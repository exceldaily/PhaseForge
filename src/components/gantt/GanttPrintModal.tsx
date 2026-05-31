'use client'
import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Project, Phase } from '@/types/app'
import { differenceInDays, parseISO, format, addDays } from '@/lib/dates'
import { ZoomLevel } from '@/types/app'

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

const ROW_HEIGHT = 48
const HEADER_HEIGHT = 70
const PROJECT_ROW_HEIGHT = 52

export function GanttPrintModal({ projects, scope, zoom, collapsedProjects, style, selectedProjectId, viewStart, viewEnd, onClose }: GanttPrintModalProps) {
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // DEBUG: Log all projects and their phases
    console.log('===== PRINT MODAL DEBUG =====')
    console.log('Total projects:', projects.length)
    console.log('Scope:', scope)
    projects.forEach((p, idx) => {
      console.log(`Project ${idx + 1}: ${p.name}`)
      console.log(`  - Phases count: ${p.phases?.length || 0}`)
      console.log(`  - Phases:`, p.phases)
    })
    console.log('============================')

    const timer = setTimeout(() => {
      window.print()
    }, 1000)
    return () => clearTimeout(timer)
  }, [])

  // Determine pixels per day and header interval based on zoom level
  const pixelsPerDay = zoom === 'day' ? 24 : zoom === 'week' ? 20 : zoom === 'month' ? 18 : 16
  const headerInterval = zoom === 'day' ? 1 : zoom === 'week' ? 7 : zoom === 'month' ? 30 : 90

  const projectsToPrint = scope === 'all'
    ? projects
    : selectedProjectId
      ? projects.filter(p => p.id === selectedProjectId)
      : projects.slice(0, 1)

  // Use the current view range from the Gantt chart
  const startDate = viewStart
  const endDate = viewEnd
  const totalDays = differenceInDays(endDate, startDate) + 1
  const totalWidth = totalDays * pixelsPerDay

  // Generate timeline headers based on zoom level
  const headers: { date: Date; label: string; weekStart: boolean }[] = []
  for (let i = 0; i < totalDays; i += headerInterval) {
    const headerDate = addDays(startDate, i)
    const label = zoom === 'day' ? format(headerDate, 'MMM d') :
                  zoom === 'week' ? format(headerDate, 'MMM d') :
                  zoom === 'month' ? format(headerDate, 'MMM yyyy') :
                  format(headerDate, 'MMM yyyy')
    headers.push({
      date: headerDate,
      label,
      weekStart: true,
    })
  }

  const getBarPosition = (start: string, end: string) => {
    const phStart = parseISO(start)
    const phEnd = parseISO(end)
    const left = differenceInDays(phStart, startDate) * pixelsPerDay
    const width = Math.max(differenceInDays(phEnd, phStart) + 1, 1) * pixelsPerDay
    return { left, width }
  }

  return (
    <div
      ref={printRef}
      className="fixed inset-0 bg-white overflow-auto print:static print:inset-auto print:h-auto print:overflow-visible"
      style={{ zIndex: 9999 }}
    >
      <div className="print:hidden absolute top-4 right-4 z-50">
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-100 rounded-lg bg-white border border-slate-300"
        >
          <X size={20} />
        </button>
      </div>

      {/* Main Content */}
      <div className="bg-white text-black">
        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b-2 border-slate-300 border-solid">
          <h1 className="text-3xl font-bold text-black mb-2">{style === 'chart' ? 'Gantt Chart' : 'Project Schedule'}</h1>
          <p className="text-base text-black mb-1">
            {scope === 'all' ? 'All Projects' : 'Current Project'}
          </p>
          <p className="text-sm text-black">
            {format(startDate, 'MMM d, yyyy')} – {format(endDate, 'MMM d, yyyy')}
          </p>
          {/* DEBUG INFO */}
          <p className="text-xs text-red-600 mt-2 print:hidden">
            DEBUG: {projectsToPrint.length} projects total | Scope: {scope} | Style: {style}
            {projectsToPrint.map(p => ` | ${p.name}: ${p.phases?.length || 0} phases`).join('')}
          </p>
        </div>

        {projectsToPrint.length === 0 && (
          <div className="px-8 py-12 text-center">
            <p className="text-slate-500">No projects to print</p>
          </div>
        )}

        {/* List Style */}
        {style === 'list' && (
          <div className="px-8 py-6">
            {/* DETAILED DEBUG */}
            <div className="mb-4 p-4 bg-yellow-100 border-2 border-red-500 print:hidden">
              <p className="text-xs font-bold">DETAILED DEBUG:</p>
              <p className="text-xs">projectsToPrint length: {projectsToPrint.length}</p>
              {projectsToPrint.map(p => (
                <div key={p.id} className="text-xs ml-4 border-l-2 border-gray-400 pl-2">
                  <p>{p.name}</p>
                  <p className="text-gray-600">phases array exists: {p.phases ? 'YES' : 'NO'}</p>
                  <p className="text-gray-600">phases length: {p.phases?.length || 'undefined'}</p>
                  {p.phases && p.phases.length > 0 && (
                    <p className="text-gray-600">first phase: {p.phases[0].name}</p>
                  )}
                </div>
              ))}
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-black">
                  <th className="text-left px-3 py-3 font-bold text-black border border-black">Project</th>
                  <th className="text-left px-3 py-3 font-bold text-black border border-black">Phase</th>
                  <th className="text-left px-3 py-3 font-bold text-black border border-black">Start Date</th>
                  <th className="text-left px-3 py-3 font-bold text-black border border-black">End Date</th>
                  <th className="text-left px-3 py-3 font-bold text-black border border-black">Duration</th>
                </tr>
              </thead>
              <tbody>
                {projectsToPrint.map((project) => (
                  <React.Fragment key={project.id}>
                    {/* Project Row */}
                    <tr className="border-b border-black">
                      <td className="px-3 py-2 font-bold text-black border border-black">{project.name}</td>
                      <td colSpan={4} className="px-3 py-2 text-sm text-black border border-black"></td>
                    </tr>

                    {/* Phase Rows for this Project */}
                    {(project.phases || []).length > 0 && (
                      <tr className="border-b-2 border-black bg-gray-200">
                        <td className="px-3 py-2 text-black text-xs font-bold border border-black" colSpan={5}>
                          ↓ {project.name} ({(project.phases || []).length} phases) ↓
                        </td>
                      </tr>
                    )}
                    {(project.phases || []).map((phase) => {
                      try {
                        const phStart = parseISO(phase.start_date)
                        const phEnd = parseISO(phase.end_date)
                        const duration = differenceInDays(phEnd, phStart) + 1
                        return (
                          <tr key={phase.id} className="border-b border-black">
                            <td className="px-3 py-2 text-black border border-black"></td>
                            <td className="px-3 py-2 text-black border border-black">{phase.name}</td>
                            <td className="px-3 py-2 text-black text-sm border border-black">{format(phStart, 'MMM d, yyyy')}</td>
                            <td className="px-3 py-2 text-black text-sm border border-black">{format(phEnd, 'MMM d, yyyy')}</td>
                            <td className="px-3 py-2 text-black text-sm border border-black">{duration} days</td>
                          </tr>
                        )
                      } catch (error) {
                        console.error(`Error rendering phase for ${project.name}:`, error, phase)
                        return (
                          <tr key={phase.id} className="border-b border-black bg-red-200">
                            <td className="px-3 py-2 text-red-700 border border-black" colSpan={5}>
                              ERROR: {project.name} - {phase.name}: {String(error)}
                            </td>
                          </tr>
                        )
                      }
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Gantt Container - Chart Style */}
        {style === 'chart' && (
        <div className="flex bg-white">
          {/* Sidebar */}
          <div className="w-80 flex-shrink-0 border-r-2 border-slate-300 bg-slate-50">
            {/* Header */}
            <div
              className="border-b-2 border-slate-300 bg-slate-100 px-6 font-bold text-slate-800 text-sm"
              style={{ height: HEADER_HEIGHT }}
            >
              <div className="flex items-center h-full">Projects & Phases</div>
            </div>

            {/* Content */}
            <div>
              {projectsToPrint.map((project) => (
                <div key={project.id}>
                  {/* Project Row */}
                  <div
                    className="border-b border-slate-300 bg-slate-100 px-6 font-bold text-slate-900 flex items-center gap-3"
                    style={{ height: PROJECT_ROW_HEIGHT }}
                  >
                    <div
                      className="w-4 h-4 rounded-md flex-shrink-0"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="text-sm">{project.name}</span>
                  </div>

                  {/* Phase Rows */}
                  {!collapsedProjects.has(project.id) && (project.phases || []).map((phase) => (
                    <div
                      key={phase.id}
                      className="border-b border-slate-200 px-6 flex items-center gap-3 bg-white"
                      style={{ height: ROW_HEIGHT }}
                    >
                      <div
                        className="w-3 h-3 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: phase.color || '#6366f1' }}
                      />
                      <span className="text-xs text-slate-700 font-medium truncate">
                        {phase.name}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div className="flex-1 overflow-x-auto bg-white">
            {/* Header */}
            <div className="flex border-b-2 border-slate-300 bg-slate-50">
              {headers.map((header, idx) => (
                <div
                  key={idx}
                  className="border-r border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 flex items-center justify-center flex-shrink-0"
                  style={{ width: pixelsPerDay * headerInterval, minWidth: pixelsPerDay * headerInterval }}
                >
                  {header.label}
                </div>
              ))}
            </div>

            {/* Grid */}
            <div style={{ width: totalWidth, minWidth: '100%' }}>
              {projectsToPrint.map((project) => (
                <div key={project.id}>
                  {/* Project Row */}
                  <div
                    className="border-b border-slate-300 bg-slate-50 relative"
                    style={{ height: PROJECT_ROW_HEIGHT }}
                  >
                    {headers.map((_, idx) => (
                      <div
                        key={idx}
                        className="absolute top-0 bottom-0 border-r border-slate-300"
                        style={{ left: idx * pixelsPerDay * headerInterval, width: pixelsPerDay * headerInterval }}
                      />
                    ))}

                    {/* Project bar */}
                    {(() => {
                      const { left, width } = getBarPosition(project.start_date, project.end_date)
                      return width > 0 ? (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 rounded-lg shadow-md flex items-center px-3 font-semibold text-white text-xs"
                          style={{
                            left,
                            width: Math.max(width, 50),
                            height: PROJECT_ROW_HEIGHT - 10,
                            backgroundColor: project.color,
                          }}
                        >
                          {width > 80 && <span className="truncate">{project.name}</span>}
                        </div>
                      ) : null
                    })()}
                  </div>

                  {/* Phase Rows */}
                  {!collapsedProjects.has(project.id) && (project.phases || []).map((phase) => {
                    const { left, width } = getBarPosition(phase.start_date, phase.end_date)
                    return (
                      <div
                        key={phase.id}
                        className="border-b border-slate-200 bg-white relative"
                        style={{ height: ROW_HEIGHT }}
                      >
                        {/* Grid lines */}
                        {headers.map((_, idx) => (
                          <div
                            key={idx}
                            className="absolute top-0 bottom-0 border-r border-slate-200"
                            style={{ left: idx * pixelsPerDay * headerInterval, width: pixelsPerDay * headerInterval }}
                          />
                        ))}

                        {/* Bar */}
                        {width > 0 && (
                          <div
                            className="absolute top-1/2 -translate-y-1/2 rounded-lg shadow-md flex items-center px-3 font-semibold text-white text-xs"
                            style={{
                              left,
                              width: Math.max(width, 50),
                              height: ROW_HEIGHT - 10,
                              backgroundColor: phase.color || '#6366f1',
                            }}
                          >
                            {width > 80 && <span className="truncate">{phase.name}</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            margin: 0;
            padding: 0;
            background: white;
            height: auto !important;
            overflow: visible !important;
            width: 100%;
          }
          body {
            margin: 0;
            padding: 0;
          }
          div[style*="zIndex"] {
            position: static !important;
            inset: auto !important;
            height: auto !important;
            overflow: visible !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          @page {
            size: landscape !important;
            margin: 0.25in !important;
          }
          table {
            font-size: 11px !important;
            page-break-inside: auto;
            width: 100%;
          }
          tr {
            page-break-inside: avoid;
          }
          th, td {
            padding: 3px 2px !important;
            page-break-inside: avoid;
          }
          h1 {
            font-size: 16px !important;
            margin: 0.2in 0 !important;
            page-break-after: avoid;
          }
          p {
            font-size: 12px !important;
            margin: 0.1in 0 !important;
            page-break-after: avoid;
          }
        }
      `}</style>
    </div>
  )
}
