// Change Order domain model — stage registry, aging thresholds, helpers.
// Stage keys are stored as text in the DB against this code-side registry, so
// a future per-company workflow table can override labels/order without a
// schema change (the UI already renders purely from this registry).

export type CoStageKey =
  | 'potential' | 'pricing_required' | 'pricing_in_progress' | 'internal_review'
  | 'internal_revision' | 'ready_to_submit' | 'submitted' | 'customer_review'
  | 'customer_revision' | 'resubmitted' | 'approved' | 'work_complete'
  | 'ready_to_bill' | 'billed' | 'closed' | 'rejected' | 'cancelled' | 'on_hold'

export interface CoStage {
  key: CoStageKey
  label: string
  short: string
  color: string          // hex for chips/kanban headers
  /** open = counts toward pipeline; terminal = done/dead; hold = paused */
  category: 'open' | 'terminal' | 'hold'
  /** true when the ball is in the customer's court (Waiting On applies) */
  external: boolean
  /** moving INTO this stage requires these CO fields to be present */
  requires?: ('submitted_date' | 'tracking' | 'approved_amount' | 'invoice_number')[]
}

export const CO_STAGES: CoStage[] = [
  { key: 'potential',           label: 'Potential Change',        short: 'Potential',      color: '#94a3b8', category: 'open',     external: false },
  { key: 'pricing_required',    label: 'Pricing Required',        short: 'Pricing Req',    color: '#f43f5e', category: 'open',     external: false },
  { key: 'pricing_in_progress', label: 'Pricing In Progress',     short: 'Pricing',        color: '#f97316', category: 'open',     external: false },
  { key: 'internal_review',     label: 'Internal Review',         short: 'Int. Review',    color: '#f59e0b', category: 'open',     external: false },
  { key: 'internal_revision',   label: 'Revision Required (Int)', short: 'Int. Revision',  color: '#eab308', category: 'open',     external: false },
  { key: 'ready_to_submit',     label: 'Ready to Submit',         short: 'Ready',          color: '#8b5cf6', category: 'open',     external: false },
  { key: 'submitted',           label: 'Submitted to Customer',   short: 'Submitted',      color: '#6366f1', category: 'open',     external: true, requires: ['submitted_date', 'tracking'] },
  { key: 'customer_review',     label: 'Customer Review',         short: 'Cust. Review',   color: '#0ea5e9', category: 'open',     external: true },
  { key: 'customer_revision',   label: 'Customer Revision Req',   short: 'Cust. Revision', color: '#ec4899', category: 'open',     external: false },
  { key: 'resubmitted',         label: 'Resubmitted',             short: 'Resubmitted',    color: '#06b6d4', category: 'open',     external: true, requires: ['submitted_date'] },
  { key: 'approved',            label: 'Approved',                short: 'Approved',       color: '#10b981', category: 'open',     external: false, requires: ['approved_amount'] },
  { key: 'work_complete',       label: 'Work Complete',           short: 'Work Done',      color: '#14b8a6', category: 'open',     external: false },
  { key: 'ready_to_bill',       label: 'Ready to Bill',           short: 'Ready to Bill',  color: '#84cc16', category: 'open',     external: false },
  { key: 'billed',              label: 'Billed',                  short: 'Billed',         color: '#22c55e', category: 'open',     external: false, requires: ['invoice_number'] },
  { key: 'closed',              label: 'Closed',                  short: 'Closed',         color: '#64748b', category: 'terminal', external: false },
  { key: 'rejected',            label: 'Rejected',                short: 'Rejected',       color: '#e11d48', category: 'terminal', external: false },
  { key: 'cancelled',           label: 'Cancelled',               short: 'Cancelled',      color: '#94a3b8', category: 'terminal', external: false },
  { key: 'on_hold',             label: 'On Hold',                 short: 'On Hold',        color: '#a8a29e', category: 'hold',     external: false },
]

