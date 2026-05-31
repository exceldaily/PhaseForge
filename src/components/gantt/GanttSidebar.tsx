'use client'

import type { MutableRefObject, UIEvent } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { PHASE_STATUS_COLORS, PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS } from '@/lib/constants'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { Project, ProjectStatus, PhaseStatus } from '@/types/app'
import { useGanttStore } from '@/stores/ganttStore'

interface GanttSidebarProps {
  projects: Project[]
  headerHeight: number
  rowHeight: number
  projectRowHeight: number
  rowsRef: MutableRefObject<HTMLDivElement | null>
  onRowsScroll: (event: UIEvent<HTMLDivElement>) => void
}

const SIDEBAR_WIDTH = 280

export function GanttSidebar({
  projects,
  headerHeight,
  rowHeight,
  projectRowHeight,
  rowsRef,
  onRowsScroll,
}: GanttSidebarProps) {
  const { collapsedProjects, toggleProjectCollapse, selectedPhaseId, setSelectedPhase, selectedProjectId, setSelectedProject } = useGanttStore()

  return (
    <div
      className="flex flex-shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-gradient-to-b from-white to-slate-50/30"
      style={{ width: SIDEBAR_WIDTH }}
    >
      <div
        className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-gradient-to-r from-white to-slate-50 px-4 shadow-sm"
        style={{ height: headerHeight }}
      >
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Projects & Phases</span>
        <div className="flex gap-1">
          <button
            onClick={() => projects.forEach(p => collapsedProjects.has(p.id) && toggleProjectCollapse(p.id))}
            title="Expand all"
            className="rounded px-2 py-0.5 text-xs font-semibold text-slate-500 hover:bg-indigo-100 hover:text-indigo-700 transition-colors"
          >
            +
          </button>
          <button
            onClick={() => projects.forEach(p => !collapsedProjects.has(p.id) && toggleProjectCollapse(p.id))}
            title="Collapse all"
            className="rounded px-2 py-0.5 text-xs font-semibold text-slate-500 hover:bg-indigo-100 hover:text-indigo-700 transition-colors"
          >
            −
          </button>
        </div>
      </div>

      <div ref={rowsRef} onScroll={onRowsScroll} className="flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-white to-slate-50/40">
        {projects.map((project) => {
          const isCollapsed = collapsedProjects.has(project.id)
          const phases = project.phases || []
          const projectMeta = [
            project.customer_name,
            `${formatDate(project.start_date, 'MMM d')} - ${formatDate(project.end_date, 'MMM d')}`,
            `${phases.length} phase${phases.length === 1 ? '' : 's'}`,
          ]
            .filter(Boolean)
            .join(' • ')

          return (
            <div key={project.id}>
              <div
                className="cursor-pointer border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-50/30 px-3 transition-all hover:bg-indigo-50/40 hover:border-slate-200"
                style={{ height: projectRowHeight }}
                onClick={() => {
                  toggleProjectCollapse(project.id)
                  setSelectedProject(project.id)
                }}
              >
                <div className="flex h-full items-center gap-2">
                  <div className="flex-shrink-0 text-slate-400">
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </div>
                  <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/app/projects/${project.id}`}
                      onClick={(event) => event.stopPropagation()}
                      className="block truncate text-sm font-semibold text-slate-800 transition-colors hover:text-indigo-600"
                    >
                      {project.name}
                    </Link>
                    <p className="truncate text-[11px] text-slate-400">{projectMeta}</p>
                  </div>
                  <Badge className={cn('flex-shrink-0 text-[10px]', PROJECT_STATUS_COLORS[project.status as ProjectStatus])}>
                    {PROJECT_STATUS_LABELS[project.status as ProjectStatus]}
                  </Badge>
                </div>
              </div>

              {!isCollapsed && phases.map((phase) => (
                <div
                  key={phase.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 transition-colors hover:bg-indigo-50',
                    selectedPhaseId === phase.id && 'bg-indigo-50'
                  )}
                  style={{ height: rowHeight }}
                  onClick={() => setSelectedPhase(selectedPhaseId === phase.id ? null : phase.id)}
                >
                  <div className="w-4 flex-shrink-0" />
                  <div
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: phase.color || PHASE_STATUS_COLORS[phase.status as PhaseStatus] }}
                  />
                  <span className="flex-1 truncate text-xs text-slate-700">{phase.name}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
