// The math behind every PM number. Pure, so the phone can show progress the
// instant a box is tapped and the server can store the exact same answer.
//
//   Checklist %      inspected applicable checks / applicable checks
//   Documentation %  documentation requirements met / requirements that apply
//
// A check counts as inspected once it is Pass or Fail AND whatever it calls
// for (photo, reading, recorded value, note) has been entered. Not Applicable
// checks, checks excluded for the store, and checks for a refrigerant the
// store does not run are left out of both sides of the fraction.

import type {
  CheckResult, CompletionRules, PmBlocker, PmCycle, PmExclusion, PmReading, PmResponse, PmStatus, ReadingRef, SystemType, TemplateItem,
} from './types'
import { DEFAULT_RULES } from './types'

/** Does a check with this label apply to a store running this system? */
export function itemApplies(applicability: string | null | undefined, system: SystemType | null | undefined): boolean {
  const label = (applicability ?? '').trim().toUpperCase()
  if (!label || label === 'ALL') return true
  // The store's system is not recorded yet: hide nothing, the technician decides.
  if (!system) return true
  return label.split('/').map((s) => s.trim()).includes(system.toUpperCase())
}

export type Missing = 'photo' | 'reading' | 'measure' | 'note' | 'deficiency'
export const MISSING_LABEL: Record<Missing, string> = {
  photo: 'Needs a photo', reading: 'Needs its readings', measure: 'Needs its value', note: 'Needs a note', deficiency: 'Needs a deficiency',
}

/**
 * excluded   left out for this store (wrong refrigerant, or a store exclusion)
 * na         marked Not Applicable on this PM, with a reason
 * todo       not inspected yet
 * incomplete Pass or Fail, but something it calls for is still missing
 * pass/fail  inspected and complete
 */
export type ItemState = 'excluded' | 'na' | 'todo' | 'incomplete' | 'pass' | 'fail'

export interface ItemEval {
  item: TemplateItem
  state: ItemState
  result: CheckResult | null
  /** In the denominator. */
  counted: boolean
  /** In the numerator. */
  done: boolean
  /** What stops it counting as inspected. */
  missing: Missing[]
  /** A Fail with no deficiency written up. Tracked apart: it is paperwork, not inspection. */
  needsDeficiency: boolean
  excludedWhy: string | null
}

export interface ProgressInput {
  items: TemplateItem[]
  system: SystemType | null
  exclusions: Pick<PmExclusion, 'itemCode' | 'reason'>[]
  responses: Pick<PmResponse, 'itemId' | 'result' | 'measureValue' | 'note'>[]
  /** itemId -> how many photos are attached to that check. */
  photoCounts: Record<string, number>
  readings: Pick<PmReading, 'tableKey' | 'colKey' | 'value'>[]
  /** itemIds that have a deficiency linked. */
  deficiencyItemIds: string[]
  techNotes?: string | null
  rules?: CompletionRules
}

export interface SectionProgress { key: string; label: string; total: number; done: number; todo: number; incomplete: number; fails: number; pct: number }

export interface Progress {
  evals: ItemEval[]
  byId: Record<string, ItemEval>
  checklistTotal: number
  checklistDone: number
  checklistPct: number
  docsTotal: number
  docsDone: number
  docsPct: number
  fails: number
  failsUnlinked: number
  uninspected: number
  incomplete: number
  sections: SectionProgress[]
}

export const pct = (done: number, total: number): number => (total <= 0 ? 0 : Math.min(100, Math.floor((done / total) * 100)))

const has = (s: string | null | undefined) => !!s && s.trim().length > 0

export function hasReading(readings: Pick<PmReading, 'tableKey' | 'colKey' | 'value'>[], ref: ReadingRef): boolean {
  return readings.some((r) => r.tableKey === ref.table && (!ref.column || r.colKey === ref.column) && has(r.value))
}

