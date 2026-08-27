'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canUseCalendarSync } from '@/lib/constants'
import { pushPhase, removePhaseEvent, pullLinkedEvents } from '@/lib/scheduling/syncCore'
import { swapSuperintendentLabels } from '@/lib/scheduling/calendarEvent'
import { canEditCompanyData } from '@/lib/permissions'

async function ctx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: p } = await supabase
    .from('profiles').select('company_id, ops_role, role, companies(plan)').eq('id', user.id).single()
  const isManager = ['owner', 'admin', 'manager', 'dispatcher'].includes(p?.ops_role ?? '') ||
    canEditCompanyData(p)
  if (!p?.company_id) throw new Error('No organization')
  // Plan gates only the PUSH direction (see canPush below). Cleanup (unsync /
  // remove events), status reads, and PhaseForge-side edits stay available so
  // a downgraded org can still pull its events out of Google.
  const plan = (p.companies as { plan?: string } | null)?.plan
  return { supabase, userId: user.id, companyId: p.company_id, isManager, canPush: canUseCalendarSync(plan) }
}

const PLAN_ERROR = 'Calendar sync requires a paid plan (Individual, Pro, or Business)'

export async function syncPhaseToCalendar(phaseId: string) {
  try {
    const { supabase, companyId, isManager, canPush } = await ctx()
    if (!isManager) return { error: 'Only managers can sync to calendar' }
    if (!canPush) return { error: PLAN_ERROR }
    const res = await pushPhase(supabase, companyId, phaseId)
    revalidatePath(`/app/projects/${res.projectId}`)
    return { ok: true, eventId: res.eventId, calendarId: res.calendarId }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Sync failed' }
  }
}

export async function unsyncPhaseFromCalendar(phaseId: string) {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Only managers can change calendar sync' }
    await removePhaseEvent(supabase, companyId, phaseId)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unsync failed' }
  }
}

// Sync selected phases (or all when phaseIds omitted); enables auto-sync.
export async function syncAllProjectPhases(projectId: string, phaseIds?: string[]) {
  try {
    const { supabase, companyId, isManager, canPush } = await ctx()
    if (!isManager) return { error: 'Only managers can sync to calendar' }
    if (!canPush) return { error: PLAN_ERROR }
    const { data: project } = await supabase
      .from('projects').select('id').eq('id', projectId).eq('company_id', companyId).single()
    if (!project) return { error: 'Project not found' }

    let query = supabase.from('phases').select('id').eq('project_id', projectId).order('sort_order')
    if (phaseIds?.length) query = query.in('id', phaseIds)
    const { data: phases } = await query
    if (!phases?.length) return { error: 'No phases selected to sync' }

    let synced = 0
    const failures: string[] = []
    for (const p of phases) {
      try { await pushPhase(supabase, companyId, p.id); synced++ }
      catch (e) { failures.push(e instanceof Error ? e.message : 'failed') }
    }
    await supabase.from('projects').update({ gcal_autosync: true }).eq('id', projectId)
    revalidatePath(`/app/projects/${projectId}`)
    return { ok: true, synced, total: phases.length, failures: failures.slice(0, 3) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Bulk sync failed' }
  }
}

// Remove EVERY linked event for a project from Google and turn auto-sync off.
export async function unsyncAllProjectPhases(projectId: string) {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Only managers can change calendar sync' }
    const { data: links } = await supabase
      .from('gcal_event_links').select('phase_id').eq('project_id', projectId).eq('company_id', companyId)
    let removed = 0
    for (const l of links ?? []) {
      if (!l.phase_id) continue
      try { await removePhaseEvent(supabase, companyId, l.phase_id); removed++ } catch { /* keep going */ }
    }
    await supabase.from('projects').update({ gcal_autosync: false }).eq('id', projectId).eq('company_id', companyId)
    revalidatePath(`/app/projects/${projectId}`)
    return { ok: true, removed }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Desync failed' }
  }
}

