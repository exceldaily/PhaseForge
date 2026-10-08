'use client'

// Every deficiency found on a PM, across all stores. They outlive the PM
// that found them: this is where the proposal and the repair get chased.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Download, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { exportRows } from '@/lib/pm/exporter'
import { daysBetween, fmtDate } from '@/lib/pm/quarters'
import {
  PROPOSAL_LABEL, REPAIR_LABEL, REPAIR_OPEN, REPAIR_STATUSES, SEVERITIES, SEVERITY_LABEL, SEVERITY_TONE,
  type PmCycle, type PmDeficiency, type PmStore, type RepairStatus, type Severity,
} from '@/lib/pm/types'
import { Empty, ErrorNote, PmPage, Stat, fieldCls } from '@/components/pm/ui'
import { saveDeficiency } from '../workActions'

type Focus = '' | 'open' | 'urgent' | 'proposal' | 'return' | 'blocking'
const SEV_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const FOCUS: Record<Exclude<Focus, ''>, (d: PmDeficiency) => boolean> = {
  open: () => true,
  urgent: (d) => d.severity === 'high' || d.severity === 'critical',
  proposal: (d) => d.proposalStatus === 'needed',
  return: (d) => d.returnVisitRequired,
  blocking: (d) => d.affectsPm,
}

