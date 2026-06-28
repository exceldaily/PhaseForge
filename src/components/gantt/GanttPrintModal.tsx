'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { GantticLogo } from '@/components/branding/GantticLogo'
import { addDays, differenceInDays, format, formatDate, getTimelineHeaders, parseISO } from '@/lib/dates'
import { getClippedBarPosition } from '@/lib/gantt'
import { Project, ZoomLevel } from '@/types/app'

interface GanttPrintModalProps {
  projects: Project[]
  scope: 'current' | 'all'
  zoom: ZoomLevel
  collapsedProjects: Set<string>
  style: 'chart' | 'list'
  selectedProjectId: string | null
  viewStart: Date
  viewEnd: Date
  onClose: () => void
}

interface TimelineSegment {
  key: string
  label: string
  left: number
  width: number
}

interface ChartPrintRow {
  key: string
  kind: 'project' | 'phase'
  label: string
  color: string
  startDate: string
  endDate: string
}

const ROW_HEIGHT = 42
const PROJECT_ROW_HEIGHT = 50
const HEADER_HEIGHT = 62
const SIDEBAR_WIDTH = 294

export function GanttPrintModal({
  projects,
  scope,
  zoom,
  collapsedProjects,
  style,
  selectedProjectId,
  viewStart,
  viewEnd,
  onClose,
}: GanttPrintModalProps) {
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

  const pixelsPerDay = zoom === 'day' ? 24 : zoom === 'week' ? 20 : zoom === 'month' ? 18 : 16
  const projectsToPrint = scope === 'all'
    ? projects
    : selectedProjectId
      ? projects.filter((project) => project.id === selectedProjectId)
      : projects.slice(0, 1)

  const totalDays = differenceInDays(viewEnd, viewStart) + 1
  const totalWidth = Math.max(totalDays * pixelsPerDay, 720)
  const timelineSegments = getPrintTimelineSegments(zoom, viewStart, viewEnd, pixelsPerDay)
  const chartRows = buildChartRows(projectsToPrint, collapsedProjects)

  return (
    <div className="gantt-print-root fixed inset-0 z-[9999] overflow-auto bg-slate-200/80 backdrop-blur-sm">
      <div className="gantt-print-sheet min-h-screen bg-white text-black shadow-2xl">
        <div className="print:hidden sticky top-4 z-50 flex justify-end px-4 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            <X size={20} />
          </button>
        </div>

        <div className="gantt-print-header flex items-start justify-between gap-6 border-b border-slate-200 px-8 pb-6 pt-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              {style === 'chart' ? 'Gantt Chart' : 'Project Schedule'}
            </h1>
            <p className="mt-2 text-sm font-medium text-slate-600">
              {scope === 'all' ? 'All Projects' : 'Current Project'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {format(viewStart, 'MMM d, yyyy')} - {format(viewEnd, 'MMM d, yyyy')}
            </p>
          </div>
          <GantticLogo variant="lockup" width={170} alt="PhaseForge logo" />
        </div>

        {projectsToPrint.length === 0 && (
          <div className="px-8 py-12 text-center text-slate-500">
            No projects to print
          </div>
        )}

        {style === 'list' && projectsToPrint.length > 0 && (
          <div className="gantt-print-scroll px-8 py-6">
            <table className="gantt-print-table gantt-print-list-table w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Project
                  </th>
                  <th className="border border-slate-300 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Phase
                  </th>
                  <th className="border border-slate-300 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Start
                  </th>
                  <th className="border border-slate-300 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
                    End
                  </th>
                  <th className="border border-slate-300 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Duration
                  </th>
                </tr>
              </thead>
              <tbody>
                {projectsToPrint.map((project) => {
                  const phases = project.phases || []
                  const projectDuration = differenceInDays(parseISO(project.end_date), parseISO(project.start_date)) + 1

                  if (phases.length === 0) {
                    return (
                      <tr key={project.id}>
                        <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-900">
                          {project.name}
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-slate-500">
                          No phases
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-slate-700">
                          {formatDate(project.start_date, 'MMM d, yyyy')}
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-slate-700">
                          {formatDate(project.end_date, 'MMM d, yyyy')}
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-slate-700">
                          {projectDuration} days
                        </td>
                      </tr>
                    )
                  }

                  return phases.map((phase, phaseIndex) => {
                    const phaseDuration = differenceInDays(parseISO(phase.end_date), parseISO(phase.start_date)) + 1

                    return (
                      <tr key={phase.id}>
                        <td className="border border-slate-300 px-3 py-2 align-top text-slate-900">
                          {phaseIndex === 0 ? (
                            <div>
                              <div className="font-semibold">{project.name}</div>
                              <div className="mt-1 text-xs text-slate-500">
                                {formatDate(project.start_date, 'MMM d')} - {formatDate(project.end_date, 'MMM d, yyyy')}
                              </div>
                            </div>
                          ) : null}
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-slate-800">
                          {phase.name}
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-slate-700">
                          {formatDate(phase.start_date, 'MMM d, yyyy')}
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-slate-700">
                          {formatDate(phase.end_date, 'MMM d, yyyy')}
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-slate-700">
                          {phaseDuration} days
                        </td>
                      </tr>
                    )
                  })
                })}
              </tbody>
            </table>
          </div>
        )}

        {style === 'chart' && projectsToPrint.length > 0 && (
          <div className="gantt-print-scroll gantt-print-chart-scroll px-8 py-6">
            <table
              className="gantt-print-table gantt-print-chart-table border-collapse"
              style={{ minWidth: SIDEBAR_WIDTH + totalWidth }}
            >
              <thead>
                <tr>
                  <th
                    className="gantt-print-sidebar-cell border border-slate-300 bg-slate-100 px-5 py-3 text-left text-sm font-semibold text-slate-900"
                    style={{ width: SIDEBAR_WIDTH, minWidth: SIDEBAR_WIDTH }}
                  >
                    Projects & Phases
                  </th>
                  <th className="gantt-print-timeline-cell border border-slate-300 bg-slate-50 p-0">
                    <div className="relative" style={{ width: totalWidth, minWidth: totalWidth, height: HEADER_HEIGHT }}>
                      {timelineSegments.map((segment) => (
                        <div
                          key={segment.key}
                          className="absolute bottom-0 top-0 flex items-center justify-center border-r border-slate-300 px-2 text-xs font-semibold text-slate-700"
                          style={{ left: segment.left, width: segment.width }}
                        >
                          {segment.label}
                        </div>
                      ))}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {chartRows.map((row) => {
                  const bar = getClippedBarPosition(row.startDate, row.endDate, viewStart, viewEnd, pixelsPerDay)
                  const rowHeight = row.kind === 'project' ? PROJECT_ROW_HEIGHT : ROW_HEIGHT
                  const barWidth = row.kind === 'project'
                    ? bar.clippedStart || bar.clippedEnd
                      ? bar.width
                      : Math.max(bar.width, 44)
                    : bar.clippedStart || bar.clippedEnd
                      ? bar.width
                      : Math.max(bar.width, 24)

                  return (
                    <tr key={row.key}>
                      <td
                        className={`border border-slate-200 align-middle text-slate-800 ${row.kind === 'project' ? 'bg-slate-50 px-5' : 'bg-white px-5 pl-8'}`}
                        style={{ height: rowHeight }}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={row.kind === 'project' ? 'h-4 w-4 rounded-md' : 'h-3 w-3 rounded-sm'}
                            style={{ backgroundColor: row.color }}
                          />
                          <span className={row.kind === 'project' ? 'text-sm font-semibold' : 'text-xs font-medium'}>
                            {row.label}
                          </span>
                        </div>
                      </td>
                      <td className={`gantt-print-timeline-cell border border-slate-200 p-0 ${row.kind === 'project' ? 'bg-slate-50' : 'bg-white'}`}>
                        <div className="relative" style={{ width: totalWidth, minWidth: totalWidth, height: rowHeight }}>
                          {timelineSegments.map((segment) => (
                            <div
                              key={`${row.key}-${segment.key}`}
                              className={`absolute bottom-0 top-0 border-r ${row.kind === 'project' ? 'border-slate-200' : 'border-slate-100'}`}
                              style={{ left: segment.left, width: segment.width }}
                            />
                          ))}

                          {bar.width > 0 && (
                            <div
                              className={`absolute top-1/2 flex -translate-y-1/2 items-center px-3 text-xs font-semibold text-white shadow-sm ${
                                bar.clippedStart ? '' : 'rounded-l-lg'
                              } ${bar.clippedEnd ? '' : 'rounded-r-lg'}`}
                              style={{
                                left: bar.left,
                                width: barWidth,
                                height: rowHeight - (row.kind === 'project' ? 14 : 10),
                                backgroundColor: row.color,
                              }}
                            >
                              {barWidth > 96 ? (
                                <span className="truncate">{row.label}</span>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        @page {
          size: landscape;
          margin: 0.5in;
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
            width: auto !important;
            overflow: visible !important;
            background: white !important;
          }

          body * {
            visibility: hidden !important;
          }

          .gantt-print-root,
          .gantt-print-root * {
            visibility: visible !important;
          }

          .gantt-print-root {
            position: absolute !important;
            inset: 0 !important;
            overflow: visible !important;
            height: auto !important;
            width: 100% !important;
            background: white !important;
          }

          .gantt-print-sheet {
            width: 100% !important;
            max-width: none !important;
            min-height: 0 !important;
            box-shadow: none !important;
          }

          .gantt-print-header {
            padding: 0 0 12pt !important;
            margin-bottom: 12pt !important;
            break-after: avoid !important;
            page-break-after: avoid !important;
          }

          .gantt-print-header h1 {
            font-size: 18pt !important;
          }

          .gantt-print-header p {
            font-size: 10pt !important;
          }

          .gantt-print-scroll {
            max-width: 100% !important;
            overflow: visible !important;
            padding: 0 !important;
          }

          .gantt-print-table {
            border-collapse: collapse !important;
            font-size: 10pt !important;
            max-width: 100% !important;
          }

          .gantt-print-chart-table {
            transform: scale(0.72);
            transform-origin: top left;
          }

          .gantt-print-chart-scroll {
            width: calc(100% / 0.72) !important;
          }

          .gantt-print-table thead {
            display: table-header-group !important;
          }

          .gantt-print-table tfoot {
            display: table-footer-group !important;
          }

          .gantt-print-table tr,
          .gantt-print-table td,
          .gantt-print-table th {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .gantt-print-list-table {
            width: 100% !important;
            table-layout: fixed !important;
            font-size: 9pt !important;
          }

          .gantt-print-list-table th,
          .gantt-print-list-table td {
            overflow-wrap: anywhere !important;
            padding: 5pt 6pt !important;
          }

          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  )
}

function buildChartRows(projects: Project[], collapsedProjects: Set<string>): ChartPrintRow[] {
  return projects.flatMap((project) => {
    const rows: ChartPrintRow[] = [
      {
        key: `project-${project.id}`,
        kind: 'project',
        label: project.name,
        color: project.color,
        startDate: project.start_date,
        endDate: project.end_date,
      },
    ]

    if (!collapsedProjects.has(project.id)) {
      rows.push(
        ...(project.phases || []).map((phase) => ({
          key: `phase-${phase.id}`,
          kind: 'phase' as const,
          label: phase.name,
          color: phase.color || '#6366f1',
          startDate: phase.start_date,
          endDate: phase.end_date,
        }))
      )
    }

    return rows
  })
}

function getPrintTimelineSegments(
  zoom: ZoomLevel,
  viewStart: Date,
  viewEnd: Date,
  pixelsPerDay: number
): TimelineSegment[] {
  const headers = getTimelineHeaders(zoom, viewStart, viewEnd)

  return headers.map((header, index) => {
    const nextDate = headers[index + 1]?.date ?? addDays(viewEnd, 1)
    const left = differenceInDays(header.date, viewStart) * pixelsPerDay
    const width = Math.max(differenceInDays(nextDate, header.date) * pixelsPerDay, pixelsPerDay)

    return {
      key: `${format(header.date, 'yyyy-MM-dd')}-${index}`,
      label: zoom === 'day' ? format(header.date, 'MMM d') : header.label,
      left,
      width,
    }
  })
}
