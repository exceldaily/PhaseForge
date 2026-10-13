// What needs attention today, what is coming, and what is waiting on someone
// else. Pure, so the page, the counts on the overview, and the weekly report
// agree. A future maintenance window stays in Upcoming; it only becomes a
// problem when its date has passed with nothing recorded.

import { daysBetween, isActionable, type TaskLite } from './rules'
import { OFFICIAL_OPEN } from './views'
import type { WorkOrderView } from './server'

export const WAITING_ON = ['technician', 'estimating', 'service_manager', 'customer', 'parts', 'billing'] as const
export type WaitingOn = (typeof WAITING_ON)[number]
export const WAITING_LABELS: Record<WaitingOn, string> = {
  technician: 'Waiting on technician', estimating: 'Waiting on estimating', service_manager: 'Waiting on service manager',
  customer: 'Waiting on customer', parts: 'Waiting on parts', billing: 'Waiting on billing',
}

export interface ActionItem {
  wo: WorkOrderView
  reason: string
  due: string | null
  /** When the item is about one task, that task. */
  taskId?: string
  /** Days since the last internal activity, or since the call date when nothing internal has happened. */
  daysWaiting: number
}

export interface ActionCenter {
  needsToday: { key: string; label: string; items: ActionItem[] }[]
  upcoming: { key: string; label: string; items: ActionItem[] }[]
  waiting: { key: WaitingOn; label: string; items: ActionItem[] }[]
  counts: Record<string, number>
}

