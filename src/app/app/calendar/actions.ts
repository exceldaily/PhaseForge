'use server'

// The company calendar. Project work on it IS the project's phases: adding,
// moving, or renaming one here writes the same phases rows the Gantt and the
// project page read, through the same rules (a reason for big moves, review
// of what depends on it, Google Calendar auto-sync, one line on the project
// timeline). Things that are not phases (a safety meeting, an inspection at
// 2 PM) live in calendar_events.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canEditCompanyData } from '@/lib/permissions'
import { logActivity, REASON_PROMPT_THRESHOLD_DAYS } from '@/lib/activity/log'
import { computeMoveImpact, type ScheduleDependency, type SchedulePhase } from '@/lib/schedule/engine'
import { addDaysIso, diffDaysIso, isIsoDate } from '@/lib/calendar/dates'
import { resolveDivision, resolveSuper, safeColor, type CalItem, type CalSuper } from '@/lib/calendar/model'
import type { QaPoolItem } from '@/lib/calendar/quickAdd'
import { autoSyncPhaseIfEnabled } from '@/app/app/projects/[id]/scheduleActions'

const PATH = '/app/calendar'
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DONE = new Set(['completed', 'skipped'])

type Db = Awaited<ReturnType<typeof createClient>>

async function ctx(write = false) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: p } = await supabase.from('profiles').select('company_id, role, ops_role').eq('id', user.id).single()
  if (!p?.company_id) throw new Error('No organization')
  const canEdit = canEditCompanyData(p)
  if (write && !canEdit) throw new Error('Managers and up only')
  return { supabase, userId: user.id, companyId: p.company_id as string, canEdit }
}
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'Failed' })
const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null)

export interface CalProject {
  id: string; name: string; jobNumber: string | null; color: string | null
  superId: string | null; division: string | null
}
export interface CalendarRefs { projects: CalProject[]; supers: CalSuper[] }
export interface CalendarData { items: CalItem[]; pool: QaPoolItem[]; from: string; to: string }

interface ProjectRow {
  id: string; name: string; job_number: string | null; color: string | null; end_date: string | null
  status: string | null; superintendent_id: string | null; superintendent: string | null; trade: string | null
}

async function loadRefRows(supabase: Db, companyId: string) {
  const [{ data: projects }, { data: supers }] = await Promise.all([
    supabase.from('projects')
      .select('id, name, job_number, color, end_date, status, superintendent_id, superintendent, trade')
      .eq('company_id', companyId).eq('is_archived', false).order('name'),
    supabase.from('superintendents').select('id, name, division, default_color')
      .eq('company_id', companyId).eq('is_active', true).order('name'),
  ])
  const sup: CalSuper[] = (supers ?? []).map((s) => ({
    id: s.id as string, name: s.name as string, division: (s.division as string | null) ?? null, color: safeColor(s.default_color as string | null),
  }))
  return { projects: (projects ?? []) as ProjectRow[], supers: sup }
}

function projectSuper(p: ProjectRow, supers: CalSuper[]) {
  return resolveSuper({ superintendentId: p.superintendent_id, superintendentText: p.superintendent }, supers)
}

/** Jobs and supers, for the pickers, the labels, and the type-it box. */
export async function loadCalendarRefs(): Promise<CalendarRefs> {
  const { supabase, companyId } = await ctx()
  const { projects, supers } = await loadRefRows(supabase, companyId)
  return {
    supers,
    projects: projects.map((p) => {
      const superId = projectSuper(p, supers)
      return { id: p.id, name: p.name, jobNumber: p.job_number, color: safeColor(p.color), superId, division: resolveDivision(superId, p.trade, supers) }
    }),
  }
}

