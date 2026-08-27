// Schedule intelligence: critical path, float, variance, and move impact.
//
// Pure functions over plain data, no I/O, so the same math runs on the server
// (command center, board aggregates) and in the browser (Gantt) and can be
// unit-tested without a database.
//
// The model is classic CPM adapted to how PhaseForge stores schedules:
// phases carry concrete start/end DATES (not durations waiting to be
// scheduled), and dependencies constrain how early a phase may start.
// The forward pass therefore computes the earliest each phase COULD sit
// given its predecessors; the backward pass computes the latest it could sit
// without pushing project completion; float is the difference. A phase with
// no float is critical: slip it a day and the project completion moves.
//
// Dependency types follow the existing phase_dependencies.type column:
//   finish_to_start  (FS): successor starts after predecessor finishes
//   start_to_start   (SS): successor starts after predecessor starts
//   finish_to_finish (FF): successor finishes after predecessor finishes
// lag_days shifts the constraint in days (can be negative for leads).

import { addDays, differenceInDays, parseISO } from '@/lib/dates'

export interface SchedulePhase {
  id: string
  start_date: string   // yyyy-MM-dd
  end_date: string     // yyyy-MM-dd
  name?: string
  is_milestone?: boolean | null
  status?: string
}

export interface ScheduleDependency {
  phase_id: string        // the successor
  depends_on_id: string   // the predecessor
  type: 'finish_to_start' | 'start_to_start' | 'finish_to_finish'
  lag_days: number
}

export interface PhaseScheduleInfo {
  id: string
  durationDays: number       // inclusive of both endpoints, min 1
  earlyStart: number         // day offsets from the project origin
  earlyFinish: number
  lateStart: number
  lateFinish: number
  totalFloat: number         // days of slack before completion moves
  isCritical: boolean
}

export interface ScheduleAnalysis {
  ok: true
  phases: Map<string, PhaseScheduleInfo>
  criticalIds: Set<string>
  /** Latest end date across all phases: the schedule's completion. */
  completionDate: string | null
  originDate: string | null
}

export interface ScheduleCycleError {
  ok: false
  /** Phase ids participating in (or downstream of) the circular dependency. */
  cycleIds: string[]
}

const DAY = (iso: string) => parseISO(iso)

function fmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** Inclusive calendar duration; a one-day phase is 1, never 0. */
export function phaseDuration(p: Pick<SchedulePhase, 'start_date' | 'end_date'>): number {
  return Math.max(1, differenceInDays(DAY(p.end_date), DAY(p.start_date)) + 1)
}

/**
 * Topological order via Kahn's algorithm. Returns null when a cycle exists,
 * with the ids that never became orderable (the cycle and its downstream).
 */
function topoOrder(
  ids: string[],
  preds: Map<string, ScheduleDependency[]>,
  succs: Map<string, ScheduleDependency[]>,
): { order: string[] } | { cycle: string[] } {
  const inDeg = new Map<string, number>(ids.map((id) => [id, preds.get(id)?.length ?? 0]))
  const queue = ids.filter((id) => (inDeg.get(id) ?? 0) === 0)
  const order: string[] = []
  while (queue.length) {
    const id = queue.shift() as string
    order.push(id)
    for (const dep of succs.get(id) ?? []) {
      const d = (inDeg.get(dep.phase_id) ?? 0) - 1
      inDeg.set(dep.phase_id, d)
      if (d === 0) queue.push(dep.phase_id)
    }
  }
  if (order.length !== ids.length) {
    const placed = new Set(order)
    return { cycle: ids.filter((id) => !placed.has(id)) }
  }
  return { order }
}

/**
 * Run CPM over a project's phases.
 *
 * Phases with no dependency network still get correct answers: each phase's
 * early window is where it actually sits on the calendar, and its float is
 * the room between its finish and project completion. That means a project
 * that has never drawn a dependency still shows a sensible critical set (the
 * phases that end at completion) instead of pretending everything is slack.
 */
