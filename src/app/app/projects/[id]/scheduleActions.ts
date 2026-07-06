'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { gcal, refreshAccessToken, encryptToken, decryptToken } from '@/lib/scheduling/google'
import { buildEventPayload, isPhaseForgeEvent, EventSource, QuickLink } from '@/lib/scheduling/calendarEvent'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

async function ctx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: p } = await supabase
    .from('profiles').select('company_id, ops_role, role').eq('id', user.id).single()
  const isManager = ['owner', 'admin', 'manager', 'dispatcher'].includes(p?.ops_role ?? '') ||
    ['owner', 'admin'].includes(p?.role ?? '')
  if (!p?.company_id) throw new Error('No organization')
  return { supabase, userId: user.id, companyId: p.company_id, isManager }
}

// Valid access token, refreshing + re-encrypting when stale.
async function accessToken(supabase: Awaited<ReturnType<typeof createClient>>, companyId: string) {
  const { data: conn } = await supabase
    .from('gcal_connections')
    .select('id, access_token_enc, access_token_expires_at, refresh_token_enc')
    .eq('company_id', companyId).single()
  if (!conn?.refresh_token_enc) throw new Error('Google Calendar is not connected')
  const expiresAt = conn.access_token_expires_at ? new Date(conn.access_token_expires_at).getTime() : 0
  if (conn.access_token_enc && expiresAt > Date.now() + 60_000) return decryptToken(conn.access_token_enc)
  const fresh = await refreshAccessToken(conn.refresh_token_enc)
  await supabase.from('gcal_connections').update({
    access_token_enc: encryptToken(fresh.access_token),
    access_token_expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
  }).eq('id', conn.id)
  return fresh.access_token
}

// Assemble the full EventSource for a phase from project + org config.
async function buildSource(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  phaseId: string,
) {
  const { data: phase } = await supabase
    .from('phases')
    .select('id, project_id, name, start_date, end_date, status, superintendent_id, schedule_label_ids, gcal_skip_days')
    .eq('id', phaseId).single()
  if (!phase) throw new Error('Phase not found')

  const { data: project } = await supabase
    .from('projects')
    .select('id, company_id, name, customer_name, job_number, store_site_id, project_manager, superintendent_id, formatted_address, job_location, maps_url, links, quick_links, schedule_label_ids')
    .eq('id', phase.project_id).eq('company_id', companyId).single()
  if (!project) throw new Error('Project not found')

  // Phase overrides project for superintendent + SCH labels; else inherit.
  const superintendentId = phase.superintendent_id ?? project.superintendent_id ?? null
  const labelIds: string[] = (phase.schedule_label_ids?.length ? phase.schedule_label_ids : project.schedule_label_ids) ?? []

  const [conn, sup, labels, pm] = await Promise.all([
    supabase.from('gcal_connections')
      .select('id, target_calendar_id, routing_mode').eq('company_id', companyId).single(),
    superintendentId
      ? supabase.from('superintendents').select('id, name, gcal_email, gcal_calendar_id').eq('id', superintendentId).single()
      : Promise.resolve({ data: null }),
    labelIds.length
      ? supabase.from('schedule_labels').select('id, name, gcal_color_id, gcal_calendar_id, gcal_attendee_email').in('id', labelIds)
      : Promise.resolve({ data: [] as { id: string; name: string; gcal_color_id: string | null; gcal_calendar_id: string | null; gcal_attendee_email: string | null }[] }),
    project.project_manager
      ? supabase.from('profiles').select('full_name').eq('id', project.project_manager).single()
      : Promise.resolve({ data: null }),
  ])

  if (!conn.data?.target_calendar_id) throw new Error('No target calendar selected — choose one in Settings → Scheduling')

  const labelRows = labels.data ?? []
  const labelNames = labelRows.map((l) => l.name)

  // Calendar routing: superintendent mode prefers the superintendent's own
  // calendar, then a label's calendar, then the org default; shared mode
  // always uses the org default calendar. A label colorId/attendees still apply.
  let calendarId = conn.data.target_calendar_id
  if (conn.data.routing_mode === 'superintendent') {
    calendarId = sup.data?.gcal_calendar_id
      || labelRows.find((l) => l.gcal_calendar_id)?.gcal_calendar_id
      || conn.data.target_calendar_id
  }

  const colorId = labelRows.find((l) => l.gcal_color_id)?.gcal_color_id ?? null
  const attendees = [
    sup.data?.gcal_email,
    ...labelRows.map((l) => l.gcal_attendee_email),
  ].filter((e): e is string => Boolean(e))

  const quickLinks: QuickLink[] = [
    ...((project.quick_links as QuickLink[]) ?? []),
    ...((project.links as QuickLink[]) ?? []),
  ]

  const source: EventSource = {
    orgId: companyId,
    projectId: project.id,
    phaseId: phase.id,
    connectionId: conn.data.id,
    projectName: project.name,
    phaseName: phase.name,
    jobNumber: project.job_number,
    storeSiteId: project.store_site_id,
    client: project.customer_name,
    formattedAddress: project.formatted_address || project.job_location,
    mapsUrl: project.maps_url,
    startDate: phase.start_date,
    endDate: phase.end_date,
    phaseStatus: phase.status,
    pmName: pm.data?.full_name ?? null,
    superintendentName: sup.data?.name ?? null,
    schLabelNames: labelNames,
    quickLinks,
    appBaseUrl: APP_URL,
    pfRevision: 1,
    colorId,
    attendeeEmails: attendees,
    skipDays: phase.gcal_skip_days ?? [],
  }
  return { source, calendarId, connectionId: conn.data.id }
}