/** Everything on the calendar between two dates, plus what a typed line can move. */
export async function loadCalendar(input: { from: string; to: string }): Promise<CalendarData> {
  const { supabase, companyId } = await ctx()
  if (!isIsoDate(input.from) || !isIsoDate(input.to) || input.to < input.from) throw new Error('Bad date range')
  const { projects, supers } = await loadRefRows(supabase, companyId)
  const byId = new Map(projects.map((p) => [p.id, p]))
  const superOf = new Map(projects.map((p) => [p.id, projectSuper(p, supers)]))

  // Every phase on a live project. Paged, because one request stops at 1000 rows.
  const phases: { id: string; project_id: string; name: string; start_date: string; end_date: string; status: string | null; color: string | null; is_milestone: boolean | null; superintendent_id: string | null }[] = []
  for (let page = 0; page < 10; page++) {
    const { data } = await supabase.from('phases')
      .select('id, project_id, name, start_date, end_date, status, color, is_milestone, superintendent_id, projects!inner(company_id, is_archived)')
      .eq('projects.company_id', companyId).eq('projects.is_archived', false)
      .order('id').range(page * 1000, page * 1000 + 999)
    phases.push(...((data ?? []) as unknown as typeof phases))
    if (!data || data.length < 1000) break
  }
  const { data: events } = await supabase.from('calendar_events')
    .select('id, project_id, superintendent_id, division, title, start_date, end_date, start_time, end_time, notes, color')
    .eq('company_id', companyId).lte('start_date', input.to).gte('end_date', input.from).order('start_date').limit(2000)
  const poolFloor = addDaysIso(new Date().toISOString().slice(0, 10), -30)
  const { data: poolEvents } = await supabase.from('calendar_events')
    .select('id, project_id, title, start_date, end_date')
    .eq('company_id', companyId).gte('end_date', poolFloor).order('start_date').limit(2000)

  const items: CalItem[] = []
  const pool: QaPoolItem[] = []
  for (const ph of phases) {
    const proj = byId.get(ph.project_id)
    if (!proj || !ph.start_date) continue
    // Real data has phases that end before they start; show them as one day.
    const end = ph.end_date && ph.end_date >= ph.start_date ? ph.end_date : ph.start_date
    pool.push({ kind: 'phase', id: ph.id, projectId: ph.project_id, title: ph.name, start: ph.start_date, end, done: DONE.has(ph.status ?? '') })
    if (ph.start_date > input.to || end < input.from) continue
    const own = supers.some((s) => s.id === ph.superintendent_id) ? ph.superintendent_id : null
    const superId = own ?? superOf.get(ph.project_id) ?? null
    items.push({
      key: `phase:${ph.id}`, kind: 'phase', id: ph.id, title: ph.name, start: ph.start_date, end,
      startTime: null, endTime: null, projectId: proj.id, projectName: proj.name, jobNumber: proj.job_number,
      superId, ownSuperId: own, division: resolveDivision(superId, proj.trade, supers), color: safeColor(ph.color),
      status: ph.status, milestone: !!ph.is_milestone,
    })
  }
  for (const e of events ?? []) {
    const proj = e.project_id ? byId.get(e.project_id as string) : undefined
    const own = supers.some((s) => s.id === e.superintendent_id) ? (e.superintendent_id as string) : null
    const superId = own ?? (proj ? superOf.get(proj.id) ?? null : null)
    items.push({
      key: `event:${e.id}`, kind: 'event', id: e.id as string, title: e.title as string,
      start: e.start_date as string, end: e.end_date as string, startTime: hhmm(e.start_time as string | null), endTime: hhmm(e.end_time as string | null),
      projectId: proj?.id ?? null, projectName: proj?.name ?? null, jobNumber: proj?.job_number ?? null,
      superId, ownSuperId: own, division: (e.division as string | null) ?? resolveDivision(superId, proj?.trade ?? null, supers),
      color: safeColor(e.color as string | null), notes: (e.notes as string | null) ?? null,
    })
  }
  for (const e of poolEvents ?? []) {
    pool.push({ kind: 'event', id: e.id as string, projectId: (e.project_id as string | null) ?? null, title: e.title as string, start: e.start_date as string, end: e.end_date as string })
  }
  for (const p of projects) {
    if (!p.end_date || p.end_date < input.from || p.end_date > input.to || p.status === 'closed') continue
    const superId = superOf.get(p.id) ?? null
    items.push({
      key: `deadline:${p.id}`, kind: 'deadline', id: p.id, title: 'Project end date', start: p.end_date, end: p.end_date,
      startTime: null, endTime: null, projectId: p.id, projectName: p.name, jobNumber: p.job_number,
      superId, division: resolveDivision(superId, p.trade, supers), color: null,
    })
  }
  return { items, pool, from: input.from, to: input.to }
}

