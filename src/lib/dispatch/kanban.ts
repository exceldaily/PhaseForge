// Kanban lane derivation for dispatch calls (ported from DispatchForge).
import type { CallWithRelations } from './types'

export type KanbanLane =
  | 'needs_dispatch'
  | 'waiting_on_vendor'
  | 'waiting_on_parts'
  | 'ready_to_schedule'
  | 'scheduled_in_progress'
  | 'closed'

export const KANBAN_LANES: KanbanLane[] = [
  'needs_dispatch',
  'waiting_on_vendor',
  'waiting_on_parts',
  'ready_to_schedule',
  'scheduled_in_progress',
  'closed',
]

export const KANBAN_LABELS: Record<KanbanLane, string> = {
  needs_dispatch: 'Needs Dispatch',
  waiting_on_vendor: 'Waiting on Vendor',
  waiting_on_parts: 'Waiting on Parts',
  ready_to_schedule: 'Ready to Schedule',
  scheduled_in_progress: 'Scheduled / In Progress',
  closed: 'Closed',
}

const PARTS_ARRIVED = new Set(['received', 'installed', 'partially_delivered'])

export function getKanbanLane(call: CallWithRelations): KanbanLane {
  if (call.status === 'completed' || call.status === 'cancelled') return 'closed'

  if (!call.assigned_vendor_id && (call.status === 'open' || call.status === 'recall')) {
    return 'needs_dispatch'
  }

  if (PARTS_ARRIVED.has(call.part_status)) {
    if (call.status === 'in_progress') return 'scheduled_in_progress'
    return 'ready_to_schedule'
  }

  if (call.proposal_status === 'approved' && call.part_status === 'none') {
    return 'ready_to_schedule'
  }

  if (call.part_status === 'ordered' || call.status === 'parts_on_order') {
    return 'waiting_on_parts'
  }

  if (call.proposal_status === 'quote_requested' || call.proposal_status === 'sent') {
    return 'waiting_on_vendor'
  }

  if (call.status === 'in_progress') return 'scheduled_in_progress'
  if (call.scheduled_date && call.assigned_vendor_id) return 'scheduled_in_progress'

  if (!call.assigned_vendor_id) return 'needs_dispatch'

  return 'waiting_on_vendor'
}

export function groupByKanbanLane(calls: CallWithRelations[]): Record<KanbanLane, CallWithRelations[]> {
  const groups = Object.fromEntries(KANBAN_LANES.map((l) => [l, [] as CallWithRelations[]])) as Record<
    KanbanLane,
    CallWithRelations[]
  >
  for (const call of calls) {
    groups[getKanbanLane(call)].push(call)
  }
  return groups
}
