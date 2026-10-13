'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Person } from '@/lib/servicechannel/server'
import type { RecordEvent, RecoveryView, TaskFull } from '@/lib/servicechannel/records'
import { OUTCOMES_NEEDING_EVIDENCE, RECOVERY_OUTCOMES, RECOVERY_OUTCOME_LABELS, RECOVERY_STATUSES, RECOVERY_STATUS_LABELS, type RecoveryOutcome } from '@/lib/servicechannel/types'
import { cx, fmtDate, scLink } from '@/components/servicechannel/ui'
import { Area, Chip, DeptInput, Msg, PersonSelect, STATUS_TONE, Select, Text, box, btnPrimary } from '@/components/servicechannel/fields'
import { TaskList, Timeline } from '@/components/servicechannel/Tasks'
import { updateRecoveryAction } from '../../recordActions'

interface Props { recovery: RecoveryView; tasks: TaskFull[]; events: RecordEvent[]; people: Person[]; departments: string[]; today: string }

export function RecoveryClient({ recovery: r, tasks, events, people, departments, today }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [f, setF] = useState({
    customerName: r.customerName ?? '', storeLabel: r.storeLabel ?? '', trackingNumber: r.trackingNumber ?? '', reportingContact: r.reportingContact ?? '', complaint: r.complaint, approvedScope: r.approvedScope ?? '', findings: r.findings ?? '',
    ownerKey: r.ownerKey ?? '', ownerName: r.ownerName, department: r.department ?? '', contactDate: r.contactDate ?? '', conversationNotes: r.conversationNotes ?? '', agreedResolution: r.agreedResolution ?? '',
    requiredAction: r.requiredAction ?? '', followUpDeadline: r.followUpDeadline ?? '', verificationEvidence: r.verificationEvidence ?? '', outcome: r.outcome ?? '', status: r.status as string, note: '',
  })
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))
  const save = () => start(async () => {
    const { note, ...patch } = f
    const res = await updateRecoveryAction({ id: r.id, patch: { ...patch, ownerKey: patch.ownerKey || null, contactDate: patch.contactDate || null, followUpDeadline: patch.followUpDeadline || null, outcome: patch.outcome || null }, note })
    setMsg({ ok: res.ok, text: res.ok ? 'Saved.' : (res.error ?? 'Something went wrong.') })
    if (res.ok) { setF((s) => ({ ...s, note: '' })); router.refresh() }
  })
  const needsEvidence = f.outcome && OUTCOMES_NEEDING_EVIDENCE.includes(f.outcome as RecoveryOutcome) && (!f.findings.trim() || !f.verificationEvidence.trim())
  const late = r.status !== 'closed' && r.followUpDeadline && r.followUpDeadline < today
  const steps: [string, boolean][] = [['Complaint recorded', true], ['Customer contacted', !!f.contactDate], ['Findings documented', !!f.findings.trim()], ['Resolution agreed', !!f.agreedResolution.trim()], ['Corrective action done', tasks.length > 0 && tasks.every((t) => t.status === 'verified_resolved' || t.status === 'pending_verification')], ['Verified with the customer', !!f.verificationEvidence.trim()], ['Outcome chosen', !!f.outcome]]

  return (
    <div className="mx-auto max-w-none space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/app/servicechannel/customer-recovery" className="text-xs font-semibold text-indigo-700">← Customer Recovery</Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold text-slate-900">{r.customerName ?? 'Customer not named'}{r.storeLabel ? <span className="text-base font-medium text-slate-600">{r.storeLabel}</span> : null}<Chip tone={STATUS_TONE[r.status]}>{RECOVERY_STATUS_LABELS[r.status]}</Chip>{late && <Chip tone="bg-rose-600 text-white">DEADLINE PASSED</Chip>}</h1>
          <p className="mt-0.5 text-sm text-slate-600">Owner {r.ownerName ?? 'nobody'}{r.department ? ` · ${r.department}` : ''} · opened {fmtDate(r.createdAt.slice(0, 10))} by {r.createdName ?? '?'}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {r.workOrderId && <Link className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-indigo-700 hover:bg-slate-50" href={`/app/servicechannel/work-orders/${r.workOrderId}`}>Work order {r.trackingNumber}</Link>}
          {r.trackingNumber && <a className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-indigo-700 hover:bg-slate-50" target="_blank" rel="noreferrer" href={scLink(r.trackingNumber)}>Open in ServiceChannel</a>}
        </div>
      </div>
      <Msg m={msg} />
      <ol className="flex flex-wrap gap-1 text-[11px]">{steps.map(([s, done], i) => <li key={s} className={cx('rounded-full px-2 py-0.5 font-semibold', done ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>{i + 1}. {s}</li>)}</ol>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className={cx(box, 'lg:col-span-2')}>
          <h2 className="text-sm font-bold text-slate-900">The record</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Text label="Customer" value={f.customerName} onChange={set('customerName')} />
            <Text label="Store / site" value={f.storeLabel} onChange={set('storeLabel')} />
            <Text label="ServiceChannel tracking #" value={f.trackingNumber} onChange={set('trackingNumber')} />
            <Text label="Reporting contact" value={f.reportingContact} onChange={set('reportingContact')} />
            <Area className="sm:col-span-2" label="Complaint, in the customer's words" value={f.complaint} onChange={set('complaint')} rows={3} />
            <Area label="Approved scope (what was agreed before)" value={f.approvedScope} onChange={set('approvedScope')} rows={3} />
            <Area label="What we found" value={f.findings} onChange={set('findings')} rows={3} hint="Site visit, photos, technician account, ServiceChannel history. Facts, not a verdict." />
            <PersonSelect label="Owner" value={f.ownerKey} people={people} onChange={(k, n) => setF((s) => ({ ...s, ownerKey: k, ownerName: n }))} />
            <DeptInput value={f.department} onChange={set('department')} departments={departments} />
            <Text label="Customer contacted on" type="date" value={f.contactDate} onChange={set('contactDate')} hint="Recording a date here also logs a customer contact on the linked work order." />
            <Text label="Follow-up deadline" type="date" value={f.followUpDeadline} onChange={set('followUpDeadline')} />
            <Area className="sm:col-span-2" label="Conversation notes" value={f.conversationNotes} onChange={set('conversationNotes')} rows={3} placeholder="Who you spoke to, what they said, what they expect" />
            <Area label="Agreed resolution" value={f.agreedResolution} onChange={set('agreedResolution')} rows={2} />
            <Area label="Required action" value={f.requiredAction} onChange={set('requiredAction')} rows={2} hint="Then add it as a responsibility on the right so someone owns it." />
            <Area className="sm:col-span-2" label="Verification evidence" value={f.verificationEvidence} onChange={set('verificationEvidence')} rows={2} placeholder="Who at the customer confirmed the fix, when, and how; photos or portal status" />
            <Select label="Outcome" value={f.outcome} onChange={set('outcome')} blank="Not decided yet" options={RECOVERY_OUTCOMES.map((o) => [o, RECOVERY_OUTCOME_LABELS[o]])} hint={needsEvidence ? 'This outcome needs findings and verification evidence first.' : 'Chosen by you after the facts are checked. Nothing picks it automatically, and no rating correction is requested from here.'} />
            <Select label="Status" value={f.status} onChange={set('status')} options={RECOVERY_STATUSES.map((s) => [s, RECOVERY_STATUS_LABELS[s]])} hint={f.status === 'closed' && !f.outcome ? 'Pick the outcome before closing.' : undefined} />
            <Text className="sm:col-span-2" label="Note for the history (optional)" value={f.note} onChange={set('note')} />
          </div>
          <div className="mt-3 flex items-center gap-2"><button className={btnPrimary} disabled={pending || !f.complaint.trim() || !!needsEvidence || (f.status === 'closed' && !f.outcome)} onClick={save}>{pending ? 'Saving…' : 'Save'}</button><span className="text-[11px] text-slate-400">Every save is logged with what changed.</span></div>
        </section>
        <div className="space-y-4">
          <section className={box}><TaskList tasks={tasks} people={people} departments={departments} today={today} link={{ type: 'recovery', id: r.id }} title="Corrective actions" defaults={{ kind: 'corrective_action', ownerKey: r.ownerKey ?? undefined, ownerName: r.ownerName ?? undefined, department: r.department ?? undefined, dueDate: r.followUpDeadline ?? undefined }} /></section>
          <Timeline events={events} />
        </div>
      </div>
    </div>
  )
}
