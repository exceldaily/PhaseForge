'use client'

// Every filter and part request across the stores, in one place: what still
// has to be ordered, what is late, and what has arrived and is waiting to be
// installed.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Download, Package, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { exportRows } from '@/lib/pm/exporter'
import { daysBetween, fmtDate } from '@/lib/pm/quarters'
import {
  MATERIAL_CATEGORY_LABEL, MATERIAL_OPEN, MATERIAL_STATUSES, MATERIAL_STATUS_LABEL, MATERIAL_TONE,
  type MaterialStatus, type PmCycle, type PmMaterial, type PmStore, type PmTech,
} from '@/lib/pm/types'
import { Empty, ErrorNote, PmPage, Stat, fieldCls } from '@/components/pm/ui'
import { setMaterialStatus } from '../workActions'

type Focus = '' | 'to_order' | 'on_order' | 'late' | 'to_install'
type CycleLite = Pick<PmCycle, 'id' | 'storeId' | 'year' | 'quarter' | 'jobNumber' | 'techId' | 'status'>

const isLate = (m: PmMaterial, today: string) =>
  m.status === 'backordered'
  || (!!m.etaDate && m.etaDate < today && ['ordered', 'approved', 'needed', 'pending_approval'].includes(m.status))
  || (['needed', 'approved'].includes(m.status) && daysBetween(m.requestedDate, today) > 3)
const FOCUS: Record<Exclude<Focus, ''>, (m: PmMaterial, today: string) => boolean> = {
  to_order: (m) => ['needed', 'pending_approval', 'approved'].includes(m.status),
  on_order: (m) => ['ordered', 'backordered', 'partially_received'].includes(m.status),
  late: isLate,
  to_install: (m) => m.status === 'received',
}
/** The next step a coordinator or technician is most likely to take. */
const NEXT: Partial<Record<MaterialStatus, MaterialStatus>> = {
  needed: 'ordered', pending_approval: 'approved', approved: 'ordered', ordered: 'received', backordered: 'received', partially_received: 'received', received: 'installed',
}

