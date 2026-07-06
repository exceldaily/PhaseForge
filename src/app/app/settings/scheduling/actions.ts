'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { gcal, refreshAccessToken, encryptToken, decryptToken } from '@/lib/scheduling/google'

const PATH = '/app/settings/scheduling'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: p } = await supabase
    .from('profiles').select('company_id, ops_role, role').eq('id', user.id).single()
  const isAdmin = ['owner', 'admin'].includes(p?.ops_role ?? '') ||
    ['owner', 'admin'].includes(p?.role ?? '')
  if (!p?.company_id || !isAdmin) throw new Error('Admins only')
  return { supabase, userId: user.id, companyId: p.company_id }
}

// Returns a valid access token, refreshing (and re-encrypting) when expired.
async function getAccessToken(supabase: Awaited<ReturnType<typeof createClient>>, companyId: string) {
  const { data: conn } = await supabase
    .from('gcal_connections')
    .select('id, access_token_enc, access_token_expires_at, refresh_token_enc')
    .eq('company_id', companyId).single()
  if (!conn?.refresh_token_enc) throw new Error('Google Calendar is not connected')

  const expiresAt = conn.access_token_expires_at ? new Date(conn.access_token_expires_at).getTime() : 0
  if (conn.access_token_enc && expiresAt > Date.now() + 60_000) {
    return decryptToken(conn.access_token_enc)
  }
  const fresh = await refreshAccessToken(conn.refresh_token_enc)
  await supabase.from('gcal_connections').update({
    access_token_enc: encryptToken(fresh.access_token),
    access_token_expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
  }).eq('id', conn.id)
  return fresh.access_token
}

export async function listCalendars() {
  try {
    const { supabase, companyId } = await requireAdmin()
    const token = await getAccessToken(supabase, companyId)
    const result = await gcal.listCalendars(token) as { items?: { id: string; summary: string; primary?: boolean }[] }
    return {
      ok: true as const,
      calendars: (result.items ?? []).map((c) => ({
        id: c.id, name: c.summary, primary: Boolean(c.primary),
      })),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to list calendars' }
  }
}

export async function setTargetCalendar(calendarId: string, calendarName: string) {
  try {
    const { supabase, companyId } = await requireAdmin()
    const { error } = await supabase.from('gcal_connections')
      .update({ target_calendar_id: calendarId, target_calendar_name: calendarName, updated_at: new Date().toISOString() })
      .eq('company_id', companyId)
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

export async function setRoutingMode(mode: 'shared' | 'superintendent') {
  try {
    const { supabase, companyId } = await requireAdmin()
    const { error } = await supabase.from('gcal_connections')
      .update({ routing_mode: mode, updated_at: new Date().toISOString() })
      .eq('company_id', companyId)
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

export async function disconnectGoogle() {
  try {
    const { supabase, companyId } = await requireAdmin()
    // Deactivate + wipe tokens; event links are kept (status untouched) so a
    // reconnect can resume, and nothing is ever deleted on Google's side here.
    const { error } = await supabase.from('gcal_connections').update({
      is_active: false, refresh_token_enc: null, access_token_enc: null,
      last_error: null, updated_at: new Date().toISOString(),
    }).eq('company_id', companyId)
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

// ── Pending calendar changes (Google-side edits held for review) ────────────

// 'keep' = re-push the PhaseForge version to Google (restores title / recreates
// a deleted event). 'dismiss' = accept Google's state and stop flagging it.
export async function resolvePendingChange(changeId: string, action: 'keep' | 'dismiss') {
  try {
    const { supabase, userId, companyId } = await requireAdmin()
    const { data: change } = await supabase
      .from('gcal_pending_changes')
      .select('id, change_type, link_id')
      .eq('id', changeId).eq('company_id', companyId).eq('status', 'pending').single()
    if (!change) return { error: 'Change not found or already resolved' }

    if (action === 'keep') {
      const { data: link } = await supabase
        .from('gcal_event_links').select('phase_id, status').eq('id', change.link_id).maybeSingle()
      if (link?.phase_id) {
        // Recreating after deletion needs the link back in a pushable state.
        if (link.status === 'event_deleted') {
          await supabase.from('gcal_event_links')
            .update({ status: 'linked' }).eq('id', change.link_id)
        }
        const { pushPhase } = await import('@/lib/scheduling/syncCore')
        await pushPhase(supabase, companyId, link.phase_id)
      }
    }

    await supabase.from('gcal_pending_changes').update({
      status: action === 'keep' ? 'accepted' : 'rejected',
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
    }).eq('id', changeId)
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed' }
  }
}

// ── Superintendents ──────────────────────────────────────────────────────────

export async function saveSuperintendent(input: {
  id?: string; name: string; email?: string; phone?: string
  gcal_email?: string; gcal_calendar_id?: string
  default_label_ids?: string[]; is_active?: boolean; notes?: string
}) {
  try {
    const { supabase, companyId } = await requireAdmin()
    const row = {
      company_id: companyId,
      name: input.name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      gcal_email: input.gcal_email?.trim() || null,
      gcal_calendar_id: input.gcal_calendar_id?.trim() || null,
      default_label_ids: input.default_label_ids ?? [],
      is_active: input.is_active ?? true,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    }
    if (!row.name) return { error: 'Name is required' }
    const { error } = input.id
      ? await supabase.from('superintendents').update(row).eq('id', input.id).eq('company_id', companyId)
      : await supabase.from('superintendents').insert(row)
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

// ── SCH labels ───────────────────────────────────────────────────────────────

export async function saveScheduleLabel(input: {
  id?: string; name: string; color?: string
  gcal_calendar_id?: string; gcal_color_id?: string; gcal_attendee_email?: string
  superintendent_id?: string | null; is_active?: boolean
}) {
  try {
    const { supabase, companyId } = await requireAdmin()
    const row = {
      company_id: companyId,
      name: input.name.trim(),
      color: input.color || '#6366f1',
      gcal_calendar_id: input.gcal_calendar_id?.trim() || null,
      gcal_color_id: input.gcal_color_id?.trim() || null,
      gcal_attendee_email: input.gcal_attendee_email?.trim() || null,
      superintendent_id: input.superintendent_id || null,
      is_active: input.is_active ?? true,
    }
    if (!row.name) return { error: 'Label name is required' }
    const { error } = input.id
      ? await supabase.from('schedule_labels').update(row).eq('id', input.id).eq('company_id', companyId)
      : await supabase.from('schedule_labels').insert(row)
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}
