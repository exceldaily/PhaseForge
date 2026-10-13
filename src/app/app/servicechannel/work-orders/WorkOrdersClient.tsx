'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Person, WorkOrderView } from '@/lib/servicechannel/server'
import { INTERNAL_STATUS_LABELS, OBSERVATION_LABELS } from '@/lib/servicechannel/types'
import { VIEWS, matchesView, type ViewKey } from '@/lib/servicechannel/views'
import { InternalChip, ObservationChip, OfficialChip, cx, fmtDate } from '@/components/servicechannel/ui'
import { bulkAssignAction } from '../actions'

interface Props { wos: WorkOrderView[]; people: Person[]; today: string; overdueTaskIds: string[]; initialView: string; initialQuery: string }

type SortKey = 'callDate' | 'scheduledDate' | 'priority' | 'customer' | 'status' | 'due' | 'lastSeen'
const VIEW_KEYS = new Set<string>([...VIEWS.map((v) => v.key), 'all', 'unassigned', 'sla'])
const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort()

export function WorkOrdersClient({ wos, people, today, overdueTaskIds, initialView, initialQuery }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const overdue = useMemo(() => new Set(overdueTaskIds), [overdueTaskIds])
  const [view, setView] = useState<ViewKey>(VIEW_KEYS.has(initialView) ? (initialView as ViewKey) : 'active')
  const [q, setQ] = useState(initialQuery)
  const [f, setF] = useState({ customer: '', store: '', trade: '', status: '', statusExt: '', priority: '', tech: '', internal: '', owner: '', obs: '', from: '', to: '' })
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'callDate', dir: -1 })
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [assign, setAssign] = useState({ ownerId: '', nextAction: '', dueDate: '' })
  const [msg, setMsg] = useState<string | null>(null)

  const opts = useMemo(() => ({
    customer: uniq(wos.map((w) => w.customerName)), trade: uniq(wos.map((w) => w.trade)), status: uniq(wos.map((w) => w.status)), statusExt: uniq(wos.map((w) => w.statusExt)),
    priority: uniq(wos.map((w) => w.priority)), tech: uniq(wos.flatMap((w) => w.technicians)), owner: uniq(wos.map((w) => w.case.ownerName)),
  }), [wos])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = wos.filter((w) => {
      if (!matchesView(w, view, today, overdue)) return false
      if (needle && !(w.trackingNumber.includes(needle) || (w.woNumber ?? '').toLowerCase().includes(needle) || (w.storeLabel ?? '').toLowerCase().includes(needle) || (w.problemDescription ?? '').toLowerCase().includes(needle) || (w.kalosJobNumber ?? '').toLowerCase().includes(needle))) return false
      if (f.customer && w.customerName !== f.customer) return false
      if (f.store && !(w.storeNumber ?? '').toLowerCase().includes(f.store.toLowerCase()) && !(w.storeLabel ?? '').toLowerCase().includes(f.store.toLowerCase())) return false
      if (f.trade && w.trade !== f.trade) return false
      if (f.status && w.status !== f.status) return false
      if (f.statusExt && (w.statusExt ?? '') !== f.statusExt) return false
      if (f.priority && w.priority !== f.priority) return false
      if (f.tech && !w.technicians.includes(f.tech)) return false
      if (f.internal && w.case.internalStatus !== f.internal) return false
      if (f.owner && (f.owner === '__none' ? !!w.case.ownerName : w.case.ownerName !== f.owner)) return false
      if (f.obs && w.observationState !== f.obs) return false
      if (f.from && (!w.callDate || w.callDate < f.from)) return false
      if (f.to && (!w.callDate || w.callDate > f.to)) return false
      return true
    })
    const key = (w: WorkOrderView): string => sort.key === 'callDate' ? w.callDate ?? '' : sort.key === 'scheduledDate' ? w.scheduledDate ?? '' : sort.key === 'priority' ? w.priority ?? 'zz' : sort.key === 'customer' ? `${w.customerName ?? 'zz'} ${w.storeNumber ?? ''}` : sort.key === 'status' ? `${w.status ?? ''} ${w.statusExt ?? ''}` : sort.key === 'due' ? w.case.dueDate ?? '9999' : w.lastSeenAt
    return list.sort((a, b) => key(a).localeCompare(key(b)) * sort.dir)
  }, [wos, view, q, f, sort, today, overdue])

  const toggleSort = (k: SortKey) => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : (k === 'callDate' || k === 'lastSeen' ? -1 : 1) }))
  const allSel = rows.length > 0 && rows.every((r) => sel.has(r.id))
  const doAssign = () => start(async () => {
    const p = people.find((x) => x.id === assign.ownerId)
    const r = await bulkAssignAction({ workOrderIds: [...sel], ownerProfileId: p?.id ?? null, ownerName: p?.name ?? null, nextAction: assign.nextAction, dueDate: assign.dueDate })
    setMsg(r.ok ? `Assigned ${r.count} case(s)${p ? ` to ${p.name}` : ''}.` : r.error)
    if (r.ok) { setSel(new Set()); router.refresh() }
  })

  const input = 'rounded-md border border-slate-300 px-2 py-1.5 text-xs'
  const th = (label: string, k?: SortKey) => <Th key={label} k={k} sort={sort} onSort={toggleSort}>{label}</Th>

  return (
    <div className="mx-auto max-w-none space-y-3 p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Work Orders</h1>
          <p className="mt-0.5 text-sm text-slate-500">{rows.length} of {wos.length} shown. Official status is ServiceChannel\'s as last observed; the internal status is PhaseForge\'s.</p>
        </div>
        <input className={cx(input, 'w-72 py-2 text-sm')} placeholder="Search tracking #, WO #, store, job #, description" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {msg && <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm text-slate-800">{msg}</div>}

      <div className="flex flex-wrap gap-1">
        {[{ key: 'all' as ViewKey, label: 'All' }, { key: 'active' as ViewKey, label: 'Active' }, ...VIEWS.filter((v) => v.key !== 'active'), { key: 'unassigned' as ViewKey, label: 'Unassigned' }, { key: 'sla' as ViewKey, label: 'ETA passed' }].map((v) => (
          <button key={v.key} onClick={() => setView(v.key)} className={cx('rounded-full px-3 py-1 text-xs font-medium', view === v.key ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50')}>{v.label}</button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
        <select className={input} value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })}><option value="">Customer</option>{opts.customer.map((o) => <option key={o}>{o}</option>)}</select>
        <input className={cx(input, 'w-28')} placeholder="Store #" value={f.store} onChange={(e) => setF({ ...f, store: e.target.value })} />
        <select className={input} value={f.trade} onChange={(e) => setF({ ...f, trade: e.target.value })}><option value="">Trade</option>{opts.trade.map((o) => <option key={o}>{o}</option>)}</select>
        <select className={input} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Status</option>{opts.status.map((o) => <option key={o}>{o}</option>)}</select>
        <select className={input} value={f.statusExt} onChange={(e) => setF({ ...f, statusExt: e.target.value })}><option value="">Extended status</option>{opts.statusExt.map((o) => <option key={o}>{o}</option>)}</select>
        <select className={input} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="">Priority</option>{opts.priority.map((o) => <option key={o}>{o}</option>)}</select>
        <select className={input} value={f.tech} onChange={(e) => setF({ ...f, tech: e.target.value })}><option value="">Technician</option>{opts.tech.map((o) => <option key={o}>{o}</option>)}</select>
        <select className={input} value={f.internal} onChange={(e) => setF({ ...f, internal: e.target.value })}><option value="">Internal status</option>{Object.entries(INTERNAL_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className={input} value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}><option value="">Owner</option><option value="__none">No owner</option>{opts.owner.map((o) => <option key={o}>{o}</option>)}</select>
        <select className={input} value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })}><option value="">Observation</option>{Object.entries(OBSERVATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input type="date" className={input} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} title="Call date from" />
        <input type="date" className={input} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} title="Call date to" />
        <button className="text-xs text-slate-500 underline" onClick={() => { setF({ customer: '', store: '', trade: '', status: '', statusExt: '', priority: '', tech: '', internal: '', owner: '', obs: '', from: '', to: '' }); setQ('') }}>Clear</button>
      </div>

      {sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-2 text-sm">
          <span className="font-semibold text-indigo-900">{sel.size} selected</span>
          <select className={input} value={assign.ownerId} onChange={(e) => setAssign({ ...assign, ownerId: e.target.value })}><option value="">Assign owner…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input className={cx(input, 'w-64')} placeholder="Next action (optional)" value={assign.nextAction} onChange={(e) => setAssign({ ...assign, nextAction: e.target.value })} />
          <input type="date" className={input} value={assign.dueDate} onChange={(e) => setAssign({ ...assign, dueDate: e.target.value })} />
          <button className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" disabled={pending || !assign.ownerId} onClick={doAssign}>Assign</button>
          <button className="text-xs text-slate-600 underline" onClick={() => setSel(new Set())}>Clear selection</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2"><input type="checkbox" checked={allSel} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} aria-label="Select all" /></th>
              {th('Tracking #')}{th('Customer / store', 'customer')}{th('Trade')}{th('Priority', 'priority')}{th('Official status', 'status')}{th('Call date', 'callDate')}{th('Scheduled', 'scheduledDate')}{th('Technician(s)')}{th('Internal')}{th('Owner')}{th('Next action')}{th('Due', 'due')}{th('Observation', 'lastSeen')}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((w) => {
              const dueOver = w.case.dueDate && w.case.dueDate < today && w.case.internalStatus !== 'verified_resolved'
              return (
                <tr key={w.id} className="hover:bg-slate-50">
                  <td className="px-2 py-1.5"><input type="checkbox" checked={sel.has(w.id)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(w.id); else n.delete(w.id); setSel(n) }} aria-label={`Select ${w.trackingNumber}`} /></td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs"><Link className="font-semibold text-indigo-700 hover:underline" href={`/app/servicechannel/work-orders/${w.id}`}>{w.trackingNumber}</Link>{w.reopenCount > 0 && <span className="ml-1 rounded bg-rose-100 px-1 text-[10px] font-bold text-rose-700" title="Reopened">R{w.reopenCount}</span>}{w.statusExt === 'UNSATISFACTORY' && <span className="ml-1 rounded bg-rose-600 px-1 text-[10px] font-bold text-white">UNSAT</span>}</td>
                  <td className="max-w-[220px] px-2 py-1.5"><div className="truncate text-slate-900">{w.customerName ?? <span className="text-slate-400">Unknown customer</span>}</div><div className="truncate text-xs text-slate-500" title={w.storeLabel ?? ''}>{w.storeLabel ?? '-'}</div></td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-xs text-slate-600">{w.trade ?? '-'}</td>
                  <td className="max-w-[160px] truncate px-2 py-1.5 text-xs text-slate-600" title={w.priority ?? ''}>{w.priority ?? '-'}</td>
                  <td className="px-2 py-1.5"><OfficialChip status={w.status} statusExt={w.statusExt} /></td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-xs text-slate-600">{fmtDate(w.callDate)}</td>
                  <td className={cx('whitespace-nowrap px-2 py-1.5 text-xs', w.scheduledDate && w.scheduledDate < today && !/MAINTENANCE/i.test(w.category ?? '') ? 'text-amber-700' : 'text-slate-600')}>{fmtDate(w.scheduledDate)}</td>
                  <td className="max-w-[160px] truncate px-2 py-1.5 text-xs text-slate-600" title={w.technicians.join('; ')}>{w.technicians.join('; ') || '-'}</td>
                  <td className="px-2 py-1.5"><InternalChip status={w.case.internalStatus} /></td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-xs text-slate-700">{w.case.ownerName ?? <span className="text-slate-400">-</span>}{w.case.ownerProfileId && !w.case.handoffAcceptedAt && <span className="ml-1 text-[10px] text-amber-700" title="Handoff not accepted yet">unaccepted</span>}</td>
                  <td className="max-w-[220px] truncate px-2 py-1.5 text-xs text-slate-700" title={w.case.nextAction ?? ''}>{w.case.nextAction ?? '-'}{w.openTasks ? <span className="ml-1 text-slate-400">({w.openTasks} task{w.openTasks === 1 ? '' : 's'})</span> : null}</td>
                  <td className={cx('whitespace-nowrap px-2 py-1.5 text-xs', dueOver ? 'font-semibold text-rose-700' : 'text-slate-600')}>{fmtDate(w.case.dueDate)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5"><ObservationChip state={w.observationState} /></td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={14} className="px-3 py-10 text-center text-sm text-slate-500">{wos.length ? 'Nothing matches these filters.' : 'No work orders yet. Import a ServiceChannel report first.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Th({ k, sort, onSort, children }: { k?: SortKey; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void; children: React.ReactNode }) {
  return (
    <th className={cx('whitespace-nowrap px-2 py-2 font-semibold', k && 'cursor-pointer select-none hover:text-slate-800')} onClick={k ? () => onSort(k) : undefined}>
      {children}{k && sort.key === k ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
    </th>
  )
}
