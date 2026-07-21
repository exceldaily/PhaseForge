// Dispatch domain types — ported from DispatchForge, re-scoped to PhaseForge
// companies (company_id) and profiles. Tables live in supabase/migrations/
// 20260721_dispatch_port.sql.

export type Urgency = 'urgent' | 'high' | 'normal' | 'low'

export type CallStatus =
  | 'open'
  | 'in_progress'
  | 'awaiting_repair'
  | 'completed'
  | 'parts_on_order'
  | 'part_received'
  | 'incomplete'
  | 'recall'
  | 'cancelled'
  | 'partially_delivered'
  | 'quote_requested'
  | 'proposal_sent'
  | 'proposal_approved'
  | 'proposal_rejected'

export type PartStatus = 'none' | 'part_needed' | 'ordered' | 'received' | 'partially_delivered' | 'installed'

export type ProposalStatus = 'none' | 'quote_requested' | 'sent' | 'approved' | 'parts_received' | 'rejected'

export type NextAction =
  | 'assign_vendor'
  | 'request_eta'
  | 'follow_up_vendor'
  | 'check_part_shipping'
  | 'schedule_repair'
  | 'send_proposal'
  | 'await_customer_approval'
  | 'close_call'
  | 'none'

export type NoteCategory =
  | 'customer_update'
  | 'vendor_update'
  | 'parts_update'
  | 'scheduling_update'
  | 'internal_note'
  | 'proposal_update'
  | 'completion_update'

export type ActivityType =
  | 'status_change'
  | 'assignment_change'
  | 'eta_change'
  | 'schedule_change'
  | 'note_added'
  | 'call_created'
  | 'next_action_change'
  | 'acknowledged'

export interface Customer {
  id: string
  company_id: string
  name: string
  created_at: string
}

// One rung of a customer's priority scale, e.g. code "P1", label "2-4 Hours".
export interface PriorityLevel {
  id: string
  company_id: string
  customer_id: string
  code: string
  label: string
  severity: Urgency
  sort_order: number
  created_at: string
}

export interface Store {
  id: string
  company_id: string
  customer_id: string | null
  store_number: string
  store_name: string
  address: string | null
  city: string | null
  state: string | null
  main_tech_id: string | null
  store_manager: string | null
  district_manager: string | null
  google_maps_url: string | null
  notes: string | null
  created_at: string
}

export interface Vendor {
  id: string
  company_id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  trade_type: string | null
  active: boolean
  created_at: string
}

// An org-defined extra field on the New Service Call card ("fillable blank").
export interface DispatchFormField {
  id: string
  company_id: string
  label: string
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface ServiceCall {
  id: string
  company_id: string
  store_id: string
  service_call_number: string
  tracking_url: string | null
  internal_job_number: string | null
  internal_job_url: string | null
  urgency: Urgency
  priority_level_id: string | null
  status: CallStatus
  next_action: NextAction
  date_started: string
  // ETA from call intake (customer SLA) vs the date a visit is actually booked.
  eta_scheduled: string | null
  scheduled_date: string | null
  rack_circuit_case: string | null
  description: string
  manager_note?: string | null
  assigned_vendor_id: string | null
  part_status: PartStatus
  proposal_status: ProposalStatus
  completed_date: string | null
  nte?: number | null
  // True for auto-imported calls not yet reviewed by a dispatcher.
  needs_acknowledgment: boolean
  // Values for the org's custom form fields, keyed by dispatch_form_fields.id.
  custom_fields: Record<string, string>
  created_at: string
  updated_at: string
}

export interface CallNote {
  id: string
  call_id: string
  user_id: string | null
  user?: { id: string; full_name: string | null; email: string | null } | null
  note_category: NoteCategory
  note_text: string
  created_at: string
}

export interface CallActivity {
  id: string
  call_id: string
  user_id: string | null
  activity_type: ActivityType
  previous_value: string | null
  new_value: string | null
  created_at: string
}

// Denormalized shape used throughout the UI so components don't re-join on render.
export interface CallWithRelations extends ServiceCall {
  store: Store
  customer_name: string | null
  vendor: Vendor | null
  vendors: Vendor[]
  priority_level: PriorityLevel | null
  latest_note: CallNote | null
  notes: CallNote[]
  activity: CallActivity[]
}

export interface PrioritizedCall extends CallWithRelations {
  priority_score: number
  priority_reasons: string[]
  days_open: number
  days_since_update: number
}
