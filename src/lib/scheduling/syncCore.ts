// Client-agnostic sync engine: works with a user-session Supabase client
// (server actions, RLS-scoped) OR a service-role client (cron). All callers
// must pass companyId explicitly — never derived from the client.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { gcal, refreshAccessToken, encryptToken, decryptToken } from '@/lib/scheduling/google'
import { buildEventPayload, isPhaseForgeEvent, parseRRuleUntil, EventSource, QuickLink } from '@/lib/scheduling/calendarEvent'

// Canonical link base for event descriptions. The env var on Vercel still
// points at an old *.vercel.app alias, so prefer the real domain whenever the
// env value isn't a phase-forge.com URL (localhost is only used in dev).
const rawUrl = process.env.NEXT_PUBLIC_APP_URL || ''
const APP_URL = rawUrl.includes('phase-forge.com') || rawUrl.includes('localhost')
  ? rawUrl
  : 'https://www.phase-forge.com'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>

export async function getAccessToken(supabase: DB, companyId: string) {
  const { data: conn } = await supabase
    .from('gcal_connections')
    .select('id, access_token_enc, access_token_expires_at, refresh_token_enc, is_active')
    .eq('company_id', companyId).single()
  if (!conn?.refresh_token_enc || !conn.is_active) throw new Error('Google Calendar is not connected')
  const expiresAt = conn.access_token_expires_at ? new Date(conn.access_token_expires_at).getTime() : 0
  if (conn.access_token_enc && expiresAt > Date.now() + 60_000) return decryptToken(conn.access_token_enc)
  const fresh = await refreshAccessToken(conn.refresh_token_enc)
  await supabase.from('gcal_connections').update({
    access_token_enc: encryptToken(fresh.access_token),
    access_token_expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
  }).eq('id', conn.id)
  return fresh.access_token
}

export async function buildSource(supabase: DB, companyId: string, phaseId: string) {
  const { data: phase } = await supabase
    .from('phases')
    .select('id, project_id, name, start_date, end_date, status, superintendent_id, schedule_label_ids, gcal_skip_days')
    .eq('id', phaseId).single()
  if (!phase) throw new Error('Phase not found')

  const { data: project } = await supabase
    .from('projects')
    .select('id, company_id, name, customer_name, job_number, store_site_id, project_manager, superintendent_id, formatted_address, job_location, maps_url, links, quick_links, schedule_label_ids, gcal_skip_days')
    .eq('id', phase.project_id).eq('company_id', companyId).single()
  if (!project) throw new Error('Project not found')

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
  let calendarId = conn.data.target_calendar_id
  if (conn.data.routing_mode === 'superintendent') {
    calendarId = sup.data?.gcal_calendar_id
      || labelRows.find((l) => l.gcal_calendar_id)?.gcal_calendar_id
      || conn.data.target_calendar_id
  }
  const attendees = [sup.data?.gcal_email, ...labelRows.map((l) => l.gcal_attendee_email)]
    .filter((e): e is string => Boolean(e))

  // Phase skip days override the project default when set.
  const skipDays: string[] = (phase.gcal_skip_days?.length ? phase.gcal_skip_days : project.gcal_skip_days) ?? []

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
    schLabelNames: labelRows.map((l) => l.name),
    quickLinks: [
      ...((project.quick_links as QuickLink[]) ?? []),
      ...((project.links as QuickLink[]) ?? []),
    ],
    appBaseUrl: APP_URL,
    pfRevision: 1,
    colorId: labelRows.find((l) => l.gcal_color_id)?.gcal_color_id ?? null,
    attendeeEmails: attendees,
    skipDays,
  }
  return { source, calendarId, connectionId: conn.data.id }
}

// Create/patch/move the linked event for a phase. Idempotent; safe to re-run.
export async function pushPhase(supabase: DB, companyId: string, phaseId: string) {
  const token = await getAccessToken(supabase, companyId)
  const { source, calendarId, connectionId } = await buildSource(supabase, companyId, phaseId)

  // Self-healing link lookup: tolerate duplicate/stale rows (e.g. a
  // previously-deleted event) — use the newest, remove the rest.
  const { data: allLinks } = await supabase
    .from('gcal_event_links')
    .select('id, gcal_event_id, gcal_calendar_id, pf_revision')
    .eq('phase_id', phaseId).eq('connection_id', connectionId)
    .order('created_at', { ascending: false })
  const link = allLinks?.[0] ?? null
  if (allLinks && allLinks.length > 1) {
    await supabase.from('gcal_event_links').delete()
      .in('id', allLinks.slice(1).map((l) => l.id))
  }

  const revision = link ? link.pf_revision + 1 : 1
  const payload = buildEventPayload({ ...source, pfRevision: revision })

  let eventId: string, etag: string | null = null, updated: string | null = null
  if (link?.gcal_event_id) {
    const existing = await gcal.getEvent(token, link.gcal_calendar_id, link.gcal_event_id).catch(() => null)
    if (existing && existing.status !== 'cancelled' && !isPhaseForgeEvent(existing)) {
      throw new Error('Linked event is not owned by PhaseForge — refusing to overwrite')
    }
    const alive = existing && existing.status !== 'cancelled'
    if (alive && link.gcal_calendar_id !== calendarId) {
      await gcal.moveEvent(token, link.gcal_calendar_id, link.gcal_event_id, calendarId)
    }
    const res = alive
      ? await gcal.patchEvent(token, calendarId, link.gcal_event_id, payload)
      : await gcal.insertEvent(token, calendarId, payload) // recreate deleted event
    eventId = res.id; etag = res.etag ?? null; updated = res.updated ?? null
  } else {
    const res = await gcal.insertEvent(token, calendarId, payload)
    eventId = res.id; etag = res.etag ?? null; updated = res.updated ?? null
  }

  const now = new Date().toISOString()
  const row = {
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
  }
  // UPDATE the existing row (keeps one row per phase even when the event id
  // changed after a recreate); insert only when the phase was never linked.
  if (link) await supabase.from('gcal_event_links').update(row).eq('id', link.id)
  else await supabase.from('gcal_event_links').insert(row)
  await Promise.all([
    supabase.from('phases').update({ sync_enabled: true }).eq('id', phaseId),
    supabase.from('gcal_connections').update({ last_sync_at: now, last_success_at: now, last_error: null }).eq('id', connectionId),
  ])
  return { eventId, calendarId, projectId: source.projectId }
}

