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

export type ImportFlag = 'reopened' | 'new_unsat' | 'appointment_changed' | 'tech_changed' | 'sla_risk' | 'overdue'
