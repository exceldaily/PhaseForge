'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { differenceInDays, format, formatDate, parseISO } from '@/lib/dates'
import { PHASE_STATUS_LABELS, PROJECT_STATUS_LABELS } from '@/lib/constants'
import { Phase, PhaseStatus, Project, ProjectStatus } from '@/types/app'

type ReportPhase = Phase & { projectName: string; projectColor: string }

interface ReportPrintModalProps {
  reportType: 'projects' | 'phases' | 'schedule'
  projects: Project[]
  filteredProjects: Project[]
  phases: ReportPhase[]
  memberMap: Record<string, string>
  onClose: () => void
}

const REPORT_TITLES = {
  projects: 'Project Report',
  phases: 'Phase Report',
  schedule: 'Schedule Report',
} as const

const headerCell =
  'border border-slate-300 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-700'
const bodyCell = 'border border-slate-300 px-3 py-2 text-slate-700'

// Print sheet styled to match GanttPrintModal's list output exactly.
export function ReportPrintModal({
  reportType,
  projects,
  filteredProjects,
  phases,
  memberMap,
  onClose,
}: ReportPrintModalProps) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.print()
    }, 250)

    const handleAfterPrint = () => {
      onClose()
    }

    window.addEventListener('afterprint', handleAfterPrint)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', handleAfterPrint)
    }
  }, [onClose])

  const projectById = Object.fromEntries(projects.map((p) => [p.id, p])) as Record<string, Project>

  // Group phases by project (preserving order) for the phases report,
  // mirroring the Gantt list's project-grouped first column.
  const phaseGroups: { project: Project | null; projectName: string; phases: ReportPhase[] }[] = []
  if (reportType === 'phases') {
    const byProject = new Map<string, { project: Project | null; projectName: string; phases: ReportPhase[] }>()
    for (const phase of phases) {
      const key = phase.project_id
      if (!byProject.has(key)) {
        byProject.set(key, {
          project: projectById[key] ?? null,
          projectName: phase.projectName,
          phases: [],
        })
      }
      byProject.get(key)!.phases.push(phase)
    }
    phaseGroups.push(...byProject.values())
  }

  const schedulePhases =
    reportType === 'schedule' ? [...phases].sort((a, b) => a.start_date.localeCompare(b.start_date)) : []

  const isEmpty =
    reportType === 'projects' ? filteredProjects.length === 0 : phases.length === 0

  const subtitle =
    reportType === 'projects'
      ? `${filteredProjects.length} project${filteredProjects.length !== 1 ? 's' : ''}`
      : `${phases.length} phase${phases.length !== 1 ? 's' : ''} across ${new Set(phases.map((p) => p.project_id)).size} project${new Set(phases.map((p) => p.project_id)).size !== 1 ? 's' : ''}`

  return (
    <div className="report-print-root fixed inset-0 z-[9999] overflow-auto bg-slate-200/80 backdrop-blur-sm">
      <div className="report-print-sheet min-h-screen bg-white text-black shadow-2xl">
        <div className="print:hidden sticky top-4 z-50 flex justify-end px-4 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            <X size={20} />
          </button>
        </div>

        <div className="report-print-header border-b border-slate-200 px-8 pb-6 pt-6">
          <h1 className="text-3xl font-bold text-slate-900">{REPORT_TITLES[reportType]}</h1>
          <p className="mt-2 text-sm font-medium text-slate-600">{subtitle}</p>
          <p className="mt-1 text-sm text-slate-500">Generated {format(new Date(), 'MMM d, yyyy')}</p>
        </div>

        {isEmpty && (
          <div className="px-8 py-12 text-center text-slate-500">No data matches your filters</div>
        )}

        {!isEmpty && (
          <div className="report-print-scroll px-8 py-6">
            {reportType === 'projects' && (
              <table className="report-print-table w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100">
                    <th className={headerCell}>Project</th>
                    <th className={headerCell}>Customer</th>
                    <th className={headerCell}>Status</th>
                    <th className={headerCell}>Priority</th>
                    <th className={headerCell}>Start</th>
                    <th className={headerCell}>End</th>
                    <th className={headerCell}>Duration</th>
                    <th className={headerCell}>Phases</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map((project) => {
                    const duration =
                      differenceInDays(parseISO(project.end_date), parseISO(project.start_date)) + 1
                    return (
                      <tr key={project.id}>
                        <td className="border border-slate-300 px-3 py-2 align-top text-slate-900">
                          <div className="font-semibold">{project.name}</div>
                          {project.job_location && (
                            <div className="mt-1 text-xs text-slate-500">{project.job_location}</div>
                          )}
                        </td>
                        <td className={bodyCell}>{project.customer_name ?? '—'}</td>
                        <td className={bodyCell}>
                          {PROJECT_STATUS_LABELS[project.status as ProjectStatus] ?? project.status}
                        </td>
                        <td className={`${bodyCell} capitalize`}>{project.priority}</td>
                        <td className={bodyCell}>{formatDate(project.start_date, 'MMM d, yyyy')}</td>
                        <td className={bodyCell}>{formatDate(project.end_date, 'MMM d, yyyy')}</td>
                        <td className={bodyCell}>{duration} days</td>
                        <td className={bodyCell}>{(project.phases ?? []).length}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {reportType === 'phases' && (
              <table className="report-print-table w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100">
                    <th className={headerCell}>Project</th>
                    <th className={headerCell}>Phase</th>
                    <th className={headerCell}>Status</th>
                    <th className={headerCell}>Start</th>
                    <th className={headerCell}>End</th>
                    <th className={headerCell}>Duration</th>
                    <th className={headerCell}>Assigned</th>
                  </tr>
                </thead>
                <tbody>
                  {phaseGroups.map((group) =>
                    group.phases.map((phase, phaseIndex) => {
                      const duration =
                        differenceInDays(parseISO(phase.end_date), parseISO(phase.start_date)) + 1
                      return (
                        <tr key={phase.id}>
                          <td className="border border-slate-300 px-3 py-2 align-top text-slate-900">
                            {phaseIndex === 0 ? (
                              <div>
                                <div className="font-semibold">{group.projectName}</div>
                                {group.project && (
                                  <div className="mt-1 text-xs text-slate-500">
                                    {formatDate(group.project.start_date, 'MMM d')} -{' '}
                                    {formatDate(group.project.end_date, 'MMM d, yyyy')}
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </td>
                          <td className="border border-slate-300 px-3 py-2 text-slate-800">{phase.name}</td>
                          <td className={bodyCell}>
                            {PHASE_STATUS_LABELS[phase.status as PhaseStatus] ?? phase.status}
                          </td>
                          <td className={bodyCell}>{formatDate(phase.start_date, 'MMM d, yyyy')}</td>
                          <td className={bodyCell}>{formatDate(phase.end_date, 'MMM d, yyyy')}</td>
                          <td className={bodyCell}>{duration} days</td>
                          <td className={bodyCell}>
                            {phase.assigned_to
                              ? memberMap[phase.assigned_to] ?? '—'
                              : phase.assigned_trade ?? '—'}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            )}

            {reportType === 'schedule' && (
              <table className="report-print-table w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100">
                    <th className={headerCell}>Start</th>
                    <th className={headerCell}>End</th>
                    <th className={headerCell}>Project</th>
                    <th className={headerCell}>Phase</th>
                    <th className={headerCell}>Status</th>
                    <th className={headerCell}>Duration</th>
                    <th className={headerCell}>Assigned</th>
                  </tr>
                </thead>
                <tbody>
                  {schedulePhases.map((phase) => {
                    const duration =
                      differenceInDays(parseISO(phase.end_date), parseISO(phase.start_date)) + 1
                    return (
                      <tr key={phase.id}>
                        <td className={bodyCell}>{formatDate(phase.start_date, 'MMM d, yyyy')}</td>
                        <td className={bodyCell}>{formatDate(phase.end_date, 'MMM d, yyyy')}</td>
                        <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-900">
                          {phase.projectName}
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-slate-800">{phase.name}</td>
                        <td className={bodyCell}>
                          {PHASE_STATUS_LABELS[phase.status as PhaseStatus] ?? phase.status}
                        </td>
                        <td className={bodyCell}>{duration} days</td>
                        <td className={bodyCell}>
                          {phase.assigned_to
                            ? memberMap[phase.assigned_to] ?? '—'
                            : phase.assigned_trade ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <style>{`
        @page {
          size: landscape;
          margin: 0.35in;
        }

        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
            background: white !important;
          }

          body * {
            visibility: hidden !important;
          }

          .report-print-root,
          .report-print-root * {
            visibility: visible !important;
          }

          .report-print-root {
            position: absolute !important;
            inset: 0 !important;
            overflow: visible !important;
            height: auto !important;
            width: 100% !important;
            background: white !important;
          }

          .report-print-sheet {
            min-height: 0 !important;
            box-shadow: none !important;
          }

          .report-print-scroll {
            overflow: visible !important;
          }

          .report-print-table {
            border-collapse: collapse !important;
            width: 100% !important;
          }

          .report-print-table thead {
            display: table-header-group !important;
          }

          .report-print-table tr,
          .report-print-table td,
          .report-print-table th {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  )
}
