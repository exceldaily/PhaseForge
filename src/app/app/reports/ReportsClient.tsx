'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import { Download, Printer, Filter } from 'lucide-react'
import { PROJECT_STATUS_LABELS, PRIORITY_LABELS, PHASE_STATUS_LABELS, KANBAN_COLUMNS } from '@/lib/constants'
import { formatDate, differenceInDays, parseISO } from '@/lib/dates'
import { Project, Phase, ProjectStatus, PhaseStatus } from '@/types/app'

interface Member { id: string; full_name: string }

interface ReportsClientProps {
  projects: Project[]
  members: Member[]
}

type ReportType = 'projects' | 'phases' | 'schedule'

export function ReportsClient({ projects, members }: ReportsClientProps) {
  const memberMap = Object.fromEntries(members.map(m => [m.id, m.full_name]))

  const [reportType, setReportType] = useState<ReportType>('projects')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [search, setSearch] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const deferredSearch = useDeferredValue(search)

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      if (!includeArchived && p.is_archived) return false
      if (statusFilter && p.status !== statusFilter) return false
      if (priorityFilter && p.priority !== priorityFilter) return false
      if (deferredSearch) {
        const q = deferredSearch.toLowerCase()
        return p.name.toLowerCase().includes(q) ||
          (p.customer_name?.toLowerCase().includes(q) ?? false) ||
          (p.job_location?.toLowerCase().includes(q) ?? false)
      }
      return true
    })
  }, [projects, statusFilter, priorityFilter, deferredSearch, includeArchived])

  const allPhases = useMemo(() =>
    filteredProjects.flatMap(p =>
      (p.phases ?? []).map((ph: Phase) => ({ ...ph, projectName: p.name, projectColor: p.color }))
    ), [filteredProjects])

  const exportCSV = () => {
    let rows: string[][]
    let filename: string

    if (reportType === 'projects') {
      filename = 'ganttic-projects.csv'
      rows = [
        ['Project Name', 'Customer', 'Location', 'Status', 'Priority', 'Start Date', 'End Date', 'Duration (days)', 'PM', 'Superintendent', 'Phases'],
        ...filteredProjects.map(p => [
          p.name, p.customer_name ?? '', p.job_location ?? '',
          PROJECT_STATUS_LABELS[p.status as ProjectStatus] ?? p.status,
          PRIORITY_LABELS[p.priority as keyof typeof PRIORITY_LABELS] ?? p.priority,
          p.start_date, p.end_date,
          String(differenceInDays(parseISO(p.end_date), parseISO(p.start_date)) + 1),
          p.project_manager ? (memberMap[p.project_manager] ?? p.project_manager) : '',
          p.superintendent ?? '',
          String((p.phases ?? []).length),
        ]),
      ]
    } else if (reportType === 'phases') {
      filename = 'ganttic-phases.csv'
      rows = [
        ['Project', 'Phase Name', 'Status', 'Start Date', 'End Date', 'Duration (days)', 'Assigned To', 'Trade'],
        ...allPhases.map(ph => [
          ph.projectName, ph.name,
          PHASE_STATUS_LABELS[ph.status as PhaseStatus] ?? ph.status,
          ph.start_date, ph.end_date,
          String(differenceInDays(parseISO(ph.end_date), parseISO(ph.start_date)) + 1),
          ph.assigned_to ? (memberMap[ph.assigned_to] ?? '') : '',
          ph.assigned_trade ?? '',
        ]),
      ]
    } else {
      filename = 'ganttic-schedule.csv'
      rows = [
        ['Project', 'Phase', 'Start Date', 'End Date', 'Duration (days)', 'Status', 'Assigned'],
        ...allPhases
          .sort((a, b) => a.start_date.localeCompare(b.start_date))
          .map(ph => [
            ph.projectName, ph.name, ph.start_date, ph.end_date,
            String(differenceInDays(parseISO(ph.end_date), parseISO(ph.start_date)) + 1),
            PHASE_STATUS_LABELS[ph.status as PhaseStatus] ?? ph.status,
            ph.assigned_to ? (memberMap[ph.assigned_to] ?? '') : (ph.assigned_trade ?? ''),
          ]),
      ]
    }

    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
          <p className="text-slate-500 mt-1 text-sm">Filter, preview, and export your project data.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            <Printer size={15} /> Print
          </button>
          <button onClick={exportCSV}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors">
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-slate-700">
          <Filter size={14} /> Filters
        </div>
        <div className="flex flex-wrap gap-3">
          {/* Report type */}
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
            {(['projects', 'phases', 'schedule'] as ReportType[]).map(t => (
              <button key={t} onClick={() => setReportType(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${reportType === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {t}
              </button>
            ))}
          </div>

          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects..."
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[180px]" />

          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">All statuses</option>
            {KANBAN_COLUMNS.map(c => <option key={c.status} value={c.status}>{c.label}</option>)}
          </select>

          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">All priorities</option>
            {['critical', 'high', 'medium', 'low'].map(p => (
              <option key={p} value={p}>{PRIORITY_LABELS[p as keyof typeof PRIORITY_LABELS]}</option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={includeArchived} onChange={e => setIncludeArchived(e.target.checked)}
              className="rounded border-slate-300" />
            Include archived
          </label>
        </div>
      </div>

      {/* Summary row */}
      <div className="flex items-center gap-6 text-sm text-slate-500">
        <span><strong className="text-slate-900">{filteredProjects.length}</strong> projects</span>
        <span><strong className="text-slate-900">{allPhases.length}</strong> phases</span>
        <span className="ml-auto text-xs text-slate-400">Showing {reportType} report</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden print:shadow-none">
        <div className="overflow-x-auto">
          {reportType === 'projects' && (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Project', 'Customer', 'Status', 'Priority', 'Start', 'End', 'Days', 'Phases'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProjects.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                        <span className="font-medium text-slate-900">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{p.customer_name ?? '—'}</td>
                    <td className="px-4 py-3"><span className="text-xs font-medium text-slate-700">{PROJECT_STATUS_LABELS[p.status as ProjectStatus] ?? p.status}</span></td>
                    <td className="px-4 py-3 capitalize text-slate-600">{p.priority}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(p.start_date, 'MMM d, yyyy')}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(p.end_date, 'MMM d, yyyy')}</td>
                    <td className="px-4 py-3 text-slate-600">{differenceInDays(parseISO(p.end_date), parseISO(p.start_date)) + 1}</td>
                    <td className="px-4 py-3 text-slate-600">{(p.phases ?? []).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {(reportType === 'phases' || reportType === 'schedule') && (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Project', 'Phase', 'Status', 'Start', 'End', 'Days', 'Assigned'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(reportType === 'schedule'
                  ? [...allPhases].sort((a, b) => a.start_date.localeCompare(b.start_date))
                  : allPhases
                ).map(ph => (
                  <tr key={ph.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: ph.projectColor }} />
                        <span className="text-xs text-slate-500">{ph.projectName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{ph.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{PHASE_STATUS_LABELS[ph.status as PhaseStatus] ?? ph.status}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(ph.start_date, 'MMM d, yyyy')}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(ph.end_date, 'MMM d, yyyy')}</td>
                    <td className="px-4 py-3 text-slate-600">{differenceInDays(parseISO(ph.end_date), parseISO(ph.start_date)) + 1}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {ph.assigned_to ? (memberMap[ph.assigned_to] ?? '—') : (ph.assigned_trade ?? '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {filteredProjects.length === 0 && (
            <div className="py-16 text-center text-slate-400 text-sm">No data matches your filters.</div>
          )}
        </div>
      </div>
    </div>
  )
}
