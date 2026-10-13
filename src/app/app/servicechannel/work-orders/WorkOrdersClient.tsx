'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Person, SavedViewRow, TemplateView, WorkOrderView } from '@/lib/servicechannel/server'
import { INTERNAL_STATUS_LABELS, OBSERVATION_LABELS } from '@/lib/servicechannel/types'
import { URGENT_PRIORITY, VIEWS, matchesView, type ViewKey } from '@/lib/servicechannel/views'
import { InternalChip, ObservationChip, OfficialChip, cx, fmtDate, fmtWhen, scLink } from '@/components/servicechannel/ui'
import { QuickEditor } from '@/components/servicechannel/QuickEditor'
import { bulkAssignAction } from '../actions'
import { deleteViewAction, saveViewAction } from '../opsActions'

interface Props {
  wos: WorkOrderView[]; people: Person[]; templates: TemplateView[]; departments: string[]; savedViews: SavedViewRow[]; today: string; overdueTaskIds: string[]
  initial: { view: string; q: string; dept: string }
}

type ColKey = 'tracking' | 'customer' | 'problem' | 'trade' | 'priority' | 'official' | 'callDate' | 'scheduled' | 'tech' | 'internal' | 'owner' | 'actionOwner' | 'department' | 'nextAction' | 'due' | 'waiting' | 'blocker' | 'openTasks' | 'overdue' | 'lastActivity' | 'observation' | 'kalosJob'
type Preset = 'triage' | 'details' | 'management' | 'custom'
const PRESETS: Record<Exclude<Preset, 'custom'>, ColKey[]> = {
  triage: ['tracking', 'customer', 'problem', 'priority', 'internal', 'owner', 'nextAction', 'due'],
  details: ['tracking', 'customer', 'official', 'trade', 'priority', 'callDate', 'scheduled', 'tech', 'observation'],
  management: ['tracking', 'customer', 'department', 'owner', 'actionOwner', 'openTasks', 'overdue', 'blocker', 'lastActivity'],
}
const COLS: { key: ColKey; label: string }[] = [
  { key: 'tracking', label: 'Tracking #' }, { key: 'customer', label: 'Customer / store' }, { key: 'problem', label: 'Problem' }, { key: 'trade', label: 'Trade' }, { key: 'priority', label: 'Priority' },
  { key: 'official', label: 'Official status' }, { key: 'callDate', label: 'Call date' }, { key: 'scheduled', label: 'Scheduled' }, { key: 'tech', label: 'Technician' }, { key: 'internal', label: 'Internal status' },
  { key: 'owner', label: 'Owner' }, { key: 'actionOwner', label: 'Next-action owner' }, { key: 'department', label: 'Department' }, { key: 'nextAction', label: 'Next action' }, { key: 'due', label: 'Due' },
  { key: 'waiting', label: 'Waiting on' }, { key: 'blocker', label: 'Blocker' }, { key: 'openTasks', label: 'Open follow-ups' }, { key: 'overdue', label: 'Overdue' }, { key: 'lastActivity', label: 'Last internal activity' },
  { key: 'observation', label: 'Observation' }, { key: 'kalosJob', label: 'Kalos job #' },
]
type SortKey = 'callDate' | 'scheduledDate' | 'priority' | 'customer' | 'status' | 'due' | 'lastSeen' | 'lastActivity'
const VIEW_KEYS = new Set<string>([...VIEWS.map((v) => v.key), 'all', 'unassigned', 'sla'])
const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort()
const EMPTY_F = { customer: '', store: '', trade: '', status: '', statusExt: '', priority: '', tech: '', internal: '', owner: '', obs: '', dept: '', from: '', to: '' }
const LS = 'sc.workorders.layout'
const sortFor: Partial<Record<ColKey, SortKey>> = { customer: 'customer', priority: 'priority', official: 'status', callDate: 'callDate', scheduled: 'scheduledDate', due: 'due', lastActivity: 'lastActivity', observation: 'lastSeen' }

