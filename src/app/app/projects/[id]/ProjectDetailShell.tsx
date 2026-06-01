'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, GanttChartSquare, CheckSquare,
  Activity, Paperclip, Edit, MoreHorizontal,
  MapPin, Calendar, User, Flag,
} from 'lucide-react'
import { GanttChart } from '@/components/gantt/GanttChart'
import { PhaseList } from '@/components/phases/PhaseList'
import { Badge } from '@/components/ui/Badge'
import { DeleteProjectButton } from '@/components/projects/DeleteProjectButton'
import { PRIORITY_LABELS, PRIORITY_COLORS } from '@/lib/constants'
import { formatDate } from '@/lib/dates'
import { getProjectProgressFromPhases } from '@/lib/phaseProgress'
import { Phase, Profile, Project, ProjectPriority } from '@/types/app'
import { cn } from '@/lib/utils'

type Tab = 'gantt' | 'tasks' | 'activity' | 'files'

interface ActivityLog {
  id: string
  action: string
  created_at: string
  actor?: { full_name: string; avatar_url: string | null } | null
  payload?: Record<string, unknown>
}

interface ProjectDetailShellProps {
  project: Project & { phases: Phase[] }
  members: Profile[]
  activityLogs: ActivityLog[]
  currentUserId: string
  companyId: string
  canEdit: boolean
  boardId: string | null
  boardName: string | null
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'gantt',    label: 'Gantt',     icon: <GanttChartSquare size={15} /> },
  { id: 'tasks',    label: 'Tasks',     icon: <CheckSquare size={15} /> },
  { id: 'activity', label: 'Activity',  icon: <Activity size={15} /> },
  { id: 'files',    label: 'Files',     icon: <Paperclip size={15} /> },
]

export function ProjectDetailShell({
  project, members, activityLogs, currentUserId, companyId,
  canEdit, boardId, boardName,
}: ProjectDetailShellProps) {
  const [activeTab, setActiveTab] = useState<Tab>('gantt')
  const [showMenu, setShowMenu] = useState(false)

  const isGantt = activeTab === 'gantt'
  const memberMap = Object.fromEntries(members.map(m => [m.id, m.full_name]))
  const pmName = project.project_manager
    ? (memberMap[project.project_manager] ?? project.project_manager) : null

  const progress = getProjectProgressFromPhases(project.phases)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Compact header ── */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-white">
        {/* Breadcrumb + actions */}
        <div className="flex items-center justify-between gap-3 px-6 pt-4 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href={boardId ? `/app/boards/${boardId}` : '/app/projects'}
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0"
            >
              <ArrowLeft size={15} />
              {boardName ?? 'Projects'}
            </Link>
            <span className="text-slate-300">/</span>
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
              <h1 className="text-sm font-semibold text-slate-900 truncate">{project.name}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge className={cn('text-[10px]', PRIORITY_COLORS[project.priority as ProjectPriority])}>
              {PRIORITY_LABELS[project.priority as ProjectPriority]}
            </Badge>

            {/* Progress pill */}
            {project.phases.length > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1">
                <div className="h-1.5 w-16 rounded-full bg-slate-200 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-[10px] font-semibold text-slate-600">{progress}%</span>
              </div>
            )}

            {canEdit && (
              <div className="relative">
                <button onClick={() => setShowMenu(s => !s)}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 transition-colors">
                  <MoreHorizontal size={16} />
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                      <Link href={`/app/projects/${project.id}/edit`}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        onClick={() => setShowMenu(false)}>
                        <Edit size={14} /> Edit Project
                      </Link>
                      <div className="my-1 border-t border-slate-100" />
                      <div className="px-3 py-2">
                        <DeleteProjectButton projectId={project.id} projectName={project.name} />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Project meta strip */}
        <div className="flex items-center gap-4 px-6 pb-3 text-xs text-slate-500 overflow-x-auto">
          {project.customer_name && (
            <span className="flex items-center gap-1 flex-shrink-0">
              <User size={11} className="text-slate-400" /> {project.customer_name}
            </span>
          )}
          {project.job_location && (
            <span className="flex items-center gap-1 flex-shrink-0">
              <MapPin size={11} className="text-slate-400" /> {project.job_location}
            </span>
          )}
          <span className="flex items-center gap-1 flex-shrink-0">
            <Calendar size={11} className="text-slate-400" />
            {formatDate(project.start_date, 'MMM d')} → {formatDate(project.end_date, 'MMM d, yyyy')}
          </span>
          {pmName && (
            <span className="flex items-center gap-1 flex-shrink-0">
              <Flag size={11} className="text-slate-400" /> PM: {pmName}
            </span>
          )}
          <span className="flex-shrink-0 text-slate-300">
            {project.phases.length} phase{project.phases.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 border-t border-slate-100 px-4">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'tasks' && project.phases.length > 0 && (
                <span className="ml-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                  {project.phases.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}

      {/* GANTT — fills remaining height */}
      {isGantt && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <GanttChart
            projects={[project]}
            companyId={companyId}
            members={members}
            currentUserId={currentUserId}
            canEdit={canEdit}
          />
        </div>
      )}

      {/* TASKS */}
      {activeTab === 'tasks' && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6">
            <PhaseList
              projectId={project.id}
              companyId={companyId}
              phases={project.phases}
              members={members}
              currentUserId={currentUserId}
              canEdit={canEdit}
            />
          </div>
        </div>
      )}

      {/* ACTIVITY */}
      {activeTab === 'activity' && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-700">Project Activity</h2>
            {activityLogs.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center">
                <Activity size={28} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-400 text-sm">No activity recorded yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activityLogs.map(log => (
                  <div key={log.id} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                      {log.actor?.full_name?.charAt(0) ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800">
                        <span className="font-medium">{log.actor?.full_name ?? 'Someone'}</span>
                        {' '}<span className="text-slate-500">{formatAction(log.action)}</span>
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FILES — placeholder */}
      {activeTab === 'files' && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-6">
            <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white py-20 text-center">
              <Paperclip size={32} className="mx-auto text-slate-300 mb-4" />
              <p className="text-slate-500 font-medium">File attachments coming soon</p>
              <p className="text-sm text-slate-400 mt-1">
                Upload contracts, drawings, photos, and documents directly to this project.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    'project_updated': 'updated this project',
    'phase_created':   'added a new phase',
    'phase_updated':   'updated a phase',
    'phase_deleted':   'deleted a phase',
    'project_created': 'created this project',
    'comment_added':   'left a comment',
  }
  return map[action] ?? action.replace(/_/g, ' ')
}
