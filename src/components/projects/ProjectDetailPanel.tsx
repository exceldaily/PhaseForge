'use client'

import { X, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { Project, Profile, ProjectStatus, ProjectPriority } from '@/types/app'
import { Badge } from '@/components/ui/Badge'
import { PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS } from '@/lib/constants'
import { formatDate } from '@/lib/dates'

interface ProjectDetailPanelProps {
  project: Project
  members: Pick<Profile, 'id' | 'full_name'>[]
  onClose: () => void
  canEdit: boolean
}

export function ProjectDetailPanel({ project, members, onClose, canEdit }: ProjectDetailPanelProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Side Panel */}
      <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-lg z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="h-3 w-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: project.color }}
              />
              <h2 className="font-bold text-slate-900 truncate">{project.name}</h2>
            </div>
            <p className="text-xs text-slate-400">{project.customer_name || 'No client'}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status & Priority */}
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Status</p>
              <Badge className={PROJECT_STATUS_COLORS[project.status as ProjectStatus] ?? 'bg-slate-100 text-slate-700'}>
                {PROJECT_STATUS_LABELS[project.status as ProjectStatus] ?? project.status}
              </Badge>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Priority</p>
              <Badge className={PRIORITY_COLORS[project.priority as ProjectPriority]}>
                {PRIORITY_LABELS[project.priority as ProjectPriority]}
              </Badge>
            </div>
          </div>

          {/* Location */}
          {project.job_location && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Location</p>
              <p className="text-sm text-slate-900">{project.job_location}</p>
            </div>
          )}

          {/* Dates */}
          <div className="space-y-3 pb-3 border-b border-slate-100">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Start Date</p>
              <p className="text-sm text-slate-900">{formatDate(project.start_date)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">End Date</p>
              <p className="text-sm text-slate-900">{formatDate(project.end_date)}</p>
            </div>
          </div>

          {/* Project Manager */}
          {project.project_manager && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Project Manager</p>
              <p className="text-sm text-slate-900">{project.project_manager}</p>
            </div>
          )}

          {/* Notes */}
          {project.notes && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Notes</p>
              <p className="text-sm text-slate-600 leading-relaxed">{project.notes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {canEdit && (
          <div className="sticky bottom-0 border-t border-slate-200 bg-white p-6 flex gap-3">
            <Link href={`/app/projects/${project.id}`} className="flex-1">
              <button className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                <ExternalLink size={14} />
                Full View
              </button>
            </Link>
            <Link href={`/app/projects/${project.id}/edit`} className="flex-1">
              <button className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 transition-colors">
                Edit
              </button>
            </Link>
          </div>
        )}
      </div>
    </>
  )
}
