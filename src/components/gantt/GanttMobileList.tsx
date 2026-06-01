'use client'

import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import {
  PHASE_STATUS_COLORS,
  PHASE_STATUS_LABELS,
  PROJECT_STATUS_COLORS,
  PROJECT_STATUS_LABELS,
} from '@/lib/constants'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { Phase, PhaseStatus, Project, ProjectStatus } from '@/types/app'

interface GanttMobileListProps {
  projects: Project[]
  onSelectPhase: (phase: Phase, project: Project) => void
  selectedPhaseId: string | null
}

export function GanttMobileList({ projects, onSelectPhase, selectedPhaseId }: GanttMobileListProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <p className="text-sm text-slate-500">No projects to display.</p>
        <Link href="/app/projects/new" className="text-sm font-medium text-indigo-600 hover:underline">
          Create a project →
        </Link>
      </div>
    )
  }

  return (
    <div className="divide-y divide-slate-100">
      {projects.map((project) => {
        const isCollapsed = collapsed.has(project.id)
        const phases = project.phases || []

        return (
          <div key={project.id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 bg-slate-50 px-4 py-3 text-left active:bg-slate-100"
              onClick={() => toggle(project.id)}
            >
              <span className="flex-shrink-0 text-slate-400">
                {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              </span>
              <span
                className="h-3 w-3 flex-shrink-0 rounded-full"
                style={{ backgroundColor: project.color }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{project.name}</p>
                <p className="text-xs text-slate-400">
                  {formatDate(project.start_date, 'MMM d')} – {formatDate(project.end_date, 'MMM d, yyyy')}
                  {project.customer_name ? ` · ${project.customer_name}` : ''}
                </p>
              </div>
              <Badge
                className={cn(
                  'flex-shrink-0 text-[10px]',
                  PROJECT_STATUS_COLORS[project.status as ProjectStatus]
                )}
              >
                {PROJECT_STATUS_LABELS[project.status as ProjectStatus]}
              </Badge>
            </button>

            {!isCollapsed && (
              <div className="divide-y divide-slate-100 bg-white">
                {phases.length === 0 && (
                  <p className="px-10 py-3 text-xs text-slate-400">No phases</p>
                )}
                {phases.map((phase) => {
                  const barColor = phase.color || PHASE_STATUS_COLORS[phase.status as PhaseStatus]
                  const isSelected = selectedPhaseId === phase.id

                  return (
                    <button
                      key={phase.id}
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-indigo-50',
                        isSelected && 'bg-indigo-50'
                      )}
                      onClick={() => onSelectPhase(phase, project)}
                    >
                      <span className="w-6 flex-shrink-0" />
                      <span
                        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: barColor }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-800">{phase.name}</p>
                        <p className="text-xs text-slate-400">
                          {formatDate(phase.start_date, 'MMM d')} – {formatDate(phase.end_date, 'MMM d, yyyy')}
                        </p>
                      </div>
                      <Badge className="flex-shrink-0 text-[10px]">
                        {PHASE_STATUS_LABELS[phase.status as PhaseStatus]}
                      </Badge>
                    </button>
                  )
                })}
                <div className="px-10 py-2">
                  <Link
                    href={`/app/projects/${project.id}`}
                    className="text-xs font-medium text-indigo-600 hover:underline"
                  >
                    Open project →
                  </Link>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