export const CO_STAGE_MAP: Record<string, CoStage> =
  Object.fromEntries(CO_STAGES.map((s) => [s.key, s]))

export function coStage(key: string | null | undefined): CoStage {
  return CO_STAGE_MAP[key ?? ''] ?? CO_STAGE_MAP.potential
}

/** Kanban columns: the open pipeline in workflow order (terminal/hold excluded). */
export const CO_KANBAN_STAGES = CO_STAGES.filter((s) => s.category === 'open')

/** Pending = has money in play, not yet decided by the customer. */
export const CO_PENDING_STAGES: CoStageKey[] = [
  'potential', 'pricing_required', 'pricing_in_progress', 'internal_review',
  'internal_revision', 'ready_to_submit', 'submitted', 'customer_review',
  'customer_revision', 'resubmitted',
]
export const CO_APPROVED_STAGES: CoStageKey[] = ['approved', 'work_complete', 'ready_to_bill', 'billed', 'closed']
export const CO_INTERNAL_ACTION_STAGES: CoStageKey[] = [
  'potential', 'pricing_required', 'pricing_in_progress', 'internal_review',
  'internal_revision', 'ready_to_submit', 'customer_revision',
]

// ── Aging (spec thresholds; text labels not just color for accessibility) ───
export function agingLevel(days: number): { level: 'normal' | 'attention' | 'warning' | 'critical'; label: string; className: string } {
  if (days >= 10) return { level: 'critical', label: `${days}d — critical`, className: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' }
  if (days >= 6) return { level: 'warning', label: `${days}d — warning`, className: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' }
  if (days >= 3) return { level: 'attention', label: `${days}d — attention`, className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' }
  return { level: 'normal', label: `${days}d`, className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' }
}

export function daysBetween(fromIso: string | null | undefined, to = new Date()): number {
  if (!fromIso) return 0
  const from = new Date(fromIso)
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000))
}

// ── Money formatting ────────────────────────────────────────────────────────
export function fmtMoney(n: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (n == null) return '—'
  if (opts.compact && Math.abs(n) >= 1000) {
    return `${n < 0 ? '-' : ''}$${(Math.abs(n) / 1000).toFixed(Math.abs(n) >= 100_000 ? 0 : 1)}K`
  }
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export function coDisplayAmount(co: { current_amount: number | null; requested_amount: number | null; approved_amount: number | null; stage: string }): number | null {
  if (CO_APPROVED_STAGES.includes(co.stage as CoStageKey) && co.approved_amount != null) return co.approved_amount
  return co.current_amount ?? co.requested_amount
}

export const CO_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const
export const CO_BILLING_STATUSES = [
  { key: 'not_ready', label: 'Not Ready' },
  { key: 'ready', label: 'Ready to Bill' },
  { key: 'submitted', label: 'Submitted for Billing' },
  { key: 'billed', label: 'Billed' },
  { key: 'paid', label: 'Paid / Closed' },
] as const

// ── Row shape shared by the module UIs (matches change_orders columns) ──────
export interface ChangeOrderRow {
  id: string
  company_id: string
  project_id: string
  co_number: number
  co_label: string
  title: string
  description: string | null
  stage: string
  stage_entered_at: string
  owner_id: string | null
  waiting_on: string | null
  next_action: string | null
  due_date: string | null
  follow_up_date: string | null
  priority: string
  customer_name: string | null
  store_number: string | null
  portal: string | null
  requested_amount: number | null
  current_amount: number | null
  approved_amount: number | null
  potential_cost: number | null
  approved_date: string | null
  approved_by_name: string | null
  approval_reference: string | null
  approval_notes: string | null
  submitted_date: string | null
  submitted_by: string | null
  tracking_number: string | null
  confirmation_number: string | null
  no_confirmation: boolean
  billing_status: string
  invoice_number: string | null
  invoice_date: string | null
  billed_amount: number | null
  revision_number: number
  tags: string[]
  archived_at: string | null
  closed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  updated_by: string | null
}