export function analyzeSchedule(
  phases: SchedulePhase[],
  dependencies: ScheduleDependency[],
): ScheduleAnalysis | ScheduleCycleError {
  const valid = phases.filter((p) => p.start_date && p.end_date)
  if (valid.length === 0) {
    return { ok: true, phases: new Map(), criticalIds: new Set(), completionDate: null, originDate: null }
  }

  const byId = new Map(valid.map((p) => [p.id, p]))
  // Ignore dependencies pointing at phases that are not in this set (deleted
  // phases, cross-project rows): a stale row must not poison the analysis.
  const deps = dependencies.filter((d) => byId.has(d.phase_id) && byId.has(d.depends_on_id))

  const preds = new Map<string, ScheduleDependency[]>()
  const succs = new Map<string, ScheduleDependency[]>()
  for (const d of deps) {
    preds.set(d.phase_id, [...(preds.get(d.phase_id) ?? []), d])
    succs.set(d.depends_on_id, [...(succs.get(d.depends_on_id) ?? []), d])
  }

  const ids = valid.map((p) => p.id)
  const topo = topoOrder(ids, preds, succs)
  if ('cycle' in topo) return { ok: false, cycleIds: topo.cycle }

  // Origin: the earliest calendar date on the schedule. All math in integer
  // day offsets from there, converted back to dates only at the edges.
  const origin = valid.reduce((min, p) => {
    const s = DAY(p.start_date)
    return s < min ? s : min
  }, DAY(valid[0].start_date))
  const off = (iso: string) => differenceInDays(DAY(iso), origin)

  const dur = new Map(valid.map((p) => [p.id, phaseDuration(p)]))

  // ── Forward pass: earliest window ─────────────────────────────────────────
  // A phase can never be scheduled earlier than where it actually sits (its
  // planned start is a constraint too — crews are booked for those dates).
  const ES = new Map<string, number>()
  const EF = new Map<string, number>()
  for (const id of topo.order) {
    const p = byId.get(id) as SchedulePhase
    const d = dur.get(id) as number
    let es = off(p.start_date)
    for (const dep of preds.get(id) ?? []) {
      const predEF = EF.get(dep.depends_on_id) as number
      const predES = ES.get(dep.depends_on_id) as number
      const lag = dep.lag_days ?? 0
      if (dep.type === 'start_to_start') es = Math.max(es, predES + lag)
      else if (dep.type === 'finish_to_finish') es = Math.max(es, predEF + lag - (d - 1))
      else es = Math.max(es, predEF + 1 + lag) // finish_to_start
    }
    ES.set(id, es)
    EF.set(id, es + d - 1)
  }

  const completion = Math.max(...ids.map((id) => EF.get(id) as number))

  // ── Backward pass: latest window without moving completion ────────────────
  const LF = new Map<string, number>()
  const LS = new Map<string, number>()
  for (const id of [...topo.order].reverse()) {
    const d = dur.get(id) as number
    let lf = completion
    for (const dep of succs.get(id) ?? []) {
      const succLS = LS.get(dep.phase_id) as number
      const succLF = LF.get(dep.phase_id) as number
      const lag = dep.lag_days ?? 0
      if (dep.type === 'start_to_start') lf = Math.min(lf, succLS - lag + (d - 1))
      else if (dep.type === 'finish_to_finish') lf = Math.min(lf, succLF - lag)
      else lf = Math.min(lf, succLS - 1 - lag) // finish_to_start
    }
    LF.set(id, lf)
    LS.set(id, lf - d + 1)
  }

  const infos = new Map<string, PhaseScheduleInfo>()
  const criticalIds = new Set<string>()
  for (const id of ids) {
    const totalFloat = (LF.get(id) as number) - (EF.get(id) as number)
    const isCritical = totalFloat <= 0
    if (isCritical) criticalIds.add(id)
    infos.set(id, {
      id,
      durationDays: dur.get(id) as number,
      earlyStart: ES.get(id) as number,
      earlyFinish: EF.get(id) as number,
      lateStart: LS.get(id) as number,
      lateFinish: LF.get(id) as number,
      totalFloat,
      isCritical,
    })
  }

  return {
    ok: true,
    phases: infos,
    criticalIds,
    completionDate: fmt(addDays(origin, completion)),
    originDate: fmt(origin),
  }
}

// ── Move impact ──────────────────────────────────────────────────────────────

export interface MoveImpact {
  /** Downstream phases whose dates would shift, with their new windows. */
  affected: { id: string; name: string; deltaDays: number; newStart: string; newEnd: string }[]
  /** Days the project completion moves (0 when absorbed by float). */
  completionDeltaDays: number
  newCompletionDate: string | null
  /** True when the schedule has a cycle and impact could not be computed. */
  cycleError: boolean
}

/**
 * What happens if one phase moves by deltaDays and its dependents are pushed
 * just enough to stay legal (never pulled earlier than they already sit).
 *
 * This is the honest "review impact" answer shown before a cascade is
 * applied: each successor moves only as far as the violated constraint
 * forces it, so a successor with slack absorbs part of the delay.
 */
