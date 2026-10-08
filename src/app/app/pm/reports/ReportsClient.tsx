'use client'

// The year at a glance, and the spreadsheets people ask for: where each
// quarter stands, who is carrying what, and every PM report generated.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Download, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { exportRows, type ExportRow } from '@/lib/pm/exporter'
import { averagePct, blockersOf, cycleDocsPct, cyclePct, isOverdue } from '@/lib/pm/progress'
import { fmtDate, quarterMonths } from '@/lib/pm/quarters'
import { BLOCKER_LABEL, POST_FIELD_STATUSES, STATUS_LABEL, SYSTEM_LABEL, type PmCycle, type PmStore, type PmTech } from '@/lib/pm/types'
import { Card, PmPage, ProgressBar, fieldCls } from '@/components/pm/ui'

export interface PdfRow { id: string; pmId: string; version: number; generatedAt: string; generatedBy: string | null; storeId: string; year: number; quarter: number; jobNumber: string | null; url: string | null }

const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500'
const td = 'px-3 py-2 text-sm tabular-nums text-slate-700'

export function ReportsClient({ stores, techs, cycles, pdfs, names, year, years, currentQuarter, today }: {
  stores: PmStore[]; techs: PmTech[]; cycles: PmCycle[]; pdfs: PdfRow[]; names: Record<string, string>; year: number; years: number[]; currentQuarter: number; today: string
}) {
  const router = useRouter()
  const [quarter, setQuarter] = useState(currentQuarter)
  const storeOf = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores])
  const techName = useMemo(() => new Map(techs.map((t) => [t.id, t.name])), [techs])
  const activeStores = stores.filter((s) => s.isActive).length

  const byQuarter = [1, 2, 3, 4].map((n) => {
    const list = cycles.filter((c) => c.quarter === n && c.status !== 'cancelled')
    return {
      n, opened: list.length, jobs: list.filter((c) => !!c.jobNumber).length, started: list.filter((c) => !!c.templateVersionId).length,
      field: list.filter((c) => POST_FIELD_STATUSES.includes(c.status)).length, completed: list.filter((c) => c.status === 'completed').length,
      overdue: list.filter((c) => isOverdue(c, today)).length, blocked: list.filter((c) => c.status !== 'completed' && blockersOf(c).length > 0).length, average: averagePct(list),
    }
  })
  const workload = [...techs.map((t) => t.id), '']
    .map((id) => {
      const list = cycles.filter((c) => (c.techId ?? '') === id && c.status !== 'cancelled')
      const open = list.filter((c) => c.status !== 'completed')
      return {
        id, name: id ? techName.get(id) ?? '' : 'Unassigned', total: list.length, open: open.length, inProgress: open.filter((c) => c.status === 'in_progress').length,
        awaitingOffice: open.filter((c) => POST_FIELD_STATUSES.includes(c.status)).length, completed: list.length - open.length, overdue: open.filter((c) => isOverdue(c, today)).length,
        blocked: open.filter((c) => blockersOf(c).length > 0).length,
      }
    })
    .filter((w) => w.total > 0)

  const quarterRows = (n: number): ExportRow[] => stores.filter((s) => s.isActive || cycles.some((c) => c.storeId === s.id && c.quarter === n)).map((s) => {
    const c = cycles.find((x) => x.storeId === s.id && x.quarter === n)
    return {
      'Store #': s.storeNumber, Address: s.address, City: s.city, State: s.state, Region: s.region, 'Facility Manager': s.facilityManager, System: s.systemType ? SYSTEM_LABEL[s.systemType] : '',
      Quarter: `Q${n} ${year}`, 'Job Number': c?.jobNumber ?? '', 'SC Work Order': c?.scWorkOrder ?? '', Status: c ? STATUS_LABEL[c.status] : 'No PM record',
      Blockers: c ? blockersOf(c).map((b) => BLOCKER_LABEL[b]).join(', ') : '', Technician: techName.get((c ? c.techId : s.primaryTechId) ?? '') ?? '', 'Second Technician': techName.get(c?.helperTechId ?? '') ?? '',
      Priority: c?.priority ?? '', 'Date Received': c?.jobReceivedDate ?? '', 'Due Date': c?.dueDate ?? '', Scheduled: c?.scheduledDate ?? '', 'Work Started': c?.actualStart ?? '',
      'Date of Completion': c?.actualEnd ?? '', 'Submitted On': c?.submittedOn ?? '', 'Closed On': c?.closedAt?.slice(0, 10) ?? '',
      'Checklist %': c?.templateVersionId ? cyclePct(c) : '', 'Checks Done': c?.templateVersionId ? c.checklistDone : '', 'Checks Total': c?.templateVersionId ? c.checklistTotal : '',
      'Documentation %': c?.templateVersionId ? cycleDocsPct(c) : '', 'Open Deficiencies': c?.openDeficiencies ?? '', 'Return Visit': c?.returnVisitNeeded ? 'Yes' : '',
      Overdue: c && isOverdue(c, today) ? 'Yes' : '', 'Technician Notes': c?.techNotes ?? '', 'Coordinator Notes': c?.coordinatorNotes ?? '',
    }
  })
  const yearMatrix = (): ExportRow[] => stores.filter((s) => s.isActive || cycles.some((c) => c.storeId === s.id)).map((s) => {
    const row: ExportRow = { 'Store #': s.storeNumber, Address: s.address, City: s.city }
    for (const n of [1, 2, 3, 4]) {
      const c = cycles.find((x) => x.storeId === s.id && x.quarter === n)
      row[`Q${n} Job Number`] = c?.jobNumber ?? ''
      row[`Q${n} Status`] = c ? STATUS_LABEL[c.status] : ''
      row[`Q${n} Checklist %`] = c?.templateVersionId ? cyclePct(c) : ''
      row[`Q${n} Completed`] = c?.actualEnd ?? ''
    }
    return row
  })
  const workloadRows = (): ExportRow[] => workload.map((w) => ({
    Technician: w.name, 'PMs Assigned': w.total, Open: w.open, 'In Progress': w.inProgress, 'Field Done, With Office': w.awaitingOffice, Completed: w.completed, Overdue: w.overdue, Blocked: w.blocked,
  }))
  const summaryRows = (): ExportRow[] => byQuarter.map((b) => ({
    Quarter: `Q${b.n} ${year}`, 'Active Stores': activeStores, 'PMs Opened': b.opened, 'Job Numbers Received': b.jobs, 'Job Numbers Outstanding': b.opened - b.jobs, 'Checklists Started': b.started,
    'Field Work Complete': b.field, Completed: b.completed, Overdue: b.overdue, Blocked: b.blocked, 'Average Checklist %': b.average,
  }))

  const exports: { key: string; title: string; hint: string; rows: () => ExportRow[]; name: string }[] = [
    { key: 'quarter', title: `Q${quarter} ${year} status, every store`, hint: 'One row per store: job number, status, blockers, technician, dates, checklist and documentation %.', rows: () => quarterRows(quarter), name: `pm-q${quarter}-${year}-status` },
    { key: 'year', title: `${year} matrix, all four quarters`, hint: 'One row per store with each quarter side by side: job number, status, checklist %, completion date.', rows: yearMatrix, name: `pm-${year}-matrix` },
    { key: 'summary', title: `${year} summary by quarter`, hint: 'The table on this page.', rows: summaryRows, name: `pm-${year}-summary` },
    { key: 'workload', title: `${year} technician workload`, hint: 'PMs assigned, open, completed, overdue, and blocked per technician.', rows: workloadRows, name: `pm-${year}-technician-workload` },
  ]
  const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50'

  return (
    <PmPage title="Reports" subtitle={`${year}. Totals count PMs that are not cancelled.`}
      actions={<select value={year} onChange={(e) => router.push(`/app/pm/reports?year=${e.target.value}`)} className={cn(fieldCls, 'w-auto')} aria-label="Year">{years.map((y) => <option key={y}>{y}</option>)}</select>}>

      <Card title="By quarter">
        <div className="overflow-x-auto" data-help="pm-report-quarters">
          <table className="w-full min-w-[820px]">
            <thead><tr className="bg-slate-50">
              <th className={th}>Quarter</th><th className={th}>PMs opened</th><th className={th}>Job numbers in</th><th className={th}>Started</th><th className={th}>Field done</th>
              <th className={th}>Completed</th><th className={th}>Overdue</th><th className={th}>Blocked</th><th className={cn(th, 'w-48')}>Average checklist</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {byQuarter.map((b) => (
                <tr key={b.n}>
                  <td className="px-3 py-2"><Link href={`/app/pm/tracker?year=${year}&q=${b.n}&view=list`} className="text-sm font-bold text-slate-900 hover:text-indigo-600">Q{b.n}</Link><span className="ml-2 text-[11px] text-slate-400">{quarterMonths(b.n)}</span></td>
                  <td className={td}>{b.opened}<span className="text-slate-400"> of {activeStores}</span></td>
                  <td className={td}>{b.jobs}{b.opened - b.jobs > 0 && <span className="ml-1 text-[11px] font-medium text-amber-700">{b.opened - b.jobs} waiting</span>}</td>
                  <td className={td}>{b.started}</td><td className={td}>{b.field}</td>
                  <td className={cn(td, 'font-semibold text-emerald-700')}>{b.completed}</td>
                  <td className={cn(td, b.overdue > 0 && 'font-semibold text-rose-700')}>{b.overdue}</td>
                  <td className={cn(td, b.blocked > 0 && 'font-semibold text-rose-700')}>{b.blocked}</td>
                  <td className="px-3 py-2">{b.started > 0 ? <ProgressBar value={b.average} small /> : <span className="text-[11px] text-slate-400">Not started</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Technician workload">
          {workload.length === 0 ? <p className="px-4 py-6 text-center text-sm text-slate-400">No PMs opened for {year} yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead><tr className="bg-slate-50"><th className={th}>Technician</th><th className={th}>Open</th><th className={th}>In progress</th><th className={th}>With office</th><th className={th}>Completed</th><th className={th}>Overdue</th><th className={th}>Blocked</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {workload.map((w) => (
                    <tr key={w.id || 'none'}>
                      <td className={cn('px-3 py-2 text-sm font-semibold', w.id ? 'text-slate-900' : 'text-amber-700')}>{w.name}</td>
                      <td className={td}>{w.open}</td><td className={td}>{w.inProgress}</td><td className={td}>{w.awaitingOffice}</td><td className={td}>{w.completed}</td>
                      <td className={cn(td, w.overdue > 0 && 'font-semibold text-rose-700')}>{w.overdue}</td><td className={cn(td, w.blocked > 0 && 'font-semibold text-rose-700')}>{w.blocked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Exports" actions={
          <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))} className={cn(fieldCls, 'w-auto')} aria-label="Quarter for the status export">{[1, 2, 3, 4].map((n) => <option key={n} value={n}>Q{n}</option>)}</select>
        }>
          <ul className="divide-y divide-slate-100" data-help="pm-exports">
            {exports.map((e) => (
              <li key={e.key} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1 basis-56"><p className="text-sm font-medium text-slate-800">{e.title}</p><p className="text-[11px] text-slate-400">{e.hint}</p></div>
                <button type="button" onClick={() => exportRows(e.name, e.rows(), 'csv')} className={btn}><Download size={12} /> CSV</button>
                <button type="button" onClick={() => exportRows(e.name, e.rows(), 'xlsx')} className={btn}><Download size={12} /> Excel</button>
              </li>
            ))}
            <li className="px-4 py-2.5 text-xs text-slate-500">
              Materials and deficiencies export from their own pages, with whatever filter is on: <Link href="/app/pm/materials" className="font-medium text-indigo-600 hover:underline">Materials</Link>, <Link href="/app/pm/deficiencies" className="font-medium text-indigo-600 hover:underline">Deficiencies</Link>. The store list exports from the <Link href="/app/pm/stores" className="font-medium text-indigo-600 hover:underline">Store Directory</Link>.
            </li>
          </ul>
        </Card>
      </div>

      <Card title="PM report PDFs">
        {pdfs.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">No PM reports generated yet. Open a PM and press Generate report.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pdfs.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2">
                <FileText size={15} className="shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <Link href={`/app/pm/jobs/${p.pmId}#reports`} className="text-sm font-medium text-slate-800 hover:text-indigo-600">Store {storeOf.get(p.storeId)?.storeNumber ?? ''}, Q{p.quarter} {p.year}, version {p.version}</Link>
                  <p className="text-[11px] text-slate-400">{fmtDate(p.generatedAt, today)} by {(p.generatedBy && names[p.generatedBy]) || 'someone'}{p.jobNumber ? `, job ${p.jobNumber}` : ''}</p>
                </div>
                {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" className={btn}><Download size={12} /> PDF</a>}
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">The 60 most recent. Every version of every report stays on its PM record. PhaseForge does not send these to ServiceChannel: download the PDF and attach it there.</p>
      </Card>
    </PmPage>
  )
}
