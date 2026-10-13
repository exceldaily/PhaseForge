// Shared types and labels for the ServiceChannel module. Nothing here touches
// the database.

export const SC_MODULE_KEY = 'servicechannel'

export type ObservationState = 'observed' | 'not_in_latest' | 'outside_window' | 'needs_verification' | 'manually_verified'

export const OBSERVATION_LABELS: Record<ObservationState, string> = {
  observed: 'Currently observed',
  not_in_latest: 'Not in latest comparable export',
  outside_window: 'Outside current reporting window',
  needs_verification: 'Requires verification',
  manually_verified: 'Manually verified',
}

export const INTERNAL_STATUSES = [
  'new', 'needs_verification', 'assigned', 'accepted', 'in_progress', 'waiting_customer',
  'waiting_parts', 'waiting_approval', 'blocked', 'pending_verification', 'verified_resolved',
] as const
export type InternalStatus = (typeof INTERNAL_STATUSES)[number]

export const INTERNAL_STATUS_LABELS: Record<InternalStatus, string> = {
  new: 'New',
  needs_verification: 'Needs verification',
  assigned: 'Assigned',
  accepted: 'Accepted',
  in_progress: 'In progress',
  waiting_customer: 'Waiting on customer',
  waiting_parts: 'Waiting on parts',
  waiting_approval: 'Waiting on approval',
  blocked: 'Blocked',
  pending_verification: 'Pending verification',
  verified_resolved: 'Verified resolved',
}

/** Internal statuses that mean nobody is actively working the case right now. */
export const OPEN_INTERNAL_STATUSES: InternalStatus[] = INTERNAL_STATUSES.filter((s) => s !== 'verified_resolved')

export const QUEUES = ['critical', 'recovery', 'quotes', 'parts', 'maintenance', 'billing', 'verification', 'general'] as const
export type Queue = (typeof QUEUES)[number]
export const QUEUE_LABELS: Record<Queue, string> = {
  critical: 'Critical service',
  recovery: 'Customer recovery',
  quotes: 'Quotes and approvals',
  parts: 'Parts and return visits',
  maintenance: 'Maintenance',
  billing: 'Billing and closeout',
  verification: 'Historical verification',
  general: 'General',
}

/** Official measures. Values are typed in from ServiceChannel, never computed here. */
export const MEASURES = [
  { key: 'overall', label: 'Overall', unit: 'score' },
  { key: 'speed', label: 'Speed', unit: 'score' },
  { key: 'quality', label: 'Quality', unit: 'score' },
  { key: 'price', label: 'Price', unit: 'score' },
  { key: 'engagement', label: 'Engagement', unit: 'score' },
  { key: 'maintenance', label: 'Maintenance', unit: 'score' },
  { key: 'recall_rate', label: 'Recall rate', unit: '%' },
  { key: 'quote_turnaround_days', label: 'Quote turnaround', unit: 'days' },
  { key: 'pm_checkin_pct', label: 'PM check-in compliance', unit: '%' },
  { key: 'pm_schedule_pct', label: 'PM schedule confirmation', unit: '%' },
] as const
export type MeasureKey = (typeof MEASURES)[number]['key']

/** One work order as read from an export, after column mapping. Unknown stays null. */
export interface NormalizedRow {
  trackingNumber: string
  woNumber: string | null
  poNumber: string | null
  customerName: string | null
  /** Where customerName came from: a column in the file, or the file-wide subscriber. */
  customerSource: 'import' | 'coverage' | null
  storeLabel: string | null
  storeNumber: string | null
  storeCity: string | null
  storeState: string | null
  region: string | null
  district: string | null
  trade: string | null
  category: string | null
  priority: string | null
  area: string | null
  equipment: string | null
  problemType: string | null
  problemCode: string | null
  tagId: string | null
  problemDescription: string | null
  submittedBy: string | null
  callDate: string | null
  scheduledDate: string | null
  originalEta: string | null
  reassignDate: string | null
  reassignTime: string | null
  status: string | null
  statusExt: string | null
  resolution: string | null
  nte: number | null
  currency: string | null
  assignee: string | null
  dateAssigned: string | null
  technicians: string[]
  timezone: string | null
  notesRaw: string | null
  /** The original cells by header, kept with the observation. */
  raw: Record<string, string>
}

export interface Coverage {
  /** Official statuses the export was filtered to. Empty means every status. */
  statuses: string[]
  /** Subscribers (customers) the export was filtered to. Empty means all. */
  subscribers: string[]
  /** Call date window the export covers, inclusive. */
  callDateFrom: string | null
  callDateTo: string | null
  note: string | null
}

export interface Change { field: string; label: string; from: string | null; to: string | null }

export interface ConflictEntry { field: string; imported: string; kept: string; keptSource: string | null; importId: string; at: string; resolved?: string }

export type ImportFlag = 'reopened' | 'new_unsat' | 'appointment_changed' | 'tech_changed' | 'sla_risk' | 'overdue'

