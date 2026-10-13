'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Person } from '@/lib/servicechannel/server'
import type { InvestigationView } from '@/lib/servicechannel/records'
import { CAUSE_CLASSES, CAUSE_CLASS_LABELS, INVESTIGATION_STATUSES, INVESTIGATION_STATUS_LABELS } from '@/lib/servicechannel/types'
import { cx, fmtDate } from '@/components/servicechannel/ui'
import { Area, Chip, DeptInput, Msg, PersonSelect, STATUS_TONE, Select, Text, box, btn, btnPrimary, input } from '@/components/servicechannel/fields'
import { createInvestigationAction } from '../recordActions'

interface Props { investigations: InvestigationView[]; projects: { id: string; name: string }[]; people: Person[]; departments: string[]; today: string; prefill: { trackingNumber: string; customerName: string; equipment: string } | null }

export function RcaClient({ investigations, projects, people, departments, today, prefill }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [show, setShow] = useState(!!prefill)
  const [filter, setFilter] = useState({ status: 'open', q: '', cause: '', dept: '' })
  const [f, setF] = useState({ title: prefill?.trackingNumber ? `Repeat visit on ${prefill.trackingNumber}` : '', description: '', customerName: prefill?.customerName ?? '', equipment: prefill?.equipment ?? '', impact: '', trackingNumbers: prefill?.trackingNumber ?? '', suspectedCause: '', department: '', ownerKey: '', ownerName: null as string | null, projectId: '' })
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))
  const create = () => start(async () => {
    const r = await createInvestigationAction({ ...f, ownerKey: f.ownerKey || null, projectId: f.projectId || null, trackingNumbers: f.trackingNumbers.split(/[\s,;]+/).filter(Boolean) })
    setMsg({ ok: r.ok, text: r.ok ? 'Investigation opened.' : (r.error ?? 'Something went wrong.') })
    if (r.ok && 'id' in r) router.push(`/app/servicechannel/rca/${r.id}`)
  })
  const open = investigations.filter((i) => i.status === 'open' || i.status === 'investigating')
  const rows = investigations.filter((i) => (filter.status === 'open' ? i.status === 'open' || i.status === 'investigating' : filter.status === 'all' ? true : i.status === filter.status)
    && (!filter.cause || i.causeClass === filter.cause) && (!filter.dept || i.department === filter.dept)
    && (!filter.q.trim() || `${i.title} ${i.customerName ?? ''} ${i.equipment ?? ''} ${i.verifiedCause ?? ''} ${i.suspectedCause ?? ''}`.toLowerCase().includes(filter.q.trim().toLowerCase())))
  const tally = (pick: (i: InvestigationView) => string | null) => { const m = new Map<string, number>(); for (const i of investigations) { const k = pick(i); if (k) m.set(k, (m.get(k) ?? 0) + 1) } return [...m].sort((a, b) => b[1] - a[1]) }
  const byCause = tally((i) => i.causeClass ? CAUSE_CLASS_LABELS[i.causeClass] : null), byDept = tally((i) => i.department), byCustomer = tally((i) => i.customerName)
  const verified = investigations.filter((i) => i.verifiedCause).length

  return (
    <div className="mx-auto max-w-none space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Root Cause Analysis</h1>
          <p className="mt-0.5 text-sm text-slate-500">Repeat repairs, reopened work, complaints, and failed verifications get an investigation: what happened, the evidence, the suspected cause, the verified cause, and the action that stops it recurring. The classification is yours after the evidence, not a guess.</p>
        </div>
        <button className={btnPrimary} onClick={() => setShow(!show)}>{show ? 'Close form' : 'Open an investigation'}</button>
      </div>
      <Msg m={msg} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([['Open', open.length, 'open'], ['Cause verified', verified, 'verified'], ['Closed', investigations.filter((i) => i.status === 'closed').length, 'closed'], ['All', investigations.length, 'all']] as [string, number, string][]).map(([l, n, s]) => (
          <button key={l} onClick={() => setFilter({ ...filter, status: s })} className={cx('rounded-xl border bg-white p-3 text-left hover:border-indigo-300', filter.status === s ? 'border-indigo-400' : 'border-slate-200')}><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{l}</p><p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{n}</p></button>
        ))}
      </div>

      {show && (
        <section className={cx(box, 'border-indigo-200')}>
          <h2 className="text-sm font-bold text-slate-900">New investigation</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Text className="lg:col-span-2" label="Title" value={f.title} onChange={set('title')} placeholder="What went wrong, in one line" />
            <Text label="Customer" value={f.customerName} onChange={set('customerName')} />
            <Text label="Equipment" value={f.equipment} onChange={set('equipment')} />
            <Area className="sm:col-span-2" label="What happened" value={f.description} onChange={set('description')} rows={3} />
            <Area className="sm:col-span-2" label="Impact" value={f.impact} onChange={set('impact')} rows={3} placeholder="Repeat visits, downtime, rating, cost" />
            <Text className="sm:col-span-2" label="Work orders involved (tracking numbers)" value={f.trackingNumbers} onChange={set('trackingNumbers')} placeholder="Separate with commas or spaces" />
            <Text className="sm:col-span-2" label="Suspected cause" value={f.suspectedCause} onChange={set('suspectedCause')} />
            <PersonSelect label="Owner" value={f.ownerKey} people={people} onChange={(k, n) => setF((s) => ({ ...s, ownerKey: k, ownerName: n }))} />
            <DeptInput value={f.department} onChange={set('department')} departments={departments} />
            <Select className="sm:col-span-2" label="Part of a project" value={f.projectId} onChange={set('projectId')} blank="None" options={projects.map((p) => [p.id, p.name])} />
          </div>
          <div className="mt-3 flex gap-2"><button className={btnPrimary} disabled={pending || !f.title.trim()} onClick={create}>Open investigation</button><button className={btn} onClick={() => setShow(false)}>Cancel</button></div>
        </section>
      )}

      <section className={box}>
        <div className="flex flex-wrap items-center gap-2">
          <input className={cx(input, 'w-64')} placeholder="Search" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
          <select className={cx(input, 'w-auto')} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}><option value="open">Open or investigating</option>{INVESTIGATION_STATUSES.map((s) => <option key={s} value={s}>{INVESTIGATION_STATUS_LABELS[s]}</option>)}<option value="all">Everything</option></select>
          <select className={cx(input, 'w-auto')} value={filter.cause} onChange={(e) => setFilter({ ...filter, cause: e.target.value })}><option value="">Any cause</option>{CAUSE_CLASSES.map((c) => <option key={c} value={c}>{CAUSE_CLASS_LABELS[c]}</option>)}</select>
          <select className={cx(input, 'w-auto')} value={filter.dept} onChange={(e) => setFilter({ ...filter, dept: e.target.value })}><option value="">Any department</option>{[...new Set([...departments, ...investigations.map((i) => i.department).filter((x): x is string => !!x)])].map((d) => <option key={d}>{d}</option>)}</select>
          <span className="text-xs text-slate-500">{rows.length} investigation(s)</span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500"><tr>{['Investigation', 'Customer / equipment', 'Cause', 'Department', 'Owner', 'Status', 'Work orders', 'Tasks', 'Updated'].map((h) => <th key={h} className="px-2 py-1 font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="px-2 py-1.5"><Link className="font-semibold text-indigo-700 hover:underline" href={`/app/servicechannel/rca/${i.id}`}>{i.title}</Link>{i.projectName && <span className="block text-xs text-slate-400">Project: {i.projectName}</span>}</td>
                  <td className="px-2 py-1.5 text-xs text-slate-700">{i.customerName ?? '-'}{i.equipment ? <span className="block text-slate-500">{i.equipment}</span> : null}</td>
                  <td className="px-2 py-1.5 text-xs">{i.causeClass ? <span className="font-medium text-slate-800">{CAUSE_CLASS_LABELS[i.causeClass]}</span> : <span className="text-slate-400">not classified</span>}{i.verifiedCause ? <span className="block text-emerald-700">verified</span> : i.suspectedCause ? <span className="block text-slate-500">suspected</span> : null}</td>
                  <td className="px-2 py-1.5 text-xs text-slate-600">{i.department ?? '-'}</td>
                  <td className="px-2 py-1.5 text-xs">{i.ownerName ?? <span className="text-rose-700">nobody</span>}</td>
                  <td className="px-2 py-1.5"><Chip tone={STATUS_TONE[i.status]}>{INVESTIGATION_STATUS_LABELS[i.status]}</Chip></td>
                  <td className="px-2 py-1.5 text-xs tabular-nums text-slate-600">{i.linkedCount}</td>
                  <td className="px-2 py-1.5 text-xs tabular-nums text-slate-600">{i.openTasks} open</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-xs text-slate-500">{fmtDate(i.lastUpdateAt.slice(0, 10))}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={9} className="px-2 py-6 text-center text-slate-500">No investigations match.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {investigations.length > 0 && (
        <section className="grid gap-3 md:grid-cols-3">
          {([['Causes', byCause], ['By department', byDept], ['By customer', byCustomer]] as [string, [string, number][]][]).map(([t, rows_]) => (
            <div key={t} className={box}><h2 className="text-sm font-bold text-slate-900">{t}</h2>{rows_.length ? <ul className="mt-2 space-y-1 text-xs">{rows_.map(([k, n]) => <li key={k} className="flex items-center gap-2"><span className="w-40 truncate text-slate-700">{k}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-indigo-500" style={{ width: `${(n / rows_[0][1]) * 100}%` }} /></div><span className="w-6 text-right font-semibold tabular-nums">{n}</span></li>)}</ul> : <p className="mt-2 text-xs text-slate-400">Nothing classified yet.</p>}</div>
          ))}
        </section>
      )}
      <p className="text-[11px] text-slate-400">Today {fmtDate(today)}. Classifications: {CAUSE_CLASSES.map((c) => CAUSE_CLASS_LABELS[c]).join(', ')}.</p>
    </div>
  )
}