export function computeMoveImpact(
  phases: SchedulePhase[],
  dependencies: ScheduleDependency[],
  movedId: string,
  deltaDays: number,
): MoveImpact {
  const before = analyzeSchedule(phases, dependencies)
  if (!before.ok) return { affected: [], completionDeltaDays: 0, newCompletionDate: null, cycleError: true }

  const shifted = new Map<string, number>([[movedId, deltaDays]])
  const byId = new Map(phases.map((p) => [p.id, p]))
  const deps = dependencies.filter((d) => byId.has(d.phase_id) && byId.has(d.depends_on_id))
  const succs = new Map<string, ScheduleDependency[]>()
  const preds = new Map<string, ScheduleDependency[]>()
  for (const d of deps) {
    succs.set(d.depends_on_id, [...(succs.get(d.depends_on_id) ?? []), d])
    preds.set(d.phase_id, [...(preds.get(d.phase_id) ?? []), d])
  }

  // Process in topological order so each phase settles after its predecessors.
  const topo = topoOrder(phases.map((p) => p.id), preds, succs)
  if ('cycle' in topo) return { affected: [], completionDeltaDays: 0, newCompletionDate: null, cycleError: true }

  const start = (id: string) => DAY((byId.get(id) as SchedulePhase).start_date)
  const end = (id: string) => DAY((byId.get(id) as SchedulePhase).end_date)
  const shiftedStart = (id: string) => addDays(start(id), shifted.get(id) ?? 0)
  const shiftedEnd = (id: string) => addDays(end(id), shifted.get(id) ?? 0)

  for (const id of topo.order) {
    if (id === movedId) continue
    let need = shifted.get(id) ?? 0
    for (const dep of preds.get(id) ?? []) {
      if (!shifted.has(dep.depends_on_id)) continue
      const lag = dep.lag_days ?? 0
      let required = 0
      if (dep.type === 'start_to_start') {
        required = differenceInDays(addDays(shiftedStart(dep.depends_on_id), lag), start(id))
      } else if (dep.type === 'finish_to_finish') {
        required = differenceInDays(addDays(shiftedEnd(dep.depends_on_id), lag), end(id))
      } else {
        required = differenceInDays(addDays(shiftedEnd(dep.depends_on_id), 1 + lag), start(id))
      }
      need = Math.max(need, required)
    }
    if (need > 0) shifted.set(id, need)
  }

  const affected = [...shifted.entries()]
    .filter(([id, d]) => id !== movedId && d > 0)
    .map(([id, d]) => {
      const p = byId.get(id) as SchedulePhase
      return {
        id,
        name: p.name ?? 'Phase',
        deltaDays: d,
        newStart: fmt(addDays(DAY(p.start_date), d)),
        newEnd: fmt(addDays(DAY(p.end_date), d)),
      }
    })
    .sort((a, b) => b.deltaDays - a.deltaDays)

  // Completion after: every phase at its shifted position.
  const afterPhases = phases.map((p) => {
    const d = shifted.get(p.id) ?? 0
    if (d === 0) return p
    return { ...p, start_date: fmt(addDays(DAY(p.start_date), d)), end_date: fmt(addDays(DAY(p.end_date), d)) }
  })
  const newCompletion = afterPhases.reduce<Date | null>((max, p) => {
    if (!p.end_date) return max
    const e = DAY(p.end_date)
    return !max || e > max ? e : max
  }, null)
  const oldCompletion = phases.reduce<Date | null>((max, p) => {
    if (!p.end_date) return max
    const e = DAY(p.end_date)
    return !max || e > max ? e : max
  }, null)

  return {
    affected,
    completionDeltaDays: newCompletion && oldCompletion ? differenceInDays(newCompletion, oldCompletion) : 0,
    newCompletionDate: newCompletion ? fmt(newCompletion) : null,
    cycleError: false,
  }
}

// ── Baseline variance ────────────────────────────────────────────────────────

export interface BaselinePhaseSnapshot {
  phase_id: string
  name: string
  start_date: string
  end_date: string
}

export interface PhaseVariance {
  phaseId: string
  name: string
  startVarianceDays: number   // + is later than baseline
  finishVarianceDays: number
  durationDeltaDays: number
  kind: 'moved_later' | 'moved_earlier' | 'extended' | 'shortened' | 'unchanged'
}

export interface BaselineComparison {
  phaseVariances: PhaseVariance[]
  added: { id: string; name: string }[]
  removed: { phase_id: string; name: string }[]
  movedLater: number
  movedEarlier: number
  durationChanges: number
  completionVarianceDays: number
  baselineCompletion: string | null
  currentCompletion: string | null
}

