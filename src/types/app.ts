export type UserRole = 'owner' | 'admin' | 'manager' | 'member' | 'viewer' // viewer = legacy alias for member

export interface Board {
  id: string
  company_id: string
  name: string
  description: string | null
  color: string
  sort_order: number
  is_default: boolean
  is_private: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  columns?: BoardColumn[]
  team_ids?: string[]
}

export interface BoardColumn {
  id: string
  board_id: string
  name: string
  color: string
  sort_order: number
  is_done: boolean
  created_at: string
  project_count?: number
}

export interface BoardTeam {
  board_id: string
  team_id: string
}

export type ProjectStatus =
  | 'queue'
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
  is_super_admin?: boolean
  created_at: string
}

export interface ProjectLink {
  label: string
  url: string
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
  links?: ProjectLink[]
  show_punch_on_card?: boolean
  superintendent: string | null
  subcontractors: string[]
  permit_status: string | null
  is_archived: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  updated_by?: string | null
  activity_count?: number
  activity_updated_at?: string | null
  punch_open_count?: number
  punch_completed_count?: number
  board_id?: string | null
  board_column_id?: string | null
  board?: Board
  board_column?: BoardColumn
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
  percent_complete?: number | null
  is_milestone?: boolean | null
  is_critical_path?: boolean | null
  color: string | null
  notes: string | null
  reminder_notes?: string | null
  sort_order: number
  created_at: string
  updated_at: string
  board_column_id?: string | null
  assigned_profile?: Profile
  dependencies?: PhaseDependency[]
  board_column?: BoardColumn
  checklists?: PhaseChecklist[]
}

export interface PhaseChecklist {
  id: string
  phase_id: string
  title: string
  description: string | null
  is_completed: boolean
  assigned_to?: string | null
  sort_order: number
  created_at: string
  updated_at: string
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

export interface ProjectAttachment {
  id: string
  project_id: string
  file_name: string
  file_path: string
  file_size: number
  file_type: string | null
  uploaded_by: string
  uploaded_at: string
  created_at: string
  signed_url?: string | null
}

export type PunchStatus = 'open' | 'in_progress' | 'needs_review' | 'completed'

export interface PunchItem {
  id: string
  project_id: string
  company_id: string
  number: number | null
  title: string | null
  issue_description: string
  issue_photo_path: string
  assigned_to: string | null
  created_by: string | null
  due_date: string | null
  location: string | null
  category: string | null
  priority: ProjectPriority
  status: PunchStatus
  completion_description: string | null
  completion_photo_path: string | null
  completed_by: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  // Hydrated at read time (storage paths are private; served via signed URLs)
  issue_photo_url?: string | null
  completion_photo_url?: string | null
}

export type ZoomLevel = 'day' | 'week' | 'month' | 'quarter'

export interface GanttConfig {
  zoom: ZoomLevel
  viewStart: Date
  viewEnd: Date
  pixelsPerDay: number
}
