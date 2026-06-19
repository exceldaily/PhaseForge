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
  { status: 'queue',                  label: 'Queue',                   color: '#94a3b8' },
  { status: 'mobilization',           label: 'Mobilization',            color: '#f43f5e' },
  { status: 'construction_initiated', label: 'Construction Initiated',  color: '#f97316' },
  { status: 'pct_30',                 label: '30% Constructed',         color: '#f59e0b' },
  { status: 'pct_60',                 label: '60% Constructed',         color: '#eab308' },
  { status: 'pct_90',                 label: '90% Constructed',         color: '#84cc16' },
  { status: 'final_punchlist',        label: 'Final Punchlist',         color: '#14b8a6' },
  { status: 'closeout',               label: 'Closeout',                color: '#10b981' },
  { status: 'closed',                 label: 'Closed',                  color: '#64748b' },
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

/** Per-plan resource limits — v2 includes boards and teams */
export const PLAN_LIMITS: Record<string, {
  boards: number
  projects: number   // per board (0 = unlimited)
  members: number
  teams: number
}> = {
  free:       { boards: 1,    projects: 5,    members: 3,    teams: 1    },
  individual: { boards: 10,   projects: 0,    members: 1,    teams: 1    },
  pro:        { boards: 10,   projects: 0,    members: 25,   teams: 5    },
  business:   { boards: 0,    projects: 0,    members: 0,    teams: 0    },
  enterprise: { boards: 0,    projects: 0,    members: 0,    teams: 0    },
}

export const DEFAULT_PLAN = 'free'

/** Shared color palette for board and kanban columns */
export const COLUMN_COLORS = [
  '#f43f5e', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#10b981', '#06b6d4', '#6366f1',
  '#8b5cf6', '#ec4899', '#64748b', '#0f172a',
] as const

export const PLAN_LABELS: Record<string, string> = {
  free:       'Free',
  individual: 'Individual',
  pro:        'Pro',
  business:   'Business',
  enterprise: 'Enterprise',
}

/**
 * Per-plan feature flags (beyond the numeric limits above).
 * Printing and Reports are Pro/Business/Enterprise (and Individual) only.
 */
export const PLAN_FEATURES: Record<string, { printAndReports: boolean; darkMode: boolean }> = {
  free:       { printAndReports: false, darkMode: false },
  individual: { printAndReports: true,  darkMode: true  },
  pro:        { printAndReports: true,  darkMode: true  },
  business:   { printAndReports: true,  darkMode: true  },
  enterprise: { printAndReports: true,  darkMode: true  },
}

/** Whether a plan can print Gantt charts and use the Reports page. */
export function canUsePrintAndReports(plan: string | null | undefined): boolean {
  return PLAN_FEATURES[plan ?? DEFAULT_PLAN]?.printAndReports ?? false
}

/** Whether a plan can switch between light and dark appearance. */
export function canUseDarkMode(plan: string | null | undefined): boolean {
  return PLAN_FEATURES[plan ?? DEFAULT_PLAN]?.darkMode ?? false
}

/** Board column constraints */
export const BOARD_COLUMN_MIN = 3
export const BOARD_COLUMN_MAX = 10

/** Default columns created for every new board */
export const DEFAULT_BOARD_COLUMNS = [
  { name: 'Queue',           color: '#94a3b8', sort_order: 0, is_done: false },
  { name: 'In Progress',     color: '#6366f1', sort_order: 1, is_done: false },
  { name: 'Review',          color: '#f59e0b', sort_order: 2, is_done: false },
  { name: 'Done',            color: '#10b981', sort_order: 3, is_done: true  },
] as const

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
