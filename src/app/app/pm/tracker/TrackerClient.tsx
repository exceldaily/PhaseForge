'use client'

// The Quarterly Tracker. Matrix: every store down the side, Q1 to Q4 across,
// each cell the state of that PM. List: one quarter as a table, where job
// numbers get typed in as they arrive and PMs are assigned in bulk.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Download, FileUp, LayoutGrid, List, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { exportRows } from '@/lib/pm/exporter'
import { BUCKET_LABEL, PROGRESS_BUCKETS, blockersOf, bucketOf, cyclePct, isOverdue, matchesStatus, type ProgressBucket, type StatusFilter } from '@/lib/pm/progress'
import { fmtDate, quarterMonths } from '@/lib/pm/quarters'
import { BLOCKER_LABEL, PM_STATUSES, PRIORITIES, STATUS_LABEL, STATUS_TONE, type PmCycle, type PmStore, type PmTech } from '@/lib/pm/types'
import { BlockerChips, Empty, ErrorNote, OverdueChip, PmPage, ProgressBar, StatusChip, fieldCls } from '@/components/pm/ui'
import { bulkUpdateCycles, createCycle, generateQuarter, updateCycle } from '../actions'

export function TrackerClient({ stores, techs, cycles, year, initialQuarter, initialView, thisYear, today, canEdit, quartersWithChecklist }: {
  stores: PmStore[]; techs: PmTech[]; cycles: PmCycle[]; year: number; initialQuarter: number; initialView: 'matrix' | 'list'
  thisYear: number; today: string; canEdit: boolean; quartersWithChecklist: number[]
}) {
  const router = useRouter()
  const [view, setView] = useState(initialView)
  const [quarter, setQuarter] = useState(initialQuarter)
  const [q, setQ] = useState('')
  const [tech, setTech] = useState('')
  const [city, setCity] = useState('')
  const [region, setRegion] = useState('')
  const [status, setStatus] = useState<StatusFilter>('')
  const [bucket, setBucket] = useState<ProgressBucket | ''>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const techName = useMemo(() => new Map(techs.map((t) => [t.id, t.name])), [techs])
  const at = useMemo(() => new Map(cycles.map((c) => [`${c.storeId}:${c.quarter}`, c])), [cycles])
  const cities = useMemo(() => [...new Set(stores.map((s) => s.city).filter(Boolean) as string[])].sort(), [stores])
  const regions = useMemo(() => [...new Set(stores.map((s) => s.region).filter(Boolean) as string[])].sort(), [stores])
  const hasCycles = useMemo(() => new Set(cycles.map((c) => c.storeId)), [cycles])

  const go = (y: number) => router.push(`/app/pm/tracker?year=${y}&view=${view}`)
  const passesCycle = (c: PmCycle) => matchesStatus(c, status, today) && (!bucket || (!!c.templateVersionId && bucketOf(cyclePct(c)) === bucket) || (bucket === '0' && !c.templateVersionId))

  // Stores on the tracker: active ones, plus inactive ones that have a PM this year.
  const visibleStores = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return stores.filter((s) => {
      if (!s.isActive && !hasCycles.has(s.id)) return false
      if (city && s.city !== city) return false
      if (region && s.region !== region) return false
      if (needle && ![s.storeNumber, s.address, s.city].some((v) => v?.toLowerCase().includes(needle))
        && !cycles.some((c) => c.storeId === s.id && (c.jobNumber?.toLowerCase().includes(needle) || c.scWorkOrder?.toLowerCase().includes(needle)))) return false
      if (tech) {
        const mine = [1, 2, 3, 4].map((n) => at.get(`${s.id}:${n}`)).filter(Boolean) as PmCycle[]
        if (!(tech === 'none' ? (mine.some((c) => !c.techId) || (!mine.length && !s.primaryTechId)) : (mine.some((c) => c.techId === tech || c.helperTechId === tech) || s.primaryTechId === tech))) return false
      }
      return true
    })
  }, [stores, hasCycles, q, city, region, tech, cycles, at])

  const techOk = (c: PmCycle | null, st: PmStore) => !tech
    || (tech === 'none' ? (c ? !c.techId : !st.primaryTechId) : (c ? c.techId === tech || c.helperTechId === tech : st.primaryTechId === tech))
  const listRows = visibleStores
    .map((st) => ({ store: st, cycle: at.get(`${st.id}:${quarter}`) ?? null }))
    .filter((r) => techOk(r.cycle, r.store) && (r.cycle ? passesCycle(r.cycle) : !status && !bucket))
  const matrixStores = status || bucket
    ? visibleStores.filter((st) => [1, 2, 3, 4].some((n) => { const c = at.get(`${st.id}:${n}`); return !!c && passesCycle(c) }))
    : visibleStores

  const missing = (n: number) => stores.filter((s) => s.isActive && !at.has(`${s.id}:${n}`)).length

  const run = async <T extends { ok: boolean; error?: string }>(fn: () => Promise<T>): Promise<T> => {
    setBusy(true); setError(null); setNote(null)
    const res = await fn()
    setBusy(false)
    if (!res.ok) setError(res.error ?? 'That did not save.')
    router.refresh()
    return res
  }
  const openQuarter = async (n: number) => {
    const res = await run(() => generateQuarter({ year, quarter: n }))
    if (res.ok && 'created' in res) setNote(`Q${n} ${year}: ${res.created} PM ${res.created === 1 ? 'record' : 'records'} opened as Awaiting Job Number${res.skipped ? `, ${res.skipped} already existed` : ''}. ${res.noChecklist ? `No Q${n} checklist is published yet, so they have none attached.` : `${res.checklists} blank ${res.checklists === 1 ? 'checklist' : 'checklists'} attached.`}`)
  }
  const addOne = async (storeId: string, n: number) => {
    const res = await run(() => createCycle({ storeId, year, quarter: n }))
    if (res.ok && 'id' in res) router.push(`/app/pm/jobs/${res.id}`)
  }

  /* ── Job number entry, right in the list ── */
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const saveJob = async (c: PmCycle) => {
    const value = (drafts[c.id] ?? '').trim()
    if (!value || value === (c.jobNumber ?? '')) return
    const res = await run(() => updateCycle({ id: c.id, patch: { jobNumber: value } }))
    if (res.ok) setDrafts((d) => { const next = { ...d }; delete next[c.id]; return next })
  }

  /* ── Bulk ── */
  const [bulkTech, setBulkTech] = useState('')
  const [bulkDate, setBulkDate] = useState('')
  const [bulkDue, setBulkDue] = useState('')
  const [bulkPriority, setBulkPriority] = useState('')
  const selectable = listRows.filter((r) => r.cycle && r.cycle.status !== 'completed' && r.cycle.status !== 'cancelled').map((r) => r.cycle!.id)
  const applyBulk = async () => {
    const patch: Parameters<typeof bulkUpdateCycles>[0]['patch'] = {}
    if (bulkTech) patch.techId = bulkTech === 'none' ? null : bulkTech
    if (bulkDate) patch.scheduledDate = bulkDate
    if (bulkDue) patch.dueDate = bulkDue
    if (bulkPriority) patch.priority = bulkPriority
    const res = await run(() => bulkUpdateCycles({ ids: [...selected], patch }))
    if (res.ok && 'changed' in res) {
      setNote(`${res.changed} ${res.changed === 1 ? 'PM' : 'PMs'} updated${res.skipped ? `, ${res.skipped} skipped because they are closed` : ''}.`)
      setSelected(new Set()); setBulkTech(''); setBulkDate(''); setBulkDue(''); setBulkPriority('')
    }
  }

  const doExport = (format: 'csv' | 'xlsx') => exportRows(`pm-tracker-${year}-q${quarter}`, listRows.map(({ store, cycle: c }) => ({
    'Store #': store.storeNumber, Address: store.address, City: store.city, Quarter: `Q${quarter} ${year}`,
    'Job Number': c?.jobNumber ?? '', 'SC Work Order': c?.scWorkOrder ?? '', Status: c ? STATUS_LABEL[c.status] : 'No PM record',
    Blockers: c ? blockersOf(c).map((b) => BLOCKER_LABEL[b]).join(', ') : '', Technician: c ? techName.get(c.techId ?? '') ?? '' : techName.get(store.primaryTechId ?? '') ?? '',
    Priority: c?.priority ?? '', 'Date Received': c?.jobReceivedDate ?? '', 'Due Date': c?.dueDate ?? '', Scheduled: c?.scheduledDate ?? '',
    'Actual Start': c?.actualStart ?? '', Completed: c?.actualEnd ?? '', 'Checklist %': c?.templateVersionId ? cyclePct(c) : '',
    'Open Deficiencies': c?.openDeficiencies ?? '', Overdue: c && isOverdue(c, today) ? 'Yes' : '',
  })), format)

  const filtersOn = !!(q || tech || city || region || status || bucket)

  return (
    <PmPage title="Quarterly Tracker" subtitle="Every store, every quarter. A PM exists as soon as its quarter is opened, whether or not its job number has arrived."
      actions={<>
        <div className="flex items-center rounded-lg border border-slate-200 bg-white">
          <button type="button" onClick={() => go(year - 1)} aria-label="Previous year" className="p-1.5 text-slate-500 hover:text-indigo-600"><ChevronLeft size={16} /></button>
          <span className="px-1 text-sm font-bold tabular-nums text-slate-800">{year}</span>
          <button type="button" onClick={() => go(year + 1)} aria-label="Next year" className="p-1.5 text-slate-500 hover:text-indigo-600"><ChevronRight size={16} /></button>
        </div>
        {year !== thisYear && <button type="button" onClick={() => go(thisYear)} className="text-xs font-medium text-indigo-600 hover:underline">This year</button>}
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium" data-help="pm-tracker-view">
          <button type="button" onClick={() => setView('matrix')} className={cn('inline-flex items-center gap-1 rounded-md px-2.5 py-1', view === 'matrix' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100')}><LayoutGrid size={12} /> Matrix</button>
          <button type="button" onClick={() => setView('list')} className={cn('inline-flex items-center gap-1 rounded-md px-2.5 py-1', view === 'list' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100')}><List size={12} /> List</button>
        </div>
        {canEdit && <Link href="/app/pm/import?kind=job_numbers" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><FileUp size={14} /> Import job numbers</Link>}
      </>}>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Store, address, job number, work order" className={cn(fieldCls, 'pl-8')} />
        </div>
        <select value={tech} onChange={(e) => setTech(e.target.value)} className={cn(fieldCls, 'w-auto')} aria-label="Technician">
          <option value="">Any technician</option>{techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="none">Unassigned</option>
        </select>
        {cities.length > 1 && <select value={city} onChange={(e) => setCity(e.target.value)} className={cn(fieldCls, 'w-auto')} aria-label="City"><option value="">Any city</option>{cities.map((c) => <option key={c}>{c}</option>)}</select>}
        {regions.length > 1 && <select value={region} onChange={(e) => setRegion(e.target.value)} className={cn(fieldCls, 'w-auto')} aria-label="Region"><option value="">Any region</option>{regions.map((c) => <option key={c}>{c}</option>)}</select>}
        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className={cn(fieldCls, 'w-auto')} aria-label="Status" data-help="pm-status-filter">
          <option value="">Any status</option>
          <optgroup label="Lifecycle">{PM_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</optgroup>
          <optgroup label="Blockers and flags">
            <option value="waiting_filters">Waiting on Filters</option><option value="waiting_parts">Waiting on Parts</option>
            <option value="return_visit">Return Visit Needed</option><option value="overdue">Overdue</option><option value="no_job">No job number yet</option>
          </optgroup>
        </select>
        <select value={bucket} onChange={(e) => setBucket(e.target.value as ProgressBucket | '')} className={cn(fieldCls, 'w-auto')} aria-label="Checklist completion">
          <option value="">Any completion</option>{PROGRESS_BUCKETS.map((b) => <option key={b} value={b}>{BUCKET_LABEL[b]}</option>)}
        </select>
        {filtersOn && <button type="button" onClick={() => { setQ(''); setTech(''); setCity(''); setRegion(''); setStatus(''); setBucket('') }} className="text-xs font-medium text-indigo-600 hover:underline">Clear</button>}
      </div>
      <ErrorNote>{error}</ErrorNote>
      {note && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">{note}</p>}

      {stores.length === 0 ? (
        <Empty title="No stores yet">Add stores in the <Link href="/app/pm/stores" className="font-medium text-indigo-600 underline">Store Directory</Link> first. The tracker fills in from there.</Empty>
      ) : view === 'matrix' ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white" data-help="pm-matrix">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="sticky left-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Store</th>
                {[1, 2, 3, 4].map((n) => (
                  <th key={n} className="border-b border-l border-slate-200 px-2 py-2">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => { setQuarter(n); setView('list') }} className="text-sm font-bold text-slate-800 hover:text-indigo-600" title={`Open Q${n} as a list`}>Q{n}</button>
                      <span className="text-[10px] font-normal text-slate-400">{quarterMonths(n)}</span>
                      {canEdit && missing(n) > 0 && (
                        <button type="button" disabled={busy} onClick={() => openQuarter(n)} title={`Open a Q${n} PM for the ${missing(n)} active stores that do not have one`}
                          className="ml-auto whitespace-nowrap rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 hover:border-indigo-400">Open Q{n} ({missing(n)})</button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrixStores.map((s) => (
                <tr key={s.id} className={cn(!s.isActive && 'opacity-60')}>
                  <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-1.5 align-top">
                    <Link href={`/app/pm/stores/${s.id}`} className="font-bold text-slate-900 hover:text-indigo-600">{s.storeNumber}</Link>
                    <span className="block max-w-[180px] truncate text-[11px] text-slate-500">{s.city}{techName.get(s.primaryTechId ?? '') ? ` · ${techName.get(s.primaryTechId ?? '')}` : ''}</span>
                  </td>
                  {[1, 2, 3, 4].map((n) => {
                    const c = at.get(`${s.id}:${n}`)
                    const dim = !!c && (!!status || !!bucket) && !passesCycle(c)
                    return (
                      <td key={n} className="border-b border-l border-slate-100 p-1 align-top">
                        {c ? (
                          <Link href={`/app/pm/jobs/${c.id}`} className={cn('block rounded-lg border border-slate-200 p-1.5 transition-colors hover:border-indigo-400', dim && 'opacity-30')}
                            style={{ borderLeft: `4px solid ${STATUS_TONE[c.status].hex}` }}>
                            <span className="flex flex-wrap items-center gap-1"><StatusChip status={c.status} short /><BlockerChips cycle={c} compact />{isOverdue(c, today) && <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">Overdue</span>}</span>
                            <span className="mt-1 flex items-baseline gap-2">
                              <span className={cn('truncate text-xs', c.jobNumber ? 'font-bold text-slate-900' : 'italic text-slate-400')}>{c.jobNumber ?? 'No job number yet'}</span>
                              {c.templateVersionId && <span className="ml-auto text-[11px] font-semibold tabular-nums text-slate-600">{cyclePct(c)}%</span>}
                            </span>
                            {c.templateVersionId && <span className="mt-1 block"><ProgressBar value={cyclePct(c)} small showValue={false} /></span>}
                          </Link>
                        ) : canEdit && s.isActive ? (
                          <button type="button" disabled={busy} onClick={() => addOne(s.id, n)} title={`Open a Q${n} ${year} PM for ${s.storeNumber}`}
                            className="flex h-full min-h-[52px] w-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-slate-300 hover:border-indigo-300 hover:text-indigo-500"><Plus size={14} /></button>
                        ) : <span className="block px-2 py-3 text-center text-[11px] text-slate-300">No record</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {matrixStores.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">No stores match these filters.</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
            {PM_STATUSES.map((s) => <span key={s} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_TONE[s].hex }} />{STATUS_LABEL[s]}</span>)}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm font-semibold">
              {[1, 2, 3, 4].map((n) => <button key={n} type="button" onClick={() => { setQuarter(n); setSelected(new Set()) }} className={cn('rounded-md px-3 py-1', quarter === n ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>Q{n}</button>)}
            </div>
            <span className="text-xs text-slate-500">{quarterMonths(quarter)} {year} · {listRows.filter((r) => r.cycle).length} PMs{listRows.some((r) => !r.cycle) ? `, ${listRows.filter((r) => !r.cycle).length} stores with no record` : ''}</span>
            {!quartersWithChecklist.includes(quarter) && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">No Q{quarter} checklist published yet</span>}
            <span className="ml-auto flex items-center gap-2">
              {canEdit && missing(quarter) > 0 && <Button size="sm" variant="outline" disabled={busy} onClick={() => openQuarter(quarter)}>Open Q{quarter} for {missing(quarter)} stores</Button>}
              <Button size="sm" variant="outline" onClick={() => doExport('xlsx')}><Download size={14} /> Excel</Button>
              <Button size="sm" variant="outline" onClick={() => doExport('csv')}><Download size={14} /> CSV</Button>
            </span>
          </div>

          {canEdit && selected.size > 0 && (
            <div className="sticky top-10 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs" data-help="pm-bulk">
              <span className="font-semibold text-indigo-900">{selected.size} selected</span>
              <select value={bulkTech} onChange={(e) => setBulkTech(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1"><option value="">Assign technician</option>{techs.filter((t) => t.isActive).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="none">Unassign</option></select>
              <label className="inline-flex items-center gap-1 text-slate-600">Visit <input type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1" /></label>
              <label className="inline-flex items-center gap-1 text-slate-600">Due <input type="date" value={bulkDue} onChange={(e) => setBulkDue(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1" /></label>
              <select value={bulkPriority} onChange={(e) => setBulkPriority(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1"><option value="">Priority</option>{PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.key}</option>)}</select>
              <Button size="sm" onClick={applyBulk} loading={busy} disabled={!bulkTech && !bulkDate && !bulkDue && !bulkPriority}>Apply</Button>
              <button type="button" onClick={() => setSelected(new Set())} className="font-medium text-slate-500 hover:underline">Clear</button>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {canEdit && <th className="w-8 px-3 py-2"><input type="checkbox" aria-label="Select all" checked={selectable.length > 0 && selectable.every((id) => selected.has(id))} onChange={(e) => setSelected(e.target.checked ? new Set(selectable) : new Set())} /></th>}
                  <th className="px-3 py-2">Store</th><th className="px-3 py-2">Job number</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Technician</th>
                  <th className="px-3 py-2">Scheduled</th><th className="px-3 py-2">Due</th><th className="px-3 py-2">Checklist</th><th className="px-3 py-2">Open issues</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {listRows.map(({ store: s, cycle: c }) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    {canEdit && <td className="px-3 py-2">{c && selectable.includes(c.id) && <input type="checkbox" aria-label={`Select ${s.storeNumber}`} checked={selected.has(c.id)} onChange={(e) => setSelected((cur) => { const next = new Set(cur); if (e.target.checked) next.add(c.id); else next.delete(c.id); return next })} />}</td>}
                    <td className="px-3 py-2">
                      {c ? <Link href={`/app/pm/jobs/${c.id}`} className="font-bold text-indigo-700 hover:underline">{s.storeNumber}</Link> : <Link href={`/app/pm/stores/${s.id}`} className="font-bold text-slate-700 hover:underline">{s.storeNumber}</Link>}
                      <span className="block max-w-[220px] truncate text-[11px] text-slate-500">{[s.address, s.city].filter(Boolean).join(', ')}</span>
                    </td>
                    <td className="px-3 py-2">
                      {!c ? (canEdit ? <button type="button" onClick={() => addOne(s.id, quarter)} className="text-xs font-medium text-indigo-600 hover:underline">Open a PM</button> : <span className="text-xs text-slate-300">No record</span>)
                        : c.jobNumber ? <span className="font-semibold text-slate-900">{c.jobNumber}</span>
                        : canEdit ? (
                          <input value={drafts[c.id] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') void saveJob(c) }} onBlur={() => void saveJob(c)}
                            placeholder="Enter job number" aria-label={`Job number for ${s.storeNumber}`} data-help="pm-job-entry"
                            className="w-32 rounded-lg border border-dashed border-slate-300 px-2 py-1 text-sm outline-none placeholder:italic focus:border-solid focus:border-indigo-400" />
                        ) : <span className="italic text-slate-400">Not received yet</span>}
                      {c?.scWorkOrder && <span className="block text-[11px] text-slate-400">WO {c.scWorkOrder}</span>}
                    </td>
                    <td className="px-3 py-2">{c ? <span className="flex flex-wrap items-center gap-1"><StatusChip status={c.status} /><BlockerChips cycle={c} compact /><OverdueChip cycle={c} today={today} /></span> : null}</td>
                    <td className="whitespace-nowrap px-3 py-2">{c ? techName.get(c.techId ?? '') ?? <span className="text-slate-300">Unassigned</span> : <span className="text-slate-400">{techName.get(s.primaryTechId ?? '') ?? ''}</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2">{fmtDate(c?.scheduledDate, today)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{c?.dueDate ? <span className={cn(isOverdue(c, today) && 'font-semibold text-rose-700')}>{fmtDate(c.dueDate, today)}{c.priority ? ` · ${c.priority}` : ''}</span> : c?.priority ?? ''}</td>
                    <td className="px-3 py-2">{c?.templateVersionId ? <div className="w-28"><ProgressBar value={cyclePct(c)} small /></div> : c ? <span className="text-xs text-slate-300">Not started</span> : null}</td>
                    <td className="px-3 py-2 tabular-nums">{c?.openDeficiencies ? <span className="font-semibold text-rose-700">{c.openDeficiencies}</span> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {listRows.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">Nothing matches these filters.</p>}
          </div>
        </>
      )}
    </PmPage>
  )
}
