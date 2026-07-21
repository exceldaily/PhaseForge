// Parts & proposal pipeline stages (ported from DispatchForge).
import type { CallWithRelations } from './types'

export type PipelineStage =
  | 'quote_requested'
  | 'proposal_sent'
  | 'proposal_approved'
  | 'parts_ordered'
  | 'parts_received'
  | 'ready_to_schedule'
  | 'scheduled_in_progress'
  | 'completed'

export const PIPELINE_STAGES: PipelineStage[] = [
  'quote_requested',
  'proposal_sent',
  'proposal_approved',
  'parts_ordered',
  'parts_received',
  'ready_to_schedule',
  'scheduled_in_progress',
  'completed',
]

export const PIPELINE_LABELS: Record<PipelineStage, string> = {
  quote_requested: 'Quote Requested',
  proposal_sent: 'Proposal Sent',
  proposal_approved: 'Proposal Approved',
  parts_ordered: 'Parts Ordered',
  parts_received: 'Parts Received',
  ready_to_schedule: 'Ready to Schedule',
  scheduled_in_progress: 'Scheduled / In Progress',
  completed: 'Completed',
}

// Stages where a call sitting there means someone owes a follow-up action.
export const NEEDS_ATTENTION: PipelineStage[] = ['proposal_approved', 'parts_received']

const PARTS_ARRIVED = new Set(['received', 'installed', 'partially_delivered'])

export function getPipelineStage(call: CallWithRelations): PipelineStage | null {
  if (call.status === 'cancelled' || call.proposal_status === 'rejected') return null
  if (call.status === 'completed') return 'completed'

  if (call.proposal_status === 'quote_requested') return 'quote_requested'
  if (call.proposal_status === 'sent') return 'proposal_sent'

  if (call.proposal_status === 'approved' && !PARTS_ARRIVED.has(call.part_status) && call.part_status !== 'ordered') {
    return 'proposal_approved'
  }

  if (call.part_status === 'ordered') return 'parts_ordered'

  if (PARTS_ARRIVED.has(call.part_status)) {
    if (call.status === 'in_progress') return 'scheduled_in_progress'
    if (call.scheduled_date) return 'ready_to_schedule'
    return 'parts_received'
  }

  if (call.status === 'in_progress') return 'scheduled_in_progress'

  return null
}

export function groupByPipelineStage(calls: CallWithRelations[]): Record<PipelineStage, CallWithRelations[]> {
  const groups = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, [] as CallWithRelations[]])) as Record<
    PipelineStage,
    CallWithRelations[]
  >
  for (const call of calls) {
    const stage = getPipelineStage(call)
    if (stage) groups[stage].push(call)
  }
  return groups
}