export function DeficienciesClient({ deficiencies: initial, stores, cycles, names, canCoordinate, today }: {
  deficiencies: PmDeficiency[]; stores: PmStore[]; cycles: Pick<PmCycle, 'id' | 'year' | 'quarter' | 'jobNumber'>[]
  names: Record<string, string>; canCoordinate: boolean; today: string
}) {
  const router = useRouter()
  const [deficiencies, setDeficiencies] = useState(initial)
  const [q, setQ] = useState('')
  const [show, setShow] = useState<'open' | 'all' | 'closed'>('open')
  const [severity, setSeverity] = useState('')
  const [focus, setFocus] = useState<Focus>('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const storeOf = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores])
  const cycleOf = useMemo(() => new Map(cycles.map((c) => [c.id, c])), [cycles])
  const open = deficiencies.filter((d) => REPAIR_OPEN(d.repairStatus))
  const count = (f: Exclude<Focus, ''>) => open.filter(FOCUS[f]).length

  const rows = deficiencies.filter((d) => {
    const isOpen = REPAIR_OPEN(d.repairStatus)
    if (focus ? !(isOpen && FOCUS[focus](d)) : show === 'open' ? !isOpen : show === 'closed' ? isOpen : false) return false
    if (severity && d.severity !== severity) return false
    const s = storeOf.get(d.storeId)
    const needle = q.trim().toLowerCase()
    if (needle && ![d.description, d.itemCode, d.equipmentLabel, d.followupJobNumber, d.recommendedRepair, s?.storeNumber, s?.city].some((v) => v?.toLowerCase().includes(needle))) return false
    return true
  }).sort((a, b) => Number(REPAIR_OPEN(b.repairStatus)) - Number(REPAIR_OPEN(a.repairStatus)) || SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.createdAt.localeCompare(b.createdAt))

  const setRepair = async (d: PmDeficiency, repairStatus: RepairStatus) => {
    setBusy(d.id); setError(null)
    const res = await saveDeficiency({
      id: d.id, description: d.description, severity: d.severity, equipmentId: d.equipmentId, equipmentLabel: d.equipmentLabel, recommendedRepair: d.recommendedRepair,
      proposalRequired: d.proposalRequired, returnVisitRequired: d.returnVisitRequired, affectsPm: d.affectsPm, repairStatus,
    })
    setBusy(null)
    if (!res.ok) { setError(res.error); return }
    setDeficiencies((list) => list.map((x) => (x.id === res.deficiency.id ? res.deficiency : x)))
    router.refresh()
  }

  const doExport = (format: 'csv' | 'xlsx') => exportRows(`pm-deficiencies-${today}`, rows.map((d) => {
    const s = storeOf.get(d.storeId); const c = d.pmId ? cycleOf.get(d.pmId) : null
    return {
      'Store #': s?.storeNumber ?? '', City: s?.city ?? '', 'Found On': c ? `Q${c.quarter} ${c.year}` : '', 'PM Job Number': c?.jobNumber ?? '', 'PM ID': d.itemCode ?? '',
      Severity: SEVERITY_LABEL[d.severity], Equipment: d.equipmentLabel ?? '', Description: d.description, 'Recommended Repair': d.recommendedRepair ?? '',
      Proposal: PROPOSAL_LABEL[d.proposalStatus], 'Proposal Submitted': d.proposalSubmittedDate ?? '', 'Repair Status': REPAIR_LABEL[d.repairStatus],
      'Return Visit': d.returnVisitRequired ? 'Yes' : '', 'Holds Up PM': d.affectsPm ? 'Yes' : '', 'Follow-up Job': d.followupJobNumber ?? '',
      Found: d.createdAt.slice(0, 10), 'Found By': (d.createdBy && names[d.createdBy]) || '', Resolved: d.resolvedOn ?? '', Resolution: d.resolutionNote ?? '',
      'Days Open': REPAIR_OPEN(d.repairStatus) ? daysBetween(d.createdAt, today) : '',
    }
  }), format)

  const kpi = (f: Exclude<Focus, ''>, label: string, tone: Parameters<typeof Stat>[0]['tone'], hint?: string) => (
    <button type="button" onClick={() => setFocus(focus === f ? '' : f)} className="text-left" aria-pressed={focus === f}>
      <Stat label={label} value={count(f)} tone={tone} hint={hint} active={focus === f} />
    </button>
  )

  return (
    <PmPage title="Deficiencies" subtitle="Problems found during PMs. They stay with the store until they are repaired, whether or not the PM has closed."
      actions={<>
        <button type="button" onClick={() => doExport('csv')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><Download size={14} /> CSV</button>
        <button type="button" onClick={() => doExport('xlsx')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><Download size={14} /> Excel</button>
      </>}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" data-help="pm-deficiency-kpis">
        {kpi('open', 'Open', 'slate')}
        {kpi('urgent', 'High or critical', 'rose')}
        {kpi('proposal', 'Proposal to send', 'amber', 'FOPM proposal needed, not submitted')}
        {kpi('return', 'Need a return visit', 'violet')}
        {kpi('blocking', 'Holding up a PM', 'rose', 'Marked as blocking the PM itself')}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Description, PM ID, equipment, store, follow-up job" className={cn(fieldCls, 'pl-8')} />
        </div>
        <select value={focus ? 'open' : show} onChange={(e) => { setFocus(''); setShow(e.target.value as 'open' | 'all' | 'closed') }} className={cn(fieldCls, 'w-auto')} aria-label="Show">
          <option value="open">Open</option><option value="closed">Repaired, declined, or closed</option><option value="all">Everything</option>
        </select>
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={cn(fieldCls, 'w-auto')} aria-label="Severity">
          <option value="">Any severity</option>{SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}
        </select>
      </div>
      <ErrorNote>{error}</ErrorNote>

      {rows.length === 0 ? (
        <Empty icon={<AlertTriangle size={30} />} title={deficiencies.length ? 'Nothing matches' : 'No deficiencies written up yet'}>
          {deficiencies.length ? 'Try clearing a filter.' : 'When a technician fails a check, they write it up from the checklist. It lands here and on the store.'}
        </Empty>
      ) : (
        <ul className="space-y-2" data-help="pm-deficiency-list">
          {rows.map((d) => {
            const s = storeOf.get(d.storeId); const c = d.pmId ? cycleOf.get(d.pmId) : null
            const isOpen = REPAIR_OPEN(d.repairStatus)
            const age = daysBetween(d.createdAt, today)
            return (
              <li key={d.id} className={cn('rounded-xl border bg-white p-3', isOpen && (d.severity === 'critical' || d.severity === 'high') ? 'border-rose-200' : 'border-slate-200', !isOpen && 'opacity-70')}>
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', SEVERITY_TONE[d.severity])}>{SEVERITY_LABEL[d.severity]}</span>
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="text-sm text-slate-900">{d.itemCode && <span className="mr-1.5 font-bold">{d.itemCode}</span>}{d.description}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      <Link href={`/app/pm/stores/${d.storeId}`} className="font-semibold text-slate-700 hover:text-indigo-600">Store {s?.storeNumber ?? ''}</Link>
                      {s?.city ? `, ${s.city}` : ''}
                      {c && <> | <Link href={`/app/pm/jobs/${c.id}#deficiencies`} className="text-indigo-600 hover:underline">Q{c.quarter} {c.year} PM{c.jobNumber ? `, job ${c.jobNumber}` : ''}</Link></>}
                      {d.equipmentLabel ? ` | ${d.equipmentLabel}` : ''}
                      {` | Found ${fmtDate(d.createdAt, today)}`}{d.createdBy && names[d.createdBy] ? ` by ${names[d.createdBy]}` : ''}
                      {isOpen && age > 0 ? `, open ${age} ${age === 1 ? 'day' : 'days'}` : ''}
                    </p>
                    {d.recommendedRepair && <p className="mt-1 text-xs text-slate-600"><span className="font-medium">Recommended:</span> {d.recommendedRepair}</p>}
                    {d.resolutionNote && <p className="mt-1 text-xs text-emerald-800"><span className="font-medium">Resolution:</span> {d.resolutionNote}{d.resolvedOn ? ` (${fmtDate(d.resolvedOn, today)})` : ''}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                      {d.proposalStatus !== 'not_required' && <span className={cn('rounded px-1.5 py-0.5', d.proposalStatus === 'needed' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700')}>{PROPOSAL_LABEL[d.proposalStatus]}{d.proposalSubmittedDate ? ` ${fmtDate(d.proposalSubmittedDate, today)}` : ''}</span>}
                      {d.returnVisitRequired && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-800">Return visit</span>}
                      {d.affectsPm && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-800">Holds up the PM</span>}
                      {d.followupJobNumber && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-800">Follow-up job {d.followupJobNumber}</span>}
                    </div>
                  </div>
                  {canCoordinate ? (
                    <select value={d.repairStatus} disabled={busy === d.id} onChange={(e) => setRepair(d, e.target.value as RepairStatus)} aria-label="Repair status"
                      className={cn(fieldCls, 'w-auto text-xs font-semibold', isOpen ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900')}>
                      {REPAIR_STATUSES.map((r) => <option key={r} value={r}>{REPAIR_LABEL[r]}</option>)}
                    </select>
                  ) : (
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', isOpen ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')}>{REPAIR_LABEL[d.repairStatus]}</span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-[11px] text-slate-400">Proposal details, the follow-up job number, photos, and the resolution note are edited on the PM record the deficiency was found on.</p>
    </PmPage>
  )
}