// Push a phase to Google Calendar: create the event if new, patch it if the
// link exists, or MOVE it (no duplicate) if the target calendar changed.
export async function syncPhaseToCalendar(phaseId: string) {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Only managers can sync to calendar' }
    const token = await accessToken(supabase, companyId)
    const { source, calendarId, connectionId } = await buildSource(supabase, companyId, phaseId)

    const { data: link } = await supabase
      .from('gcal_event_links')
      .select('id, gcal_event_id, gcal_calendar_id, pf_revision')
      .eq('phase_id', phaseId).eq('connection_id', connectionId).maybeSingle()

    const revision = link ? link.pf_revision + 1 : 1
    const payload = buildEventPayload({ ...source, pfRevision: revision })

    let eventId: string
    let etag: string | null = null
    let updated: string | null = null

    if (link?.gcal_event_id) {
      // Guard: never touch an event that isn't ours.
      const existing = await gcal.getEvent(token, link.gcal_calendar_id, link.gcal_event_id).catch(() => null)
      if (existing && !isPhaseForgeEvent(existing)) {
        return { error: 'Linked event is not owned by PhaseForge — refusing to overwrite' }
      }
      if (existing && link.gcal_calendar_id !== calendarId) {
        await gcal.moveEvent(token, link.gcal_calendar_id, link.gcal_event_id, calendarId)
      }
      const res = existing
        ? await gcal.patchEvent(token, calendarId, link.gcal_event_id, payload)
        : await gcal.insertEvent(token, calendarId, payload)
      eventId = res.id
      etag = res.etag ?? null
      updated = res.updated ?? null
    } else {
      const res = await gcal.insertEvent(token, calendarId, payload)
      eventId = res.id
      etag = res.etag ?? null
      updated = res.updated ?? null
    }

    const now = new Date().toISOString()
    await supabase.from('gcal_event_links').upsert({
      company_id: companyId,
      connection_id: connectionId,
      project_id: source.projectId,
      phase_id: phaseId,
      gcal_calendar_id: calendarId,
      gcal_event_id: eventId,
      sync_enabled: true,
      pf_revision: revision,
      gcal_etag: etag,
      gcal_updated_at: updated,
      last_pushed_at: now,
      status: 'linked',
      last_error: null,
    }, { onConflict: 'connection_id,gcal_event_id' })

    await Promise.all([
      supabase.from('phases').update({ sync_enabled: true }).eq('id', phaseId),
      supabase.from('gcal_connections').update({ last_sync_at: now, last_success_at: now, last_error: null }).eq('id', connectionId),
    ])

    revalidatePath(`/app/projects/${source.projectId}`)
    return { ok: true, eventId, calendarId }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Sync failed' }
  }
}