/* ── Adding ──────────────────────────────────────────────────────────────── */

export interface EntryInput {
  as: 'phase' | 'event'
  title: string
  projectId: string | null
  /** null = follow the job's super. */
  superId: string | null
  start: string
  end: string
  startTime?: string | null
  endTime?: string | null
  notes?: string | null
  color?: string | null
}

function checkDates(i: { start: string; end: string; startTime?: string | null; endTime?: string | null }): string | null {
  if (!isIsoDate(i.start) || !isIsoDate(i.end)) return 'Pick a date.'
  if (i.end < i.start) return 'The end date is before the start date.'
  if (i.startTime && !TIME_RE.test(i.startTime)) return 'That start time does not look right.'
  if (i.endTime && !TIME_RE.test(i.endTime)) return 'That end time does not look right.'
  if (i.endTime && !i.startTime) return 'Add a start time, or clear the end time.'
  if (i.startTime && i.endTime && i.start === i.end && i.endTime <= i.startTime) return 'The end time is before the start time.'
  return null
}

async function eventDivision(supabase: Db, companyId: string, superId: string | null, projectId: string | null): Promise<{ superId: string | null; division: string | null }> {
  const { projects, supers } = await loadRefRows(supabase, companyId)
  const proj = projects.find((p) => p.id === projectId)
  const own = supers.some((s) => s.id === superId) ? superId : null
  const effective = own ?? (proj ? projectSuper(proj, supers) : null)
  return { superId: own, division: resolveDivision(effective, proj?.trade ?? null, supers) }
}

export async function createEntry(input: EntryInput) {
  try {
    const { supabase, userId, companyId } = await ctx(true)
    const title = input.title.trim()
    if (!title) return { ok: false as const, error: 'Say what is being done.' }
    if (title.length > 200) return { ok: false as const, error: 'That title is too long.' }
    const bad = checkDates(input)
    if (bad) return { ok: false as const, error: bad }

    if (input.as === 'phase') {
      if (!input.projectId) return { ok: false as const, error: 'A phase needs a job.' }
      const { data: project } = await supabase.from('projects').select('id, company_id, name').eq('id', input.projectId).single()
      if (!project || project.company_id !== companyId) return { ok: false as const, error: 'That job is gone.' }
      const { data: last } = await supabase.from('phases').select('sort_order').eq('project_id', project.id)
        .order('sort_order', { ascending: false }).limit(1).maybeSingle()
      const { data: phase, error } = await supabase.from('phases').insert({
        project_id: project.id, name: title, start_date: input.start, end_date: input.end,
        status: 'not_started', color: '#6366f1', sort_order: ((last?.sort_order as number | undefined) ?? -1) + 1,
        ...(input.superId ? { superintendent_id: input.superId } : {}),
      }).select('id').single()
      if (error || !phase) return { ok: false as const, error: error?.message ?? 'Could not add the phase.' }
      await supabase.from('projects').update({ updated_at: new Date().toISOString(), updated_by: userId }).eq('id', project.id)
      await autoSyncPhaseIfEnabled(phase.id as string)
      await logActivity(supabase, {
        companyId, projectId: project.id, phaseId: phase.id as string, actorId: userId,
        action: 'phase_created', entityType: 'phase', entityId: phase.id as string, entityLabel: title,
        payload: { start_date: input.start, end_date: input.end, via: 'calendar' },
      })
      revalidatePath(`/app/projects/${project.id}`)
      revalidatePath('/app/gantt')
      revalidatePath(PATH)
      return { ok: true as const, kind: 'phase' as const, id: phase.id as string }
    }

    const tag = await eventDivision(supabase, companyId, input.superId, input.projectId)
    const { data: row, error } = await supabase.from('calendar_events').insert({
      company_id: companyId, project_id: input.projectId, superintendent_id: tag.superId, division: tag.division,
      title, start_date: input.start, end_date: input.end,
      start_time: input.startTime || null, end_time: input.startTime ? input.endTime || null : null,
      notes: input.notes?.trim() || null, color: safeColor(input.color), created_by: userId, updated_by: userId,
    }).select('id').single()
    if (error || !row) return { ok: false as const, error: error?.message ?? 'Could not add the event.' }
    if (input.projectId) {
      await logActivity(supabase, {
        companyId, projectId: input.projectId, actorId: userId, action: 'calendar_added',
        entityType: 'calendar_event', entityId: row.id as string, entityLabel: title,
        payload: { start_date: input.start, end_date: input.end },
      })
    }
    revalidatePath(PATH)
    return { ok: true as const, kind: 'event' as const, id: row.id as string }
  } catch (e) { return fail(e) }
}

