'use client'

// The coordinator's view of the whole PM program for one quarter: where every
// store stands, what is late, what is blocked, and what has not arrived yet.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, ClipboardCheck, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  BUCKET_LABEL, PROGRESS_BUCKETS, averagePct, bucketOf, cyclePct, isOverdue, matchesStatus, type ProgressBucket, type StatusFilter,
} from '@/lib/pm/progress'
import { daysBetween, fmtDate, quarterMonths } from '@/lib/pm/quarters'
import {
  MATERIAL_STATUS_LABEL, PM_STATUSES, PRIORITIES, STATUS_LABEL, STATUS_TONE,
  type PmCycle, type PmMaterial, type PmRole, type PmStatus, type PmStore, type PmTech,
} from '@/lib/pm/types'
import { BlockerChips, Card, Empty, OverdueChip, PmPage, ProgressBar, Stat, StatusChip, fieldCls } from '@/components/pm/ui'

type Focus = '' | 'received' | 'not_received' | 'awaiting_scheduling' | 'in_progress' | 'field_complete' | 'completed' | 'overdue' | 'waiting' | 'deficiencies'

const AFTER_FIELD: PmStatus[] = ['field_complete', 'pending_documentation', 'submitted']

export function DashboardClient({ stores, techs, cycles, materials, openDeficienciesByStore, year, quarter, years, today, role, myTechIds }: {
  stores: PmStore[]; techs: PmTech[]; cycles: PmCycle[]; materials: PmMaterial[]; openDeficienciesByStore: Record<string, number>
  year: number; quarter: number; years: number[]; today: string; role: PmRole; myTechIds: string[]
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [tech, setTech] = useState('')
  const [city, setCity] = useState('')
  const [region, setRegion] = useState('')
  const [status, setStatus] = useState<StatusFilter>('')
  const [priority, setPriority] = useState('')
  const [bucket, setBucket] = useState<ProgressBucket | ''>('')
  const [focus, setFocus] = useState<Focus>('')

  const techName = useMemo(() => new Map(techs.map((t) => [t.id, t.name])), [techs])
  const cities = useMemo(() => [...new Set(stores.map((s) => s.city).filter(Boolean) as string[])].sort(), [stores])
  const regions = useMemo(() => [...new Set(stores.map((s) => s.region).filter(Boolean) as string[])].sort(), [stores])
  const quarterCycles = useMemo(() => cycles.filter((c) => c.quarter === quarter), [cycles, quarter])
  const cycleByStore = useMemo(() => new Map(quarterCycles.map((c) => [c.storeId, c])), [quarterCycles])
  const allAt = useMemo(() => new Map(cycles.map((c) => [`${c.storeId}:${c.quarter}`, c])), [cycles])

  // Filters that pick stores. Everything on the page is counted over these.
  const scope = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return stores.filter((s) => {
      const c = cycleByStore.get(s.id)
      if (!s.isActive && !c) return false
      if (city && s.city !== city) return false
      if (region && s.region !== region) return false
      if (needle && ![s.storeNumber, s.address, s.city, c?.jobNumber].some((v) => v?.toLowerCase().includes(needle))) return false
      if (tech) {
        const id = c ? c.techId : s.primaryTechId
        if (tech === 'none' ? !!id : id !== tech && c?.helperTechId !== tech) return false
      }
      if (priority && c?.priority !== priority) return false
      return true
    })
  }, [stores, cycleByStore, q, city, region, tech, priority])

  const scoped = useMemo(() => scope.map((s) => ({ store: s, cycle: cycleByStore.get(s.id) ?? null })), [scope, cycleByStore])
  const live = scoped.filter((r) => r.cycle && r.cycle.status !== 'cancelled') as { store: PmStore; cycle: PmCycle }[]
  const activeStores = scope.filter((s) => s.isActive)
  const scopeIds = new Set(scope.map((s) => s.id))

  const is: Record<Exclude<Focus, ''>, (c: PmCycle | null) => boolean> = {
    received: (c) => !!c?.jobNumber && c.status !== 'cancelled',
    not_received: (c) => !c || (!c.jobNumber && c.status !== 'cancelled'),
    awaiting_scheduling: (c) => !!c && !!c.jobNumber && !c.scheduledDate && ['job_received', 'not_scheduled'].includes(c.status),
    in_progress: (c) => c?.status === 'in_progress',
    field_complete: (c) => !!c && AFTER_FIELD.includes(c.status),
    completed: (c) => c?.status === 'completed',
    overdue: (c) => !!c && isOverdue(c, today),
    waiting: (c) => !!c && c.status !== 'cancelled' && c.status !== 'completed' && (c.waitingFilters || c.waitingParts),
    deficiencies: (c) => !!c && c.openDeficiencies > 0,
  }
  const count = (f: Exclude<Focus, ''>) => scoped.filter((r) => (f === 'not_received' ? r.store.isActive : true) && is[f](r.cycle)).length
  const openDeficiencies = scope.reduce((n, s) => n + (openDeficienciesByStore[s.id] ?? 0), 0)
  const average = averagePct(live.map((r) => r.cycle))

  const rows = scoped.filter((r) => {
    if (focus && !(focus === 'deficiencies' ? (openDeficienciesByStore[r.store.id] ?? 0) > 0 : is[focus](r.cycle))) return false
    if (status && !(r.cycle && matchesStatus(r.cycle, status, today))) return false
    if (bucket && !(r.cycle && (r.cycle.templateVersionId ? bucketOf(cyclePct(r.cycle)) === bucket : bucket === '0'))) return false
    return true
  }).sort((a, b) => urgency(b.cycle, today) - urgency(a.cycle, today) || a.store.storeNumber.localeCompare(b.store.storeNumber))

  const byStatus = PM_STATUSES.map((s) => ({ status: s, n: live.filter((r) => r.cycle.status === s).length })).filter((x) => x.n > 0)
  const buckets = PROGRESS_BUCKETS.map((b) => ({ b, n: live.filter((r) => (r.cycle.templateVersionId ? bucketOf(cyclePct(r.cycle)) === b : b === '0')).length }))
  const lateMaterials = materials.filter((m) => scopeIds.has(m.storeId) && ((m.etaDate && m.etaDate < today && !['received', 'partially_received'].includes(m.status)) || (['needed', 'approved'].includes(m.status) && daysBetween(m.requestedDate, today) > 3) || m.status === 'backordered'))
  const awaitingInstall = materials.filter((m) => scopeIds.has(m.storeId) && m.status === 'received')
  const mine = myTechIds.length ? cycles.filter((c) => myTechIds.includes(c.techId ?? '') && c.status !== 'completed' && c.status !== 'cancelled').length : 0

  const go = (y: number, n: number) => router.push(`/app/pm?year=${y}&q=${n}`)
  const kpi = (f: Exclude<Focus, ''>, label: string, tone: Parameters<typeof Stat>[0]['tone'], hint?: string, value?: number) => (
    <button type="button" onClick={() => setFocus(focus === f ? '' : f)} className="text-left" aria-pressed={focus === f}>
      <Stat label={label} value={value ?? count(f)} tone={tone} hint={hint} active={focus === f} />
    </button>
  )
  const filtersOn = !!(q || tech || city || region || status || priority || bucket || focus)

  return (
    <PmPage title="PM Dashboard" subtitle={`Q${quarter} ${year}, ${quarterMonths(quarter)}. Quarterly refrigeration PMs across your ALDI stores.`}
      actions={<>
        {mine > 0 && <Link href="/app/pm/my" className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"><ClipboardCheck size={14} /> My PMs ({mine})</Link>}
        <select value={year} onChange={(e) => go(Number(e.target.value), quarter)} className={cn(fieldCls, 'w-auto')} aria-label="Year">{years.map((y) => <option key={y}>{y}</option>)}</select>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm font-semibold" data-help="pm-quarter">
          {[1, 2, 3, 4].map((n) => <button key={n} type="button" onClick={() => go(year, n)} className={cn('rounded-md px-3 py-1', quarter === n ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>Q{n}</button>)}
        </div>
      </>}>

      {stores.length === 0 ? (
        <Empty icon={<ClipboardCheck size={30} />} title="Start with the Store Directory">
          {role === 'admin' || role === 'coordinator'
            ? <>Add your stores, or import them from a spreadsheet, and this dashboard fills in. <Link href="/app/pm/stores" className="font-semibold text-indigo-600 underline">Open the Store Directory</Link></>
            : 'A coordinator has not added any stores yet.'}
        </Empty>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2" data-help="pm-dash-filters">
            <div className="relative min-w-[180px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Store, address, job number" className={cn(fieldCls, 'pl-8')} />
            </div>
            <select value={tech} onChange={(e) => setTech(e.target.value)} className={cn(fieldCls, 'w-auto')} aria-label="Technician"><option value="">Any technician</option>{techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="none">Unassigned</option></select>
            {cities.length > 1 && <select value={city} onChange={(e) => setCity(e.target.value)} className={cn(fieldCls, 'w-auto')} aria-label="City"><option value="">Any city</option>{cities.map((c) => <option key={c}>{c}</option>)}</select>}
            {regions.length > 1 && <select value={region} onChange={(e) => setRegion(e.target.value)} className={cn(fieldCls, 'w-auto')} aria-label="Region"><option value="">Any region</option>{regions.map((c) => <option key={c}>{c}</option>)}</select>}
            <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className={cn(fieldCls, 'w-auto')} aria-label="Status">
              <option value="">Any status</option>
              <optgroup label="Lifecycle">{PM_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</optgroup>
              <optgroup label="Blockers and flags"><option value="waiting_filters">Waiting on Filters</option><option value="waiting_parts">Waiting on Parts</option><option value="return_visit">Return Visit Needed</option><option value="overdue">Overdue</option><option value="no_job">No job number yet</option></optgroup>
            </select>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={cn(fieldCls, 'w-auto')} aria-label="Priority"><option value="">Any priority</option>{PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.key}: {p.window}</option>)}</select>
            {filtersOn && <button type="button" onClick={() => { setQ(''); setTech(''); setCity(''); setRegion(''); setStatus(''); setPriority(''); setBucket(''); setFocus('') }} className="text-xs font-medium text-indigo-600 hover:underline">Clear</button>}
          </div>

          {/* KPIs: tap one to list the PMs behind it */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-help="pm-kpis">
            <Stat label="Active stores" value={activeStores.length} hint={scope.length !== stores.length ? 'in this filter' : undefined} />
            {kpi('received', 'Jobs received', 'sky', `of ${activeStores.length} this quarter`)}
            {kpi('not_received', 'Jobs not received', count('not_received') ? 'amber' : 'slate', 'no job number yet')}
            {kpi('awaiting_scheduling', 'Awaiting scheduling', count('awaiting_scheduling') ? 'amber' : 'slate', 'job in, no visit date')}
            {kpi('in_progress', 'In progress', 'indigo')}
            {kpi('field_complete', 'Field work complete', 'violet', 'waiting on paperwork or closeout')}
            {kpi('completed', 'Completed', 'emerald')}
            {kpi('overdue', 'Overdue', count('overdue') ? 'rose' : 'slate', 'past the due date')}
            {kpi('waiting', 'Waiting on filters or parts', count('waiting') ? 'rose' : 'slate')}
            {kpi('deficiencies', 'Open deficiencies', openDeficiencies ? 'rose' : 'slate', 'across these stores, any quarter', openDeficiencies)}
            <Stat label="Average checklist" value={`${average}%`} tone="indigo" hint="PMs with a checklist started" />
            <Stat label="PM records" value={live.length} hint={`Q${quarter} ${year}`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Where the quarter stands" className="lg:col-span-2">
              <div className="space-y-3 p-4">
                {live.length === 0 ? <p className="text-sm text-slate-400">No PM records for Q{quarter} {year} yet. Open the quarter from the Quarterly Tracker.</p> : (
                  <>
                    <div className="flex h-4 overflow-hidden rounded-full bg-slate-100" role="img" aria-label="PMs by status">
                      {byStatus.map((x) => <div key={x.status} title={`${STATUS_LABEL[x.status]}: ${x.n}`} style={{ width: `${(x.n / live.length) * 100}%`, backgroundColor: STATUS_TONE[x.status].hex }} />)}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {byStatus.map((x) => (
                        <button key={x.status} type="button" onClick={() => setStatus(status === x.status ? '' : x.status)} className={cn('inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-xs', status === x.status ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100')}>
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_TONE[x.status].hex }} />{STATUS_LABEL[x.status]} <span className="font-bold tabular-nums">{x.n}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Checklist completion</p>
                  <div className="flex flex-wrap gap-1.5" data-help="pm-buckets">
                    {buckets.map(({ b, n }) => (
                      <button key={b} type="button" onClick={() => setBucket(bucket === b ? '' : b)}
                        className={cn('rounded-lg border px-2.5 py-1 text-xs font-medium', bucket === b ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300')}>
                        {BUCKET_LABEL[b]} <span className="ml-1 font-bold tabular-nums">{n}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
            <Card title="Materials to chase" actions={<Link href="/app/pm/materials" className="text-xs font-medium text-indigo-600 hover:underline">All materials</Link>}>
              {lateMaterials.length + awaitingInstall.length === 0 ? <p className="px-4 py-6 text-center text-sm text-slate-400">Nothing late, and nothing waiting to be installed.</p> : (
                <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto text-sm">
                  {[...lateMaterials.map((m) => ({ m, why: m.status === 'backordered' ? 'Backordered' : m.etaDate && m.etaDate < today ? `Was due ${fmtDate(m.etaDate, today)}` : `Not ordered, asked ${fmtDate(m.requestedDate, today)}` })),
                    ...awaitingInstall.map((m) => ({ m, why: 'Received, not installed yet' }))].slice(0, 30).map(({ m, why }) => (
                    <li key={m.id}>
                      <Link href={`/app/pm/jobs/${m.pmId}#materials`} className="flex items-start gap-2 px-4 py-2 hover:bg-slate-50">
                        <span className="min-w-0 flex-1"><span className="block truncate font-medium text-slate-800">{m.quantity} x {m.name}</span><span className="block text-xs text-slate-500">{stores.find((s) => s.id === m.storeId)?.storeNumber} · {why}</span></span>
                        <span className="shrink-0 text-[11px] font-semibold text-slate-500">{MATERIAL_STATUS_LABEL[m.status]}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* The year at a glance */}
          <Card title={`${year} at a glance`} actions={<Link href={`/app/pm/tracker?year=${year}`} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">Open the Quarterly Tracker <ArrowRight size={12} /></Link>}>
            <div className="grid gap-x-4 gap-y-1 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-help="pm-mini-matrix">
              {scope.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <Link href={`/app/pm/stores/${s.id}`} className="w-20 shrink-0 truncate text-xs font-semibold text-slate-700 hover:text-indigo-600">{s.storeNumber}</Link>
                  {[1, 2, 3, 4].map((n) => {
                    const c = allAt.get(`${s.id}:${n}`)
                    return c
                      ? <Link key={n} href={`/app/pm/jobs/${c.id}`} title={`Q${n}: ${STATUS_LABEL[c.status]}${c.jobNumber ? `, job ${c.jobNumber}` : ', no job number yet'}`}
                          className={cn('flex h-5 flex-1 items-center justify-center rounded text-[9px] font-bold text-white', n === quarter && 'ring-2 ring-slate-900/20')} style={{ backgroundColor: STATUS_TONE[c.status].hex }}>Q{n}</Link>
                      : <span key={n} title={`Q${n}: no PM record`} className="flex h-5 flex-1 items-center justify-center rounded border border-dashed border-slate-200 text-[9px] text-slate-300">Q{n}</span>
                  })}
                </div>
              ))}
            </div>
          </Card>

          {/* The list behind the numbers */}
          <Card title={`${focus || status || bucket ? 'Matching' : 'All'} stores for Q${quarter} ${year} (${rows.length})`}>
            {rows.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-400">Nothing matches.</p> : (
              <ul className="divide-y divide-slate-100">
                {rows.slice(0, 200).map(({ store: s, cycle: c }) => (
                  <li key={s.id}>
                    <Link href={c ? `/app/pm/jobs/${c.id}` : `/app/pm/stores/${s.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-slate-50">
                      <span className="w-20 shrink-0 font-bold text-slate-900">{s.storeNumber}</span>
                      <span className="min-w-0 flex-1 basis-40">
                        <span className="block truncate text-sm text-slate-700">{[s.address, s.city].filter(Boolean).join(', ')}</span>
                        <span className="block text-[11px] text-slate-500">
                          {c?.jobNumber ? `Job ${c.jobNumber}` : 'No job number yet'}
                          {c ? ` · ${techName.get(c.techId ?? '') ?? 'Unassigned'}` : ''}
                          {c?.scheduledDate ? ` · Visit ${fmtDate(c.scheduledDate, today)}` : ''}
                          {(openDeficienciesByStore[s.id] ?? 0) > 0 ? ` · ${openDeficienciesByStore[s.id]} open ${openDeficienciesByStore[s.id] === 1 ? 'deficiency' : 'deficiencies'}` : ''}
                        </span>
                      </span>
                      {c ? <>
                        <span className="flex flex-wrap items-center gap-1"><StatusChip status={c.status} /><BlockerChips cycle={c} compact /><OverdueChip cycle={c} today={today} /></span>
                        <span className="w-28 shrink-0">{c.templateVersionId ? <ProgressBar value={cyclePct(c)} small /> : <span className="text-[11px] text-slate-300">Checklist not started</span>}</span>
                      </> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">No PM record</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </PmPage>
  )
}

/** Sort key: what a coordinator should look at first. */
function urgency(c: PmCycle | null, today: string): number {
  if (!c) return 1
  if (c.status === 'completed' || c.status === 'cancelled') return 0
  let n = 2
  if (isOverdue(c, today)) n += 50
  if (c.returnVisitNeeded || c.blockingDeficiencies > 0) n += 20
  if (c.waitingFilters || c.waitingParts) n += 15
  if (['field_complete', 'pending_documentation'].includes(c.status)) n += 10
  if (!c.jobNumber) n += 5
  if (c.status === 'in_progress') n += 3
  return n
}
