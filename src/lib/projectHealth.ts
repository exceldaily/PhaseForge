// Deterministic project health scoring.
//
// Every number here traces to real project data through a documented rule —
// no model, no randomness, and every deduction can be shown to the user as a
// plain sentence ("Why is this project At Risk?"). The same function feeds
// the Command Center, the board cards, and Smart Priority, so a project can
// never be healthy on one screen and at risk on another.
//
// SCORING MODEL
// The overall score is a weighted average of five component scores, each
// 0–100, each computed from deductions off a perfect 100:
//
//   schedule   35%  slip vs plan (or baseline), overdue phases
//   progress   20%  open/blocked work, completion vs time elapsed
//   cos        15%  aging unresolved change orders
//   punch      15%  open and overdue punch items
//   freshness  15%  how recently anyone has touched the project
//
// Bands: 80+ healthy · 60–79 at risk · below 60 delayed. These map onto the
// existing three-level pill system (on_track / at_risk / delayed) so the
// board keeps its established visual language.

import { differenceInDays, parseISO } from '@/lib/dates'
import type { ProjectHealth } from '@/lib/projectBoard'

export interface HealthInput {
  /** Project planned dates. */
  startDate: string | null
  endDate: string | null
  /** Baseline completion when one exists; otherwise null. */
  baselineEnd: string | null
  status: string
  /** Phase rollups. */
  totalPhases: number
  completedPhases: number
  blockedPhases: number
  overduePhases: number          // past end_date and not complete
  maxPhaseOverdueDays: number
  progressPercent: number        // 0–100 from phase percent rollup
  /** Latest phase end date = current scheduled completion. */
  scheduledCompletion: string | null
  /** Change orders. */
  openCoCount: number
  oldestOpenCoDays: number
  /** Punch. */
  openPunchCount: number
  overduePunchCount: number
  /** Timeline freshness. */
  lastActivityAt: string | null
  /** "Now" is injected so scoring is reproducible in tests. */
  today: string
}

export interface HealthComponent {
  key: 'schedule' | 'progress' | 'change_orders' | 'punch' | 'freshness'
  label: string
  score: number
  weight: number
}

export interface AttentionItem {
  severity: 'critical' | 'warning' | 'info'
  text: string
  /** Where clicking should take the user, relative to the project. */
  target: 'gantt' | 'tasks' | 'punch' | 'change-orders' | 'activity' | 'overview'
  /** Days old / days overdue when meaningful, for sorting. */
  ageDays?: number
}

export interface ProjectHealthResult {
  score: number
  level: ProjectHealth
  components: HealthComponent[]
  /** Plain-language reasons behind the deductions, worst first. */
  reasons: string[]
  attention: AttentionItem[]
  /** Days the scheduled completion sits past the plan (0 = on plan). */
  slipDays: number
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)))
const days = (a: string, b: string) => differenceInDays(parseISO(a), parseISO(b))

const CLOSED = new Set(['closed', 'completed', 'cancelled'])

