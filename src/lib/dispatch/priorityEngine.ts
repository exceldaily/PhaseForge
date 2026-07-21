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
