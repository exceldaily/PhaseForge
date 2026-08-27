import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isSameMonth,
  isYesterday,
  parseISO,
  startOfDay,
} from 'date-fns'
import { getProjectProgressFromPhases } from '@/lib/phaseProgress'
import { PhaseStatus, Project, ProjectStatus } from '@/types/app'

export type ProjectHealth = 'on_track' | 'at_risk' | 'delayed'

export interface ProjectBoardState {
  progressPercent: number
  totalPhases: number
  completedPhases: number
  openPhases: number
  blockedPhases: number
  activityCount: number
  recentActivityAt: string | null
  health: ProjectHealth
  dueInDays: number | null
  overdueDays: number
  needsAttentionToday: boolean
  dueLabel: string
  updatedLabel: string
  actionLabel: string
  isCompleted: boolean
  recentActivity: boolean
  stageProgressLabel: string
}

/**
 * Serialized slice of loadProjectIntel handed to board cards: the score and
 * priority come from the shared health engine so the board can never disagree
 * with the Command Center about the same project.
 */
export interface BoardIntel {
  score: number
  level: ProjectHealth
  priority: number
  attentionCount: number
  hasCritical: boolean
  topAttention: string[]
  slipDays: number
  progressPercent: number
  overduePhases: number
  blockedPhases: number
  openPunchCount: number
  lastActivityAt: string | null
}

export interface ProjectExecutiveSummary {
  activeProjects: number
  onTrack: number
  atRisk: number
  delayed: number
  recentActivity: number
  completedThisMonth: number
  openWork: number
}

export const PROJECT_HEALTH_META: Record<
  ProjectHealth,
  {
    label: string
    pillClassName: string
    dotClassName: string
    softCardClassName: string
  }
> = {
  on_track: {
    label: 'On Track',
    pillClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dotClassName: 'bg-emerald-500',
    softCardClassName: 'border-emerald-100 bg-emerald-50/40',
  },
  at_risk: {
    label: 'At Risk',
    pillClassName: 'border-amber-200 bg-amber-50 text-amber-700',
    dotClassName: 'bg-amber-500',
    softCardClassName: 'border-amber-100 bg-amber-50/40',
  },
  delayed: {
    label: 'Delayed',
    pillClassName: 'border-rose-200 bg-rose-50 text-rose-700',
    dotClassName: 'bg-rose-500',
    softCardClassName: 'border-rose-100 bg-rose-50/40',
  },
}

const CLOSED_PROJECT_STATUSES = new Set<ProjectStatus>(['closed', 'completed', 'cancelled'])
const COMPLETE_PHASE_STATUSES = new Set<PhaseStatus>(['completed', 'skipped'])

const STATUS_PROGRESS_FALLBACK: Partial<Record<ProjectStatus, number>> = {
  queue: 5,
  mobilization: 15,
  construction_initiated: 30,
  pct_30: 30,
  pct_60: 60,
  pct_90: 90,
  final_punchlist: 95,
  closeout: 98,
  closed: 100,
  planning: 10,
  active: 55,
  on_hold: 40,
  completed: 100,
  cancelled: 0,
}

