// Priority scoring + smart queues for the Dispatch command center.
// Ported from DispatchForge's priority-engine (behavior preserved).
import type { CallWithRelations, PrioritizedCall, CallStatus, NextAction } from './types'
import { calendarDateKey, localDateKey } from './utils'

const DAY_MS = 1000 * 60 * 60 * 24

export function daysBetween(from: string, to: Date = new Date()): number {
  const start = new Date(from).getTime()
  return Math.max(0, Math.floor((to.getTime() - start) / DAY_MS))
}

export function isSameDay(dateStr: string, ref: Date = new Date()): boolean {
  return calendarDateKey(dateStr) === localDateKey(ref)
}

export function isTomorrow(dateStr: string, ref: Date = new Date()): boolean {
  const tomorrow = new Date(ref)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return isSameDay(dateStr, tomorrow)
}

const CLOSED_STATUSES: CallStatus[] = ['completed', 'cancelled']

export function dedupeCallsById<T extends { id: string }>(calls: T[]): T[] {
  const unique = new Map<string, T>()
  for (const call of calls) {
    if (!unique.has(call.id)) unique.set(call.id, call)
  }
  return Array.from(unique.values())
}

// Suggests the dispatcher's next move from status/assignment/parts/proposal
// state. A manual override on the call always wins (see resolveNextAction).
export function recommendNextAction(call: CallWithRelations): NextAction {
  const { status, assigned_vendor_id, eta_scheduled, part_status, proposal_status } = call

  if (status === 'completed' || status === 'cancelled') return 'none'
  if (status === 'proposal_rejected') return 'close_call'
  if (status === 'quote_requested') return 'send_proposal'
  if (status === 'proposal_sent') return 'await_customer_approval'
  if (status === 'proposal_approved' && proposal_status === 'approved') return 'check_part_shipping'
  if (status === 'recall') return assigned_vendor_id ? 'follow_up_vendor' : 'assign_vendor'
  if (status === 'part_received' || part_status === 'received') return 'schedule_repair'
  if (status === 'parts_on_order') return 'check_part_shipping'
  if (status === 'open' && !assigned_vendor_id) return 'assign_vendor'
  if (status === 'open' && !eta_scheduled) return 'request_eta'
  if (status === 'incomplete') return 'follow_up_vendor'
  if (status === 'in_progress' && !eta_scheduled) return 'request_eta'
  if (status === 'in_progress') return 'follow_up_vendor'
  return 'none'
}

export function resolveNextAction(call: CallWithRelations): NextAction {
  return call.next_action && call.next_action !== 'none' ? call.next_action : recommendNextAction(call)
}

interface ScoreResult { score: number; reasons: string[] }

// Higher score = needs attention sooner. Tier bands with continuous scoring
// inside each tier so aging/missing-data factors can still reorder calls.
function scoreCall(call: CallWithRelations, now: Date): ScoreResult {
  const reasons: string[] = []
  let score = 0

  const daysOpen = daysBetween(call.date_started, now)
  const daysSinceUpdate = daysBetween(call.updated_at, now)
  const isUrgent = call.urgency === 'urgent'
  const hasVendor = !!call.assigned_vendor_id
  const hasEta = !!call.eta_scheduled
  const scheduledDatePassed = call.scheduled_date
    ? calendarDateKey(call.scheduled_date) < localDateKey(now) && !CLOSED_STATUSES.includes(call.status)
    : false

  if (call.status === 'completed' || call.status === 'cancelled') {
    score = 100
  } else if (call.status === 'parts_on_order') {
    score = 3000
  } else if (isTomorrow(call.scheduled_date ?? '')) {
    score = 3500
    reasons.push('Scheduled tomorrow')
  } else if (isSameDay(call.scheduled_date ?? '')) {
    score = 4000
    reasons.push('Scheduled today')
  } else if (call.status === 'proposal_approved' || call.proposal_status === 'approved') {
    score = 4500
    reasons.push('Proposal approved — ready for action')
  } else if (call.status === 'part_received') {
    score = 5000
    reasons.push('Parts received — ready to schedule')
  } else if (call.status === 'recall') {
    score = 5500
    reasons.push('Recall')
  } else if (call.status === 'incomplete') {
    score = 6000
    reasons.push('Incomplete — needs follow-up')
  } else if (call.status === 'open' && !hasEta) {
    score = 7000
    reasons.push('No ETA')
  } else if (call.status === 'open' && !hasVendor) {
    score = 8000
    reasons.push('No tech/vendor assigned')
  } else if (call.status === 'open') {
    score = 9000
  } else {
    score = 2500
  }

  if (isUrgent && !CLOSED_STATUSES.includes(call.status)) {
    score += 5000
    reasons.push('Urgent')
  }

  if (call.needs_acknowledgment) {
    score += 10000
    reasons.push('New — needs review')
  }

  if (!CLOSED_STATUSES.includes(call.status)) {
    const agingBoost = Math.min(daysOpen * 15, 600)
    score += agingBoost
    if (daysOpen >= 3) reasons.push(`Open ${daysOpen} days`)

    if (daysSinceUpdate >= 2) {
      score += Math.min(daysSinceUpdate * 10, 300)
      reasons.push(`No update in ${daysSinceUpdate} days`)
    }

    if (scheduledDatePassed) {
      score += 400
      reasons.push('Scheduled date passed')
    }

    if (!hasVendor && call.status !== 'open') {
      score += 150
      reasons.push('Unassigned')
    }
  }

  return { score, reasons }
}

