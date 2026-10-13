// The daily action queue: what needs action today, what is waiting on
// someone else, and what is coming. Pure, so the queue page, the Command
// Center counts, the department views, and the weekly report agree.
//
// An imported work order is never a task by itself. Items come from
// responsibilities a person created or recorded: an owner, a due date, a
// recovery, a project, or a fact the export proves (a complaint with no
// recorded contact, a scheduled date that passed). A future maintenance
// window stays in Upcoming; it only becomes a problem when its date has
// passed with nothing recorded.

import { daysBetween, isActionable } from './rules'
import { OFFICIAL_OPEN } from './views'
import { DEFAULT_THRESHOLDS, WAITING_ON, WAITING_LABELS, type Thresholds, type WaitingOn } from './types'
import type { WorkOrderView } from './server'
import type { ProjectView, RecoveryView, TaskFull } from './records'

export { WAITING_ON, WAITING_LABELS, type WaitingOn } from './types'

export type QuickFocus = 'assign' | 'contact' | 'schedule' | 'follow_up' | 'record_parts' | 'confirm_pm' | 'accept' | 'verify' | 'review' | 'confirm_parts'

export interface ActionItem {
  key: string
  kind: 'work_order' | 'task' | 'recovery' | 'project'
  id: string
  /** Set when the item is about a work order, so the quick editor can open. */
  woId?: string
  taskId?: string
  title: string
  subtitle: string
  href: string
  reason: string
  due: string | null
  /** Days since the last internal activity, or since the call date when nothing internal has happened. */
  daysWaiting: number
  ownerKey: string | null
  ownerName: string | null
  nextAction: string | null
  status: string
  department: string | null
  escalated: boolean
  focus?: QuickFocus
}

export interface Section { key: string; label: string; items: ActionItem[] }
export interface ActionCenter { needsToday: Section[]; upcoming: Section[]; waiting: Section[]; counts: Record<string, number> }

