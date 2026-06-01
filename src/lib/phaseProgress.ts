import { PhaseStatus } from '@/types/app'

const DEFAULT_STATUS_PROGRESS: Record<PhaseStatus, number> = {
  not_started: 0,
  in_progress: 50,
  completed: 100,
  blocked: 50,
  skipped: 100,
}

function clampPercentage(value: number) {
  if (Number.isNaN(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function getDefaultPhasePercentComplete(status: PhaseStatus) {
  return DEFAULT_STATUS_PROGRESS[status]
}

export function getPhasePercentComplete(phase: {
  status: PhaseStatus
  percent_complete?: number | null
}) {
  if (typeof phase.percent_complete === 'number') {
    return clampPercentage(phase.percent_complete)
  }

  return getDefaultPhasePercentComplete(phase.status)
}

export function sanitizePhasePercentComplete(
  status: PhaseStatus,
  value: number | string | null | undefined
) {
  if (status === 'completed' || status === 'skipped') {
    return 100
  }

  if (value === null || value === undefined || value === '') {
    return getDefaultPhasePercentComplete(status)
  }

  return clampPercentage(Number(value))
}

export function getPhasePercentForStatusChange(
  status: PhaseStatus,
  currentValue: number | null | undefined
) {
  if (status === 'completed' || status === 'skipped') return 100
  if (status === 'not_started') return 0

  const current = typeof currentValue === 'number' ? clampPercentage(currentValue) : null
  if (current === null || current === 0) {
    return getDefaultPhasePercentComplete(status)
  }

  return current
}

export function getProjectProgressFromPhases(
  phases: Array<{ status: PhaseStatus; percent_complete?: number | null }>
) {
  if (phases.length === 0) return 0

  const total = phases.reduce((sum, phase) => sum + getPhasePercentComplete(phase), 0)
  return Math.round(total / phases.length)
}

export function shouldRetryLegacyPhaseWrite(message?: string | null) {
  if (!message) return false

  return ['percent_complete', 'is_milestone', 'is_critical_path'].some((field) => message.includes(field))
}