export function prioritizeCalls(calls: CallWithRelations[], now: Date = new Date()): PrioritizedCall[] {
  return calls
    .map((call) => {
      const { score, reasons } = scoreCall(call, now)
      return {
        ...call,
        priority_score: score,
        priority_reasons: reasons,
        days_open: daysBetween(call.date_started, now),
        days_since_update: daysBetween(call.updated_at, now),
      }
    })
    .sort((a, b) => b.priority_score - a.priority_score)
}

// ── Smart sections (Command Center chips) — ported from DispatchForge ───────

export type SmartSection =
  | 'new_unacknowledged'
  | 'needs_dispatch'
  | 'no_tech'
  | 'missing_eta'
  | 'follow_up'
  | 'parts_received'
  | 'proposal_approved'
  | 'scheduled_today'
  | 'scheduled_tomorrow'
  | 'aging'
  | 'recently_completed'

export const SMART_SECTION_LABELS: Record<SmartSection, string> = {
  new_unacknowledged: 'New — Needs Review',
  needs_dispatch: 'Needs Dispatch Now',
  no_tech: 'No Tech or Vendor Assigned',
  missing_eta: 'Missing ETA',
  follow_up: 'Follow-Up Needed',
  parts_received: 'Parts Received — Ready to Schedule',
  proposal_approved: 'Proposal Approved — Ready for Action',
  scheduled_today: 'Scheduled Today',
  scheduled_tomorrow: 'Scheduled Tomorrow',
  aging: 'Aging Calls',
  recently_completed: 'Recently Completed',
}

export type PrimaryQueue =
  | 'needs_dispatch'
  | 'missing_eta'
  | 'follow_up'
  | 'parts_received'
  | 'proposal_approved'
  | 'scheduled_today'
  | 'scheduled_tomorrow'
  | 'general_active'

export function getPrimaryQueue(call: PrioritizedCall, now: Date = new Date()): PrimaryQueue | null {
  if (CLOSED_STATUSES.includes(call.status)) return null

  const hasAssignedVendor = !!call.assigned_vendor_id || call.vendors.length > 0

  if (call.status === 'open' && !hasAssignedVendor) return 'needs_dispatch'
  if ((call.status === 'open' || call.status === 'in_progress') && !call.eta_scheduled) return 'missing_eta'
  if (call.status === 'incomplete') return 'follow_up'
  if (call.status === 'part_received' || call.part_status === 'received') return 'parts_received'
  if (call.status === 'proposal_approved' || call.proposal_status === 'approved') return 'proposal_approved'
  if (call.scheduled_date && isSameDay(call.scheduled_date, now)) return 'scheduled_today'
  if (call.scheduled_date && isTomorrow(call.scheduled_date, now)) return 'scheduled_tomorrow'

  return 'general_active'
}

// Every non-closed call exactly once, in smart-priority order.
export function buildUniqueWorkQueue(calls: PrioritizedCall[], now: Date = new Date()): PrioritizedCall[] {
  return dedupeCallsById(calls).filter((call) => getPrimaryQueue(call, now) !== null)
}

export function buildSmartSections(calls: PrioritizedCall[]): Record<SmartSection, PrioritizedCall[]> {
  const now = new Date()
  const sections: Record<SmartSection, PrioritizedCall[]> = {
    new_unacknowledged: [],
    needs_dispatch: [],
    no_tech: [],
    missing_eta: [],
    follow_up: [],
    parts_received: [],
    proposal_approved: [],
    scheduled_today: [],
    scheduled_tomorrow: [],
    aging: [],
    recently_completed: [],
  }

  for (const call of calls) {
    const isOpenish = !CLOSED_STATUSES.includes(call.status)

    if (call.needs_acknowledgment) sections.new_unacknowledged.push(call)
    if (call.urgency === 'urgent' && isOpenish) sections.needs_dispatch.push(call)
    if (call.status === 'open' && !call.assigned_vendor_id) sections.no_tech.push(call)
    if (isOpenish && !call.eta_scheduled) sections.missing_eta.push(call)
    if (call.status === 'incomplete') sections.follow_up.push(call)
    if (call.status === 'part_received') sections.parts_received.push(call)
    if (call.status === 'proposal_approved' || (call.proposal_status === 'approved' && isOpenish)) {
      sections.proposal_approved.push(call)
    }
    if (call.scheduled_date && isSameDay(call.scheduled_date, now)) sections.scheduled_today.push(call)
    if (call.scheduled_date && isTomorrow(call.scheduled_date, now)) sections.scheduled_tomorrow.push(call)
    if (isOpenish && call.days_open >= 7) sections.aging.push(call)
    if (call.status === 'completed' && call.completed_date && daysBetween(call.completed_date, now) <= 3) {
      sections.recently_completed.push(call)
    }
  }

  return sections
}

export function getCallConditionBadges(call: PrioritizedCall, now: Date = new Date()): string[] {
  const badges: string[] = []
  const isOpenish = !CLOSED_STATUSES.includes(call.status)

  if (call.needs_acknowledgment) badges.push('Needs Review')
  if (call.status === 'open' && !call.assigned_vendor_id && call.vendors.length === 0) badges.push('No Tech')
  if (isOpenish && !call.eta_scheduled) badges.push('Missing ETA')
  if (call.status === 'incomplete') badges.push('Follow-Up')
  if (call.status === 'part_received' || call.part_status === 'received') badges.push('Parts Received')
  if (call.status === 'proposal_approved' || call.proposal_status === 'approved') badges.push('Proposal Approved')
  if (call.scheduled_date && isSameDay(call.scheduled_date, now)) badges.push('Scheduled Today')
  if (call.scheduled_date && isTomorrow(call.scheduled_date, now)) badges.push('Scheduled Tomorrow')
  if (isOpenish && call.days_open >= 7) badges.push('Aging')

  return badges
}
