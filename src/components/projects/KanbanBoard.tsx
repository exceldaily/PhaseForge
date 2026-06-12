'use client'

import { useMemo, useState } from 'react'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Settings2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { KANBAN_COLUMNS } from '@/lib/constants'
import { getProjectBoardState } from '@/lib/projectBoard'
import { isMissingUpdatedByColumnError } from '@/lib/projectAudit'
import { ProjectBoardCard, type ProjectBoardStageOption } from '@/components/projects/ProjectBoardCard'
import { cn } from '@/lib/utils'
import { Project, ProjectStatus } from '@/types/app'
import { useRouter } from 'next/navigation'

const VALID_STATUSES = new Set(KANBAN_COLUMNS.map((column) => column.status))

interface ColumnConfig {
  status: ProjectStatus
  label: string
  color: string
}

interface KanbanBoardProps {
  projects: Project[]
  canEdit: boolean
  searchQuery: string
  companyId: string
  currentUserId: string
  memberMap: Record<string, string>
  selectedProjectId?: string | null
  onProjectClick?: (projectId: string) => void
}

const COLUMN_COLORS = [
  '#f43f5e', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#10b981', '#06b6d4', '#6366f1',
  '#8b5cf6', '#ec4899', '#64748b', '#0f172a',
]

function useColumnConfig(companyId: string) {
  const key = `kanban_columns_${companyId}`
  const [columns, setColumns] = useState<ColumnConfig[]>(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored) return JSON.parse(stored) as ColumnConfig[]
    } catch {}

    return KANBAN_COLUMNS.map((column) => ({
      status: column.status,
      label: column.label,
      color: column.color.replace('border-', '').replace('-400', ''),
    }))
  })

  const save = (nextColumns: ColumnConfig[]) => {
    setColumns(nextColumns)
    localStorage.setItem(key, JSON.stringify(nextColumns))
  }

  return { columns, save }
}