export function computeProgress(input: ProgressInput): Progress {
  const rules = input.rules ?? DEFAULT_RULES
  const excluded = new Map(input.exclusions.map((e) => [e.itemCode.trim().toUpperCase(), e.reason]))
  const responses = new Map(input.responses.map((r) => [r.itemId, r]))
  const linked = new Set(input.deficiencyItemIds)
  const sorted = [...input.items].sort((a, b) => a.sortOrder - b.sortOrder)

  let docsTotal = 0
  let docsDone = 0
  const evals: ItemEval[] = sorted.map((item) => {
    const r = responses.get(item.id)
    const result = r?.result ?? null
    const base = { item, result, missing: [] as Missing[], needsDeficiency: false, excludedWhy: null as string | null }

    if (!itemApplies(item.applicability, input.system)) {
      return { ...base, state: 'excluded', counted: false, done: false, excludedWhy: `Applies to ${item.applicability} systems only` }
    }
    const why = excluded.get(item.code.trim().toUpperCase())
    if (why !== undefined) return { ...base, state: 'excluded', counted: false, done: false, excludedWhy: why || 'Excluded for this store' }
    if (result === 'na') return { ...base, state: 'na', counted: false, done: false }

    // What this check calls for, and how much of it is in.
    const needs: [Missing, boolean, boolean][] = [
      ['photo', rules.photos && item.requiresPhoto, (input.photoCounts[item.id] ?? 0) > 0],
      ['reading', rules.readings && item.readingRefs.length > 0, item.readingRefs.every((ref) => hasReading(input.readings, ref))],
      ['measure', rules.notes && item.requiresMeasure, has(r?.measureValue)],
      ['note', rules.notes && item.requiresNote, has(r?.note)],
    ]
    const missing: Missing[] = []
    for (const [kind, required, met] of needs) {
      if (!required) continue
      docsTotal++
      if (met) docsDone++
      else missing.push(kind)
    }
    const needsDeficiency = result === 'fail' && !linked.has(item.id)
    if (result === 'fail' && rules.failsLinked) { docsTotal++; if (!needsDeficiency) docsDone++ }

    if (result === null) return { ...base, state: 'todo', counted: true, done: false, missing }
    if (missing.length) return { ...base, state: 'incomplete', counted: true, done: false, missing, needsDeficiency }
    return { ...base, state: result, counted: true, done: true, missing, needsDeficiency }
  })

  if (rules.techNotes) { docsTotal++; if (has(input.techNotes)) docsDone++ }

  const counted = evals.filter((e) => e.counted)
  const sectionMap = new Map<string, SectionProgress>()
  for (const e of evals) {
    const s = sectionMap.get(e.item.sectionKey) ?? { key: e.item.sectionKey, label: e.item.sectionLabel, total: 0, done: 0, todo: 0, incomplete: 0, fails: 0, pct: 0 }
    if (e.counted) {
      s.total++
      if (e.done) s.done++
      if (e.state === 'todo') s.todo++
      if (e.state === 'incomplete') s.incomplete++
      if (e.result === 'fail') s.fails++
    }
    sectionMap.set(e.item.sectionKey, s)
  }
  const sections = [...sectionMap.values()].map((s) => ({ ...s, pct: pct(s.done, s.total) }))
  const done = counted.filter((e) => e.done).length

  return {
    evals,
    byId: Object.fromEntries(evals.map((e) => [e.item.id, e])),
    checklistTotal: counted.length,
    checklistDone: done,
    checklistPct: pct(done, counted.length),
    docsTotal,
    docsDone,
    docsPct: docsTotal === 0 ? 100 : pct(docsDone, docsTotal),
    fails: counted.filter((e) => e.result === 'fail').length,
    failsUnlinked: counted.filter((e) => e.needsDeficiency).length,
    uninspected: counted.filter((e) => e.state === 'todo').length,
    incomplete: counted.filter((e) => e.state === 'incomplete').length,
    sections,
  }
}

/** Where "Resume where I left off" lands: the next open check after the last one touched. */
export function resumeItemId(progress: Progress, lastItemId: string | null | undefined): string | null {
  const open = (e: ItemEval) => e.state === 'todo' || e.state === 'incomplete'
  const at = lastItemId ? progress.evals.findIndex((e) => e.item.id === lastItemId) : -1
  const after = progress.evals.slice(at + 1).find(open)
  return (after ?? progress.evals.find(open))?.item.id ?? null
}

/* ── Blockers and gates ──────────────────────────────────────────────────── */

type CycleFlags = Pick<PmCycle, 'waitingFilters' | 'waitingParts' | 'returnVisitNeeded' | 'blockingDeficiencies'>