// Auto-push on create/date change; only when linked or project auto-sync is on.
export async function autoSyncPhaseIfEnabled(phaseId: string) {
  try {
    const { supabase, companyId, canPush } = await ctx()
    if (!canPush) return { ok: true, skipped: true } // silent: never block the phase save
    const { data: phase } = await supabase
      .from('phases').select('project_id').eq('id', phaseId).single()
    if (!phase) return { ok: false }
    const [proj, link] = await Promise.all([
      supabase.from('projects').select('gcal_autosync').eq('id', phase.project_id).eq('company_id', companyId).maybeSingle(),
      supabase.from('gcal_event_links').select('id').eq('phase_id', phaseId).eq('status', 'linked').maybeSingle(),
    ])
    if (!proj.data?.gcal_autosync && !link.data) return { ok: true, skipped: true }
    await pushPhase(supabase, companyId, phaseId)
    return { ok: true, synced: true }
  } catch {
    return { ok: false } // calendar hiccup never blocks the underlying save
  }
}

export async function setProjectAutoSync(projectId: string, enabled: boolean) {
  try {
    const { supabase, companyId, isManager, canPush } = await ctx()
    if (!isManager) return { error: 'Only managers can change calendar sync' }
    if (enabled && !canPush) return { error: PLAN_ERROR } // turning OFF stays allowed
    const { error } = await supabase.from('projects')
      .update({ gcal_autosync: enabled }).eq('id', projectId).eq('company_id', companyId)
    if (error) return { error: error.message }
    revalidatePath(`/app/projects/${projectId}`)
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

// Project-wide default skip days; re-pushes all linked phases so the calendar
// reflects the new default immediately.
export async function saveProjectSkipDays(projectId: string, skipDays: string[]) {
  try {
    const { supabase, companyId, isManager, canPush } = await ctx()
    if (!isManager) return { error: 'Only managers can change calendar sync' }
    if (!canPush) return { error: PLAN_ERROR }
    const valid = new Set(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'])
    const clean = [...new Set(skipDays.map((d) => d.toUpperCase()))].filter((d) => valid.has(d))
    if (clean.length === 7) return { error: 'You cannot skip every day of the week' }

    const { error } = await supabase.from('projects')
      .update({ gcal_skip_days: clean }).eq('id', projectId).eq('company_id', companyId)
    if (error) return { error: error.message }

    const { data: links } = await supabase
      .from('gcal_event_links').select('phase_id').eq('project_id', projectId).eq('status', 'linked')
    let repushed = 0
    for (const l of links ?? []) {
      if (!l.phase_id) continue
      try { await pushPhase(supabase, companyId, l.phase_id); repushed++ } catch { /* keep going */ }
    }
    revalidatePath(`/app/projects/${projectId}`)
    return { ok: true, repushed }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed' }
  }
}

export async function saveSkipDays(phaseId: string, skipDays: string[]) {
  try {
    const { supabase, companyId, isManager, canPush } = await ctx()
    if (!isManager) return { error: 'Only managers can change calendar sync' }
    if (!canPush) return { error: PLAN_ERROR }
    const valid = new Set(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'])
    const clean = [...new Set(skipDays.map((d) => d.toUpperCase()))].filter((d) => valid.has(d))
    if (clean.length === 7) return { error: 'You cannot skip every day of the week' }
    const { error } = await supabase.from('phases')
      .update({ gcal_skip_days: clean }).eq('id', phaseId)
    if (error) return { error: error.message }
    const { data: link } = await supabase.from('gcal_event_links')
      .select('id').eq('phase_id', phaseId).eq('status', 'linked').maybeSingle()
    if (link) {
      try { await pushPhase(supabase, companyId, phaseId) }
      catch (e) { return { error: `Saved, but calendar update failed: ${e instanceof Error ? e.message : 'error'}` } }
    }
    return { ok: true, resynced: Boolean(link) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed' }
  }
}

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

// Assign a superintendent to the project. Applies their default SCH labels
// (removing only the PREVIOUS superintendent's defaults, preserving the rest)
// and re-pushes linked events so calendar colors/attendees update immediately.
export async function setProjectSuperintendent(projectId: string, superintendentId: string | null) {
  try {
    const { supabase, companyId, isManager, canPush } = await ctx()
    if (!isManager) return { error: 'Only managers can change the superintendent' }

    const { data: project } = await supabase
      .from('projects').select('superintendent_id, schedule_label_ids')
      .eq('id', projectId).eq('company_id', companyId).single()
    if (!project) return { error: 'Project not found' }

    const getDefaults = async (id: string | null) => {
      if (!id) return [] as string[]
      const { data } = await supabase.from('superintendents')
        .select('default_label_ids').eq('id', id).eq('company_id', companyId).single()
      return (data?.default_label_ids as string[] | null) ?? []
    }
    const [prevDefaults, newDefaults] = await Promise.all([
      getDefaults(project.superintendent_id),
      getDefaults(superintendentId),
    ])
    const nextLabels = swapSuperintendentLabels(
      (project.schedule_label_ids as string[] | null) ?? [], prevDefaults, newDefaults,
    )

    const { error } = await supabase.from('projects').update({
      superintendent_id: superintendentId,
      schedule_label_ids: nextLabels,
    }).eq('id', projectId).eq('company_id', companyId)
    if (error) return { error: error.message }

    // Superintendent is PhaseForge data — the save is always allowed. Only the
    // calendar re-push is plan-gated.
    let repushed = 0
    if (canPush) {
      const { data: links } = await supabase
        .from('gcal_event_links').select('phase_id').eq('project_id', projectId).eq('status', 'linked')
      for (const l of links ?? []) {
        if (!l.phase_id) continue
        try { await pushPhase(supabase, companyId, l.phase_id); repushed++ } catch { /* keep going */ }
      }
    }
    revalidatePath(`/app/projects/${projectId}`)
    return { ok: true, repushed }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed' }
  }
}

// "Sync now" for one project: pull Google-side date changes into PhaseForge,
// then re-push all linked phases so both sides match. Immediate, on demand.
export async function syncNowProject(projectId: string) {
  try {
    const { supabase, companyId, isManager, canPush } = await ctx()
    if (!isManager) return { error: 'Only managers can sync' }
    if (!canPush) return { error: PLAN_ERROR }

    const pulled = await pullLinkedEvents(supabase, companyId, 200, projectId)

    const { data: links } = await supabase
      .from('gcal_event_links').select('phase_id').eq('project_id', projectId).eq('status', 'linked')
    let pushed = 0
    for (const l of links ?? []) {
      if (!l.phase_id) continue
      try { await pushPhase(supabase, companyId, l.phase_id); pushed++ } catch { /* keep going */ }
    }
    revalidatePath(`/app/projects/${projectId}`)
    return { ok: true, pushed, ...pulled }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Sync failed' }
  }
}

export async function getProjectSyncStatus(projectId: string) {
  try {
    const { supabase, companyId } = await ctx()
    const [conn, proj, links, phases, sups] = await Promise.all([
      supabase.from('gcal_connections').select('is_active, target_calendar_name').eq('company_id', companyId).maybeSingle(),
      supabase.from('projects').select('gcal_autosync, gcal_skip_days, superintendent_id').eq('id', projectId).eq('company_id', companyId).maybeSingle(),
      supabase.from('gcal_event_links').select('phase_id').eq('project_id', projectId).eq('status', 'linked'),
      supabase.from('phases').select('id, name, start_date, end_date').eq('project_id', projectId).order('sort_order'),
      supabase.from('superintendents').select('id, name').eq('company_id', companyId).eq('is_active', true).order('name'),
    ])
    const linkedIds = new Set((links.data ?? []).map((l) => l.phase_id))
    return {
      ok: true as const,
      connected: Boolean(conn.data?.is_active),
      calendarName: conn.data?.target_calendar_name ?? null,
      autoSync: Boolean(proj.data?.gcal_autosync),
      projectSkipDays: (proj.data?.gcal_skip_days as string[] | null) ?? [],
      superintendentId: (proj.data?.superintendent_id as string | null) ?? null,
      superintendents: (sups.data ?? []).map((s) => ({ id: s.id, name: s.name })),
      syncedCount: linkedIds.size,
      phases: (phases.data ?? []).map((p) => ({
        id: p.id, name: p.name, start: p.start_date, end: p.end_date, synced: linkedIds.has(p.id),
      })),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed' }
  }
}