// PULL: bring Google-side changes back into PhaseForge for one org.
// - Date changes on a linked event update the phase's start/end, then we
//   re-push to normalize the description (dates line, revision).
// - Title/location edits made in Google are NEVER applied silently — they go
//   into gcal_pending_changes for review (PhaseForge stays source of truth).
// - Deleted events flip the link to 'event_deleted' + queue a review item.
// - Recurring (skip-days) events are skipped for date-pull: their single-day
//   start doesn't represent the phase range.
export async function pullLinkedEvents(supabase: DB, companyId: string, limit = 100, projectId?: string) {
  const token = await getAccessToken(supabase, companyId)
  let q = supabase
    .from('gcal_event_links')
    .select('id, phase_id, gcal_calendar_id, gcal_event_id, gcal_updated_at, last_pushed_at')
    .eq('company_id', companyId).eq('status', 'linked').eq('sync_enabled', true)
  if (projectId) q = q.eq('project_id', projectId)
  const { data: links } = await q.limit(limit)

  let datesApplied = 0, queued = 0, deleted = 0
  for (const link of links ?? []) {
    if (!link.phase_id) continue
    const event = await gcal.getEvent(token, link.gcal_calendar_id, link.gcal_event_id).catch(() => null)

    if (!event || event.status === 'cancelled') {
      await supabase.from('gcal_event_links').update({ status: 'event_deleted' }).eq('id', link.id)
      await supabase.from('gcal_pending_changes').insert({
        company_id: companyId, link_id: link.id, change_type: 'deleted',
        gcal_value: {}, pf_value: {},
      })
      deleted++
      continue
    }
    if (!isPhaseForgeEvent(event)) continue
    // Only react to events Google says changed since we last touched them.
    if (link.gcal_updated_at && event.updated && new Date(event.updated) <= new Date(link.gcal_updated_at)) continue

    const { data: phase } = await supabase
      .from('phases').select('id, name, start_date, end_date').eq('id', link.phase_id).single()
    if (!phase) continue

    // Dates (all-day events). Plain events: start/end-1. Recurring (skip-day)
    // events: series start = first occurrence, series end = RRULE UNTIL —
    // so dragging/extending the SERIES in Google updates the phase. (Edits to
    // a single occurrence create a Google "exception" that has no phase-range
    // meaning; those are intentionally not applied.)
    const evStart: string | undefined = event.start?.date
    const evEndExcl: string | undefined = event.end?.date
    if (evStart && evEndExcl) {
      let newStart = evStart
      let newEnd: string
      if (event.recurrence) {
        const until = parseRRuleUntil(event.recurrence as string[])
        if (!until) continue
        newEnd = until
      } else {
        const d = new Date(`${evEndExcl}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1)
        newEnd = d.toISOString().slice(0, 10)
      }
      if (newEnd >= newStart && (newStart !== phase.start_date || newEnd !== phase.end_date)) {
        await supabase.from('phases').update({
          start_date: newStart, end_date: newEnd, updated_at: new Date().toISOString(),
        }).eq('id', phase.id)
        try { await pushPhase(supabase, companyId, phase.id) } catch { /* normalize later */ }
        datesApplied++
      }
    }

    // Non-date edits → review queue (dedupe on an existing pending row).
    const titleChanged = typeof event.summary === 'string' && !event.summary.includes(phase.name)
    if (titleChanged) {
      const { data: existing } = await supabase.from('gcal_pending_changes')
        .select('id').eq('link_id', link.id).eq('change_type', 'title').eq('status', 'pending').maybeSingle()
      if (!existing) {
        await supabase.from('gcal_pending_changes').insert({
          company_id: companyId, link_id: link.id, change_type: 'title',
          gcal_value: { title: event.summary }, pf_value: { phase_name: phase.name },
        })
        queued++
      }
    }
    await supabase.from('gcal_event_links').update({
      gcal_updated_at: event.updated ?? null, last_pulled_at: new Date().toISOString(),
    }).eq('id', link.id)
  }
  return { datesApplied, queued, deleted }
}

// Delete a phase's linked Google event (only if we own it) and remove the link.
export async function removePhaseEvent(supabase: DB, companyId: string, phaseId: string) {
  const { data: link } = await supabase
    .from('gcal_event_links')
    .select('id, gcal_event_id, gcal_calendar_id')
    .eq('phase_id', phaseId).eq('company_id', companyId).maybeSingle()
  if (!link) return { removed: false }
  const token = await getAccessToken(supabase, companyId)
  const existing = await gcal.getEvent(token, link.gcal_calendar_id, link.gcal_event_id).catch(() => null)
  if (existing && isPhaseForgeEvent(existing)) {
    await gcal.deleteEvent(token, link.gcal_calendar_id, link.gcal_event_id).catch(() => null)
  }
  await supabase.from('gcal_event_links').delete().eq('id', link.id)
  await supabase.from('phases').update({ sync_enabled: false }).eq('id', phaseId)
  return { removed: true }
}