export function blockersOf(c: CycleFlags): PmBlocker[] {
  const out: PmBlocker[] = []
  if (c.waitingFilters) out.push('waiting_filters')
  if (c.waitingParts) out.push('waiting_parts')
  if (c.returnVisitNeeded) out.push('return_visit')
  if (c.blockingDeficiencies > 0) out.push('blocking_deficiency')
  return out
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * What still stands between a PM and "Field Work Complete". The technician
 * is about to leave the store, so everything that can only be done on site
 * has to be in: every check inspected, with its photos and readings.
 */
export function fieldCompleteGaps(progress: Progress, c: CycleFlags, rules: CompletionRules = DEFAULT_RULES): string[] {
  const gaps: string[] = []
  if (rules.allInspected && progress.uninspected > 0) gaps.push(`${plural(progress.uninspected, 'check')} not inspected yet`)
  const count = (m: Missing) => progress.evals.filter((e) => e.counted && e.missing.includes(m)).length
  if (count('photo') > 0) gaps.push(`${plural(count('photo'), 'check')} still ${count('photo') === 1 ? 'needs' : 'need'} a photo`)
  if (count('reading') > 0) gaps.push(`${plural(count('reading'), 'check')} still ${count('reading') === 1 ? 'needs' : 'need'} readings`)
  if (count('measure') + count('note') > 0) gaps.push(`${plural(count('measure') + count('note'), 'check')} still ${count('measure') + count('note') === 1 ? 'needs' : 'need'} a recorded value or note`)
  if (c.returnVisitNeeded) gaps.push('A return visit is flagged')
  if (rules.materialsClosed && c.waitingFilters) gaps.push('Filters are still outstanding')
  if (rules.materialsClosed && c.waitingParts) gaps.push('Parts are still outstanding')
  if (c.blockingDeficiencies > 0) gaps.push(`${plural(c.blockingDeficiencies, 'deficiency', 'deficiencies')} marked as holding up the PM`)
  return gaps
}

export interface CloseoutFacts extends CycleFlags {
  techNotes: string | null
  submittedOn: string | null
  status: PmStatus
  reportCount: number
}

/**
 * What still stands between a PM and "Completed". Ticking every box is not
 * enough: this is the list the configurable completion rules produce.
 * Open deficiencies are deliberately not on it unless they were marked as
 * holding up the PM: a repair that follows the PM is a separate job.
 */
export function completionGaps(progress: Progress, facts: CloseoutFacts, rules: CompletionRules = DEFAULT_RULES): string[] {
  const gaps = fieldCompleteGaps(progress, facts, rules)
  if (rules.failsLinked && progress.failsUnlinked > 0) gaps.push(`${plural(progress.failsUnlinked, 'failed check')} with no deficiency written up`)
  if (rules.techNotes && !has(facts.techNotes)) gaps.push('Technician notes are empty')
  if (rules.submitted && !facts.submittedOn) gaps.push('The date the documentation was submitted is not recorded')
  if (rules.reportGenerated && facts.reportCount === 0) gaps.push('No PM report has been generated')
  if (facts.status === 'cancelled') gaps.push('This PM is cancelled')
  return gaps
}

/* ── Buckets and flags for the dashboards ────────────────────────────────── */

export type ProgressBucket = '0' | '1-25' | '26-50' | '51-75' | '76-99' | '100'
export const PROGRESS_BUCKETS: ProgressBucket[] = ['0', '1-25', '26-50', '51-75', '76-99', '100']
export const BUCKET_LABEL: Record<ProgressBucket, string> = { '0': '0%', '1-25': '1 to 25%', '26-50': '26 to 50%', '51-75': '51 to 75%', '76-99': '76 to 99%', '100': '100%' }

export function bucketOf(percent: number): ProgressBucket {
  if (percent <= 0) return '0'
  if (percent <= 25) return '1-25'
  if (percent <= 50) return '26-50'
  if (percent <= 75) return '51-75'
  if (percent < 100) return '76-99'
  return '100'
}

export const cyclePct = (c: Pick<PmCycle, 'checklistDone' | 'checklistTotal'>) => pct(c.checklistDone, c.checklistTotal)
export const cycleDocsPct = (c: Pick<PmCycle, 'docsDone' | 'docsTotal'>) => (c.docsTotal === 0 ? 100 : pct(c.docsDone, c.docsTotal))

export function isOverdue(c: Pick<PmCycle, 'dueDate' | 'status'>, today: string): boolean {
  return !!c.dueDate && c.dueDate < today && c.status !== 'completed' && c.status !== 'cancelled'
}

/** Average checklist % across PMs that have a checklist started. */
export function averagePct(cycles: Pick<PmCycle, 'checklistDone' | 'checklistTotal' | 'status'>[]): number {
  const live = cycles.filter((c) => c.status !== 'cancelled' && c.checklistTotal > 0)
  if (!live.length) return 0
  return Math.round(live.reduce((s, c) => s + cyclePct(c), 0) / live.length)
}

/** One dropdown filters by lifecycle status, by blocker, or by a flag. */
export type StatusFilter = '' | PmStatus | PmBlocker | 'overdue' | 'no_job'

export function matchesStatus(
  c: Pick<PmCycle, 'status' | 'dueDate' | 'jobNumber' | 'waitingFilters' | 'waitingParts' | 'returnVisitNeeded' | 'blockingDeficiencies'>,
  f: StatusFilter, today: string,
): boolean {
  if (!f) return true
  if (f === 'overdue') return isOverdue(c, today)
  if (f === 'no_job') return !c.jobNumber && c.status !== 'cancelled'
  if (f === 'waiting_filters' || f === 'waiting_parts' || f === 'return_visit' || f === 'blocking_deficiency') return blockersOf(c).includes(f)
  return c.status === f
}