export function buildActionCenter(input: { wos: WorkOrderView[]; tasksByWo: Map<string, TaskLite[]>; contactedSinceUnsat: Set<string>; today: string }): ActionCenter {
  const { wos, tasksByWo, today } = input
  const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
  const week = addDays(today, 7), fortnight = addDays(today, 14)
  const item = (w: WorkOrderView, reason: string, due: string | null = null, taskId?: string): ActionItem => ({
    wo: w, reason, due, taskId,
    daysWaiting: Math.max(0, daysBetween(w.case.lastUpdateAt > w.firstSeenAt ? w.case.lastUpdateAt : (w.callDate ?? w.firstSeenAt), today)),
  })
  const tasks = (w: WorkOrderView) => tasksByWo.get(w.id) ?? []
  const openTasks = (w: WorkOrderView) => tasks(w).filter((t) => t.status !== 'verified_resolved')

  const unassigned: ActionItem[] = [], overdue: ActionItem[] = [], complaints: ActionItem[] = [], unack: ActionItem[] = [], dueToday: ActionItem[] = [], blocked: ActionItem[] = [], verify: ActionItem[] = []
  const followUps: ActionItem[] = [], appointments: ActionItem[] = [], pm: ActionItem[] = [], parts: ActionItem[] = [], approvals: ActionItem[] = []
  const waiting = new Map<WaitingOn, ActionItem[]>(WAITING_ON.map((k) => [k, []]))

  for (const w of wos) {
    const c = w.case
    const actionable = isActionable(w)
    const officialOpen = !!w.status && OFFICIAL_OPEN.test(w.status)
    const ot = openTasks(w)

    if (actionable && !c.ownerProfileId && !c.actionOwnerProfileId) unassigned.push(item(w, 'No owner', c.dueDate))

    const overdueTask = ot.find((t) => t.dueDate && t.dueDate < today)
    if (c.internalStatus !== 'verified_resolved' && ((c.dueDate && c.dueDate < today) || overdueTask)) {
      const due = c.dueDate && c.dueDate < today ? c.dueDate : overdueTask!.dueDate!
      overdue.push(item(w, `${daysBetween(due, today)} day(s) overdue${overdueTask && !(c.dueDate && c.dueDate < today) ? `: ${overdueTask.title}` : ''}`, due, overdueTask?.id))
    }
    if (w.statusExt === 'UNSATISFACTORY' && actionable && !input.contactedSinceUnsat.has(w.id)) complaints.push(item(w, 'Unsatisfactory report, no customer contact recorded', c.dueDate))
    if (actionable && c.ownerProfileId && !c.handoffAcceptedAt && !c.externalAckAt && c.ownerAssignedAt && daysBetween(c.ownerAssignedAt, today) >= 1) unack.push(item(w, `Assigned to ${c.ownerName ?? 'someone'} ${daysBetween(c.ownerAssignedAt, today)} day(s) ago, not acknowledged`, c.dueDate))
    const taskToday = ot.find((t) => t.dueDate === today)
    if (c.internalStatus !== 'verified_resolved' && (c.dueDate === today || taskToday)) dueToday.push(item(w, taskToday ? `Task due today: ${taskToday.title}` : 'Follow-up due today', today, taskToday?.id))
    if (c.internalStatus === 'blocked' && daysBetween(c.lastUpdateAt, today) >= 3) blocked.push(item(w, `Blocked ${daysBetween(c.lastUpdateAt, today)} day(s) without an update${c.blockerReason ? `: ${c.blockerReason}` : ''}`, c.dueDate))
    const pending = ot.filter((t) => t.status === 'pending_verification').length
    if (c.internalStatus === 'pending_verification' || pending) verify.push(item(w, pending ? `${pending} task(s) marked complete, not verified` : 'Marked complete, not verified', c.dueDate))

    if (c.internalStatus !== 'verified_resolved') {
      const soonTask = ot.find((t) => t.dueDate && t.dueDate > today && t.dueDate <= week)
      if ((c.dueDate && c.dueDate > today && c.dueDate <= week) || soonTask) followUps.push(item(w, soonTask ? `Task: ${soonTask.title}` : (c.nextAction ?? 'Follow-up'), c.dueDate && c.dueDate > today && c.dueDate <= week ? c.dueDate : soonTask!.dueDate))
    }
    if (officialOpen && c.appointmentOn && c.appointmentOn >= today && c.appointmentOn <= fortnight) appointments.push(item(w, 'Appointment recorded on the case', c.appointmentOn))
    else if (officialOpen && w.scheduledDate && w.scheduledDate >= today && w.scheduledDate <= fortnight && !/MAINTENANCE/i.test(w.category ?? '')) appointments.push(item(w, 'Scheduled date in the export', w.scheduledDate))
    if (officialOpen && /MAINTENANCE/i.test(w.category ?? '') && w.observationState === 'observed') {
      if (w.scheduledDate && w.scheduledDate < today && w.statusExt !== 'ON SITE' && !c.appointmentOn) pm.push(item(w, `Scheduled date ${w.scheduledDate} passed, nothing recorded`, w.scheduledDate))
      else if (!w.scheduledDate && !c.appointmentOn) pm.push(item(w, 'No scheduled date in the export or on the case', null))
      else if ((c.appointmentOn ?? w.scheduledDate)! <= fortnight) pm.push(item(w, 'PM window within two weeks', c.appointmentOn ?? w.scheduledDate))
    }
    if (actionable && c.partsExpectedOn && !c.partsReceivedOn) parts.push(item(w, `Parts expected ${c.partsExpectedOn}${c.partsExpectedOn < today ? ' (date passed)' : ''}`, c.partsExpectedOn))
    if (actionable && (c.approvalStatus === 'pending' || w.statusExt === 'WAITING FOR APPROVAL' || w.statusExt === 'WAITING FOR QUOTE')) approvals.push(item(w, c.approvalStatus === 'pending' ? 'Approval pending (recorded on the case)' : `${w.statusExt} in the export`, c.dueDate))

    if (c.waitingOn && c.internalStatus !== 'verified_resolved') waiting.get(c.waitingOn as WaitingOn)?.push(item(w, c.nextAction ?? 'Waiting', c.dueDate))
  }

  const byDue = (a: ActionItem, b: ActionItem) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || b.daysWaiting - a.daysWaiting
  const sec = <K extends string>(key: K, label: string, items: ActionItem[]) => ({ key, label, items: items.sort(byDue) })
  const needsToday = [
    sec('unassigned', 'Unassigned actionable cases', unassigned), sec('overdue', 'Overdue internal follow-ups', overdue), sec('complaints', 'Customer complaints awaiting contact', complaints),
    sec('unack', 'Unacknowledged assignments', unack), sec('due_today', 'Tasks due today', dueToday), sec('blocked', 'Blocked without progress', blocked), sec('verify', 'Awaiting final verification', verify),
  ]
  const upcoming = [
    sec('follow_ups', 'Follow-ups due within seven days', followUps), sec('appointments', 'Upcoming appointments', appointments), sec('pm', 'PM scheduling requirements', pm),
    sec('parts', 'Expected parts deliveries', parts), sec('approvals', 'Pending approvals to follow up', approvals),
  ]
  const waitingSections = WAITING_ON.map((k) => sec(k, WAITING_LABELS[k], waiting.get(k) ?? []))
  const counts: Record<string, number> = {}
  for (const s of [...needsToday, ...upcoming, ...waitingSections]) counts[s.key] = s.items.length
  counts.needsToday = new Set(needsToday.flatMap((s) => s.items.map((i) => i.wo.id))).size
  return { needsToday, upcoming, waiting: waitingSections, counts }
}
