// The PM trail as sentences. One place, so the PM page, the store profile,
// and the reports all word an event the same way.

import { fmtDate } from './quarters'
import { MATERIAL_STATUS_LABEL, PROPOSAL_LABEL, REPAIR_LABEL, STATUS_LABEL, type MaterialStatus, type PmStatus, type ProposalStatus, type RepairStatus } from './types'

type Detail = Record<string, unknown>
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const status = (v: unknown) => STATUS_LABEL[s(v) as PmStatus] ?? s(v)
const pair = (v: unknown) => (v && typeof v === 'object' ? (v as { from?: unknown; to?: unknown }) : null)
const day = (v: unknown) => (s(v) ? fmtDate(s(v)) || s(v) : 'none')

export type ActivityTone = 'neutral' | 'good' | 'warn' | 'bad'

export function describeActivity(action: string, d: Detail): { text: string; tone: ActivityTone } {
  switch (action) {
    case 'pm_created': return { text: `opened the Q${s(d.quarter)} ${s(d.year)} PM`, tone: 'neutral' }
    case 'job_number_entered': return { text: `entered job number ${s(d.to)}`, tone: 'good' }
    case 'job_number_changed': return { text: `changed the job number from ${s(d.from)} to ${s(d.to)}`, tone: 'warn' }
    case 'job_number_cleared': return { text: `removed job number ${s(d.from)}`, tone: 'warn' }
    case 'work_order_changed': return { text: d.to ? `set the ServiceChannel work order to ${s(d.to)}` : `removed ServiceChannel work order ${s(d.from)}`, tone: 'neutral' }
    case 'assigned': return { text: d.to ? `assigned the PM to ${s(d.to)}` : 'unassigned the PM', tone: 'neutral' }
    case 'scheduled': return { text: `scheduled the visit for ${day(d.to)}`, tone: 'neutral' }
    case 'rescheduled': return { text: `moved the visit from ${day(d.from)} to ${day(d.to)}`, tone: 'warn' }
    case 'unscheduled': return { text: `took the visit off ${day(d.from)}`, tone: 'warn' }
    case 'due_changed': {
      const parts: string[] = []
      if (s(d.due_from) !== s(d.due_to)) parts.push(`due date ${day(d.due_from)} to ${day(d.due_to)}`)
      if (s(d.priority_from) !== s(d.priority_to)) parts.push(`priority ${s(d.priority_from) || 'none'} to ${s(d.priority_to) || 'none'}`)
      return { text: `changed ${parts.join(' and ') || 'the due date'}`, tone: 'neutral' }
    }
    case 'dates_changed': {
      const names: Record<string, string> = { start: 'actual start', end: 'actual completion', received: 'date received', submitted: 'date submitted' }
      const parts = Object.entries(names).flatMap(([k, label]) => { const p = pair(d[k]); return p ? [`${label} ${day(p.from)} to ${day(p.to)}`] : [] })
      return { text: `changed ${parts.join(', ') || 'a date'}`, tone: 'neutral' }
    }
    case 'started': return { text: 'started the PM', tone: 'good' }
    case 'reopened': return { text: `reopened the PM${d.note ? `: ${s(d.note)}` : ''}`, tone: 'warn' }
    case 'field_completed': return { text: 'marked the field work complete', tone: 'good' }
    case 'submitted': return { text: 'recorded the documentation as submitted', tone: 'good' }
    case 'closed': return { text: `closed out the PM${d.override ? `, overriding the completion rules: ${s(d.override)}` : ''}`, tone: d.override ? 'warn' : 'good' }
    case 'status_changed': return { text: `changed the status from ${status(d.from)} to ${status(d.to)}${d.note ? `: ${s(d.note)}` : ''}`, tone: s(d.to) === 'on_hold' || s(d.to) === 'cancelled' ? 'warn' : 'neutral' }
    case 'return_visit_needed': return { text: `flagged a return visit${d.note ? `: ${s(d.note)}` : ''}`, tone: 'bad' }
    case 'return_visit_cleared': return { text: 'cleared the return visit flag', tone: 'good' }
    case 'material_requested': return { text: `requested ${s(d.quantity)} x ${s(d.name)}`, tone: 'neutral' }
    case 'material_status': {
      const to = s(d.to) as MaterialStatus
      return { text: `${s(d.name)}: ${MATERIAL_STATUS_LABEL[s(d.from) as MaterialStatus] ?? s(d.from)} to ${MATERIAL_STATUS_LABEL[to] ?? to}`, tone: to === 'received' || to === 'installed' ? 'good' : to === 'backordered' ? 'bad' : 'neutral' }
    }
    case 'deficiency_identified': return { text: `wrote up a ${s(d.severity)} deficiency${d.item ? ` on ${s(d.item)}` : ''}: ${s(d.text)}`, tone: 'bad' }
    case 'deficiency_status': {
      const r = pair(d.repair); const p = pair(d.proposal)
      const parts = [
        r ? `repair ${REPAIR_LABEL[s(r.from) as RepairStatus] ?? s(r.from)} to ${REPAIR_LABEL[s(r.to) as RepairStatus] ?? s(r.to)}` : '',
        p ? `proposal ${PROPOSAL_LABEL[s(p.from) as ProposalStatus] ?? s(p.from)} to ${PROPOSAL_LABEL[s(p.to) as ProposalStatus] ?? s(p.to)}` : '',
      ].filter(Boolean)
      return { text: `updated the deficiency${d.item ? ` on ${s(d.item)}` : ''}: ${parts.join(', ')}`, tone: r && ['repaired', 'closed'].includes(s(r.to)) ? 'good' : 'neutral' }
    }
    case 'deficiency_linked': return { text: d.to ? `linked the deficiency${d.item ? ` on ${s(d.item)}` : ''} to follow-up job ${s(d.to)}` : 'removed the follow-up job from a deficiency', tone: 'neutral' }
    case 'check_corrected': return { text: `changed ${s(d.item)} from ${s(d.from)} to ${s(d.to) || 'not inspected'}${d.reason ? ` (${s(d.reason)})` : ''}`, tone: 'warn' }
    case 'checklist_progress': return { text: `checklist reached ${s(d.pct)}% (${s(d.done)} of ${s(d.total)})`, tone: s(d.pct) === '100' ? 'good' : 'neutral' }
    case 'checklist_started': return { text: `started the checklist on ${s(d.template)}`, tone: 'neutral' }
    case 'report_generated': return { text: `generated PM report version ${s(d.version)}`, tone: 'neutral' }
    case 'import_committed': return { text: `imported ${s(d.count)} ${s(d.kind)}`, tone: 'neutral' }
    case 'exclusion_added': return { text: `excluded ${s(d.item)} for this store: ${s(d.reason)}`, tone: 'neutral' }
    case 'exclusion_removed': return { text: `put ${s(d.item)} back on this store's checklist`, tone: 'neutral' }
    default: return { text: action.replace(/_/g, ' '), tone: 'neutral' }
  }
}