export function MaterialsClient({ materials: initial, stores, techs, cycles, names, canCoordinate, myTechIds, today }: {
  materials: PmMaterial[]; stores: PmStore[]; techs: PmTech[]; cycles: CycleLite[]; names: Record<string, string>; canCoordinate: boolean; myTechIds: string[]; today: string
}) {
  const router = useRouter()
  const [materials, setMaterials] = useState(initial)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<MaterialStatus | '' | 'open'>('open')
  const [category, setCategory] = useState('')
  const [tech, setTech] = useState('')
  const [focus, setFocus] = useState<Focus>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const storeOf = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores])
  const cycleOf = useMemo(() => new Map(cycles.map((c) => [c.id, c])), [cycles])
  const techName = useMemo(() => new Map(techs.map((t) => [t.id, t.name])), [techs])
  const open = materials.filter((m) => MATERIAL_OPEN(m.status))
  const count = (f: Exclude<Focus, ''>) => open.filter((m) => FOCUS[f](m, today)).length

  const rows = materials.filter((m) => {
    const c = cycleOf.get(m.pmId)
    const s = storeOf.get(m.storeId)
    if (focus && !(MATERIAL_OPEN(m.status) && FOCUS[focus](m, today))) return false
    if (!focus && status === 'open' && !MATERIAL_OPEN(m.status)) return false
    if (!focus && status && status !== 'open' && m.status !== status) return false
    if (category && m.category !== category) return false
    if (tech && c?.techId !== tech) return false
    const needle = q.trim().toLowerCase()
    if (needle && ![m.name, m.partNumber, m.vendor, m.poNumber, s?.storeNumber, s?.city, c?.jobNumber].some((v) => v?.toLowerCase().includes(needle))) return false
    return true
  }).sort((a, b) => Number(isLate(b, today)) - Number(isLate(a, today)) || a.requestedDate.localeCompare(b.requestedDate))

  const canMove = (m: PmMaterial, to: MaterialStatus) => canCoordinate || (to === 'installed' && myTechIds.includes(cycleOf.get(m.pmId)?.techId ?? ''))
  const move = async (m: PmMaterial, to: MaterialStatus) => {
    setBusy(m.id); setError(null)
    const res = await setMaterialStatus({ id: m.id, status: to })
    setBusy(null)
    if (!res.ok) { setError(res.error); return }
    if ('material' in res && res.material) { const next = res.material; setMaterials((list) => list.map((x) => (x.id === next.id ? next : x))) }
    router.refresh()
  }

  const doExport = (format: 'csv' | 'xlsx') => exportRows(`pm-materials-${today}`, rows.map((m) => {
    const c = cycleOf.get(m.pmId); const s = storeOf.get(m.storeId)
    return {
      'Store #': s?.storeNumber ?? '', City: s?.city ?? '', PM: c ? `Q${c.quarter} ${c.year}` : '', 'Job Number': c?.jobNumber ?? '', Technician: techName.get(c?.techId ?? '') ?? '',
      Type: MATERIAL_CATEGORY_LABEL[m.category], Material: m.name, 'Part Number': m.partNumber ?? '', Qty: m.quantity, For: m.unitLabel ?? '', Status: MATERIAL_STATUS_LABEL[m.status],
      Requested: m.requestedDate, 'Requested By': (m.requestedBy && names[m.requestedBy]) || '', Ordered: m.orderedDate ?? '', Vendor: m.vendor ?? '', 'PO Number': m.poNumber ?? '',
      ETA: m.etaDate ?? '', Received: m.receivedDate ?? '', Installed: m.installedDate ?? '', Late: isLate(m, today) && MATERIAL_OPEN(m.status) ? 'Yes' : '', Notes: m.notes ?? '',
    }
  }), format)

  const kpi = (f: Exclude<Focus, ''>, label: string, tone: Parameters<typeof Stat>[0]['tone'], hint: string) => (
    <button type="button" onClick={() => setFocus(focus === f ? '' : f)} className="text-left" aria-pressed={focus === f}>
      <Stat label={label} value={count(f)} tone={tone} hint={hint} active={focus === f} />
    </button>
  )

  return (
    <PmPage title="Materials" subtitle="Filters and parts requested on PMs, from the request through to installed."
      actions={<>
        <button type="button" onClick={() => doExport('csv')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><Download size={14} /> CSV</button>
        <button type="button" onClick={() => doExport('xlsx')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><Download size={14} /> Excel</button>
      </>}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-help="pm-materials-kpis">
        {kpi('to_order', 'To order', 'amber', 'Needed or approved, not ordered yet')}
        {kpi('on_order', 'On order', 'indigo', 'Ordered, backordered, or partly in')}
        {kpi('late', 'Late', 'rose', 'Past ETA, backordered, or unordered for 3+ days')}
        {kpi('to_install', 'Received, not installed', 'sky', 'Ready for the technician')}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Material, part number, vendor, PO, store, job number" className={cn(fieldCls, 'pl-8')} />
        </div>
        <select value={focus ? 'open' : status} onChange={(e) => { setFocus(''); setStatus(e.target.value as MaterialStatus | '' | 'open') }} className={cn(fieldCls, 'w-auto')} aria-label="Status">
          <option value="open">All open</option><option value="">Everything</option>
          {MATERIAL_STATUSES.map((s) => <option key={s} value={s}>{MATERIAL_STATUS_LABEL[s]}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={cn(fieldCls, 'w-auto')} aria-label="Type">
          <option value="">Filters and parts</option><option value="filter">Filters</option><option value="part">Parts</option><option value="other">Other</option>
        </select>
        <select value={tech} onChange={(e) => setTech(e.target.value)} className={cn(fieldCls, 'w-auto')} aria-label="Technician">
          <option value="">Any technician</option>{techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <ErrorNote>{error}</ErrorNote>

      {rows.length === 0 ? (
        <Empty icon={<Package size={30} />} title={materials.length ? 'Nothing matches' : 'No material requests yet'}>
          {materials.length ? 'Try clearing a filter.' : 'A technician asks for filters or parts from the checklist, or a coordinator adds them on the PM record. They all land here.'}
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white" data-help="pm-materials-table">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Store and PM</th><th className="px-3 py-2">Material</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Requested</th><th className="px-3 py-2">Ordered</th><th className="px-3 py-2">ETA</th><th className="px-3 py-2">Received</th><th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((m) => {
                const c = cycleOf.get(m.pmId); const s = storeOf.get(m.storeId)
                const late = MATERIAL_OPEN(m.status) && isLate(m, today)
                const next = NEXT[m.status]
                return (
                  <tr key={m.id} className={cn(late && 'bg-rose-50/40')}>
                    <td className="px-3 py-2 align-top">
                      <Link href={`/app/pm/jobs/${m.pmId}#materials`} className="font-bold text-slate-900 hover:text-indigo-600">{s?.storeNumber ?? 'Store'}</Link>
                      <p className="text-[11px] text-slate-500">{c ? `Q${c.quarter} ${c.year}` : ''}{c?.jobNumber ? `, job ${c.jobNumber}` : ''}</p>
                      <p className="text-[11px] text-slate-400">{[s?.city, techName.get(c?.techId ?? '')].filter(Boolean).join(' | ')}</p>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <p className="font-medium text-slate-800">{m.name}</p>
                      <p className="text-[11px] text-slate-500">{[MATERIAL_CATEGORY_LABEL[m.category], m.partNumber && `Part ${m.partNumber}`, m.unitLabel && `for ${m.unitLabel}`].filter(Boolean).join(' | ')}</p>
                      {(m.vendor || m.poNumber) && <p className="text-[11px] text-slate-400">{[m.vendor, m.poNumber && `PO ${m.poNumber}`].filter(Boolean).join(' | ')}</p>}
                    </td>
                    <td className="px-3 py-2 align-top tabular-nums text-slate-700">{m.quantity}</td>
                    <td className="px-3 py-2 align-top">
                      <span className={cn('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', MATERIAL_TONE[m.status])}>{MATERIAL_STATUS_LABEL[m.status]}</span>
                      {late && <span className="ml-1 inline-block rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">Late</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-top text-xs text-slate-600">{fmtDate(m.requestedDate, today)}<span className="block text-[11px] text-slate-400">{(m.requestedBy && names[m.requestedBy]) || ''}</span></td>
                    <td className="whitespace-nowrap px-3 py-2 align-top text-xs text-slate-600">{fmtDate(m.orderedDate, today)}</td>
                    <td className={cn('whitespace-nowrap px-3 py-2 align-top text-xs', late && m.etaDate && m.etaDate < today ? 'font-semibold text-rose-700' : 'text-slate-600')}>{fmtDate(m.etaDate, today)}</td>
                    <td className="whitespace-nowrap px-3 py-2 align-top text-xs text-slate-600">{fmtDate(m.receivedDate, today)}</td>
                    <td className="px-3 py-2 text-right align-top">
                      {next && canMove(m, next) && (
                        <button type="button" disabled={busy === m.id} onClick={() => move(m, next)}
                          className="whitespace-nowrap rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 hover:border-indigo-400 disabled:opacity-50">
                          Mark {MATERIAL_STATUS_LABEL[next].toLowerCase()}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-slate-400">Vendor, PO number, ETA, and partial deliveries are edited on the PM record. Installed and cancelled requests from the last four months are kept here under Everything.</p>
    </PmPage>
  )
}
