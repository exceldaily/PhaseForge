'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Person } from '@/lib/servicechannel/server'
import type { InvestigationBundle } from '@/lib/servicechannel/records'
import { CAUSE_CLASSES, CAUSE_CLASS_LABELS, INVESTIGATION_STATUSES, INVESTIGATION_STATUS_LABELS } from '@/lib/servicechannel/types'
import { cx, fmtDate } from '@/components/servicechannel/ui'
import { Area, Chip, DeptInput, Msg, PersonSelect, STATUS_TONE, Select, Text, box, btnPrimary, btnSmall, input } from '@/components/servicechannel/fields'
import { TaskList, Timeline } from '@/components/servicechannel/Tasks'
import { linkWorkOrdersToRecordAction, unlinkWorkOrderFromRecordAction, updateInvestigationAction } from '../../recordActions'

interface Props { bundle: InvestigationBundle; people: Person[]; departments: string[]; projects: { id: string; name: string }[]; today: string }
type Result = { ok: boolean; error?: string }

export function InvestigationClient({ bundle, people, departments, projects, today }: Props) {
  const { investigation: i, links, tasks, events } = bundle
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [f, setF] = useState({
    title: i.title, description: i.description ?? '', customerName: i.customerName ?? '', equipment: i.equipment ?? '', impact: i.impact ?? '', evidence: i.evidence ?? '', suspectedCause: i.suspectedCause ?? '', verifiedCause: i.verifiedCause ?? '',
    causeClass: i.causeClass ?? '', department: i.department ?? '', correctiveAction: i.correctiveAction ?? '', preventionPlan: i.preventionPlan ?? '', ownerKey: i.ownerKey ?? '', ownerName: i.ownerName, status: i.status as string, verificationDate: i.verificationDate ?? '', outcome: i.outcome ?? '', projectId: i.projectId ?? '', note: '',
  })
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))
  const run = (fn: () => Promise<Result>, ok: string) => start(async () => { const r = await fn(); setMsg({ ok: r.ok, text: r.ok ? ok : (r.error ?? 'Something went wrong.') }); if (r.ok) router.refresh() })
  const save = () => { const { note, ...patch } = f; run(() => updateInvestigationAction({ id: i.id, patch: { ...patch, ownerKey: patch.ownerKey || null, causeClass: patch.causeClass || null, verificationDate: patch.verificationDate || null, projectId: patch.projectId || null }, note }).then((r) => { if (r.ok) setF((s) => ({ ...s, note: '' })); return r }), 'Saved.') }
  const [tn, setTn] = useState('')
  const steps: [string, boolean][] = [['Described', !!f.description.trim()], ['Evidence gathered', !!f.evidence.trim()], ['Cause suspected', !!f.suspectedCause.trim()], ['Cause verified', !!f.verifiedCause.trim()], ['Classified', !!f.causeClass], ['Corrective action', !!f.correctiveAction.trim()], ['Prevention plan', !!f.preventionPlan.trim()]]

  return (
    <div className="mx-auto max-w-none space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/app/servicechannel/rca" className="text-xs font-semibold text-indigo-700">← Root Cause Analysis</Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold text-slate-900">{i.title}<Chip tone={STATUS_TONE[i.status]}>{INVESTIGATION_STATUS_LABELS[i.status]}</Chip>{i.causeClass && <Chip>{CAUSE_CLASS_LABELS[i.causeClass]}</Chip>}</h1>
          <p className="mt-0.5 text-sm text-slate-600">{i.customerName ?? 'Customer not named'}{i.equipment ? ` · ${i.equipment}` : ''} · owner {i.ownerName ?? 'nobody'}{i.department ? ` · ${i.department}` : ''} · opened {fmtDate(i.createdAt.slice(0, 10))}{i.projectName ? <> · project <Link className="text-indigo-700" href={`/app/servicechannel/projects/${i.projectId}`}>{i.projectName}</Link></> : null}</p>
        </div>
      </div>
      <Msg m={msg} />
      <ol className="flex flex-wrap gap-1 text-[11px]">{steps.map(([s, done], k) => <li key={s} className={cx('rounded-full px-2 py-0.5 font-semibold', done ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>{k + 1}. {s}</li>)}</ol>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className={cx(box, 'lg:col-span-2')}>
          <h2 className="text-sm font-bold text-slate-900">Investigation</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Text className="sm:col-span-2" label="Title" value={f.title} onChange={set('title')} />
            <Text label="Customer" value={f.customerName} onChange={set('customerName')} />
            <Text label="Equipment" value={f.equipment} onChange={set('equipment')} />
            <Area label="What happened" value={f.description} onChange={set('description')} rows={3} />
            <Area label="Impact" value={f.impact} onChange={set('impact')} rows={3} />
            <Area className="sm:col-span-2" label="Evidence" value={f.evidence} onChange={set('evidence')} rows={3} placeholder="Technician accounts, photos, ServiceChannel history, parts records, timestamps" />
            <Area label="Suspected cause" value={f.suspectedCause} onChange={set('suspectedCause')} rows={2} />
            <Area label="Verified cause" value={f.verifiedCause} onChange={set('verifiedCause')} rows={2} hint="Required before the cause is marked verified or the investigation is closed." />
            <Select label="Cause classification" value={f.causeClass} onChange={set('causeClass')} blank="Not classified yet" options={CAUSE_CLASSES.map((c) => [c, CAUSE_CLASS_LABELS[c]])} />
            <DeptInput label="Department responsible" value={f.department} onChange={set('department')} departments={departments} />
            <Area label="Corrective action" value={f.correctiveAction} onChange={set('correctiveAction')} rows={3} hint="Required before closing. Add it as a responsibility on the right so someone owns it." />
            <Area label="Prevention plan" value={f.preventionPlan} onChange={set('preventionPlan')} rows={3} placeholder="What changes so this does not recur" />
            <PersonSelect label="Owner" value={f.ownerKey} people={people} onChange={(k, n) => setF((s) => ({ ...s, ownerKey: k, ownerName: n }))} />
            <Select label="Part of a project" value={f.projectId} onChange={set('projectId')} blank="None" options={projects.map((p) => [p.id, p.name])} />
            <Select label="Status" value={f.status} onChange={set('status')} options={INVESTIGATION_STATUSES.map((s) => [s, INVESTIGATION_STATUS_LABELS[s]])} />
            <Text label="Verification date" type="date" value={f.verificationDate} onChange={set('verificationDate')} />
            <Area className="sm:col-span-2" label="Outcome" value={f.outcome} onChange={set('outcome')} rows={2} placeholder="What was concluded and what changed" />
            <Text className="sm:col-span-2" label="Note for the history (optional)" value={f.note} onChange={set('note')} />
          </div>
          <div className="mt-3"><button className={btnPrimary} disabled={pending || !f.title.trim()} onClick={save}>{pending ? 'Saving…' : 'Save'}</button></div>
        </section>
        <div className="space-y-4">
          <section className={box}><TaskList tasks={tasks} people={people} departments={departments} today={today} link={{ type: 'investigation', id: i.id }} title="Corrective actions" defaults={{ kind: 'corrective_action', ownerKey: i.ownerKey ?? undefined, ownerName: i.ownerName ?? undefined, department: i.department ?? undefined }} /></section>
          <section className={box}>
            <h2 className="text-sm font-bold text-slate-900">Work orders involved <span className="font-normal text-slate-400">({links.length})</span></h2>
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-sm">
              {links.map((l) => <li key={l.id} className="flex items-center gap-2"><Link className="font-mono text-xs font-semibold text-indigo-700 hover:underline" href={`/app/servicechannel/work-orders/${l.workOrderId}`}>{l.trackingNumber}</Link><span className="min-w-0 flex-1 truncate text-xs text-slate-600">{l.customerName ?? ''} {l.storeLabel ?? ''} · {l.status ?? ''}{l.statusExt ? ` / ${l.statusExt}` : ''}</span><button className="text-xs text-rose-600" disabled={pending} onClick={() => run(() => unlinkWorkOrderFromRecordAction({ type: 'investigation', id: i.id, linkId: l.id }), 'Unlinked.')}>×</button></li>)}
              {!links.length && <li className="text-xs text-slate-400">None linked yet.</li>}
            </ul>
            <div className="mt-2 flex gap-2"><input className={cx(input, 'flex-1')} placeholder="Tracking numbers" value={tn} onChange={(e) => setTn(e.target.value)} /><button className={btnSmall} disabled={pending || !tn.trim()} onClick={() => run(() => linkWorkOrdersToRecordAction({ type: 'investigation', id: i.id, trackingNumbers: tn.split(/[\s,;]+/) }).then((r) => { if (r.ok) setTn(''); return r.ok && 'missing' in r && r.missing.length ? { ok: true, error: `Not found: ${r.missing.join(', ')}` } : r }), 'Linked.')}>Link</button></div>
          </section>
          <Timeline events={events} />
        </div>
      </div>
    </div>
  )
}