export interface ActionCenterInput {
  wos: WorkOrderView[]
  /** Every open task, on work orders or standalone. */
  tasks: TaskFull[]
  recoveries?: RecoveryView[]
  projects?: ProjectView[]
  contactedSinceUnsat: Set<string>
  today: string
  thresholds?: Thresholds
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

export function buildActionCenter(input: ActionCenterInput): ActionCenter {
  const { wos, tasks, today } = input
  const th = input.thresholds ?? DEFAULT_THRESHOLDS
  const recoveries = input.recoveries ?? [], projects = input.projects ?? []
  const week = addDays(today, 7), fortnight = addDays(today, 14)

  const woItem = (w: WorkOrderView, reason: string, due: string | null = null, focus?: QuickFocus): ActionItem => ({
    key: `wo:${w.id}:${reason}`, kind: 'work_order', id: w.id, woId: w.id, title: w.trackingNumber,
    subtitle: `${w.customerName ?? 'Customer not known'} · ${w.storeNumber ?? '-'} · ${w.problemDescription ?? 'No problem description in the export'}`,
    href: `/app/servicechannel/work-orders/${w.id}`, reason, due,
    daysWaiting: Math.max(0, daysBetween(w.case.lastUpdateAt > w.firstSeenAt ? w.case.lastUpdateAt : (w.callDate ?? w.firstSeenAt), today)),
    ownerKey: w.case.ownerProfileId, ownerName: w.case.ownerName, nextAction: w.case.nextAction, status: w.case.internalStatus, department: w.case.department, escalated: !!w.case.escalatedAt, focus,
  })
  const taskItem = (t: TaskFull, reason: string, due: string | null = t.dueDate): ActionItem => ({
    key: `task:${t.id}:${reason}`, kind: 'task', id: t.id, woId: t.workOrderId ?? undefined, taskId: t.id, title: t.title,
    subtitle: t.record ? t.record.label : 'Standalone responsibility', href: t.record?.href ?? '/app/servicechannel/action-center', reason, due,
    daysWaiting: Math.max(0, daysBetween(t.lastUpdateAt ?? t.createdAt, today)),
    ownerKey: t.ownerKey, ownerName: t.ownerName, nextAction: t.nextAction, status: t.status, department: t.department, escalated: !!t.escalatedAt,
  })
  const recItem = (r: RecoveryView, reason: string, due: string | null = r.followUpDeadline): ActionItem => ({
    key: `rec:${r.id}:${reason}`, kind: 'recovery', id: r.id, title: [r.customerName, r.storeLabel].filter(Boolean).join(' ') || 'Customer recovery',
    subtitle: `${r.trackingNumber ? `${r.trackingNumber} · ` : ''}${r.complaint.slice(0, 120)}`, href: `/app/servicechannel/customer-recovery/${r.id}`, reason, due,
    daysWaiting: Math.max(0, daysBetween(r.lastUpdateAt, today)), ownerKey: r.ownerKey, ownerName: r.ownerName, nextAction: r.requiredAction, status: r.status, department: r.department, escalated: false,
  })
  const projItem = (p: ProjectView, reason: string, due: string | null): ActionItem => ({
    key: `proj:${p.id}:${reason}`, kind: 'project', id: p.id, title: p.name, subtitle: `${p.scopeCustomer ?? 'Company-wide'} · ${p.kpi ?? p.scoreCategory ?? 'improvement project'}`,
    href: `/app/servicechannel/projects/${p.id}`, reason, due, daysWaiting: Math.max(0, daysBetween(p.lastUpdateAt, today)),
    ownerKey: p.ownerKey, ownerName: p.ownerName, nextAction: null, status: p.status, department: p.department, escalated: false,
  })

  const S = () => [] as ActionItem[]
  const unassigned = S(), overdue = S(), complaints = S(), unack = S(), dueToday = S(), blocked = S(), escalated = S(), verify = S()
  const followUps = S(), reviews = S(), corrective = S(), appointments = S(), pm = S(), parts = S(), approvals = S()
  const waiting = new Map<WaitingOn, ActionItem[]>(WAITING_ON.map((k) => [k, []]))

  // Work orders: only what a person recorded, or what the export proves.
  for (const w of wos) {
    const c = w.case
    if (c.internalStatus === 'verified_resolved') continue
    const actionable = isActionable(w)
    const officialOpen = !!w.status && OFFICIAL_OPEN.test(w.status)
    const tracked = c.internalStatus !== 'new' || !!c.nextAction || !!c.dueDate

    if (tracked && !c.ownerProfileId && !c.actionOwnerProfileId) unassigned.push(woItem(w, 'Being followed up, but nobody owns it', c.dueDate, 'assign'))
    if (c.dueDate && c.dueDate < today) overdue.push(woItem(w, `Follow-up ${daysBetween(c.dueDate, today)} day(s) overdue${c.nextAction ? `: ${c.nextAction}` : ''}`, c.dueDate, 'follow_up'))
    else if (c.dueDate === today) dueToday.push(woItem(w, `Follow-up due today${c.nextAction ? `: ${c.nextAction}` : ''}`, today, 'follow_up'))
    else if (c.dueDate && c.dueDate <= week) followUps.push(woItem(w, c.nextAction ?? 'Follow-up', c.dueDate, 'follow_up'))
    if (w.statusExt === 'UNSATISFACTORY' && actionable && !input.contactedSinceUnsat.has(w.id)) complaints.push(woItem(w, 'Unsatisfactory report in the export, no customer contact recorded', c.dueDate, 'contact'))
    if (actionable && c.ownerProfileId && !c.handoffAcceptedAt && !c.externalAckAt && c.ownerAssignedAt && daysBetween(c.ownerAssignedAt, today) >= th.unackDays) unack.push(woItem(w, `Assigned to ${c.ownerName ?? 'someone'} ${daysBetween(c.ownerAssignedAt, today)} day(s) ago, not acknowledged`, c.dueDate, 'accept'))
    if (c.internalStatus === 'blocked' && daysBetween(c.lastUpdateAt, today) >= th.staleDays) blocked.push(woItem(w, `Blocked ${daysBetween(c.lastUpdateAt, today)} day(s) without an update${c.blockerReason ? `: ${c.blockerReason}` : ''}`, c.dueDate, 'review'))
    if (c.escalatedAt) escalated.push(woItem(w, `Escalated to ${c.escalatedTo ?? 'management'} on ${c.escalatedAt.slice(0, 10)}${c.escalationNote ? `: ${c.escalationNote}` : ''}`, c.dueDate, 'review'))
    if (c.internalStatus === 'pending_verification') verify.push(woItem(w, 'Marked complete, not verified', c.dueDate, 'verify'))

    if (officialOpen && c.appointmentOn && c.appointmentOn >= today && c.appointmentOn <= fortnight) appointments.push(woItem(w, 'Appointment recorded on the case', c.appointmentOn, 'schedule'))
    else if (officialOpen && w.scheduledDate && w.scheduledDate >= today && w.scheduledDate <= fortnight && !/MAINTENANCE/i.test(w.category ?? '')) appointments.push(woItem(w, 'Scheduled date in the export', w.scheduledDate, 'schedule'))
    if (officialOpen && /MAINTENANCE/i.test(w.category ?? '') && w.observationState === 'observed') {
      if (w.scheduledDate && w.scheduledDate < today && w.statusExt !== 'ON SITE' && !c.appointmentOn) pm.push(woItem(w, `Scheduled date ${w.scheduledDate} passed, nothing recorded`, w.scheduledDate, 'confirm_pm'))
      else if (!w.scheduledDate && !c.appointmentOn) pm.push(woItem(w, 'No scheduled date in the export or on the case', null, 'confirm_pm'))
      else if ((c.appointmentOn ?? w.scheduledDate)! <= fortnight) pm.push(woItem(w, 'PM window within two weeks', c.appointmentOn ?? w.scheduledDate, 'confirm_pm'))
    }
    if (actionable && c.partsExpectedOn && !c.partsReceivedOn) parts.push(woItem(w, `Parts expected ${c.partsExpectedOn}${c.partsExpectedOn < today ? ' (date passed)' : ''}`, c.partsExpectedOn, 'confirm_parts'))
    if (actionable && (c.approvalStatus === 'pending' || w.statusExt === 'WAITING FOR APPROVAL' || w.statusExt === 'WAITING FOR QUOTE')) approvals.push(woItem(w, c.approvalStatus === 'pending' ? 'Approval pending (recorded on the case)' : `${w.statusExt} in the export`, c.dueDate, 'follow_up'))
    if (c.waitingOn) waiting.get(c.waitingOn as WaitingOn)?.push(woItem(w, c.nextAction ?? 'Waiting', c.dueDate, 'follow_up'))
  }

  // Responsibilities: tasks on work orders, projects, recoveries, investigations, or standalone.
  for (const t of tasks) {
    if (t.status === 'verified_resolved') continue
    if (!t.ownerKey) unassigned.push(taskItem(t, 'No owner'))
    if (t.dueDate && t.dueDate < today) overdue.push(taskItem(t, `${daysBetween(t.dueDate, today)} day(s) overdue`))
    else if (t.dueDate === today) dueToday.push(taskItem(t, 'Due today'))
    else if (t.dueDate && t.dueDate <= week && t.kind !== 'review' && t.kind !== 'corrective_action') followUps.push(taskItem(t, t.nextAction ?? 'Due this week'))
    if (t.kind === 'corrective_action' && t.dueDate && t.dueDate > today && t.dueDate <= fortnight) corrective.push(taskItem(t, 'Scheduled corrective action'))
    if (t.kind === 'review' && t.dueDate && t.dueDate > today && t.dueDate <= fortnight) reviews.push(taskItem(t, 'Management review'))
    if (t.ownerKey && !t.acceptedAt && !t.externalAckAt && daysBetween(t.createdAt, today) >= th.unackDays) unack.push(taskItem(t, `Assigned to ${t.ownerName ?? 'someone'}, not acknowledged for ${daysBetween(t.createdAt, today)} day(s)`))
    if (t.status === 'blocked' && daysBetween(t.lastUpdateAt, today) >= th.staleDays) blocked.push(taskItem(t, `Blocked ${daysBetween(t.lastUpdateAt, today)} day(s) without an update${t.blockerReason ? `: ${t.blockerReason}` : ''}`))
    if (t.escalatedAt) escalated.push(taskItem(t, `Escalated to ${t.escalatedTo ?? 'management'} on ${t.escalatedAt.slice(0, 10)}${t.escalationNote ? `: ${t.escalationNote}` : ''}`))
    if (t.status === 'pending_verification') verify.push(taskItem(t, 'Marked complete, not verified'))
    if (t.waitingOn) waiting.get(t.waitingOn as WaitingOn)?.push(taskItem(t, t.nextAction ?? 'Waiting'))
  }

  for (const r of recoveries) {
    if (r.status === 'closed') continue
    if (!r.ownerKey) unassigned.push(recItem(r, 'Recovery has no owner'))
    if (r.status === 'open' && !r.contactDate) complaints.push(recItem(r, 'Customer complaint recorded, no contact yet'))
    if (r.followUpDeadline && r.followUpDeadline < today) overdue.push(recItem(r, `Follow-up deadline ${daysBetween(r.followUpDeadline, today)} day(s) past`))
    else if (r.followUpDeadline === today) dueToday.push(recItem(r, 'Follow-up deadline today'))
    else if (r.followUpDeadline && r.followUpDeadline <= week) followUps.push(recItem(r, r.requiredAction ?? 'Recovery follow-up'))
    if (r.status === 'pending_verification') verify.push(recItem(r, 'Corrective action done, customer confirmation not recorded'))
  }

  for (const p of projects) {
    if (p.status === 'completed' || p.status === 'cancelled') continue
    if (p.reviewDate && p.reviewDate < today) overdue.push(projItem(p, `Management review date ${daysBetween(p.reviewDate, today)} day(s) past`, p.reviewDate))
    else if (p.reviewDate === today) dueToday.push(projItem(p, 'Management review today', p.reviewDate))
    else if (p.reviewDate && p.reviewDate <= fortnight) reviews.push(projItem(p, 'Management review', p.reviewDate))
    if (p.targetDate && p.targetDate < today) overdue.push(projItem(p, `Target date passed, project still ${p.status.replace('_', ' ')}`, p.targetDate))
  }

  const byDue = (a: ActionItem, b: ActionItem) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || b.daysWaiting - a.daysWaiting
  const sec = (key: string, label: string, items: ActionItem[]): Section => ({ key, label, items: items.sort(byDue) })
  const needsToday = [
    sec('overdue', 'Overdue responsibilities', overdue), sec('complaints', 'Customer complaints awaiting contact', complaints), sec('escalated', 'Escalated to management', escalated),
    sec('unack', 'Unacknowledged assignments', unack), sec('unassigned', 'Responsibilities with no owner', unassigned), sec('due_today', 'Due today', dueToday),
    sec('blocked', 'Blocked without progress', blocked), sec('verify', 'Awaiting verification', verify),
  ]
  const upcoming = [
    sec('follow_ups', 'Due within seven days', followUps), sec('reviews', 'Management reviews', reviews), sec('corrective', 'Scheduled corrective actions', corrective),
    sec('appointments', 'Upcoming appointments', appointments), sec('pm', 'PM scheduling requirements', pm), sec('parts', 'Expected parts deliveries', parts), sec('approvals', 'Pending approvals to follow up', approvals),
  ]
  const waitingSections = WAITING_ON.map((k) => sec(k, WAITING_LABELS[k], waiting.get(k) ?? []))
  const counts: Record<string, number> = {}
  for (const s of [...needsToday, ...upcoming, ...waitingSections]) counts[s.key] = s.items.length
  counts.needsToday = new Set(needsToday.flatMap((s) => s.items.map((i) => `${i.kind}:${i.id}`))).size
  counts.waiting = waitingSections.reduce((n, s) => n + s.items.length, 0)
  counts.upcoming = upcoming.reduce((n, s) => n + s.items.length, 0)
  return { needsToday, upcoming, waiting: waitingSections, counts }
}
