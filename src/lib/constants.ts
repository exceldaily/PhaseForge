import { PhaseStatus, ProjectPriority, ProjectStatus } from '@/types/app'

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  queue: 'Queue',
  mobilization: 'Mobilization',
  construction_initiated: 'Construction Initiated',
  pct_30: '30% Constructed',
  pct_60: '60% Constructed',
  pct_90: '90% Constructed',
  final_punchlist: 'Final Punchlist',
  closeout: 'Closeout',
  closed: 'Closed',
  // legacy
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  queue: 'bg-slate-100 text-slate-700',
  mobilization: 'bg-rose-100 text-rose-700',
  construction_initiated: 'bg-orange-100 text-orange-700',
  pct_30: 'bg-amber-100 text-amber-700',
  pct_60: 'bg-yellow-100 text-yellow-700',
  pct_90: 'bg-lime-100 text-lime-700',
  final_punchlist: 'bg-teal-100 text-teal-700',
  closeout: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-slate-100 text-slate-600',
  // legacy
  planning: 'bg-slate-100 text-slate-700',
  active: 'bg-indigo-100 text-indigo-700',
  on_hold: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-rose-100 text-rose-700',
}

// The ordered Kanban columns (construction stages)
export const KANBAN_COLUMNS: { status: ProjectStatus; label: string; color: string }[] = [
  { status: 'queue',                 label: 'Queue',                  color: 'border-slate-400' },
  { status: 'mobilization',          label: 'Mobilization',          color: 'border-rose-400' },
  { status: 'construction_initiated',label: 'Construction Initiated', color: 'border-orange-400' },
  { status: 'pct_30',                label: '30% Constructed',        color: 'border-amber-400' },
  { status: 'pct_60',                label: '60% Constructed',        color: 'border-yellow-400' },
  { status: 'pct_90',                label: '90% Constructed',        color: 'border-lime-400' },
  { status: 'final_punchlist',       label: 'Final Punchlist',        color: 'border-teal-400' },
  { status: 'closeout',              label: 'Closeout',               color: 'border-emerald-400' },
  { status: 'closed',                label: 'Closed',                 color: 'border-slate-400' },
]

export const PRIORITY_LABELS: Record<ProjectPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
}

export const PRIORITY_COLORS: Record<ProjectPriority, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-rose-100 text-rose-700',
}

export const PHASE_STATUS_LABELS: Record<PhaseStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
  blocked: 'Blocked',
  skipped: 'Skipped',
}

export const PHASE_STATUS_COLORS: Record<PhaseStatus, string> = {
  not_started: '#94a3b8',
  in_progress: '#6366f1',
  completed: '#10b981',
  blocked: '#f43f5e',
  skipped: '#d1d5db',
}

export const DEFAULT_PHASE_COLORS = [
  '#6366f1', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#f43f5e', '#3b82f6', '#ec4899',
  '#14b8a6', '#84cc16',
]

export const DEFAULT_PHASES = [
  'Planning', 'Permits', 'Materials', 'Mobilization',
  'Demo', 'Rough-in', 'Installation', 'Inspection',
  'Punch List', 'Closeout',
]

export const ZOOM_PIXELS_PER_DAY: Record<string, number> = {
  day: 60,
  week: 24,
  month: 8,
  quarter: 3,
}

/** Per-plan resource limits. 'pro' and 'enterprise' are effectively unlimited. */
export const PLAN_LIMITS: Record<string, { projects: number; members: number }> = {
  free:       { projects: 5,    members: 5    },
  pro:        { projects: 200,  members: 50   },
  enterprise: { projects: 9999, members: 9999 },
}

export const DEFAULT_PLAN = 'free'

/** Role display labels (viewer is the legacy name for member) */
export const ROLE_LABELS: Record<string, string> = {
  owner:   'Organization Owner',
  admin:   'Admin',
  manager: 'Manager',
  member:  'Member',
  viewer:  'Member', // legacy alias
}

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner:   'Full access · Billing · Team & user management',
  admin:   'Manage teams · Manage projects · Manage users',
  manager: 'Create projects · Assign tasks · Manage workload',
  member:  'View assigned projects · Update tasks · Track progress',
  viewer:  'View assigned projects · Update tasks · Track progress',
}

export const ROLE_COLORS: Record<string, string> = {
  owner:   'bg-indigo-100 text-indigo-700',
  admin:   'bg-violet-100 text-violet-700',
  manager: 'bg-blue-100 text-blue-700',
  member:  'bg-slate-100 text-slate-600',
  viewer:  'bg-slate-100 text-slate-600',
}

/** Roles available when inviting a new member */
export const INVITE_ROLES = [
  { value: 'admin',   label: 'Admin',   description: 'Manage teams, projects, and users' },
  { value: 'manager', label: 'Manager', description: 'Create projects and assign tasks' },
  { value: 'member',  label: 'Member',  description: 'View projects and update tasks' },
] as const