/* ── Accountability records (PhaseForge-owned; nothing here is imported) ──── */

export const TASK_KINDS = ['follow_up', 'corrective_action', 'customer_contact', 'review', 'milestone'] as const
export type TaskKind = (typeof TASK_KINDS)[number]
export const TASK_KIND_LABELS: Record<TaskKind, string> = { follow_up: 'Follow-up', corrective_action: 'Corrective action', customer_contact: 'Customer contact', review: 'Management review', milestone: 'Project milestone' }

export const RECOVERY_STATUSES = ['open', 'contacted', 'in_progress', 'pending_verification', 'closed'] as const
export type RecoveryStatus = (typeof RECOVERY_STATUSES)[number]
export const RECOVERY_STATUS_LABELS: Record<RecoveryStatus, string> = { open: 'Open', contacted: 'Customer contacted', in_progress: 'Corrective action in progress', pending_verification: 'Pending verification', closed: 'Closed' }

/** Outcome categories. Chosen by a person after the facts are checked; never set automatically. */
export const RECOVERY_OUTCOMES = [
  'confirmed_incomplete_repair', 'workmanship_concern', 'additional_scope_required', 'customer_misunderstanding',
  'incorrect_sc_record', 'resolved_after_corrective_action', 'further_investigation_required',
] as const
export type RecoveryOutcome = (typeof RECOVERY_OUTCOMES)[number]
export const RECOVERY_OUTCOME_LABELS: Record<RecoveryOutcome, string> = {
  confirmed_incomplete_repair: 'Confirmed incomplete repair', workmanship_concern: 'Workmanship concern', additional_scope_required: 'Additional scope required',
  customer_misunderstanding: 'Customer misunderstanding', incorrect_sc_record: 'Incorrect ServiceChannel record', resolved_after_corrective_action: 'Resolved after corrective action',
  further_investigation_required: 'Further investigation required',
}
/** Outcomes that say the customer or the record was wrong need written findings and evidence before they can be saved. */
export const OUTCOMES_NEEDING_EVIDENCE: RecoveryOutcome[] = ['customer_misunderstanding', 'incorrect_sc_record']

export const PROJECT_STATUSES = ['planned', 'active', 'on_hold', 'completed', 'cancelled'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = { planned: 'Planned', active: 'Active', on_hold: 'On hold', completed: 'Completed', cancelled: 'Cancelled' }
export const SCORE_CATEGORIES = ['overall', 'speed', 'quality', 'price', 'engagement', 'maintenance', 'recall_rate'] as const

export const INVESTIGATION_STATUSES = ['open', 'investigating', 'verified', 'closed'] as const
export type InvestigationStatus = (typeof INVESTIGATION_STATUSES)[number]
export const INVESTIGATION_STATUS_LABELS: Record<InvestigationStatus, string> = { open: 'Open', investigating: 'Investigating', verified: 'Cause verified', closed: 'Closed' }

export const CAUSE_CLASSES = [
  'diagnosis_failure', 'incomplete_repair', 'inadequate_testing', 'parts_issue', 'dispatch_error', 'scheduling_failure',
  'estimating_delay', 'customer_access', 'scope_misunderstanding', 'documentation_failure', 'billing_error', 'other',
] as const
export type CauseClass = (typeof CAUSE_CLASSES)[number]
export const CAUSE_CLASS_LABELS: Record<CauseClass, string> = {
  diagnosis_failure: 'Diagnosis failure', incomplete_repair: 'Incomplete repair', inadequate_testing: 'Inadequate testing', parts_issue: 'Parts issue', dispatch_error: 'Dispatch error',
  scheduling_failure: 'Scheduling failure', estimating_delay: 'Estimating delay', customer_access: 'Customer access', scope_misunderstanding: 'Scope misunderstanding',
  documentation_failure: 'Documentation failure', billing_error: 'Billing error', other: 'Other',
}

/** Who a case or task is waiting on. Department supervisor, scheduling, and customer approval are tracked separately from a plain customer wait. */
export const WAITING_ON = ['technician', 'department_supervisor', 'estimating', 'service_manager', 'scheduling', 'customer', 'customer_approval', 'parts', 'billing'] as const
export type WaitingOn = (typeof WAITING_ON)[number]
export const WAITING_LABELS: Record<WaitingOn, string> = {
  technician: 'Waiting on technician', department_supervisor: 'Waiting on department supervisor', estimating: 'Waiting on estimating', service_manager: 'Waiting on service manager',
  scheduling: 'Waiting on scheduling', customer: 'Waiting on customer', customer_approval: 'Waiting on customer approval', parts: 'Waiting on parts', billing: 'Waiting on billing',
}

/** Alert thresholds, configurable in Settings. Days, never hours; these are internal follow-up rules, not ServiceChannel SLA terms. */
export interface Thresholds { unackDays: number; staleDays: number; reviewDays: number }
export const DEFAULT_THRESHOLDS: Thresholds = { unackDays: 2, staleDays: 3, reviewDays: 7 }