// Remove a phase's event from Google (used before deleting a phase, or on
// user request). Only deletes events PhaseForge owns.
export async function unsyncPhaseFromCalendar(phaseId: string) {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Only managers can change calendar sync' }
    const token = await accessToken(supabase, companyId)
    const { data: link } = await supabase
      .from('gcal_event_links')
      .select('id, gcal_event_id, gcal_calendar_id, project_id')
      .eq('phase_id', phaseId).maybeSingle()
    if (!link) return { ok: true }

    const existing = await gcal.getEvent(token, link.gcal_calendar_id, link.gcal_event_id).catch(() => null)
    if (existing && isPhaseForgeEvent(existing)) {
      await gcal.deleteEvent(token, link.gcal_calendar_id, link.gcal_event_id).catch(() => null)
    }
    await supabase.from('gcal_event_links').delete().eq('id', link.id)
    await supabase.from('phases').update({ sync_enabled: false }).eq('id', phaseId)
    revalidatePath(`/app/projects/${link.project_id}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unsync failed' }
  }
}

// Persist which weekdays a phase should NOT appear on the calendar
// (RFC-5545 codes, e.g. ['FR','SA','SU']); re-pushes the event if linked.
export async function saveSkipDays(phaseId: string, skipDays: string[]) {
  try {
    const { supabase, isManager } = await ctx()
    if (!isManager) return { error: 'Only managers can change calendar sync' }
    const valid = new Set(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'])
    const clean = [...new Set(skipDays.map((d) => d.toUpperCase()))].filter((d) => valid.has(d))
    if (clean.length === 7) return { error: 'You cannot skip every day of the week' }

    const { error } = await supabase.from('phases')
      .update({ gcal_skip_days: clean }).eq('id', phaseId)
    if (error) return { error: error.message }

    // Keep the calendar in step immediately when this phase is already synced.
    const { data: link } = await supabase.from('gcal_event_links')
      .select('id').eq('phase_id', phaseId).eq('status', 'linked').maybeSingle()
    if (link) {
      const res = await syncPhaseToCalendar(phaseId)
      if (res?.error) return { error: `Saved, but calendar update failed: ${res.error}` }
    }
    return { ok: true, resynced: Boolean(link) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed' }
  }
}

// Lightweight status for the edit panel: is this phase linked, and where.
export async function getPhaseSyncStatus(phaseId: string) {
  try {
    const { supabase, companyId } = await ctx()
    const [conn, link, ph] = await Promise.all([
      supabase.from('gcal_connections')
        .select('is_active, target_calendar_name').eq('company_id', companyId).maybeSingle(),
      supabase.from('gcal_event_links')
        .select('gcal_event_id, gcal_calendar_id, last_pushed_at, status').eq('phase_id', phaseId).maybeSingle(),
      supabase.from('phases').select('gcal_skip_days').eq('id', phaseId).maybeSingle(),
    ])
    return {
      ok: true as const,
      connected: Boolean(conn.data?.is_active),
      calendarName: conn.data?.target_calendar_name ?? null,
      skipDays: (ph.data?.gcal_skip_days as string[] | null) ?? [],
      link: link.data
        ? {
            eventId: link.data.gcal_event_id,
            calendarId: link.data.gcal_calendar_id,
            lastPushedAt: link.data.last_pushed_at,
            status: link.data.status,
          }
        : null,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed' }
  }
}