export function scoreProjectHealth(input: HealthInput): ProjectHealthResult {
  const reasons: string[] = []
  const attention: AttentionItem[] = []
  const today = input.today

  // ── Schedule (35%) ─────────────────────────────────────────────────────────
  // Reference completion: baseline when set (that is its whole point),
  // otherwise the project's planned end date.
  const planEnd = input.baselineEnd ?? input.endDate
  let slipDays = 0
  if (planEnd && input.scheduledCompletion) {
    slipDays = Math.max(0, days(input.scheduledCompletion, planEnd))
  }
  let schedule = 100
  if (slipDays > 0) {
    schedule -= Math.min(60, slipDays * 6)      // 10 days of slip zeroes most of it
    reasons.push(`Completion has slipped ${slipDays} day${slipDays === 1 ? '' : 's'} past ${input.baselineEnd ? 'the baseline' : 'the plan'}.`)
    attention.push({
      severity: slipDays >= 5 ? 'critical' : 'warning',
      text: `Project completion slipped ${slipDays} day${slipDays === 1 ? '' : 's'}`,
      target: 'gantt',
      ageDays: slipDays,
    })
  }
  if (input.overduePhases > 0) {
    schedule -= Math.min(40, input.overduePhases * 8)
    reasons.push(`${input.overduePhases} ${input.overduePhases === 1 ? 'phase is' : 'phases are'} past their finish date.`)
    attention.push({
      severity: input.maxPhaseOverdueDays >= 7 ? 'critical' : 'warning',
      text: `${input.overduePhases} overdue ${input.overduePhases === 1 ? 'phase' : 'phases'}${input.maxPhaseOverdueDays > 0 ? `, worst by ${input.maxPhaseOverdueDays} days` : ''}`,
      target: 'gantt',
      ageDays: input.maxPhaseOverdueDays,
    })
  }
  schedule = clamp(schedule)

  // ── Progress (20%) ─────────────────────────────────────────────────────────
  // Being behind the calendar matters, not raw percent: 40% done is fine in
  // month two of ten and a problem in month nine.
  let progress = 100
  if (input.startDate && input.endDate && !CLOSED.has(input.status)) {
    const total = Math.max(1, days(input.endDate, input.startDate))
    const elapsed = Math.min(total, Math.max(0, days(today, input.startDate)))
    const expectedPct = (elapsed / total) * 100
    const gap = expectedPct - input.progressPercent
    if (gap > 10) {
      progress -= Math.min(55, (gap - 10) * 1.6)
      reasons.push(`Work is ${Math.round(gap)} points behind the calendar (${input.progressPercent}% done, ${Math.round(expectedPct)}% of the time gone).`)
    }
  }
  if (input.blockedPhases > 0) {
    progress -= Math.min(30, input.blockedPhases * 12)
    reasons.push(`${input.blockedPhases} ${input.blockedPhases === 1 ? 'phase is' : 'phases are'} blocked.`)
    attention.push({
      severity: 'critical',
      text: `${input.blockedPhases} blocked ${input.blockedPhases === 1 ? 'phase' : 'phases'}`,
      target: 'tasks',
    })
  }
  progress = clamp(progress)

  // ── Change orders (15%) ────────────────────────────────────────────────────
  let cos = 100
  if (input.oldestOpenCoDays >= 7) {
    cos -= Math.min(60, (input.oldestOpenCoDays - 6) * 6)
    reasons.push(`A change order has sat unresolved for ${input.oldestOpenCoDays} days.`)
    attention.push({
      severity: input.oldestOpenCoDays >= 14 ? 'critical' : 'warning',
      text: `Change order unresolved for ${input.oldestOpenCoDays} days`,
      target: 'change-orders',
      ageDays: input.oldestOpenCoDays,
    })
  }
  if (input.openCoCount >= 3) {
    cos -= Math.min(25, (input.openCoCount - 2) * 5)
    reasons.push(`${input.openCoCount} change orders are open at once.`)
  }
  cos = clamp(cos)

  // ── Punch (15%) ────────────────────────────────────────────────────────────
  let punch = 100
  if (input.overduePunchCount > 0) {
    punch -= Math.min(50, input.overduePunchCount * 10)
    reasons.push(`${input.overduePunchCount} punch ${input.overduePunchCount === 1 ? 'item is' : 'items are'} past due.`)
    attention.push({
      severity: 'warning',
      text: `${input.overduePunchCount} overdue punch ${input.overduePunchCount === 1 ? 'item' : 'items'}`,
      target: 'punch',
    })
  }
  if (input.openPunchCount >= 10) {
    punch -= Math.min(30, (input.openPunchCount - 9) * 3)
    reasons.push(`${input.openPunchCount} punch items remain open.`)
  }
  punch = clamp(punch)

  // ── Freshness (15%) ────────────────────────────────────────────────────────
  // A live job someone is working leaves a trail. Silence is a signal.
  let freshness = 100
  let staleDays = 0
  if (!CLOSED.has(input.status)) {
    if (input.lastActivityAt) staleDays = Math.max(0, days(today, input.lastActivityAt.slice(0, 10)))
    else staleDays = 30
    if (staleDays >= 7) {
      freshness -= Math.min(70, (staleDays - 6) * 8)
      reasons.push(`No project update in ${staleDays} days.`)
      attention.push({
        severity: staleDays >= 14 ? 'warning' : 'info',
        text: `No update in ${staleDays} days`,
        target: 'activity',
        ageDays: staleDays,
      })
    }
  }
  freshness = clamp(freshness)

  const components: HealthComponent[] = [
    { key: 'schedule', label: 'Schedule', score: schedule, weight: 0.35 },
    { key: 'progress', label: 'Progress', score: progress, weight: 0.2 },
    { key: 'change_orders', label: 'Change Orders', score: cos, weight: 0.15 },
    { key: 'punch', label: 'Punch List', score: punch, weight: 0.15 },
    { key: 'freshness', label: 'Updates', score: freshness, weight: 0.15 },
  ]
  const score = clamp(components.reduce((sum, c) => sum + c.score * c.weight, 0))
  const level: ProjectHealth = score >= 80 ? 'on_track' : score >= 60 ? 'at_risk' : 'delayed'

  const rank = { critical: 0, warning: 1, info: 2 } as const
  attention.sort((a, b) => rank[a.severity] - rank[b.severity] || (b.ageDays ?? 0) - (a.ageDays ?? 0))

  return { score, level, components, reasons, attention, slipDays }
}

// ── Smart Priority ───────────────────────────────────────────────────────────
// Board ordering: highest number = needs eyes first. Documented so nobody has
// to reverse-engineer why a project floated to the top:
//   (100 - health)      the core signal, everything above already weighs in
//   + 3 per attention item (max 15)   many small fires beat one clean score
//   + 8 if anything critical          a hard problem always outranks drift
//   + up to 10 for a completion date inside 14 days   crunch time surfaces
export function smartPriority(health: ProjectHealthResult, endDate: string | null, today: string): number {
  let p = 100 - health.score
  p += Math.min(15, health.attention.length * 3)
  if (health.attention.some((a) => a.severity === 'critical')) p += 8
  if (endDate) {
    const toEnd = days(endDate, today)
    if (toEnd >= 0 && toEnd <= 14) p += Math.round(10 * (1 - toEnd / 14))
  }
  return p
}
