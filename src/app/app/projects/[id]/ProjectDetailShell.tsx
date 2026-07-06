'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, GanttChartSquare, CheckSquare,
  Activity, Paperclip, Edit, MoreHorizontal,
  MapPin, Calendar, User, Flag, ClipboardList,
} from 'lucide-react'
import { GanttChart } from '@/components/gantt/GanttChart'
import { ProjectCalendarSyncBar } from '@/components/gantt/ProjectCalendarSyncBar'
import { PhaseList } from '@/components/phases/PhaseList'
import { Badge } from '@/components/ui/Badge'
import { DeleteProjectButton } from '@/components/projects/DeleteProjectButton'
import { ActivityTimeline } from '@/components/projects/ActivityTimeline'
import { ProjectAttachments } from '@/components/projects/ProjectAttachments'
import { PunchListTab } from '@/components/punch/PunchListTab'
import { PRIORITY_LABELS, PRIORITY_COLORS } from '@/lib/constants'
import { formatDate } from '@/lib/dates'
import { getProjectProgressFromPhases } from '@/lib/phaseProgress'
import { Phase, Profile, Project, ProjectPriority, ActivityLog, ProjectAttachment, PunchItem } from '@/types/app'
import { cn } from '@/lib/utils'

type Tab = 'gantt' | 'tasks' | 'punch' | 'activity' | 'files'

interface ProjectDetailShellProps {
  project: Project & { phases: Phase[] }
  members: Profile[]
  activityLogs: ActivityLog[]
  attachments: ProjectAttachment[]
  punchItems: PunchItem[]
  currentUserId: string
  companyId: string
  canEdit: boolean
  canPrint: boolean
  initialTab?: Tab
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'gantt',    label: 'Gantt',      icon: <GanttChartSquare size={15} /> },
  { id: 'tasks',    label: 'Tasks',      icon: <CheckSquare size={15} /> },
  { id: 'punch',    label: 'Punch List', icon: <ClipboardList size={15} /> },
  { id: 'activity', label: 'Activity',   icon: <Activity size={15} /> },
  { id: 'files',    label: 'Files',      icon: <Paperclip size={15} /> },
]

export function ProjectDetailShell({
  project, members, activityLogs, attachments, punchItems, currentUserId, companyId,
  canEdit, canPrint,
  initialTab = 'gantt',
}: ProjectDetailShellProps) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
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
              href="/app/projects"
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0"
            >
              <ArrowLeft size={15} />
              Projects
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
              {tab.id === 'punch' && punchItems.length > 0 && (
                <span className="ml-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                  {punchItems.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}

      {/* GANTT — fills remaining height */}
      {isGantt && (
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
          {canEdit && <ProjectCalendarSyncBar projectId={project.id} />}
          <div className="flex-1 min-h-0 overflow-hidden">
            <GanttChart
              projects={[project]}
              companyId={companyId}
              members={members}
              currentUserId={currentUserId}
              canEdit={canEdit}
              canPrint={canPrint}
            />
          </div>
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

      {/* PUNCH LIST */}
      {activeTab === 'punch' && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6">
            <PunchListTab
              project={project}
              items={punchItems}
              members={members}
              currentUserId={currentUserId}
              canEdit={canEdit}
              canPrint={canPrint}
            />
          </div>
        </div>
      )}

      {/* ACTIVITY */}
      {activeTab === 'activity' && (
        <div className="flex-1 overflow-hidden">
          <div className="max-w-3xl mx-auto h-full flex flex-col p-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Project Edit History</h2>
            <ActivityTimeline logs={activityLogs} members={Object.fromEntries(members.map(m => [m.id, m.full_name]))} />
          </div>
        </div>
      )}

      {/* FILES */}
      {activeTab === 'files' && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-6">
            <ProjectAttachments
              projectId={project.id}
              attachments={attachments}
              canEdit={canEdit}
              memberMap={Object.fromEntries(members.map(m => [m.id, m.full_name]))}
            />
          </div>
        </div>
      )}
    </div>
  )
}
