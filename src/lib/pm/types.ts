// Preventative Maintenance: the shapes and the vocabulary. Mirrors
// supabase/migrations/20261008000070_pm_module.sql.

export type PmRole = 'admin' | 'coordinator' | 'technician' | 'read_only'

export type SystemType = 'HFC' | 'CO2' | 'R-290'
export const SYSTEM_TYPES: SystemType[] = ['HFC', 'CO2', 'R-290']
export const SYSTEM_LABEL: Record<SystemType, string> = { HFC: 'HFC', CO2: 'CO2', 'R-290': 'R-290 (propane)' }

/* ── Lifecycle ───────────────────────────────────────────────────────────── */

export type PmStatus =
  | 'awaiting_job_number' | 'job_received' | 'not_scheduled' | 'scheduled' | 'in_progress'
  | 'field_complete' | 'pending_documentation' | 'submitted' | 'completed' | 'on_hold' | 'cancelled'

export const PM_STATUSES: PmStatus[] = [
  'awaiting_job_number', 'job_received', 'not_scheduled', 'scheduled', 'in_progress',
  'field_complete', 'pending_documentation', 'submitted', 'completed', 'on_hold', 'cancelled',
]

export const STATUS_LABEL: Record<PmStatus, string> = {
  awaiting_job_number: 'Awaiting Job Number',
  job_received: 'Job Received',
  not_scheduled: 'Not Scheduled',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  field_complete: 'Field Work Complete',
  pending_documentation: 'Pending Documentation',
  submitted: 'Submitted / Pending Closeout',
  completed: 'Completed',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
}
export const STATUS_SHORT: Record<PmStatus, string> = {
  awaiting_job_number: 'No job #',
  job_received: 'Received',
  not_scheduled: 'Unscheduled',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  field_complete: 'Field done',
  pending_documentation: 'Docs',
  submitted: 'Submitted',
  completed: 'Done',
  on_hold: 'Hold',
  cancelled: 'Cancelled',
}

