// Transparent, rules-based suggestions. Every rule names the data it stands
// on, and only data we actually have: fields in the export, or facts a person
// recorded on the case. There is no SLA deadline, proposal status, or invoice
// status in the export, so nothing here claims one.
//
// "exception" means the data proves something needs doing (no owner, a passed
// deadline). "suggestion" means worth a look, and a person decides.

import { OFFICIAL_OPEN } from './views'
import type { WorkOrderView } from './server'

export interface TaskLite { id?: string; status: string; dueDate: string | null; title: string }

export interface Suggestion {
  key: string
  kind: 'exception' | 'suggestion'
  title: string
  /** Where this comes from, in plain words. */
  basis: string
  /** What the quick editor should offer. */
  action: 'assign' | 'contact' | 'schedule' | 'verify' | 'accept' | 'confirm_parts' | 'follow_up' | 'record_parts' | 'confirm_pm' | 'review'
}

export const UNACK_DAYS = 2
export const BLOCKED_STALE_DAYS = 3

export const daysBetween = (from: string, to: string) => Math.floor((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000)

export function isActionable(w: WorkOrderView): boolean {
  return w.observationState === 'observed' && !!w.status && OFFICIAL_OPEN.test(w.status) && w.case.internalStatus !== 'verified_resolved'
}

export function suggestFor(w: WorkOrderView, tasks: TaskLite[], today: string, opts: { contactedSinceUnsat: boolean }): Suggestion[] {
  const out: Suggestion[] = []
  const c = w.case
  if (!isActionable(w)) return out
  const exportDate = w.lastSeenAt.slice(0, 10)

  if (!c.ownerProfileId) out.push({ key: 'no_owner', kind: 'exception', title: 'No accountable owner', basis: `Active in the export of ${exportDate}; no PhaseForge owner recorded.`, action: 'assign' })

  if (c.dueDate && c.dueDate < today) out.push({ key: 'case_overdue', kind: 'exception', title: `Follow-up overdue by ${daysBetween(c.dueDate, today)} day(s)`, basis: `Internal due date ${c.dueDate} set in PhaseForge.`, action: 'follow_up' })
  const overdueTasks = tasks.filter((t) => t.status !== 'verified_resolved' && t.dueDate && t.dueDate < today)
  if (overdueTasks.length) out.push({ key: 'task_overdue', kind: 'exception', title: `${overdueTasks.length} task(s) past due`, basis: overdueTasks.map((t) => `"${t.title}" due ${t.dueDate}`).join('; '), action: 'follow_up' })

  if (w.statusExt === 'UNSATISFACTORY' && !opts.contactedSinceUnsat) out.push({ key: 'unsat_contact', kind: 'suggestion', title: 'Contact the reporting manager', basis: `Extended status UNSATISFACTORY in the export of ${exportDate}; no customer contact recorded in PhaseForge since.`, action: 'contact' })

  if (c.ownerProfileId && !c.handoffAcceptedAt && !c.externalAckAt && c.ownerAssignedAt && daysBetween(c.ownerAssignedAt, today) >= UNACK_DAYS) {
    out.push({ key: 'unacknowledged', kind: 'exception', title: `Assignment not acknowledged for ${daysBetween(c.ownerAssignedAt, today)} day(s)`, basis: `Assigned to ${c.ownerName ?? 'someone'} on ${c.ownerAssignedAt.slice(0, 10)}; no acceptance recorded.`, action: 'accept' })
  }

  if (c.approvalStatus === 'approved' && !c.appointmentOn) out.push({ key: 'approved_no_appt', kind: 'suggestion', title: 'Schedule the return visit', basis: 'Approval recorded on the case in PhaseForge; no appointment date entered.', action: 'schedule' })
  if (c.partsReceivedOn && !c.appointmentOn) out.push({ key: 'parts_no_appt', kind: 'suggestion', title: 'Confirm the return appointment', basis: `Parts recorded as received on ${c.partsReceivedOn}; no appointment date entered.`, action: 'schedule' })

  if (w.statusExt === 'PROPOSAL APPROVED' && !c.appointmentOn && (!w.scheduledDate || w.scheduledDate < today)) {
    out.push({ key: 'sc_approved_no_appt', kind: 'suggestion', title: 'Approved in ServiceChannel, no future appointment', basis: `Extended status PROPOSAL APPROVED in the export of ${exportDate}; scheduled date ${w.scheduledDate ?? 'blank'}; no appointment on the case.`, action: 'schedule' })
  }
  if ((w.statusExt === 'WAITING FOR QUOTE' || w.statusExt === 'WAITING FOR APPROVAL') && c.approvalStatus !== 'declined') {
    out.push({ key: 'sc_waiting_quote', kind: 'suggestion', title: w.statusExt === 'WAITING FOR QUOTE' ? 'Quote still outstanding' : 'Approval still outstanding', basis: `Extended status ${w.statusExt} in the export of ${exportDate}. The export has no proposal detail; check the proposal itself.`, action: 'follow_up' })
  }
  if (w.statusExt === 'PARTS ON ORDER' && !c.partsExpectedOn && !c.partsReceivedOn) out.push({ key: 'parts_no_eta', kind: 'suggestion', title: 'Record the expected parts date', basis: `Extended status PARTS ON ORDER in the export of ${exportDate}; no expected date on the case.`, action: 'record_parts' })
  if (w.statusExt === 'PARTS DELIVERED' && !c.appointmentOn) out.push({ key: 'parts_delivered', kind: 'suggestion', title: 'Parts delivered, schedule the return', basis: `Extended status PARTS DELIVERED in the export of ${exportDate}; no appointment on the case.`, action: 'schedule' })

  if (/MAINTENANCE/i.test(w.category ?? '') && w.scheduledDate && w.scheduledDate < today && w.statusExt !== 'ON SITE' && !c.appointmentOn) {
    out.push({ key: 'pm_date_passed', kind: 'suggestion', title: 'PM scheduled date has passed', basis: `Maintenance with scheduled date ${w.scheduledDate} in the export of ${exportDate}; no on-site status and no appointment on the case.`, action: 'confirm_pm' })
  }

  if (c.internalStatus === 'blocked' && daysBetween(c.lastUpdateAt, today) >= BLOCKED_STALE_DAYS) out.push({ key: 'blocked_stale', kind: 'exception', title: `Blocked with no update for ${daysBetween(c.lastUpdateAt, today)} day(s)`, basis: `${c.blockerReason ? `Blocker: ${c.blockerReason}. ` : ''}Last internal activity ${c.lastUpdateAt.slice(0, 10)}.`, action: 'review' })

  const pendingTasks = tasks.filter((t) => t.status === 'pending_verification').length
  if (c.internalStatus === 'pending_verification' || pendingTasks) out.push({ key: 'verify', kind: 'exception', title: pendingTasks ? `${pendingTasks} task(s) awaiting verification` : 'Case awaiting verification', basis: 'Marked complete in PhaseForge but not verified.', action: 'verify' })

  if (w.originalEta && w.originalEta < today && w.statusExt !== 'ON SITE') out.push({ key: 'eta_passed', kind: 'suggestion', title: 'Original ETA in the export has passed', basis: `Original ETA ${w.originalEta}; the export carries no SLA deadline, so this is the ETA field only.`, action: 'review' })

  if (w.conflicts.length) out.push({ key: 'conflict', kind: 'exception', title: 'Import disagrees with a manual value', basis: w.conflicts.map((x) => `${x.field}: import says "${x.imported}", kept "${x.kept}"`).join('; '), action: 'review' })

  return out
}