export function WorkOrdersClient({ wos, people, templates, departments, savedViews, today, overdueTaskIds, initial }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const overdue = useMemo(() => new Set(overdueTaskIds), [overdueTaskIds])
  const [view, setView] = useState<ViewKey>(VIEW_KEYS.has(initial.view) ? (initial.view as ViewKey) : 'active')
  const [q, setQ] = useState(initial.q)
  const [f, setF] = useState({ ...EMPTY_F, dept: initial.dept })
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'callDate', dir: -1 })
  const [preset, setPreset] = useState<Preset>('triage')
  const [cols, setCols] = useState<ColKey[]>(PRESETS.triage)
  const [showCols, setShowCols] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [bulk, setBulk] = useState({ ownerId: '', dept: '', nextAction: '', dueDate: '' })
  const [bulkPreview, setBulkPreview] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [viewName, setViewName] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Restore the saved layout after mount, so the server and first client render agree.
    const restore = setTimeout(() => { try { const raw = localStorage.getItem(LS); if (raw) { const v = JSON.parse(raw); if (v.preset) setPreset(v.preset); if (Array.isArray(v.cols)) setCols(v.cols) } } catch {} }, 0)
    const onKey = (e: KeyboardEvent) => { const tag = document.activeElement?.tagName; if (e.key === '/' && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') { e.preventDefault(); searchRef.current?.focus() } }
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(restore); window.removeEventListener('keydown', onKey) }
  }, [])
  const choosePreset = (p: Preset, c?: ColKey[]) => { const next = c ?? (p === 'custom' ? cols : PRESETS[p]); setPreset(p); setCols(next); try { localStorage.setItem(LS, JSON.stringify({ preset: p, cols: next })) } catch {} }
  const toggleCol = (k: ColKey) => choosePreset('custom', cols.includes(k) ? cols.filter((x) => x !== k) : [...cols, k])

  const opts = useMemo(() => ({
    customer: uniq(wos.map((w) => w.customerName)), trade: uniq(wos.map((w) => w.trade)), status: uniq(wos.map((w) => w.status)), statusExt: uniq(wos.map((w) => w.statusExt)),
    priority: uniq(wos.map((w) => w.priority)), tech: uniq(wos.flatMap((w) => w.technicians)), owner: uniq(wos.map((w) => w.case.ownerName)), dept: uniq([...departments, ...wos.map((w) => w.case.department)]),
  }), [wos, departments])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = wos.filter((w) => {
      if (!matchesView(w, view, today, overdue)) return false
      if (needle && !(w.trackingNumber.includes(needle) || (w.woNumber ?? '').toLowerCase().includes(needle) || (w.storeLabel ?? '').toLowerCase().includes(needle) || (w.problemDescription ?? '').toLowerCase().includes(needle) || (w.kalosJobNumber ?? '').toLowerCase().includes(needle) || (w.customerName ?? '').toLowerCase().includes(needle))) return false
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
      if (f.dept && (f.dept === '__none' ? !!w.case.department : w.case.department !== f.dept)) return false
      if (f.from && (!w.callDate || w.callDate < f.from)) return false
      if (f.to && (!w.callDate || w.callDate > f.to)) return false
      return true
    })
    const key = (w: WorkOrderView): string => sort.key === 'callDate' ? w.callDate ?? '' : sort.key === 'scheduledDate' ? w.scheduledDate ?? '' : sort.key === 'priority' ? w.priority ?? 'zz' : sort.key === 'customer' ? `${w.customerName ?? 'zz'} ${w.storeNumber ?? ''}` : sort.key === 'status' ? `${w.status ?? ''} ${w.statusExt ?? ''}` : sort.key === 'due' ? w.case.dueDate ?? '9999' : sort.key === 'lastActivity' ? w.case.lastUpdateAt : w.lastSeenAt
    return list.sort((a, b) => key(a).localeCompare(key(b)) * sort.dir)
  }, [wos, view, q, f, sort, today, overdue])

  const toggleSort = (k: SortKey) => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : (['callDate', 'lastSeen', 'lastActivity'].includes(k) ? -1 : 1) }))
  const allSel = rows.length > 0 && rows.every((r) => sel.has(r.id))
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { const r = await fn(); setMsg(r.ok ? ok : (r.error ?? 'Something went wrong.')); if (r.ok) router.refresh() })
  const applyBulk = () => {
    const p = people.find((x) => x.id === bulk.ownerId)
    setBulkPreview(false)
    act(() => bulkAssignAction({ workOrderIds: [...sel], ownerProfileId: p?.id ?? null, ownerName: p?.name ?? null, nextAction: bulk.nextAction, dueDate: bulk.dueDate, department: bulk.dept || null }), `Updated ${sel.size} case(s).`)
    setSel(new Set())
  }
  const applySaved = (v: SavedViewRow) => { const s = v.filters as { view?: ViewKey; q?: string; f?: typeof EMPTY_F; preset?: Preset; cols?: ColKey[] }; if (s.view) setView(s.view); setQ(s.q ?? ''); setF({ ...EMPTY_F, ...(s.f ?? {}) }); if (s.preset) choosePreset(s.preset, s.cols) }
  const editingWo = editing ? wos.find((w) => w.id === editing) : null
  const isOverdue = (w: WorkOrderView) => (!!w.case.dueDate && w.case.dueDate < today && w.case.internalStatus !== 'verified_resolved') || overdue.has(w.id)
  const isUrgent = (w: WorkOrderView) => !!w.priority && URGENT_PRIORITY.test(w.priority)
  const isPm = (w: WorkOrderView) => /MAINTENANCE/i.test(w.category ?? '')
  const input = 'rounded-md border border-slate-300 px-2 py-1.5 text-xs'

  const cell = (w: WorkOrderView, k: ColKey) => {
    const c = w.case
    switch (k) {
      case 'tracking': return <span className="whitespace-nowrap font-mono text-xs"><Link className="font-semibold text-indigo-700 hover:underline" href={`/app/servicechannel/work-orders/${w.id}`} onClick={(e) => e.stopPropagation()}>{w.trackingNumber}</Link><a className="ml-1 text-slate-400 hover:text-indigo-700" href={scLink(w.trackingNumber)} target="_blank" rel="noreferrer" title="Open in ServiceChannel" onClick={(e) => e.stopPropagation()}>↗</a>{w.statusExt === 'UNSATISFACTORY' && <span className="ml-1 rounded bg-rose-600 px-1 text-[10px] font-bold text-white">UNSAT</span>}{w.reopenCount > 0 && <span className="ml-1 text-[10px] font-bold text-rose-700" title="Reopened">R{w.reopenCount}</span>}</span>
      case 'customer': return <span className="block max-w-[220px]"><span className="block truncate text-slate-900">{w.customerName ?? <span className="text-slate-400">Customer not known</span>}</span><span className="block truncate text-xs text-slate-500" title={w.storeLabel ?? ''}>{w.storeLabel ?? '-'}</span></span>
      case 'problem': return <span className="block max-w-[300px] truncate text-xs text-slate-700" title={w.problemDescription ?? ''}>{w.problemDescription ?? <span className="text-slate-400">-</span>}</span>
      case 'trade': return <span className="whitespace-nowrap text-xs text-slate-600">{w.trade ?? '-'}</span>
      case 'priority': return <span className={cx('block max-w-[150px] truncate text-xs', isUrgent(w) ? 'font-semibold text-rose-700' : isPm(w) ? 'text-slate-400' : 'text-slate-600')} title={w.priority ?? ''}>{w.priority ?? '-'}</span>
      case 'official': return <OfficialChip status={w.status} statusExt={w.statusExt} />
      case 'callDate': return <span className="whitespace-nowrap text-xs text-slate-600">{fmtDate(w.callDate)}</span>
      case 'scheduled': return <span className={cx('whitespace-nowrap text-xs', w.scheduledDate && w.scheduledDate < today && !isPm(w) ? 'text-amber-700' : 'text-slate-600')}>{fmtDate(w.scheduledDate)}</span>
      case 'tech': return <span className="block max-w-[160px] truncate text-xs text-slate-600" title={w.technicians.join('; ')}>{w.technicians.join('; ') || <span className="text-slate-400">not in export</span>}</span>
      case 'internal': return <InternalChip status={c.internalStatus} />
      case 'owner': return <span className="whitespace-nowrap text-xs text-slate-700">{c.ownerName ?? <span className="text-slate-400">-</span>}{c.ownerProfileId && !c.handoffAcceptedAt && !c.externalAckAt && <span className="ml-1 text-[10px] text-amber-700" title="Not acknowledged">unack</span>}</span>
      case 'actionOwner': return <span className="whitespace-nowrap text-xs text-slate-700">{c.actionOwnerName ?? <span className="text-slate-400">-</span>}</span>
      case 'department': return <span className="whitespace-nowrap text-xs text-slate-700">{c.department ?? <span className="text-slate-400">-</span>}</span>
      case 'nextAction': return <span className="block max-w-[260px] truncate text-xs text-slate-700" title={c.nextAction ?? ''}>{c.nextAction ?? <span className="text-slate-400">-</span>}</span>
      case 'due': return <span className={cx('whitespace-nowrap text-xs', c.dueDate && c.dueDate < today && c.internalStatus !== 'verified_resolved' ? 'font-semibold text-rose-700' : 'text-slate-600')}>{fmtDate(c.dueDate)}</span>
      case 'waiting': return <span className="whitespace-nowrap text-xs text-slate-600">{c.waitingOn ? c.waitingOn.replace('_', ' ') : '-'}</span>
      case 'blocker': return <span className="block max-w-[200px] truncate text-xs text-slate-700" title={c.blockerReason ?? ''}>{c.blockerReason ?? '-'}</span>
      case 'openTasks': return <span className="text-xs tabular-nums text-slate-700">{w.openTasks || '-'}</span>
      case 'overdue': return isOverdue(w) ? <span className="text-xs font-semibold text-rose-700">yes</span> : <span className="text-xs text-slate-400">-</span>
      case 'lastActivity': return <span className="whitespace-nowrap text-xs text-slate-600">{c.lastUpdateAt > w.firstSeenAt ? fmtWhen(c.lastUpdateAt) : <span className="text-slate-400">none</span>}</span>
      case 'observation': return <ObservationChip state={w.observationState} />
      case 'kalosJob': return <span className="whitespace-nowrap text-xs text-slate-700">{w.kalosJobNumber ?? '-'}</span>
    }
  }

  return (
    <div className="mx-auto max-w-none space-y-3 p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Work Orders</h1>
          <p className="mt-0.5 text-sm text-slate-500">{rows.length} of {wos.length}. Click a row to update its follow-up; the tracking number opens the case.</p>
        </div>
        <input ref={searchRef} className={cx(input, 'w-80 py-2 text-sm')} placeholder="Search tracking #, WO #, store, customer, job # ( / )" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {msg && <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm text-slate-800">{msg}</div>}

      <div className="flex flex-wrap items-center gap-1">
        {[{ key: 'all' as ViewKey, label: 'All' }, { key: 'active' as ViewKey, label: 'Active' }, ...VIEWS.filter((v) => v.key !== 'active'), { key: 'unassigned' as ViewKey, label: 'Unassigned' }, { key: 'sla' as ViewKey, label: 'ETA passed' }].map((v) => (
          <button key={v.key} onClick={() => setView(v.key)} className={cx('rounded-full px-3 py-1 text-xs font-medium', view === v.key ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50')}>{v.label}</button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Layout</span>
        {(['triage', 'details', 'management'] as const).map((p) => <button key={p} onClick={() => choosePreset(p)} className={cx('rounded-md px-2.5 py-1 text-xs font-medium', preset === p ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}>{p === 'triage' ? 'Daily triage' : p === 'details' ? 'ServiceChannel details' : 'Management'}</button>)}
        <div className="relative">
          <button onClick={() => setShowCols(!showCols)} className={cx('rounded-md px-2.5 py-1 text-xs font-medium', preset === 'custom' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}>Columns…</button>
          {showCols && <div className="absolute left-0 top-8 z-30 grid w-64 grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">{COLS.map((c) => <label key={c.key} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={cols.includes(c.key)} onChange={() => toggleCol(c.key)} />{c.label}</label>)}</div>}
        </div>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Saved</span>
        {savedViews.map((v) => <span key={v.id} className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-xs text-indigo-800"><button onClick={() => applySaved(v)}>{v.name}</button><button className="text-indigo-400 hover:text-rose-600" title="Delete" onClick={() => act(() => deleteViewAction(v.id), 'View deleted.')}>×</button></span>)}
        <input className={cx(input, 'w-36')} placeholder="Save filters as… (Enter)" value={viewName} onChange={(e) => setViewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && viewName.trim()) { act(() => saveViewAction({ pageKey: 'servicechannel.work-orders', name: viewName, filters: { view, q, f, preset, cols } }), 'View saved.'); setViewName('') } }} />
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
        <select className={input} value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })}><option value="">Customer</option>{opts.customer.map((o) => <option key={o}>{o}</option>)}</select>
        <input className={cx(input, 'w-24')} placeholder="Store #" value={f.store} onChange={(e) => setF({ ...f, store: e.target.value })} />
        <select className={input} value={f.trade} onChange={(e) => setF({ ...f, trade: e.target.value })}><option value="">Trade</option>{opts.trade.map((o) => <option key={o}>{o}</option>)}</select>
        <select className={input} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Status</option>{opts.status.map((o) => <option key={o}>{o}</option>)}</select>
        <select className={input} value={f.statusExt} onChange={(e) => setF({ ...f, statusExt: e.target.value })}><option value="">Extended status</option>{opts.statusExt.map((o) => <option key={o}>{o}</option>)}</select>
        <select className={input} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="">Priority</option>{opts.priority.map((o) => <option key={o}>{o}</option>)}</select>
        <select className={input} value={f.tech} onChange={(e) => setF({ ...f, tech: e.target.value })}><option value="">Technician</option>{opts.tech.map((o) => <option key={o}>{o}</option>)}</select>
        <select className={input} value={f.internal} onChange={(e) => setF({ ...f, internal: e.target.value })}><option value="">Internal status</option>{Object.entries(INTERNAL_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className={input} value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}><option value="">Owner</option><option value="__none">No owner</option>{opts.owner.map((o) => <option key={o}>{o}</option>)}</select>
        <select className={input} value={f.dept} onChange={(e) => setF({ ...f, dept: e.target.value })}><option value="">Department</option><option value="__none">No department</option>{opts.dept.map((o) => <option key={o}>{o}</option>)}</select>
        <select className={input} value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })}><option value="">Observation</option>{Object.entries(OBSERVATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input type="date" className={input} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} title="Call date from" />
        <input type="date" className={input} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} title="Call date to" />
        <button className="text-xs text-slate-500 underline" onClick={() => { setF(EMPTY_F); setQ('') }}>Clear</button>
      </div>

      {sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-2 text-sm">
          <span className="font-semibold text-indigo-900">{sel.size} selected</span>
          <select className={input} value={bulk.ownerId} onChange={(e) => setBulk({ ...bulk, ownerId: e.target.value })}><option value="">Owner (unchanged)</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input className={cx(input, 'w-36')} list="wo-depts" placeholder="Department (unchanged)" value={bulk.dept} onChange={(e) => setBulk({ ...bulk, dept: e.target.value })} /><datalist id="wo-depts">{opts.dept.map((d) => <option key={d} value={d} />)}</datalist>
          <input className={cx(input, 'w-56')} placeholder="Next action (optional)" value={bulk.nextAction} onChange={(e) => setBulk({ ...bulk, nextAction: e.target.value })} />
          <input type="date" className={input} value={bulk.dueDate} onChange={(e) => setBulk({ ...bulk, dueDate: e.target.value })} />
          <button className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" disabled={pending || (!bulk.ownerId && !bulk.dept.trim())} onClick={() => setBulkPreview(true)}>Preview</button>
          <button className="text-xs text-slate-600 underline" onClick={() => setSel(new Set())}>Clear selection</button>
          {bulkPreview && (
            <div className="w-full rounded-lg border border-indigo-300 bg-white p-3 text-xs text-slate-800">
              <p className="font-semibold">Apply to {sel.size} case(s)?</p>
              <ul className="mt-1 list-disc pl-5">{bulk.ownerId && <li>Accountable owner → {people.find((p) => p.id === bulk.ownerId)?.name} (handoff will need acknowledging)</li>}{bulk.dept.trim() && <li>Department → {bulk.dept}</li>}{bulk.nextAction.trim() && <li>Next action → {bulk.nextAction}</li>}{bulk.dueDate && <li>Due → {fmtDate(bulk.dueDate)}</li>}<li>Official ServiceChannel status: not touched</li></ul>
              <div className="mt-2 flex gap-2"><button className="rounded-md bg-indigo-600 px-3 py-1 font-semibold text-white" disabled={pending} onClick={applyBulk}>Apply</button><button className="rounded-md border border-slate-300 px-3 py-1" onClick={() => setBulkPreview(false)}>Cancel</button></div>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2"><input type="checkbox" checked={allSel} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} aria-label="Select all" /></th>
              {cols.map((k) => { const s = sortFor[k]; const label = COLS.find((c) => c.key === k)?.label ?? k; return <th key={k} className={cx('whitespace-nowrap px-2 py-2 font-semibold', s && 'cursor-pointer select-none hover:text-slate-800')} onClick={s ? () => toggleSort(s) : undefined}>{label}{s && sort.key === s ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</th> })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((w) => (
              <tr key={w.id} tabIndex={0} onClick={() => setEditing(w.id)} onKeyDown={(e) => { if (e.key === 'Enter') setEditing(w.id) }}
                className={cx('cursor-pointer border-l-4 hover:bg-slate-50 focus:bg-indigo-50 focus:outline-none', isOverdue(w) ? 'border-l-rose-500 bg-rose-50/30' : isUrgent(w) ? 'border-l-amber-400' : isPm(w) ? 'border-l-slate-200 text-slate-600' : 'border-l-transparent')}>
                <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(w.id)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(w.id); else n.delete(w.id); setSel(n) }} aria-label={`Select ${w.trackingNumber}`} /></td>
                {cols.map((k) => <td key={k} className="px-2 py-1.5 align-top">{cell(w, k)}</td>)}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={cols.length + 1} className="px-3 py-10 text-center text-sm text-slate-500">{wos.length ? 'Nothing matches these filters.' : 'No work orders yet. Import a ServiceChannel report first.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400">Red edge: an internal follow-up is overdue. Amber edge: urgent priority in the export. Grey: scheduled maintenance. The ServiceChannel link uses the work-order URL pattern from your cleanup workbook.</p>
      {editingWo && <QuickEditor wo={editingWo} people={people} templates={templates} departments={departments} today={today} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setMsg('Saved.'); router.refresh() }} />}
    </div>
  )
}