export function KanbanBoard({
  projects,
  canEdit,
  searchQuery,
  companyId,
  currentUserId,
  memberMap,
  selectedProjectId,
  onProjectClick,
}: KanbanBoardProps) {
  const router = useRouter()
  const { columns, save } = useColumnConfig(companyId)
  const [showColSettings, setShowColSettings] = useState(false)
  const [projectOverrides, setProjectOverrides] = useState<Record<string, Partial<Project>>>({})
  const [deletedProjectIds, setDeletedProjectIds] = useState<string[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)

  const visibleProjects = useMemo(() => {
    return projects
      .filter((project) => !deletedProjectIds.includes(project.id))
      .map((project) => ({
        ...project,
        ...projectOverrides[project.id],
      }))
  }, [deletedProjectIds, projectOverrides, projects])

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return visibleProjects

    const query = searchQuery.toLowerCase()
    return visibleProjects.filter((project) =>
      project.name.toLowerCase().includes(query) ||
      (project.customer_name?.toLowerCase().includes(query)) ||
      (project.job_location?.toLowerCase().includes(query))
    )
  }, [searchQuery, visibleProjects])

  const activeProject =
    filteredProjects.find((project) => project.id === activeProjectId) ||
    visibleProjects.find((project) => project.id === activeProjectId) ||
    null

  const stageOptions = useMemo<ProjectBoardStageOption[]>(
    () => columns.map((column) => ({ id: column.status, label: column.label })),
    [columns]
  )

  const persistStatusChange = async (projectId: string, nextStatus: ProjectStatus) => {
    const previousProject = visibleProjects.find((project) => project.id === projectId)
    const updatedAt = new Date().toISOString()

    setProjectOverrides((current) => ({
      ...current,
      [projectId]: {
        ...current[projectId],
        status: nextStatus,
        updated_at: updatedAt,
        updated_by: currentUserId,
        activity_updated_at: updatedAt,
      },
    }))

    const supabase = createClient()
    let { error } = await supabase
      .from('projects')
      .update({ status: nextStatus, updated_at: updatedAt, updated_by: currentUserId })
      .eq('id', projectId)

    if (error && isMissingUpdatedByColumnError(error)) {
      ;({ error } = await supabase
        .from('projects')
        .update({ status: nextStatus, updated_at: updatedAt })
        .eq('id', projectId))
    }

    if (error) {
      setProjectOverrides((current) => {
        const next = { ...current }
        if (previousProject) {
          next[projectId] = {
            ...next[projectId],
            status: previousProject.status,
            updated_at: previousProject.updated_at,
            updated_by: previousProject.updated_by ?? null,
            activity_updated_at: previousProject.activity_updated_at ?? previousProject.updated_at,
          }
        } else {
          delete next[projectId]
        }
        return next
      })
      alert('Failed to update project status. Please try again.')
    }
  }

  const handleDelete = async (projectId: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('projects').delete().eq('id', projectId)
    if (error) {
      alert('Failed to delete project. Please try again.')
      return
    }

    setDeletedProjectIds((current) => [...current, projectId])
    router.refresh()
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveProjectId(String(event.active.id))
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveProjectId(null)

    const projectId = String(event.active.id)
    const rawStatus = event.over ? String(event.over.id) : null
    if (!rawStatus || !VALID_STATUSES.has(rawStatus as ProjectStatus)) return
    const nextStatus = rawStatus as ProjectStatus

    const currentProject = visibleProjects.find((project) => project.id === projectId)
    if (!currentProject || currentProject.status === nextStatus) return

    await persistStatusChange(projectId, nextStatus)
  }

  const updateColLabel = (status: ProjectStatus, label: string) => {
    save(columns.map((column) => (column.status === status ? { ...column, label } : column)))
  }

  const updateColColor = (status: ProjectStatus, color: string) => {
    save(columns.map((column) => (column.status === status ? { ...column, color } : column)))
  }

  return (
    <div className="relative space-y-4">
      <div className="flex items-center justify-end">
        <button
          onClick={() => setShowColSettings((current) => !current)}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
            showColSettings
              ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
              : 'border-slate-200 bg-white text-slate-500 hover:text-slate-800'
          )}
        >
          <Settings2 size={13} /> Customize columns
        </button>
      </div>

      {showColSettings && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-4 text-sm font-semibold text-slate-800">Column names &amp; colors</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {columns.map((column) => (
              <div key={column.status} className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="h-1.5 w-full rounded-full" style={{ backgroundColor: column.color }} />
                <input
                  value={column.label}
                  onChange={(event) => updateColLabel(column.status, event.target.value)}
                  className="w-full border-0 bg-transparent px-1 text-xs font-semibold text-slate-800 focus:rounded focus:border focus:border-indigo-300 focus:bg-white focus:outline-none"
                />
                <div className="flex flex-wrap gap-1">
                  {COLUMN_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => updateColColor(column.status, color)}
                      className="h-4 w-4 rounded-full border-2 transition-all"
                      style={{
                        backgroundColor: color,
                        borderColor: column.color === color ? '#0f172a' : 'transparent',
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-5 overflow-x-auto pb-6" style={{ minHeight: 'calc(100vh - 280px)' }}>
          {columns.map((column) => {
            const columnProjects = filteredProjects.filter((project) => project.status === column.status)

            return (
              <KanbanColumn
                key={column.status}
                column={column}
                allColumns={columns}
                projects={columnProjects}
                canEdit={canEdit}
                memberMap={memberMap}
                activeProjectId={activeProjectId}
                onStatusChange={persistStatusChange}
                onDelete={handleDelete}
                onProjectClick={onProjectClick}
                selectedProjectId={selectedProjectId ?? null}
                stageOptions={stageOptions}
              />
            )
          })}
        </div>

        <DragOverlay>
          {activeProject ? (
            <div className="w-[320px] rotate-1 opacity-95">
              <ProjectBoardCard
                project={activeProject}
                canEdit={false}
                memberMap={memberMap}
                stageLabel={columns.find((column) => column.status === activeProject.status)?.label ?? 'Project'}
                stageColor={columns.find((column) => column.status === activeProject.status)?.color ?? '#6366f1'}
                currentStageId={activeProject.status}
                stageOptions={stageOptions}
                isDragging
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function KanbanColumn({
  column,
  allColumns,
  projects,
  canEdit,
  memberMap,
  activeProjectId,
  onStatusChange,
  onDelete,
  onProjectClick,
  selectedProjectId,
  stageOptions,
}: {
  column: ColumnConfig
  allColumns: ColumnConfig[]
  projects: Project[]
  canEdit: boolean
  memberMap: Record<string, string>
  activeProjectId: string | null
  onStatusChange: (projectId: string, status: ProjectStatus) => Promise<void>
  onDelete: (projectId: string) => Promise<void>
  onProjectClick?: (projectId: string) => void
  selectedProjectId: string | null
  stageOptions: ProjectBoardStageOption[]
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: column.status,
    disabled: !canEdit,
  })

  const attentionCount = projects.filter((project) => getProjectBoardState(project).needsAttentionToday).length
  const delayedCount = projects.filter((project) => getProjectBoardState(project).health === 'delayed').length

  return (
    <div className="w-[320px] flex-shrink-0">
      <div
        className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        style={{ borderTop: `4px solid ${column.color}` }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-700">{column.label}</p>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {projects.length} project{projects.length === 1 ? '' : 's'}
            </p>
          </div>
          <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-slate-100 px-2 text-xs font-bold text-slate-700">
            {projects.length}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
            {attentionCount > 0 ? `${attentionCount} need attention` : 'No urgent issues'}
          </span>
          {delayedCount > 0 && (
            <span className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700">
              {delayedCount} delayed
            </span>
          )}
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'min-h-[220px] space-y-4 rounded-[28px] border border-slate-200 bg-slate-50/70 p-3 transition-all',
          isOver && activeProjectId ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-200' : ''
        )}
      >
        {projects.map((project) => (
          <DraggableKanbanCard
            key={project.id}
            project={project}
            canEdit={canEdit}
            allColumns={allColumns}
            memberMap={memberMap}
            onStatusChange={onStatusChange}
            onDelete={onDelete}
            onProjectClick={onProjectClick}
            isSelected={selectedProjectId === project.id}
            stageOptions={stageOptions}
          />
        ))}

        {projects.length === 0 && (
          <div
            className={cn(
              'rounded-2xl border-2 border-dashed p-5 text-center transition-colors',
              isOver && activeProjectId ? 'border-indigo-300 bg-white/80' : 'border-slate-200 bg-white/60'
            )}
          >
            <p className="text-xs font-medium text-slate-400">
              {isOver && activeProjectId ? 'Drop project here' : 'No projects in this stage'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function DraggableKanbanCard({
  project,
  canEdit,
  allColumns,
  memberMap,
  onStatusChange,
  onDelete,
  onProjectClick,
  isSelected,
  stageOptions,
}: {
  project: Project
  canEdit: boolean
  allColumns: ColumnConfig[]
  memberMap: Record<string, string>
  onStatusChange: (projectId: string, status: ProjectStatus) => Promise<void>
  onDelete: (projectId: string) => Promise<void>
  onProjectClick?: (projectId: string) => void
  isSelected: boolean
  stageOptions: ProjectBoardStageOption[]
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: project.id,
    disabled: !canEdit,
  })

  const stage = allColumns.find((column) => column.status === project.status)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(isDragging && 'opacity-40')}
    >
      <ProjectBoardCard
        project={project}
        canEdit={canEdit}
        memberMap={memberMap}
        stageLabel={stage?.label ?? 'Project'}
        stageColor={stage?.color ?? '#6366f1'}
        currentStageId={project.status}
        stageOptions={stageOptions}
        onStageChange={(projectId, stageId) => onStatusChange(projectId, stageId as ProjectStatus)}
        onDelete={onDelete}
        onCardClick={onProjectClick}
        dragHandle={{ attributes, listeners }}
        isSelected={isSelected}
      />
    </div>
  )
}
