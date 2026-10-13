'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import type { Person, TemplateView, WorkOrderView } from '@/lib/servicechannel/server'
import { INTERNAL_STATUSES, INTERNAL_STATUS_LABELS } from '@/lib/servicechannel/types'
import { WAITING_LABELS, WAITING_ON } from '@/lib/servicechannel/actionCenter'
import { quickUpdateCaseAction, recordExternalAckAction, type CaseFacts, type QuickPatch } from '@/app/app/servicechannel/opsActions'
import { InternalChip, OfficialChip, cx, fmtDate } from './ui'

interface Props {
  wo: WorkOrderView; people: Person[]; templates: TemplateView[]; departments: string[]; today: string
  onClose: () => void; onSaved: () => void
  /** Pre-fill from a suggestion: which part to open first. */
  focus?: 'assign' | 'contact' | 'schedule' | 'follow_up' | 'record_parts' | 'confirm_pm' | 'accept' | 'verify' | 'review' | 'confirm_parts'
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/**
 * The fast follow-up panel: who owns it, what happens next, by when, plus the
 * facts the export cannot tell us. One save. Ctrl+Enter saves, Esc closes.
 */
export function QuickEditor({ wo, people, templates, departments, today, onClose, onSaved, focus }: Props) {
  const c = wo.case
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [f, setF] = useState({
    internalStatus: c.internalStatus as string, ownerId: c.ownerProfileId ?? '', actionOwnerId: c.actionOwnerProfileId ?? '', department: c.department ?? '', waitingOn: c.waitingOn ?? '',
    nextAction: c.nextAction ?? '', dueDate: c.dueDate ?? '', blockerReason: c.blockerReason ?? '', note: '', noteKind: (focus === 'contact' ? 'customer_contact' : 'note') as 'note' | 'customer_contact' | 'department_followup',
  })
  const [facts, setFacts] = useState({
    appointmentOn: c.appointmentOn ?? '', partsExpectedOn: c.partsExpectedOn ?? '', partsReceivedOn: c.partsReceivedOn ?? '', approvalStatus: c.approvalStatus ?? '',
    equipmentCondition: c.equipmentCondition ?? '', conditionVerified: false, customerContactName: c.customerContactName ?? '', nextContactOn: c.nextContactOn ?? '',
  })
  const [showFacts, setShowFacts] = useState(focus === 'schedule' || focus === 'record_parts' || focus === 'confirm_pm' || focus === 'confirm_parts' || focus === 'contact')
  const [ack, setAck] = useState('')
  const person = (id: string) => people.find((p) => p.id === id)

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id)
    if (!t) return
    setF((s) => ({ ...s, nextAction: t.nextAction, dueDate: addDays(today, t.daysDue), waitingOn: t.waitingOn ?? s.waitingOn, internalStatus: t.internalStatus && t.internalStatus !== 'verified_resolved' ? t.internalStatus : s.internalStatus }))
  }

  const save = () => start(async () => {
    setErr(null)
    const patch: QuickPatch = {
      internalStatus: f.internalStatus, ownerProfileId: f.ownerId || null, ownerName: person(f.ownerId)?.name ?? null,
      actionOwnerProfileId: f.actionOwnerId || null, actionOwnerName: person(f.actionOwnerId)?.name ?? null,
      department: f.department, waitingOn: f.waitingOn || null, nextAction: f.nextAction, dueDate: f.dueDate || null, blockerReason: f.blockerReason,
    }
    const cf: CaseFacts = {
      appointmentOn: facts.appointmentOn || null, partsExpectedOn: facts.partsExpectedOn || null, partsReceivedOn: facts.partsReceivedOn || null, approvalStatus: facts.approvalStatus || null,
      equipmentCondition: facts.equipmentCondition, conditionVerified: facts.conditionVerified, customerContactName: facts.customerContactName, nextContactOn: facts.nextContactOn || null,
    }
    const r = await quickUpdateCaseAction({ workOrderId: wo.id, patch, facts: cf, note: f.note, noteKind: f.noteKind })
    if (!r.ok) { setErr(r.error); return }
    onSaved()
  })
  const recordAck = () => start(async () => {
    const r = await recordExternalAckAction({ workOrderId: wo.id, who: ack })
    if (!r.ok) { setErr(r.error); return }
    setAck(''); onSaved()
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, facts])

  const input = 'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none'
  const lbl = 'block text-[11px] font-semibold uppercase tracking-wide text-slate-500'

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-4 shadow-2xl sm:p-5" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Follow-up for ${wo.trackingNumber}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2"><Link href={`/app/servicechannel/work-orders/${wo.id}`} className="font-mono text-base font-bold text-indigo-700 hover:underline">{wo.trackingNumber}</Link><OfficialChip status={wo.status} statusExt={wo.statusExt} /><InternalChip status={c.internalStatus} /></p>
            <p className="mt-0.5 truncate text-sm text-slate-600">{wo.customerName ?? 'Customer not known'} · {wo.storeLabel ?? '-'} · {wo.trade ?? '-'}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{wo.problemDescription ?? 'No problem description in the export'}</p>
          </div>
          <button className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {err && <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800">{err}</p>}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label><span className={lbl}>Accountable owner</span><select className={input} value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })} autoFocus={focus === 'assign'}><option value="">Nobody yet</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label><span className={lbl}>Next-action owner</span><select className={input} value={f.actionOwnerId} onChange={(e) => setF({ ...f, actionOwnerId: e.target.value })}><option value="">Same as accountable</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label><span className={lbl}>Internal status</span><select className={input} value={f.internalStatus} onChange={(e) => setF({ ...f, internalStatus: e.target.value })}>{INTERNAL_STATUSES.filter((s) => s !== 'verified_resolved' || s === c.internalStatus).map((s) => <option key={s} value={s}>{INTERNAL_STATUS_LABELS[s]}</option>)}</select></label>
          <label><span className={lbl}>Waiting on</span><select className={input} value={f.waitingOn} onChange={(e) => setF({ ...f, waitingOn: e.target.value })}><option value="">Not waiting</option>{WAITING_ON.map((w) => <option key={w} value={w}>{WAITING_LABELS[w].replace('Waiting on ', '')}</option>)}</select></label>
          <label><span className={lbl}>Department</span><input className={input} list="qe-depts" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /><datalist id="qe-depts">{departments.map((d) => <option key={d} value={d} />)}</datalist></label>
          <label><span className={lbl}>Template</span><select className={input} defaultValue="" onChange={(e) => { applyTemplate(e.target.value); e.target.value = '' }}><option value="">Fill from a template…</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
          <label className="col-span-2"><span className={lbl}>Next action</span><input className={input} value={f.nextAction} onChange={(e) => setF({ ...f, nextAction: e.target.value })} placeholder="One concrete step" autoFocus={focus === 'follow_up'} /></label>
          <label><span className={lbl}>Due</span><input type="date" className={input} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></label>
          <label><span className={lbl}>Blocker</span><input className={input} value={f.blockerReason} onChange={(e) => setF({ ...f, blockerReason: e.target.value })} placeholder="What is holding it" /></label>
          <div className="col-span-2 grid grid-cols-[150px_1fr] gap-2">
            <select className={input} value={f.noteKind} onChange={(e) => setF({ ...f, noteKind: e.target.value as typeof f.noteKind })}><option value="note">Note</option><option value="customer_contact">Customer contact</option><option value="department_followup">Department follow-up</option></select>
            <input className={input} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={f.noteKind === 'customer_contact' ? 'Who you spoke to, what they said, what was agreed' : 'Add a note (optional)'} autoFocus={focus === 'contact'} />
          </div>
        </div>

        <button className="mt-3 text-xs font-semibold text-indigo-700" onClick={() => setShowFacts(!showFacts)}>{showFacts ? 'Hide' : 'Show'} recorded facts (appointment, parts, approval, condition, contact)</button>
        {showFacts && (
          <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3">
            <p className="col-span-2 text-[11px] text-slate-500">These are not in the ServiceChannel export. What you record here is kept across imports and drives the suggestions.</p>
            <label><span className={lbl}>Appointment / return visit</span><input type="date" className={input} value={facts.appointmentOn} onChange={(e) => setFacts({ ...facts, appointmentOn: e.target.value })} autoFocus={focus === 'schedule' || focus === 'confirm_pm'} /></label>
            <label><span className={lbl}>Approval (recorded)</span><select className={input} value={facts.approvalStatus} onChange={(e) => setFacts({ ...facts, approvalStatus: e.target.value })}><option value="">Not recorded</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="declined">Declined</option></select></label>
            <label><span className={lbl}>Parts expected</span><input type="date" className={input} value={facts.partsExpectedOn} onChange={(e) => setFacts({ ...facts, partsExpectedOn: e.target.value })} autoFocus={focus === 'record_parts'} /></label>
            <label><span className={lbl}>Parts received</span><input type="date" className={input} value={facts.partsReceivedOn} onChange={(e) => setFacts({ ...facts, partsReceivedOn: e.target.value })} /></label>
            <label className="col-span-2"><span className={lbl}>Equipment condition (verified with the site)</span><div className="flex gap-2"><input className={input} value={facts.equipmentCondition} onChange={(e) => setFacts({ ...facts, equipmentCondition: e.target.value })} placeholder="Running / alarming / down, and who confirmed it" /><label className="flex shrink-0 items-center gap-1 text-xs"><input type="checkbox" checked={facts.conditionVerified} onChange={(e) => setFacts({ ...facts, conditionVerified: e.target.checked })} />verified now</label></div>{c.conditionVerifiedAt && <span className="text-[11px] text-slate-500">Last verified {fmtDate(c.conditionVerifiedAt.slice(0, 10))}</span>}</label>
            <label><span className={lbl}>Customer contact person</span><input className={input} value={facts.customerContactName} onChange={(e) => setFacts({ ...facts, customerContactName: e.target.value })} /></label>
            <label><span className={lbl}>Next contact</span><input type="date" className={input} value={facts.nextContactOn} onChange={(e) => setFacts({ ...facts, nextContactOn: e.target.value })} /></label>
          </div>
        )}

        {c.ownerProfileId && !c.handoffAcceptedAt && !c.externalAckAt && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p>Assignment to {c.ownerName} not acknowledged yet. If they confirmed outside PhaseForge, record it here under your name.</p>
            <div className="mt-2 flex gap-2"><input className={cx(input, 'bg-white')} placeholder="Who acknowledged (name)" value={ack} onChange={(e) => setAck(e.target.value)} /><button className="shrink-0 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-50" disabled={pending || !ack.trim()} onClick={recordAck}>Record acknowledgment</button></div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
          <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={pending} onClick={save}>{pending ? 'Saving…' : 'Save and return'}</button>
          <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700" onClick={onClose}>Cancel</button>
          <span className="ml-auto text-[11px] text-slate-400">Ctrl+Enter saves · Esc closes</span>
        </div>
      </aside>
    </div>
  )
}
