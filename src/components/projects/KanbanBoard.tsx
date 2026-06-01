'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Edit, GanttChartSquare, GripVertical, MoreHorizontal, Settings2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/Badge'
import { KANBAN_COLUMNS, PRIORITY_COLORS, PRIORITY_LABELS } from '@/lib/constants'

const VALID_STATUSES = new Set(KANBAN_COLUMNS.map((col) => col.status))
import { formatDate } from '@/lib/dates'
import { getProjectLastUpdatedLabel, isMissingUpdatedByColumnError } from '@/lib/projectAudit'
import { cn } from '@/lib/utils'
import { Project, ProjectStatus } from '@/types/app'
import { useRouter } from 'next/navigation'

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
}

const COLUMN_COLORS = [
  '#f43f5e', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#10b981', '#06b6d4', '#6366f1',
  '#8b5cf6', '#ec4899', '#64748b', '#0f172a',
]

const PERMIT_COLORS: Record<string, string> = {
  not_required: 'bg-slate-100 text-slate-500',
  pending: 'bg-amber-100 text-amber-700',
  submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-emerald-100 text-emerald-700',
  denied: 'bg-rose-100 text-rose-700',
}

const PERMIT_LABELS: Record<string, string> = {
  not_required: 'No Permit',
  pending: 'Permit Pending',
  submitted: 'Permit Submitted',
  approved: 'Permit Approved',
  denied: 'Permit Denied',
}

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

export function KanbanBoard({ projects, canEdit, searchQuery, companyId, currentUserId, memberMap }: KanbanBoardProps) {
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
    save(columns.map((column) => column.status === status ? { ...column, label } : column))
  }

  const updateColColor = (status: ProjectStatus, color: string) => {
    save(columns.map((column) => column.status === status ? { ...column, color } : column))
  }

  return (
    <div className="relative">
      <div className="mb-3 flex items-center justify-end">
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
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
                      style={{ backgroundColor: color, borderColor: column.color === color ? '#0f172a' : 'transparent' }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-6" style={{ minHeight: 'calc(100vh - 280px)' }}>
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
              />
            )
          })}
        </div>

        <DragOverlay>
          {activeProject ? (
            <div className="w-[272px] rotate-1 opacity-95">
              <ProjectCard
                project={activeProject}
                canEdit={false}
                columns={columns}
                memberMap={memberMap}
                onStatusChange={persistStatusChange}
                onDelete={handleDelete}
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
}: {
  column: ColumnConfig
  allColumns: ColumnConfig[]
  projects: Project[]
  canEdit: boolean
  memberMap: Record<string, string>
  activeProjectId: string | null
  onStatusChange: (projectId: string, status: ProjectStatus) => Promise<void>
  onDelete: (projectId: string) => Promise<void>
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: column.status,
    disabled: !canEdit,
  })

  return (
    <div className="w-[272px] flex-shrink-0">
      <div
        className="mb-3 flex items-center justify-between rounded-xl border border-slate-200 border-t-4 bg-white px-3 py-2.5 shadow-sm"
        style={{ borderTopColor: column.color }}
      >
        <div className="flex items-center gap-2">
          <span className="max-w-[150px] truncate text-xs font-bold uppercase tracking-wide text-slate-700">{column.label}</span>
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
            {projects.length}
          </span>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'min-h-[148px] space-y-3 rounded-2xl p-2 transition-all',
          isOver && activeProjectId ? 'bg-indigo-50 ring-2 ring-indigo-200' : 'bg-transparent'
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
          />
        ))}

        {projects.length === 0 && (
          <div className={cn(
            'rounded-xl border-2 border-dashed p-4 text-center transition-colors',
            isOver && activeProjectId ? 'border-indigo-300 bg-white/80' : 'border-slate-200'
          )}>
            <p className="text-xs text-slate-400">{isOver && activeProjectId ? 'Drop project here' : 'No projects'}</p>
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
}: {
  project: Project
  canEdit: boolean
  allColumns: ColumnConfig[]
  memberMap: Record<string, string>
  onStatusChange: (projectId: string, status: ProjectStatus) => Promise<void>
  onDelete: (projectId: string) => Promise<void>
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: project.id,
    disabled: !canEdit,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(isDragging && 'opacity-40')}
    >
      <ProjectCard
        project={project}
        canEdit={canEdit}
        columns={allColumns}
        memberMap={memberMap}
        onStatusChange={onStatusChange}
        onDelete={onDelete}
        dragHandle={{ attributes, listeners }}
      />
    </div>
  )
}

