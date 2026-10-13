// The operational queues and dashboard counts, derived from the work orders
// PhaseForge holds. Pure, so the overview and the table agree exactly. These
// are operating counts, never ServiceChannel's score.

import type { WorkOrderView } from './server'

export const OFFICIAL_OPEN = /^(OPEN|IN PROGRESS)/
export const URGENT_PRIORITY = /^(P0|P1|P2)\b|EMERGENCY|\b(2-4|4|12|24) HOURS?\b/i

export type ViewKey = 'all' | 'active' | 'critical' | 'unsat' | 'reopened' | 'overdue_actions' | 'quotes' | 'approved' | 'parts' | 'pm' | 'billing' | 'verify' | 'unassigned' | 'sla'

export const VIEWS: { key: ViewKey; label: string; hint: string }[] = [
  { key: 'active', label: 'Active work orders', hint: 'Official status OPEN or IN PROGRESS, seen in the latest export' },
  { key: 'critical', label: 'Critical service issues', hint: 'Active with an urgent priority (P0 to P2 or hours-based)' },
  { key: 'unsat', label: 'Unsatisfactory customer reports', hint: 'Extended status UNSATISFACTORY' },
  { key: 'reopened', label: 'Reopened work orders', hint: 'Went from completed back to open at least once' },
  { key: 'overdue_actions', label: 'Overdue action tasks', hint: 'PhaseForge next action or task past its due date' },
  { key: 'quotes', label: 'Quotes needing attention', hint: 'WAITING FOR QUOTE or WAITING FOR APPROVAL' },
  { key: 'approved', label: 'Approved, awaiting scheduling', hint: 'PROPOSAL APPROVED with no future scheduled date' },
  { key: 'parts', label: 'Parts awaiting action', hint: 'PARTS ON ORDER or PARTS DELIVERED' },
  { key: 'pm', label: 'PM scheduling issues', hint: 'Maintenance with no appointment, or one already past without an on-site record' },
  { key: 'billing', label: 'Pending billing', hint: 'Needs a completed-work report with invoice status; not in the active export' },
  { key: 'verify', label: 'Awaiting verification', hint: 'Not in the latest comparable export, or flagged for a current-status check' },
]

export function matchesView(w: WorkOrderView, view: ViewKey, today: string, overdueTaskIds: Set<string>): boolean {
  const officialOpen = !!w.status && OFFICIAL_OPEN.test(w.status)
  const active = officialOpen && w.observationState === 'observed'
  switch (view) {
    case 'all': return true
    case 'active': return active
    case 'critical': return active && !!w.priority && URGENT_PRIORITY.test(w.priority)
    case 'unsat': return w.statusExt === 'UNSATISFACTORY'
    case 'reopened': return w.reopenCount > 0
    case 'overdue_actions': return (w.case.internalStatus !== 'verified_resolved' && !!w.case.dueDate && w.case.dueDate < today) || overdueTaskIds.has(w.id)
    case 'quotes': return active && (w.statusExt === 'WAITING FOR QUOTE' || w.statusExt === 'WAITING FOR APPROVAL')
    case 'approved': return active && w.statusExt === 'PROPOSAL APPROVED' && (!w.scheduledDate || w.scheduledDate < today)
    case 'parts': return active && (w.statusExt === 'PARTS ON ORDER' || w.statusExt === 'PARTS DELIVERED')
    case 'pm': return active && /MAINTENANCE/i.test(w.category ?? '') && w.statusExt !== 'ON SITE' && (!w.scheduledDate || w.scheduledDate < today)
    case 'billing': return !!w.status && /^COMPLETED/.test(w.status) && !/INVOICED/.test(w.status)
    case 'verify': return w.observationState === 'not_in_latest' || w.observationState === 'needs_verification'
    case 'unassigned': return active && !w.case.ownerProfileId && w.case.internalStatus !== 'verified_resolved'
    case 'sla': return active && !!w.originalEta && w.originalEta < today && w.statusExt !== 'ON SITE'
  }
}

export function countViews(wos: WorkOrderView[], today: string, overdueTaskIds: Set<string>): Record<ViewKey, number> {
  const out = Object.fromEntries([...VIEWS.map((v) => v.key), 'all', 'unassigned', 'sla'].map((k) => [k, 0])) as Record<ViewKey, number>
  for (const w of wos) for (const k of Object.keys(out) as ViewKey[]) if (matchesView(w, k, today, overdueTaskIds)) out[k]++
  return out
}

/** Days since the call date, bucketed, for the aging chart. */
export const AGE_BUCKETS = [
  { label: '0 to 7 days', max: 7 }, { label: '8 to 30', max: 30 }, { label: '31 to 90', max: 90 }, { label: '91 to 180', max: 180 }, { label: 'Over 180', max: Infinity },
]
export function ageBucket(callDate: string | null, today: string): string | null {
  if (!callDate) return null
  const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${callDate}T00:00:00Z`)) / 86_400_000)
  return AGE_BUCKETS.find((b) => days <= b.max)?.label ?? null
}
