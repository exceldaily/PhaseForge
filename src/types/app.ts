export type UserRole = 'owner' | 'admin' | 'manager' | 'viewer'
export type ProjectStatus =
  | 'mobilization'
  | 'construction_initiated'
  | 'pct_30'
  | 'pct_60'
  | 'pct_90'
  | 'final_punchlist'
  | 'closeout'
  | 'closed'
  | 'planning'
  | 'active'
  | 'on_hold'
  | 'completed'
  | 'cancelled'
export type ProjectPriority = 'low' | 'medium' | 'high' | 'critical'
export type PhaseStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked' | 'skipped'

export interface Company {
  id: string
  name: string
  slug: string
  logo_url: string | null
  plan: string
  created_at: string
}

export interface Profile {
  id: string
  company_id: string | null
  full_name: string
  avatar_url: string | null
  role: UserRole
  job_title: string | null
  email: string
  is_active: boolean
  created_at: string
}

export interface Project {
  id: string
  company_id: string
  name: string
  customer_name: string | null
  job_location: string | null
  start_date: string
  end_date: string
  project_manager: string | null
  status: ProjectStatus
  priority: ProjectPriority
  notes: string | null
  color: string
  tags: string[]
  superintendent: string | null
  subcontractors: string[]
  permit_status: string | null
  is_archived: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  updated_by?: string | null
  // joined
  manager_profile?: Profile
  members?: Profile[]
  phases?: Phase[]
}

export interface Phase {
  id: string
  project_id: string
  name: string
  start_date: string
  end_date: string
  assigned_to: string | null
  assigned_trade: string | null
  status: PhaseStatus
  color: string | null
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
  // joined
  assigned_profile?: Profile
  dependencies?: PhaseDependency[]
}

export interface PhaseDependency {
  id: string
  phase_id: string
  depends_on_id: string
  type: 'finish_to_start' | 'start_to_start' | 'finish_to_finish'
  lag_days: number
}

export interface ActivityLog {
  id: string
  company_id: string
  project_id: string | null
  phase_id: string | null
  actor_id: string
  action: string
  payload: Record<string, unknown>
  created_at: string
  actor?: Profile
}

export type ZoomLevel = 'day' | 'week' | 'month' | 'quarter'

export interface GanttConfig {
  zoom: ZoomLevel
  viewStart: Date
  viewEnd: Date
  pixelsPerDay: number
}