/** Tailwind classes per status: chip (bg + text) and a solid dot/bar color. */
export const STATUS_TONE: Record<PmStatus, { chip: string; dot: string; hex: string }> = {
  awaiting_job_number: { chip: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400', hex: '#94a3b8' },
  job_received: { chip: 'bg-sky-100 text-sky-800', dot: 'bg-sky-500', hex: '#0ea5e9' },
  not_scheduled: { chip: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500', hex: '#f59e0b' },
  scheduled: { chip: 'bg-indigo-100 text-indigo-800', dot: 'bg-indigo-500', hex: '#6366f1' },
  in_progress: { chip: 'bg-blue-100 text-blue-800', dot: 'bg-blue-600', hex: '#2563eb' },
  field_complete: { chip: 'bg-teal-100 text-teal-800', dot: 'bg-teal-500', hex: '#14b8a6' },
  pending_documentation: { chip: 'bg-violet-100 text-violet-800', dot: 'bg-violet-500', hex: '#8b5cf6' },
  submitted: { chip: 'bg-cyan-100 text-cyan-800', dot: 'bg-cyan-600', hex: '#0891b2' },
  completed: { chip: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-600', hex: '#059669' },
  on_hold: { chip: 'bg-orange-100 text-orange-800', dot: 'bg-orange-500', hex: '#f97316' },
  cancelled: { chip: 'bg-slate-200 text-slate-500 line-through', dot: 'bg-slate-300', hex: '#cbd5e1' },
}

/** Statuses a coordinator can pick by hand. The two with rules behind them are not here. */
export const MANUAL_STATUSES: PmStatus[] = [
  'awaiting_job_number', 'job_received', 'not_scheduled', 'scheduled', 'in_progress',
  'pending_documentation', 'submitted', 'on_hold', 'cancelled',
]
export const OPEN_STATUSES: PmStatus[] = PM_STATUSES.filter((s) => s !== 'completed' && s !== 'cancelled')
/** Not started in the field yet. */
export const PRE_WORK_STATUSES: PmStatus[] = ['awaiting_job_number', 'job_received', 'not_scheduled', 'scheduled']
/** The field work is over. */
export const POST_FIELD_STATUSES: PmStatus[] = ['field_complete', 'pending_documentation', 'submitted', 'completed']

/** Blockers sit beside the status. A PM can be In Progress and waiting on filters. */
export type PmBlocker = 'waiting_filters' | 'waiting_parts' | 'return_visit' | 'blocking_deficiency'
export const BLOCKER_LABEL: Record<PmBlocker, string> = {
  waiting_filters: 'Waiting on Filters',
  waiting_parts: 'Waiting on Parts',
  return_visit: 'Return Visit Needed',
  blocking_deficiency: 'Blocked by a deficiency',
}

/** ALDI priority levels, as printed on the store sheet. */
export const PRIORITIES: { key: string; window: string; businessDays: number | null }[] = [
  { key: 'P1', window: '2-4 hours', businessDays: null },
  { key: 'P2', window: '24 hours', businessDays: 1 },
  { key: 'P3', window: '2 business days', businessDays: 2 },
  { key: 'P4', window: '5 business days', businessDays: 5 },
  { key: 'P5', window: '14 business days', businessDays: 14 },
  { key: 'P6', window: '30 business days', businessDays: 30 },
  { key: 'P7', window: 'Up to 365 business days', businessDays: 365 },
]

/* ── Rows ────────────────────────────────────────────────────────────────── */

export interface PmTech { id: string; name: string; profileId: string | null; employeeId: string | null; phone: string | null; email: string | null; isActive: boolean }

export interface PmStore {
  id: string
  storeNumber: string
  address: string | null
  city: string | null
  county: string | null
  state: string | null
  postalCode: string | null
  region: string | null
  facilityManager: string | null
  fmPhone: string | null
  fmEmail: string | null
  storePhone: string | null
  contactNotes: string | null
  primaryTechId: string | null
  secondaryTechId: string | null
  systemType: SystemType | null
  refrigerant: string | null
  notes: string | null
  isActive: boolean
}

export type EquipmentKind = 'circuit' | 'compressor' | 'hvac_compressor' | 'condenser' | 'rack' | 'walk_in' | 'case' | 'hvac_unit' | 'spot_merchandiser' | 'other'
export const EQUIPMENT_KIND_LABEL: Record<EquipmentKind, string> = {
  circuit: 'Circuit / coil', compressor: 'Rack compressor', hvac_compressor: 'HVAC compressor', condenser: 'Condenser',
  rack: 'Rack', walk_in: 'Walk-in', case: 'Case', hvac_unit: 'HVAC unit', spot_merchandiser: 'Spot merchandiser', other: 'Other',
}
export interface PmEquipment {
  id: string; storeId: string; kind: EquipmentKind; label: string
  manufacturer: string | null; model: string | null; serialNumber: string | null; refrigerant: string | null
  notes: string | null; sortOrder: number; isActive: boolean
}

export interface PmExclusion { id: string; storeId: string; itemCode: string; equipmentId: string | null; reason: string }

export interface PmCycle {
  id: string
  storeId: string
  year: number
  quarter: number
  jobNumber: string | null
  scWorkOrder: string | null
  jobReceivedDate: string | null
  priority: string | null
  dueDate: string | null
  techId: string | null
  helperTechId: string | null
  scheduledDate: string | null
  actualStart: string | null
  actualEnd: string | null
  status: PmStatus
  statusNote: string | null
  returnVisitNeeded: boolean
  returnVisitNote: string | null
  techNotes: string | null
  coordinatorNotes: string | null
  serviceProvider: string | null
  timeIn: string | null
  timeOut: string | null
  fmSpotChecked: boolean | null
  templateVersionId: string | null
  layout: PmLayout | null
  lastItemId: string | null
  checklistTotal: number
  checklistDone: number
  docsTotal: number
  docsDone: number
  openDeficiencies: number
  blockingDeficiencies: number
  waitingFilters: boolean
  waitingParts: boolean
  fieldCompletedAt: string | null
  submittedOn: string | null
  closedAt: string | null
  completionOverrideReason: string | null
  updatedAt: string
}

/* ── Checklist ───────────────────────────────────────────────────────────── */

export type CheckResult = 'pass' | 'fail' | 'na'
export const RESULT_LABEL: Record<CheckResult, string> = { pass: 'Pass', fail: 'Fail', na: 'N/A' }

export interface ReadingRef { table: string; column?: string | null }

export interface TemplateItem {
  id: string
  sectionKey: string
  sectionLabel: string
  sortOrder: number
  code: string
  applicability: string
  description: string
  requiresPhoto: boolean
  requiresNote: boolean
  measureLabel: string | null
  measureUnit: string | null
  requiresMeasure: boolean
  readingRefs: ReadingRef[]
  fopmOnFail: boolean
  hint: string | null
}

export type RowSource = 'fixed' | 'circuits' | 'compressors' | 'hvac_compressors'
export interface DataColumn { key: string; label: string; unit?: string }
export interface DataRow { key: string; label: string }
export interface DataTable {
  key: string
  /** Which data entry page of the sheet it sits on. */
  group: 'refrigeration' | 'electrical' | 'hvac'
  title: string
  hint?: string
  rowSource: RowSource
  /** Fixed rows, or the default rows used when the store lists no equipment of this kind. */
  rows: DataRow[]
  columns: DataColumn[]
}

/** The rows a PM's data tables were built with, frozen when the checklist starts. */
export interface PmLayout { circuits: DataRow[]; compressors: DataRow[]; hvac_compressors: DataRow[] }

export interface TemplateVersion {
  id: string
  name: string
  quarter: number
  version: number
  revisionLabel: string | null
  status: 'draft' | 'active' | 'retired'
  notes: string | null
  dataTables: DataTable[]
  publishedAt: string | null
  createdAt: string
}

export interface PmResponse {
  itemId: string
  result: CheckResult | null
  measureValue: string | null
  note: string | null
  naReason: string | null
  inspectedBy: string | null
  inspectedAt: string | null
  rev: number
}

export interface PmReading { tableKey: string; rowKey: string; colKey: string; value: string }

export interface PmAttachment {
  id: string
  pmId: string | null
  storeId: string
  itemId: string | null
  deficiencyId: string | null
  kind: 'photo' | 'document' | 'source'
  path: string
  name: string
  mime: string | null
  sizeBytes: number | null
  caption: string | null
  uploadedBy: string | null
  createdAt: string
  url?: string | null
}

/* ── Materials ───────────────────────────────────────────────────────────── */

export type MaterialStatus = 'needed' | 'pending_approval' | 'approved' | 'ordered' | 'partially_received' | 'received' | 'installed' | 'cancelled' | 'backordered'
export const MATERIAL_STATUSES: MaterialStatus[] = ['needed', 'pending_approval', 'approved', 'ordered', 'backordered', 'partially_received', 'received', 'installed', 'cancelled']
export const MATERIAL_STATUS_LABEL: Record<MaterialStatus, string> = {
  needed: 'Needed', pending_approval: 'Pending Approval', approved: 'Approved', ordered: 'Ordered',
  partially_received: 'Partially Received', received: 'Received', installed: 'Installed', cancelled: 'Cancelled', backordered: 'Backordered',
}
export const MATERIAL_TONE: Record<MaterialStatus, string> = {
  needed: 'bg-rose-100 text-rose-800', pending_approval: 'bg-amber-100 text-amber-800', approved: 'bg-sky-100 text-sky-800',
  ordered: 'bg-indigo-100 text-indigo-800', partially_received: 'bg-violet-100 text-violet-800', received: 'bg-teal-100 text-teal-800',
  installed: 'bg-emerald-100 text-emerald-800', cancelled: 'bg-slate-200 text-slate-500', backordered: 'bg-orange-100 text-orange-800',
}
export const MATERIAL_OPEN = (s: MaterialStatus) => s !== 'installed' && s !== 'cancelled'
export type MaterialCategory = 'filter' | 'part' | 'other'
export const MATERIAL_CATEGORY_LABEL: Record<MaterialCategory, string> = { filter: 'Filter', part: 'Part', other: 'Other' }

export interface PmMaterial {
  id: string
  pmId: string
  storeId: string
  category: MaterialCategory
  name: string
  partNumber: string | null
  quantity: number
  unitLabel: string | null
  equipmentId: string | null
  itemId: string | null
  requestedBy: string | null
  requestedDate: string
  status: MaterialStatus
  orderedDate: string | null
  vendor: string | null
  poNumber: string | null
  etaDate: string | null
  receivedDate: string | null
  installedDate: string | null
  notes: string | null
  updatedAt: string
}

/* ── Deficiencies ────────────────────────────────────────────────────────── */

export type Severity = 'low' | 'medium' | 'high' | 'critical'
export const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical']
export const SEVERITY_LABEL: Record<Severity, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' }
export const SEVERITY_TONE: Record<Severity, string> = {
  low: 'bg-slate-100 text-slate-700', medium: 'bg-amber-100 text-amber-800', high: 'bg-orange-100 text-orange-800', critical: 'bg-rose-100 text-rose-800',
}
export type ProposalStatus = 'not_required' | 'needed' | 'submitted' | 'approved' | 'declined'
export const PROPOSAL_LABEL: Record<ProposalStatus, string> = {
  not_required: 'No proposal needed', needed: 'Proposal needed', submitted: 'Proposal submitted', approved: 'Proposal approved', declined: 'Proposal declined',
}
export type RepairStatus = 'open' | 'proposal_pending' | 'approved' | 'scheduled' | 'in_progress' | 'repaired' | 'declined' | 'deferred' | 'closed'
export const REPAIR_STATUSES: RepairStatus[] = ['open', 'proposal_pending', 'approved', 'scheduled', 'in_progress', 'repaired', 'deferred', 'declined', 'closed']
export const REPAIR_LABEL: Record<RepairStatus, string> = {
  open: 'Open', proposal_pending: 'Proposal pending', approved: 'Approved', scheduled: 'Repair scheduled', in_progress: 'Repair in progress',
  repaired: 'Repaired', declined: 'Declined', deferred: 'Deferred', closed: 'Closed',
}
export const REPAIR_OPEN = (s: RepairStatus) => s !== 'repaired' && s !== 'closed' && s !== 'declined'

export interface PmDeficiency {
  id: string
  storeId: string
  pmId: string | null
  itemId: string | null
  itemCode: string | null
  equipmentId: string | null
  equipmentLabel: string | null
  description: string
  severity: Severity
  recommendedRepair: string | null
  proposalRequired: boolean
  proposalSubmittedDate: string | null
  proposalStatus: ProposalStatus
  returnVisitRequired: boolean
  affectsPm: boolean
  followupJobNumber: string | null
  repairStatus: RepairStatus
  resolvedOn: string | null
  resolutionNote: string | null
  createdBy: string | null
  createdAt: string
}

export interface PmActivity { id: string; pmId: string | null; storeId: string | null; actorId: string | null; action: string; detail: Record<string, unknown>; createdAt: string }

/* ── Settings ────────────────────────────────────────────────────────────── */

/** What has to be true before a PM can be marked Completed. All configurable. */
export interface CompletionRules {
  /** Every applicable check has a Pass or Fail. */
  allInspected: boolean
  /** Checks that call for a photo have one. */
  photos: boolean
  /** Checks that point at a data table have readings in it. */
  readings: boolean
  /** Checks that call for a note or a recorded value have it. */
  notes: boolean
  /** Every failed check is tied to a deficiency. */
  failsLinked: boolean
  /** The technician left overall notes. */
  techNotes: boolean
  /** No filters or parts still outstanding. */
  materialsClosed: boolean
  /** The documentation was submitted (date recorded). */
  submitted: boolean
  /** A PM report has been generated. */
  reportGenerated: boolean
}
export const DEFAULT_RULES: CompletionRules = {
  allInspected: true, photos: true, readings: true, notes: true, failsLinked: true,
  techNotes: false, materialsClosed: true, submitted: true, reportGenerated: false,
}
export const RULE_LABEL: Record<keyof CompletionRules, { label: string; hint: string }> = {
  allInspected: { label: 'Every applicable check is inspected', hint: 'Each one is Pass or Fail. Not Applicable checks do not count.' },
  photos: { label: 'Required photos are attached', hint: 'The checks the ALDI sheet marks with a camera.' },
  readings: { label: 'Required readings are entered', hint: 'Superheat, oil levels, discharge temps, electrical, and fan CFM where a check calls for them.' },
  notes: { label: 'Required notes and values are entered', hint: 'Receiver level, UPS battery level, and other checks that ask for a recorded value.' },
  failsLinked: { label: 'Every failed check has a deficiency', hint: 'A Fail has to be written up before closeout.' },
  techNotes: { label: 'Technician notes are filled in', hint: 'The overall comments for the visit.' },
  materialsClosed: { label: 'No filters or parts outstanding', hint: 'Every material request is installed or cancelled.' },
  submitted: { label: 'Documentation submitted', hint: 'The date the report went into ServiceChannel is recorded.' },
  reportGenerated: { label: 'A PM report has been generated', hint: 'At least one PDF report exists for the PM.' },
}

export interface NotifyRules {
  blocked: boolean
  overdue: boolean
  readyForCloseout: boolean
  materialsReceived: boolean
  materialsDelayed: boolean
  assigned: boolean
  deficiency: boolean
}
export const DEFAULT_NOTIFY: NotifyRules = {
  blocked: true, overdue: true, readyForCloseout: true, materialsReceived: true, materialsDelayed: true, assigned: true, deficiency: true,
}
export const NOTIFY_LABEL: Record<keyof NotifyRules, { label: string; who: string }> = {
  blocked: { label: 'A PM gets blocked', who: 'Coordinators, when a PM starts waiting on filters or parts or needs a return visit' },
  overdue: { label: 'A PM goes overdue', who: 'Coordinators, once per PM per week while it stays past its due date' },
  readyForCloseout: { label: 'Field work is complete', who: 'Coordinators, when a technician marks the field work done' },
  materialsReceived: { label: 'Materials are received', who: 'The assigned technician and coordinators' },
  materialsDelayed: { label: 'Materials are late or not ordered', who: 'Coordinators, for requests sitting unordered or past their ETA' },
  assigned: { label: 'A PM is assigned', who: 'The technician it was assigned to' },
  deficiency: { label: 'A high or critical deficiency is found', who: 'Coordinators' },
}

export function mergeRules(saved: Partial<CompletionRules> | null | undefined): CompletionRules {
  const out = { ...DEFAULT_RULES }
  for (const k of Object.keys(out) as (keyof CompletionRules)[]) if (typeof saved?.[k] === 'boolean') out[k] = saved[k] as boolean
  return out
}
export function mergeNotify(saved: Partial<NotifyRules> | null | undefined): NotifyRules {
  const out = { ...DEFAULT_NOTIFY }
  for (const k of Object.keys(out) as (keyof NotifyRules)[]) if (typeof saved?.[k] === 'boolean') out[k] = saved[k] as boolean
  return out
}
