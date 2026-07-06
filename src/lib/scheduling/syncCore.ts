// Client-agnostic sync engine: works with a user-session Supabase client
// (server actions, RLS-scoped) OR a service-role client (cron). All callers
// must pass companyId explicitly — never derived from the client.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { gcal, refreshAccessToken, encryptToken, decryptToken } from '@/lib/scheduling/google'
import { buildEventPayload, isPhaseForgeEvent, EventSource, QuickLink } from '@/lib/scheduling/calendarEvent'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

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

  const { data: link } = await supabase
    .from('gcal_event_links')
    .select('id, gcal_event_id, gcal_calendar_id, pf_revision')
    .eq('phase_id', phaseId).eq('connection_id', connectionId).maybeSingle()

  const revision = link ? link.pf_revision + 1 : 1
  const payload = buildEventPayload({ ...source, pfRevision: revision })

  let eventId: string, etag: string | null = null, updated: string | null = null
  if (link?.gcal_event_id) {
    const existing = await gcal.getEvent(token, link.gcal_calendar_id, link.gcal_event_id).catch(() => null)
    if (existing && !isPhaseForgeEvent(existing)) {
      throw new Error('Linked event is not owned by PhaseForge — refusing to overwrite')
    }
    if (existing && link.gcal_calendar_id !== calendarId) {
      await gcal.moveEvent(token, link.gcal_calendar_id, link.gcal_event_id, calendarId)
    }
    const res = existing
      ? await gcal.patchEvent(token, calendarId, link.gcal_event_id, payload)
      : await gcal.insertEvent(token, calendarId, payload)
    eventId = res.id; etag = res.etag ?? null; updated = res.updated ?? null
  } else {
    const res = await gcal.insertEvent(token, calendarId, payload)
    eventId = res.id; etag = res.etag ?? null; updated = res.updated ?? null
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
  return { eventId, calendarId, projectId: source.projectId }
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