function ProjectCard({
  project,
  canEdit,
  columns,
  memberMap,
  onStatusChange,
  onDelete,
  dragHandle,
  isDragging = false,
}: {
  project: Project
  canEdit: boolean
  columns: ColumnConfig[]
  memberMap: Record<string, string>
  onStatusChange: (projectId: string, status: ProjectStatus) => Promise<void>
  onDelete: (projectId: string) => Promise<void>
  dragHandle?: { attributes: DraggableAttributes; listeners: DraggableSyntheticListeners }
  isDragging?: boolean
}) {
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editingPM, setEditingPM] = useState(false)

  // Handle both UUID (member ID) and custom text names for project_manager
  const pmName = project.project_manager
    ? (memberMap[project.project_manager] || project.project_manager)
    : null
  const permitStatus = project.permit_status || 'not_required'
  const lastUpdatedLabel = getProjectLastUpdatedLabel(project, memberMap)
  const [pmInput, setPMInput] = useState(pmName || '')

  const updateProjectField = async (field: string, value: any) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('projects')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', project.id)
    if (!error) {
      onStatusChange(project.id, project.status)
    }
  }

  const handlePMSave = async () => {
    if (pmInput.trim()) {
      await updateProjectField('project_manager', pmInput)
      setEditingPM(false)
    }
  }

  return (
    <div
      className={cn(
        'group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all',
        isDragging ? 'shadow-xl ring-1 ring-indigo-200' : 'hover:border-indigo-200 hover:shadow-md'
      )}
    >
      <div className="h-1 w-full" style={{ backgroundColor: project.color }} />

      <div className="p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <Link
            href={`/app/projects/${project.id}`}
            className="flex-1 text-sm font-semibold leading-snug text-slate-900 transition-colors hover:text-indigo-600"
          >
            {project.name}
          </Link>

          {(canEdit || dragHandle) && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {dragHandle && (
                <button
                  type="button"
                  {...dragHandle.attributes}
                  {...dragHandle.listeners}
                  className="rounded p-1 text-slate-300 transition-all hover:bg-slate-100 hover:text-slate-600 cursor-grab active:cursor-grabbing"
                  aria-label={`Drag ${project.name}`}
                >
                  <GripVertical size={15} />
                </button>
              )}

              {canEdit && (
                <div className="relative">
                  <button
                    onClick={() => setShowMenu((current) => !current)}
                    className="rounded p-1 text-slate-300 transition-all hover:bg-slate-100 hover:text-slate-600 opacity-0 group-hover:opacity-100"
                  >
                    <MoreHorizontal size={15} />
                  </button>

                  {showMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                      <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                        <Link
                          href={`/app/projects/${project.id}/edit`}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          onClick={() => setShowMenu(false)}
                        >
                          <Edit size={13} /> Edit project
                        </Link>
                        <Link
                          href={`/app/gantt?project=${project.id}`}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          onClick={() => setShowMenu(false)}
                        >
                          <GanttChartSquare size={13} /> View Gantt
                        </Link>
                        <div className="my-1 border-t border-slate-100" />
                        <button
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                          onClick={() => {
                            setShowMenu(false)
                            setShowDeleteConfirm(true)
                          }}
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {project.customer_name && (
          <p className="mb-2.5 truncate text-xs font-medium text-slate-500">{project.customer_name}</p>
        )}

        <div className="mb-3 space-y-1.5">
          {editingPM ? (
            <div className="flex items-center gap-1">
              <span className="w-8 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">PM</span>
              <input
                autoFocus
                value={pmInput}
                onChange={(e) => setPMInput(e.target.value)}
                onBlur={handlePMSave}
                onKeyDown={(e) => e.key === 'Enter' && handlePMSave()}
                className="flex-1 text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Type PM name"
              />
            </div>
          ) : (
            pmName && (
              <div className="flex items-center justify-between">
                <InfoRow label="PM" value={pmName} />
                {canEdit && (
                  <button onClick={() => setEditingPM(true)} className="text-slate-400 hover:text-rose-500 text-xs">✕</button>
                )}
              </div>
            )
          )}
          {!pmName && !editingPM && canEdit && (
            <button
              onClick={() => setEditingPM(true)}
              className="text-[10px] text-slate-400 hover:text-indigo-600"
            >
              + Add PM
            </button>
          )}
          {project.superintendent && (
            <div className="flex items-center justify-between">
              <InfoRow label="Super" value={project.superintendent} />
              {canEdit && (
                <button
                  onClick={() => updateProjectField('superintendent', null)}
                  className="text-slate-400 hover:text-rose-500 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          )}
          {project.subcontractors && project.subcontractors.length > 0 && (
            <div className="flex items-center justify-between">
              <InfoRow
                label="Subs"
                value={
                  project.subcontractors.slice(0, 2).join(', ') +
                  (project.subcontractors.length > 2 ? ` +${project.subcontractors.length - 2}` : '')
                }
              />
              {canEdit && (
                <button
                  onClick={() => updateProjectField('subcontractors', [])}
                  className="text-slate-400 hover:text-rose-500 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {permitStatus !== 'not_required' && (
            <Badge className={cn('text-[10px]', PERMIT_COLORS[permitStatus])}>
              {PERMIT_LABELS[permitStatus]}
            </Badge>
          )}
          <Badge className={cn('text-[10px]', PRIORITY_COLORS[project.priority as keyof typeof PRIORITY_COLORS])}>
            {PRIORITY_LABELS[project.priority as keyof typeof PRIORITY_LABELS]}
          </Badge>
          <span className="ml-auto text-[10px] text-slate-400">{formatDate(project.end_date, 'MMM d, yy')}</span>
        </div>

        <div className="mb-3 rounded-lg bg-slate-100 px-2.5 py-2 text-[10px] leading-4 text-slate-500">
          {lastUpdatedLabel}
        </div>

        {canEdit && (
          <select
            value={project.status}
            onChange={(event) => void onStatusChange(project.id, event.target.value as ProjectStatus)}
            className="w-full cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {columns.map((column) => (
              <option key={column.status} value={column.status}>
                {column.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="px-4 pb-4">
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
            <p className="mb-1 text-xs font-semibold text-rose-800">Delete &ldquo;{project.name}&rdquo;?</p>
            <p className="mb-3 text-xs text-rose-600">Permanently deletes all phases too.</p>
            <div className="flex gap-2">
              <button
                onClick={() => void onDelete(project.id)}
                className="flex-1 rounded-lg bg-rose-600 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-700"
              >
                Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-lg border border-slate-300 bg-white py-1.5 text-xs text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="w-8 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="truncate text-xs text-slate-700">{value}</span>
    </div>
  )
}
