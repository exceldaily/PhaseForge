// PhaseForge Operations — domain types mirroring supabase/migrations/20260705_*.sql

export type ModuleKey =
  | 'customers' | 'staff' | 'vendors' | 'calls'
  | 'projects' | 'files' | 'invoices' | 'reports'

export type OpsRole =
  | 'owner' | 'admin' | 'dispatcher' | 'project_manager'
  | 'billing' | 'staff' | 'read_only'

export interface Division {
  id: string
  company_id: string
  name: string
  color: string
  is_active: boolean
  sort_order: number
}

export interface OrgTag {
  id: string
  company_id: string
  name: string
  color: string
}

export interface SavedView {
  id: string
  company_id: string
  user_id: string | null
  page_key: string
  name: string
  filters: Record<string, string>
  is_default: boolean
}

export interface Customer {
  id: string
  company_id: string
  name: string
  status: 'active' | 'inactive' | 'prospect' | 'on_hold'
  division_id: string | null
  customer_type: string | null
  phone: string | null
  email: string | null
  website: string | null
  billing_address: string | null
  billing_status: string | null
  notes: string | null
  last_activity_at: string | null
  created_at: string
  updated_at: string
}

export interface CustomerContact {
  id: string
  customer_id: string
  location_id: string | null
  name: string
  title: string | null
  email: string | null
  phone: string | null
  is_billing: boolean
  is_primary: boolean
  notes: string | null
}

export interface Location {
  id: string
  company_id: string
  customer_id: string
  division_id: string | null
  name: string
  location_number: string | null
  address: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
  timezone: string | null
  access_notes: string | null
  site_notes: string | null
  status: 'active' | 'inactive'
  created_at: string
}

export interface Asset {
  id: string
  company_id: string
  customer_id: string
  location_id: string
  name: string
  asset_type: string | null
  trade_category: string | null
  make: string | null
  model: string | null
  serial_number: string | null
  install_date: string | null
  warranty_start: string | null
  warranty_end: string | null
  warranty_provider: string | null
  status: 'in_service' | 'needs_attention' | 'out_of_service' | 'retired'
  notes: string | null
  created_at: string
}

export interface StaffDetails {
  id: string
  company_id: string
  profile_id: string
  division_id: string | null
  phone: string | null
  employment_status: 'active' | 'on_leave' | 'inactive' | 'terminated'
  skills: string[]
  notes: string | null
}

export interface StaffCertification {
  id: string
  staff_id: string
  name: string
  issuer: string | null
  number: string | null
  issued_on: string | null
  expires_on: string | null
}

export interface Vendor {
  id: string
  company_id: string
  name: string
  status: 'active' | 'inactive' | 'do_not_use'
  trade_categories: string[]
  coverage_areas: string[]
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
  insurance_expires: string | null
  license_expires: string | null
  license_number: string | null
  notes: string | null
  performance_notes: string | null
  created_at: string
}

export interface CallStatusDef { key: string; label: string; closed: boolean }
export interface CallPriorityDef { key: string; label: string; color: string }

export interface OrgCallSettings {
  company_id: string
  terminology: string
  template_kind: 'commercial' | 'residential' | 'construction'
  statuses: CallStatusDef[]
  priorities: CallPriorityDef[]
  card_fields: string[]
  required_fields: string[]
  required_closeout_fields: string[]
  require_completion_photo: boolean
  default_view: 'list' | 'card' | 'board'
  use_divisions: boolean
  quick_actions: string[]
}

export interface Call {
  id: string
  company_id: string
  call_number: number
  title: string
  description: string | null
  customer_id: string | null
  location_id: string | null
  asset_id: string | null
  division_id: string | null
  project_id: string | null
  priority: string
  status: string
  assigned_staff_id: string | null
  vendor_id: string | null
  due_date: string | null
  sla_at: string | null
  appointment_start: string | null
  appointment_end: string | null
  completed_at: string | null
  closed_at: string | null
  invoice_ready: boolean
  invoice_id: string | null
  completion_notes: string | null
  service_type: string | null
  source: string
  last_note_at: string | null
  last_activity_at: string
  created_by: string | null
  created_at: string
  updated_at: string
  // joined
  customer?: Pick<Customer, 'id' | 'name'> | null
  location?: Pick<Location, 'id' | 'name' | 'location_number' | 'address' | 'city' | 'state'> | null
  vendor?: Pick<Vendor, 'id' | 'name'> | null
  assigned_staff?: { id: string; full_name: string } | null
  division?: Pick<Division, 'id' | 'name' | 'color'> | null
}

export interface CallNote {
  id: string
  call_id: string
  author_id: string | null
  author_name: string | null
  category: string
  body: string
  created_at: string
}

export interface OrgFile {
  id: string
  company_id: string
  storage_path: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  record_type: string | null
  record_id: string | null
  customer_id: string | null
  location_id: string | null
  uploaded_by: string | null
  created_at: string
}

export interface Invoice {
  id: string
  company_id: string
  invoice_number: number
  customer_id: string | null
  billing_contact_id: string | null
  project_id: string | null
  status: 'draft' | 'ready' | 'sent' | 'paid' | 'overdue' | 'void'
  issue_date: string | null
  due_date: string | null
  notes: string | null
  terms: string | null
  payment_reference: string | null
  currency: string
  created_at: string
  customer?: Pick<Customer, 'id' | 'name'> | null
}

export interface InvoiceItem {
  id: string
  invoice_id: string
  description: string
  quantity: number
  unit_price: number
  call_id: string | null
  project_id: string | null
  sort_order: number
}

export interface AssetReading {
  id: string
  company_id: string
  asset_id: string
  call_id: string | null
  trade_category: string | null
  readings: Record<string, string>
  notes: string | null
  recorded_by: string | null
  recorded_at: string
}

export interface OpsActivity {
  id: string
  company_id: string
  actor_id: string | null
  actor_name: string | null
  record_type: string
  record_id: string
  action: string
  detail: Record<string, unknown>
  created_at: string
}