/* ── Events ──────────────────────────────────────────────────────────────── */

export async function updateEvent(input: { id: string } & Omit<EntryInput, 'as'>) {
  try {
    const { supabase, userId, companyId } = await ctx(true)
    const title = input.title.trim()
    if (!title) return { ok: false as const, error: 'Say what is being done.' }
    const bad = checkDates(input)
    if (bad) return { ok: false as const, error: bad }
    const { data: before } = await supabase.from('calendar_events').select('start_date, end_date, project_id').eq('id', input.id).eq('company_id', companyId).single()
    if (!before) return { ok: false as const, error: 'That event is gone.' }
    const tag = await eventDivision(supabase, companyId, input.superId, input.projectId)
    const { error } = await supabase.from('calendar_events').update({
      title, project_id: input.projectId, superintendent_id: tag.superId, division: tag.division,
      start_date: input.start, end_date: input.end,
      start_time: input.startTime || null, end_time: input.startTime ? input.endTime || null : null,
      notes: input.notes?.trim() || null, color: safeColor(input.color), updated_by: userId,
    }).eq('id', input.id).eq('company_id', companyId)
    if (error) return { ok: false as const, error: error.message }
    if (input.projectId && (before.start_date !== input.start || before.end_date !== input.end)) {
      await logActivity(supabase, {
        companyId, projectId: input.projectId, actorId: userId, action: 'calendar_moved',
        entityType: 'calendar_event', entityId: input.id, entityLabel: title,
        payload: { start_date: { from: before.start_date, to: input.start }, end_date: { from: before.end_date, to: input.end } },
      })
    }
    revalidatePath(PATH)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/** Drag and drop, or a typed move: new dates, and a new time only when one is given. */
export async function moveEvent(input: { id: string; start: string; end: string; startTime?: string | null; endTime?: string | null }) {
  try {
    const { supabase, userId, companyId } = await ctx(true)
    const bad = checkDates(input)
    if (bad) return { ok: false as const, error: bad }
    const { data: before } = await supabase.from('calendar_events').select('title, start_date, end_date, project_id').eq('id', input.id).eq('company_id', companyId).single()
    if (!before) return { ok: false as const, error: 'That event is gone.' }
    const patch: Record<string, unknown> = { start_date: input.start, end_date: input.end, updated_by: userId }
    if (input.startTime !== undefined) {
      patch.start_time = input.startTime || null
      patch.end_time = input.startTime ? input.endTime || null : null
    }
    const { error } = await supabase.from('calendar_events').update(patch).eq('id', input.id).eq('company_id', companyId)
    if (error) return { ok: false as const, error: error.message }
    if (before.project_id && (before.start_date !== input.start || before.end_date !== input.end)) {
      await logActivity(supabase, {
        companyId, projectId: before.project_id as string, actorId: userId, action: 'calendar_moved',
        entityType: 'calendar_event', entityId: input.id, entityLabel: before.title as string,
        payload: { start_date: { from: before.start_date, to: input.start }, end_date: { from: before.end_date, to: input.end } },
      })
    }
    revalidatePath(PATH)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function deleteEvent(input: { id: string }) {
  try {
    const { supabase, userId, companyId } = await ctx(true)
    const { data: before } = await supabase.from('calendar_events').select('title, project_id').eq('id', input.id).eq('company_id', companyId).single()
    const { error } = await supabase.from('calendar_events').delete().eq('id', input.id).eq('company_id', companyId)
    if (error) return { ok: false as const, error: error.message }
    if (before?.project_id) {
      await logActivity(supabase, {
        companyId, projectId: before.project_id as string, actorId: userId, action: 'calendar_removed',
        entityType: 'calendar_event', entityId: input.id, entityLabel: before.title as string,
      })
    }
    revalidatePath(PATH)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/* ── Phases ──────────────────────────────────────────────────────────────── */

export interface MoveGate {
  phaseName: string
  projectName: string
  from: { start: string; end: string }
  to: { start: string; end: string }
  deltaDays: number
  kind: 'move' | 'resize'
  /** The move is big enough to ask why. */
  askReason: boolean
  /** Phases that depend on this one and would have to shift. */
  affected: { id: string; name: string; deltaDays: number; newStart: string; newEnd: string }[]
  completionDeltaDays: number
}

/**
 * Move or stretch a phase from the calendar. Same rules as dragging its bar
 * on the Gantt: a move of three days or more, or one that pushes phases
 * depending on it, comes back as a gate for the person to confirm first.
 */
export async function movePhase(input: {
  id: string; start: string; end: string
  confirmed?: boolean; reason?: string | null; applyDownstream?: boolean
}) {
  try {
    const { supabase, userId, companyId } = await ctx(true)
    const bad = checkDates(input)
    if (bad) return { ok: false as const, error: bad }
    const { data: phase } = await supabase.from('phases').select('id, project_id, name, start_date, end_date').eq('id', input.id).single()
    if (!phase) return { ok: false as const, error: 'That phase is gone.' }
    const { data: project } = await supabase.from('projects').select('id, company_id, name').eq('id', phase.project_id).single()
    if (!project || project.company_id !== companyId) return { ok: false as const, error: 'That phase is gone.' }

    const from = { start: phase.start_date as string, end: phase.end_date as string }
    const to = { start: input.start, end: input.end }
    if (from.start === to.start && from.end === to.end) return { ok: true as const, moved: 0 }

    const startDelta = diffDaysIso(from.start, to.start)
    const endDelta = diffDaysIso(from.end, to.end)
    const kind: 'move' | 'resize' = startDelta === endDelta ? 'move' : 'resize'
    const deltaDays = kind === 'move' ? startDelta : (endDelta !== 0 ? endDelta : startDelta)

    const { data: siblings } = await supabase.from('phases').select('id, name, start_date, end_date, is_milestone, status').eq('project_id', project.id)
    const all = (siblings ?? []) as SchedulePhase[]
    const ids = all.map((p) => p.id)
    const { data: depRows } = ids.length
      ? await supabase.from('phase_dependencies').select('id, phase_id, depends_on_id, type, lag_days').in('phase_id', ids)
      : { data: [] }
    const deps = (depRows ?? []) as ScheduleDependency[]
    const impact = endDelta !== 0 && deps.length
      ? computeMoveImpact(all, deps, phase.id as string, endDelta)
      : { affected: [], completionDeltaDays: 0, newCompletionDate: null, cycleError: false }
    const askReason = Math.abs(deltaDays) >= REASON_PROMPT_THRESHOLD_DAYS

    if ((impact.affected.length > 0 || askReason) && !input.confirmed) {
      const gate: MoveGate = {
        phaseName: phase.name as string, projectName: project.name as string, from, to, deltaDays, kind,
        askReason, affected: impact.affected, completionDeltaDays: impact.completionDeltaDays,
      }
      return { ok: false as const, gate }
    }

    const now = new Date().toISOString()
    const { error } = await supabase.from('phases').update({ start_date: to.start, end_date: to.end, updated_at: now }).eq('id', phase.id)
    if (error) return { ok: false as const, error: error.message }
    const cascaded: { name: string; from: { start: string; end: string }; to: { start: string; end: string } }[] = []
    if (input.applyDownstream) {
      for (const a of impact.affected) {
        const orig = all.find((p) => p.id === a.id)
        if (!orig) continue
        const res = await supabase.from('phases').update({ start_date: a.newStart, end_date: a.newEnd, updated_at: now }).eq('id', a.id)
        if (!res.error) cascaded.push({ name: a.name, from: { start: orig.start_date, end: orig.end_date }, to: { start: a.newStart, end: a.newEnd } })
      }
    }
    await supabase.from('projects').update({ updated_at: now, updated_by: userId }).eq('id', project.id)
    await autoSyncPhaseIfEnabled(phase.id as string)
    if (input.applyDownstream) for (const a of impact.affected) await autoSyncPhaseIfEnabled(a.id)
    await logActivity(supabase, {
      companyId, projectId: project.id as string, phaseId: phase.id as string, actorId: userId,
      action: kind === 'move' ? 'phase_moved' : 'phase_resized',
      entityType: 'phase', entityId: phase.id as string, entityLabel: phase.name as string,
      reason: input.reason?.trim() || null,
      payload: {
        start_date: { from: from.start, to: to.start },
        end_date: { from: from.end, to: to.end },
        ...(cascaded.length ? { cascaded } : {}),
        via: 'calendar',
      },
    })
    revalidatePath(`/app/projects/${project.id}`)
    revalidatePath('/app/gantt')
    revalidatePath(PATH)
    return { ok: true as const, moved: 1 + cascaded.length }
  } catch (e) { return fail(e) }
}

/** Rename a phase or give it its own super label. Dates go through movePhase. */
export async function updatePhase(input: { id: string; name?: string; superId?: string | null }) {
  try {
    const { supabase, userId, companyId } = await ctx(true)
    const { data: phase } = await supabase.from('phases').select('id, project_id, name, superintendent_id').eq('id', input.id).single()
    if (!phase) return { ok: false as const, error: 'That phase is gone.' }
    const { data: project } = await supabase.from('projects').select('id, company_id').eq('id', phase.project_id).single()
    if (!project || project.company_id !== companyId) return { ok: false as const, error: 'That phase is gone.' }
    const patch: Record<string, unknown> = {}
    const name = input.name?.trim()
    if (input.name !== undefined) {
      if (!name) return { ok: false as const, error: 'A phase needs a name.' }
      if (name !== phase.name) patch.name = name
    }
    if (input.superId !== undefined && input.superId !== phase.superintendent_id) patch.superintendent_id = input.superId
    if (!Object.keys(patch).length) return { ok: true as const }
    patch.updated_at = new Date().toISOString()
    const { error } = await supabase.from('phases').update(patch).eq('id', phase.id)
    if (error) return { ok: false as const, error: error.message }
    if (patch.name) {
      await autoSyncPhaseIfEnabled(phase.id as string)
      await logActivity(supabase, {
        companyId, projectId: project.id as string, phaseId: phase.id as string, actorId: userId,
        action: 'phase_updated', entityType: 'phase', entityId: phase.id as string, entityLabel: name,
        payload: { name: { from: phase.name, to: name } },
      })
    }
    revalidatePath(`/app/projects/${project.id}`)
    revalidatePath('/app/gantt')
    revalidatePath(PATH)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/* ── Super labels ────────────────────────────────────────────────────────── */

export async function setSuperColor(input: { superId: string; color: string }) {
  try {
    const { supabase, companyId } = await ctx(true)
    const color = safeColor(input.color)
    if (!color) return { ok: false as const, error: 'Pick one of the colors.' }
    const { error } = await supabase.from('superintendents').update({ default_color: color }).eq('id', input.superId).eq('company_id', companyId)
    if (error) return { ok: false as const, error: error.message }
    revalidatePath(PATH)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}