function toDate(value?: string | null) {
  if (!value) return null

  try {
    return parseISO(value)
  } catch {
    return null
  }
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function getTimelineProgress(
  startDate: string,
  endDate: string,
  referenceDate: Date
) {
  const start = toDate(startDate)
  const end = toDate(endDate)
  if (!start || !end) return null

  const totalDays = Math.max(differenceInCalendarDays(end, start), 1)
  const elapsedDays = differenceInCalendarDays(referenceDate, start)

  if (elapsedDays <= 0) return 0
  if (elapsedDays >= totalDays) return 100

  return clampPercent((elapsedDays / totalDays) * 100)
}

function formatUpdatedLabel(updatedAt: string | null | undefined, referenceDate: Date) {
  const updated = toDate(updatedAt)
  if (!updated) return 'Updated recently'

  const diffDays = differenceInCalendarDays(startOfDay(referenceDate), startOfDay(updated))
  if (diffDays <= 0) {
    return `Updated ${formatDistanceToNowStrict(updated, { addSuffix: true })}`
  }

  if (isYesterday(updated)) return 'Updated yesterday'

  return `Updated ${format(updated, 'MMM d')}`
}

function getProgressFallback(status: ProjectStatus) {
  return STATUS_PROGRESS_FALLBACK[status] ?? 0
}

export function getProjectBoardState(project: Project, referenceDate = new Date()): ProjectBoardState {
  const phases = project.phases ?? []
  const totalPhases = phases.length
  const completedPhases = phases.filter((phase) =>
    COMPLETE_PHASE_STATUSES.has(phase.status) || phase.percent_complete === 100
  ).length
  const blockedPhases = phases.filter((phase) => phase.status === 'blocked').length
  const openPhases = Math.max(totalPhases - completedPhases, 0)
  const progressPercent = totalPhases > 0
    ? getProjectProgressFromPhases(phases)
    : getProgressFallback(project.status)
  const isCompleted = CLOSED_PROJECT_STATUSES.has(project.status) || progressPercent >= 100
  const timelineProgress = getTimelineProgress(project.start_date, project.end_date, referenceDate)

  const dueInDays = differenceInCalendarDays(startOfDay(toDate(project.end_date) ?? referenceDate), startOfDay(referenceDate))
  const overdueDays = dueInDays < 0 ? Math.abs(dueInDays) : 0
  const dueSoon = !isCompleted && dueInDays >= 0 && dueInDays <= 7
  const overdue = !isCompleted && dueInDays < 0

  const activityCount = project.activity_count ?? 0
  const recentActivityAt = project.activity_updated_at ?? project.updated_at ?? null
  const updated = toDate(recentActivityAt)
  const staleDays = updated
    ? differenceInCalendarDays(startOfDay(referenceDate), startOfDay(updated))
    : 999
  const recentActivity = staleDays <= 2

  const noSchedule = !isCompleted && totalPhases === 0
  const progressLag = timelineProgress !== null && progressPercent + 12 < timelineProgress
  const severeLag = timelineProgress !== null && progressPercent + 25 < timelineProgress
  const stalledAfterStart =
    !isCompleted &&
    differenceInCalendarDays(startOfDay(referenceDate), startOfDay(toDate(project.start_date) ?? referenceDate)) > 5 &&
    progressPercent === 0

  let health: ProjectHealth = 'on_track'

  if (overdue || severeLag || (blockedPhases > 0 && dueInDays <= 3) || stalledAfterStart) {
    health = 'delayed'
  } else if (noSchedule || blockedPhases > 0 || dueSoon || progressLag || (staleDays >= 8 && openPhases > 0)) {
    health = 'at_risk'
  }

  const needsAttentionToday =
    overdue ||
    blockedPhases > 0 ||
    noSchedule ||
    dueSoon ||
    (staleDays >= 8 && openPhases > 0) ||
    Boolean(progressLag && dueInDays <= 14)

  let dueLabel = `Due ${format(toDate(project.end_date) ?? referenceDate, 'MMM d')}`
  if (isCompleted) {
    dueLabel = 'Completed'
  } else if (overdue) {
    dueLabel = `Overdue ${overdueDays}d`
  } else if (dueInDays === 0) {
    dueLabel = 'Due today'
  } else if (dueSoon) {
    dueLabel = `Due in ${dueInDays}d`
  }

  let actionLabel = 'Healthy'
  if (noSchedule) {
    actionLabel = 'Build the schedule'
  } else if (overdue) {
    actionLabel = `Past due by ${overdueDays} day${overdueDays === 1 ? '' : 's'}`
  } else if (blockedPhases > 0) {
    actionLabel = `${blockedPhases} blocked phase${blockedPhases === 1 ? '' : 's'}`
  } else if (dueInDays === 0) {
    actionLabel = 'Finish work due today'
  } else if (dueSoon) {
    actionLabel = `${openPhases} open phase${openPhases === 1 ? '' : 's'}`
  } else if (staleDays >= 8 && openPhases > 0) {
    actionLabel = 'Needs a fresh update'
  } else if (!isCompleted && openPhases > 0) {
    actionLabel = `${openPhases} open phase${openPhases === 1 ? '' : 's'}`
  } else if (isCompleted) {
    actionLabel = 'Ready to close out'
  }

  const stageProgressLabel = totalPhases > 0
    ? `${completedPhases}/${totalPhases} phases complete`
    : 'No phases built yet'

  return {
    progressPercent,
    totalPhases,
    completedPhases,
    openPhases,
    blockedPhases,
    activityCount,
    recentActivityAt,
    health,
    dueInDays,
    overdueDays,
    needsAttentionToday,
    dueLabel,
    updatedLabel: formatUpdatedLabel(recentActivityAt, referenceDate),
    actionLabel,
    isCompleted,
    recentActivity,
    stageProgressLabel,
  }
}

export function getProjectExecutiveSummary(projects: Project[], referenceDate = new Date()): ProjectExecutiveSummary {
  return projects.reduce<ProjectExecutiveSummary>((summary, project) => {
    const state = getProjectBoardState(project, referenceDate)

    summary.activeProjects += 1
    summary.openWork += state.openPhases

    if (state.recentActivity) summary.recentActivity += 1
    if (state.health === 'on_track') summary.onTrack += 1
    if (state.health === 'at_risk') summary.atRisk += 1
    if (state.health === 'delayed') summary.delayed += 1

    const completionAnchor = toDate(project.activity_updated_at ?? project.updated_at ?? project.end_date)
    if (state.isCompleted && completionAnchor && isSameMonth(completionAnchor, referenceDate)) {
      summary.completedThisMonth += 1
    }

    return summary
  }, {
    activeProjects: 0,
    onTrack: 0,
    atRisk: 0,
    delayed: 0,
    recentActivity: 0,
    completedThisMonth: 0,
    openWork: 0,
  })
}