/** Current schedule against a baseline snapshot, phase by phase. */
export function compareToBaseline(
  phases: SchedulePhase[],
  baseline: BaselinePhaseSnapshot[],
): BaselineComparison {
  const baseById = new Map(baseline.map((b) => [b.phase_id, b]))
  const liveIds = new Set(phases.map((p) => p.id))

  const phaseVariances: PhaseVariance[] = []
  for (const p of phases) {
    const b = baseById.get(p.id)
    if (!b || !p.start_date || !p.end_date) continue
    const sv = differenceInDays(DAY(p.start_date), DAY(b.start_date))
    const fv = differenceInDays(DAY(p.end_date), DAY(b.end_date))
    const dd = phaseDuration(p) - phaseDuration(b)
    let kind: PhaseVariance['kind'] = 'unchanged'
    if (dd > 0) kind = 'extended'
    else if (dd < 0) kind = 'shortened'
    else if (fv > 0) kind = 'moved_later'
    else if (fv < 0) kind = 'moved_earlier'
    if (kind !== 'unchanged') {
      phaseVariances.push({ phaseId: p.id, name: p.name ?? b.name, startVarianceDays: sv, finishVarianceDays: fv, durationDeltaDays: dd, kind })
    }
  }

  const maxEnd = (list: { end_date: string }[]) =>
    list.reduce<Date | null>((max, x) => {
      if (!x.end_date) return max
      const e = DAY(x.end_date)
      return !max || e > max ? e : max
    }, null)

  const baseC = maxEnd(baseline)
  const curC = maxEnd(phases.filter((p) => p.end_date))

  return {
    phaseVariances: phaseVariances.sort((a, b) => Math.abs(b.finishVarianceDays) - Math.abs(a.finishVarianceDays)),
    added: phases.filter((p) => !baseById.has(p.id)).map((p) => ({ id: p.id, name: p.name ?? 'Phase' })),
    removed: baseline.filter((b) => !liveIds.has(b.phase_id)).map((b) => ({ phase_id: b.phase_id, name: b.name })),
    movedLater: phaseVariances.filter((v) => v.kind === 'moved_later').length,
    movedEarlier: phaseVariances.filter((v) => v.kind === 'moved_earlier').length,
    durationChanges: phaseVariances.filter((v) => v.kind === 'extended' || v.kind === 'shortened').length,
    completionVarianceDays: baseC && curC ? differenceInDays(curC, baseC) : 0,
    baselineCompletion: baseC ? fmt(baseC) : null,
    currentCompletion: curC ? fmt(curC) : null,
  }
}

// ── Lookahead ────────────────────────────────────────────────────────────────

export interface LookaheadRow {
  phase: SchedulePhase
  state: 'in_progress' | 'starting' | 'finishing' | 'spanning'
  blockedBy: { id: string; name: string }[]
}

/**
 * The slice of the master schedule active inside a window — the 2/3/6 week
 * lookahead a superintendent runs a meeting from. Derived, never a copy.
 */
export function buildLookahead(
  phases: SchedulePhase[],
  dependencies: ScheduleDependency[],
  fromIso: string,
  weeks: number,
): LookaheadRow[] {
  const from = DAY(fromIso)
  const to = addDays(from, weeks * 7 - 1)
  const byId = new Map(phases.map((p) => [p.id, p]))
  const preds = new Map<string, ScheduleDependency[]>()
  for (const d of dependencies) preds.set(d.phase_id, [...(preds.get(d.phase_id) ?? []), d])

  const rows: LookaheadRow[] = []
  for (const p of phases) {
    if (!p.start_date || !p.end_date) continue
    if (p.status === 'completed' || p.status === 'skipped') continue
    const s = DAY(p.start_date)
    const e = DAY(p.end_date)
    if (e < from || s > to) continue

    const startsIn = s >= from
    const endsIn = e <= to
    const state: LookaheadRow['state'] =
      startsIn && endsIn ? 'in_progress' : startsIn ? 'starting' : endsIn ? 'finishing' : 'spanning'

    // A predecessor that is not complete and has not finished by this
    // phase's start is a real-world blocker worth flagging in the meeting.
    const blockedBy = (preds.get(p.id) ?? [])
      .map((d) => byId.get(d.depends_on_id))
      .filter((pre): pre is SchedulePhase => !!pre)
      .filter((pre) => pre.status !== 'completed' && pre.status !== 'skipped' && DAY(pre.end_date) >= s)
      .map((pre) => ({ id: pre.id, name: pre.name ?? 'Phase' }))

    rows.push({ phase: p, state, blockedBy })
  }

  return rows.sort((a, b) => a.phase.start_date.localeCompare(b.phase.start_date))
}
