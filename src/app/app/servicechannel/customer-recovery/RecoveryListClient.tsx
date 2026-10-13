'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Person } from '@/lib/servicechannel/server'
import type { RecoveryView } from '@/lib/servicechannel/records'
import { RECOVERY_OUTCOME_LABELS, RECOVERY_STATUSES, RECOVERY_STATUS_LABELS } from '@/lib/servicechannel/types'
import { cx, fmtDate } from '@/components/servicechannel/ui'
import { Area, Chip, DeptInput, Msg, PersonSelect, STATUS_TONE, Text, box, btn, btnPrimary, input } from '@/components/servicechannel/fields'
import { createRecoveryAction } from '../recordActions'

interface Prefill { workOrderId: string; trackingNumber: string; customerName: string | null; storeLabel: string | null; problem: string | null }
interface Props { recoveries: RecoveryView[]; people: Person[]; departments: string[]; today: string; openNew: boolean; prefill: Prefill | null }

export function RecoveryListClient({ recoveries, people, departments, today, openNew, prefill }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [show, setShow] = useState(openNew)
  const [status, setStatus] = useState<string>('open_all')
  const [q, setQ] = useState('')
  const [f, setF] = useState({
    workOrderId: prefill?.workOrderId ?? '', trackingNumber: prefill?.trackingNumber ?? '', customerName: prefill?.customerName ?? '', storeLabel: prefill?.storeLabel ?? '', reportingContact: '',
    complaint: '', approvedScope: prefill?.problem ? `Original request in ServiceChannel: ${prefill.problem}` : '', ownerKey: '', ownerName: null as string | null, department: '', followUpDeadline: '',
  })
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))
  const create = () => start(async () => {
    const r = await createRecoveryAction({ ...f, workOrderId: f.workOrderId || null, ownerKey: f.ownerKey || null, followUpDeadline: f.followUpDeadline || null })
    setMsg({ ok: r.ok, text: r.ok ? 'Recovery opened.' : (r.error ?? 'Something went wrong.') })
    if (r.ok && 'id' in r) router.push(`/app/servicechannel/customer-recovery/${r.id}`)
  })
  const rows = recoveries.filter((r) => (status === 'open_all' ? r.status !== 'closed' : status === 'all' ? true : r.status === status) && (!q.trim() || `${r.customerName ?? ''} ${r.storeLabel ?? ''} ${r.trackingNumber ?? ''} ${r.complaint} ${r.ownerName ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())))
  const counts = { open: recoveries.filter((r) => r.status !== 'closed').length, overdue: recoveries.filter((r) => r.status !== 'closed' && r.followUpDeadline && r.followUpDeadline < today).length, noContact: recoveries.filter((r) => r.status === 'open' && !r.contactDate).length, closed: recoveries.filter((r) => r.status === 'closed').length }
  const outcomes = new Map<string, number>()
  for (const r of recoveries) if (r.outcome) outcomes.set(r.outcome, (outcomes.get(r.outcome) ?? 0) + 1)

  return (
    <div className="mx-auto max-w-none space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Customer Recovery</h1>
          <p className="mt-0.5 text-sm text-slate-500">Every complaint or unsatisfactory report gets a record: what the customer said, what we found, what we agreed, and whether it held. The outcome is chosen by a person after the facts are checked, never by the system.</p>
        </div>
        <button className={btnPrimary} onClick={() => setShow(!show)}>{show ? 'Close form' : 'Open a recovery'}</button>
      </div>
      <Msg m={msg} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([['Open', counts.open, 'open_all', false], ['Deadline passed', counts.overdue, 'open_all', true], ['No contact yet', counts.noContact, 'open', true], ['Closed', counts.closed, 'closed', false]] as [string, number, string, boolean][]).map(([l, n, s, bad]) => (
          <button key={l} onClick={() => setStatus(s)} className={cx('rounded-xl border bg-white p-3 text-left hover:border-indigo-300', status === s ? 'border-indigo-400' : 'border-slate-200')}><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{l}</p><p className={cx('mt-1 text-2xl font-bold tabular-nums', bad && n ? 'text-rose-700' : 'text-slate-900')}>{n}</p></button>
        ))}
      </div>

      {show && (
        <section className={cx(box, 'border-indigo-200')}>
          <h2 className="text-sm font-bold text-slate-900">New recovery</h2>
          {prefill && <p className="mt-0.5 text-xs text-slate-500">From work order <span className="font-mono font-semibold">{prefill.trackingNumber}</span>. The complaint below is what the customer reports now, in their words; the approved scope is what was agreed before.</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Text label="Customer" value={f.customerName} onChange={set('customerName')} />
            <Text label="Store / site" value={f.storeLabel} onChange={set('storeLabel')} />
            <Text label="ServiceChannel tracking #" value={f.trackingNumber} onChange={set('trackingNumber')} hint={f.workOrderId ? 'Linked to the imported work order' : 'Optional; type it if known'} />
            <Text label="Reporting contact" value={f.reportingContact} onChange={set('reportingContact')} placeholder="Name and role at the customer" />
            <Area className="sm:col-span-2" label="Complaint, in the customer's words" value={f.complaint} onChange={set('complaint')} rows={3} />
            <Area className="sm:col-span-2" label="Approved scope (what was agreed before)" value={f.approvedScope} onChange={set('approvedScope')} rows={3} />
            <PersonSelect label="Owner" value={f.ownerKey} people={people} onChange={(k, n) => setF((s) => ({ ...s, ownerKey: k, ownerName: n }))} />
            <DeptInput value={f.department} onChange={set('department')} departments={departments} />
            <Text label="Follow-up deadline" type="date" value={f.followUpDeadline} onChange={set('followUpDeadline')} />
          </div>
          <div className="mt-3 flex gap-2"><button className={btnPrimary} disabled={pending || !f.complaint.trim()} onClick={create}>Open recovery</button><button className={btn} onClick={() => setShow(false)}>Cancel</button></div>
        </section>
      )}

      <section className={box}>
        <div className="flex flex-wrap items-center gap-2">
          <input className={cx(input, 'w-64')} placeholder="Search customer, store, tracking #, text" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className={cx(input, 'w-auto')} value={status} onChange={(e) => setStatus(e.target.value)}><option value="open_all">Open (any stage)</option>{RECOVERY_STATUSES.map((s) => <option key={s} value={s}>{RECOVERY_STATUS_LABELS[s]}</option>)}<option value="all">Everything</option></select>
          <span className="text-xs text-slate-500">{rows.length} record(s)</span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500"><tr>{['Customer', 'Tracking #', 'Complaint', 'Owner', 'Status', 'Contact', 'Deadline', 'Outcome', 'Tasks'].map((h) => <th key={h} className="px-2 py-1 font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const late = r.status !== 'closed' && r.followUpDeadline && r.followUpDeadline < today
                return (
                  <tr key={r.id} className={cx('hover:bg-slate-50', late && 'bg-rose-50/40')}>
                    <td className="whitespace-nowrap px-2 py-1.5"><Link className="font-semibold text-indigo-700 hover:underline" href={`/app/servicechannel/customer-recovery/${r.id}`}>{r.customerName ?? 'Customer not named'}</Link><span className="block text-xs text-slate-500">{r.storeLabel ?? ''}</span></td>
                    <td className="px-2 py-1.5 font-mono text-xs">{r.workOrderId ? <Link className="text-indigo-700 hover:underline" href={`/app/servicechannel/work-orders/${r.workOrderId}`}>{r.trackingNumber}</Link> : (r.trackingNumber ?? '-')}</td>
                    <td className="max-w-[320px] truncate px-2 py-1.5 text-slate-700" title={r.complaint}>{r.complaint}</td>
                    <td className="px-2 py-1.5 text-xs">{r.ownerName ?? <span className="text-rose-700">nobody</span>}{r.department ? <span className="block text-slate-400">{r.department}</span> : null}</td>
                    <td className="px-2 py-1.5"><Chip tone={STATUS_TONE[r.status]}>{RECOVERY_STATUS_LABELS[r.status]}</Chip></td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-xs text-slate-600">{r.contactDate ? fmtDate(r.contactDate) : <span className="text-amber-700">none</span>}</td>
                    <td className={cx('whitespace-nowrap px-2 py-1.5 text-xs', late ? 'font-semibold text-rose-700' : 'text-slate-600')}>{r.followUpDeadline ? fmtDate(r.followUpDeadline) : '-'}</td>
                    <td className="px-2 py-1.5 text-xs text-slate-600">{r.outcome ? RECOVERY_OUTCOME_LABELS[r.outcome] : '-'}</td>
                    <td className="px-2 py-1.5 text-xs tabular-nums text-slate-600">{r.openTasks} open</td>
                  </tr>
                )
              })}
              {!rows.length && <tr><td colSpan={9} className="px-2 py-6 text-center text-slate-500">No recovery records match.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {outcomes.size > 0 && <section className={box}><h2 className="text-sm font-bold text-slate-900">Outcomes so far</h2><ul className="mt-2 flex flex-wrap gap-2 text-xs">{[...outcomes].map(([o, n]) => <li key={o} className="rounded-md bg-slate-50 px-2 py-1 text-slate-700">{RECOVERY_OUTCOME_LABELS[o as keyof typeof RECOVERY_OUTCOME_LABELS]} <strong>{n}</strong></li>)}</ul></section>}
    </div>
  )
}
