'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  DndContext, closestCenter, DragOverlay,
  type DragEndEvent, type DragStartEvent,
  type DraggableAttributes, type DraggableSyntheticListeners,
  useDraggable, useDroppable,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus, Settings, Settings2, GanttChartSquare, MoreHorizontal,
  Edit, Search, X, GripVertical,
} from 'lucide-react'
import { moveProjectToColumn, updateBoardColumn } from '../actions'
import { Board, BoardColumn, Project, ProjectPriority } from '@/types/app'
import { formatDate } from '@/lib/dates'
import { PRIORITY_LABELS, PRIORITY_COLORS } from '@/lib/constants'
import { Badge } from '@/components/ui/Badge'
import { getProjectLastUpdatedLabel } from '@/lib/projectAudit'
import { cn } from '@/lib/utils'

interface BoardKanbanProps {
  board: Board
  columns: BoardColumn[]
  projects: Project[]
  memberMap: Record<string, string>
  currentUserId: string
  canEdit: boolean
  canAdmin: boolean
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

export function BoardKanban({ board, columns, projects, memberMap, canEdit, canAdmin }: BoardKanbanProps) {
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)

  const filtered = useMemo(() => {
    const q = deferredSearch.toLowerCase().trim()
    return q
      ? projects.filter(p =>
          p.name.toLowerCase().includes(q) ||
          (p.customer_name?.toLowerCase().includes(q) ?? false)
        )
      : projects
  }, [projects, deferredSearch])

  const totalProjects = projects.length
  const doneCount = projects.filter(p => columns.find(c => c.id === p.board_column_id)?.is_done).length

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Board header */}
      <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: board.color }} />
          <h1 className="text-lg font-bold text-slate-900 truncate">{board.name}</h1>
          <span className="hidden sm:block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            {totalProjects} project{totalProjects !== 1 ? 's' : ''}
            {doneCount > 0 && <> | {doneCount} done</>}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Search */}
          <div className="relative hidden md:block">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-48 rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={13} />
              </button>
            )}
          </div>

          {canEdit && (
            <Link href={`/app/projects/new?board=${board.id}`}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors">
              <Plus size={14} /> New Project
            </Link>
          )}

          {canAdmin && (
            <Link href={`/app/boards/${board.id}/settings`}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              <Settings size={14} /> Settings
            </Link>
          )}
        </div>
      </div>

      {/* Kanban */}
      <BoardColumnsKanban
        boardId={board.id}
        columns={columns}
        projects={filtered}
        memberMap={memberMap}
        canEdit={canEdit}
      />
    </div>
  )
}

// ── Columns view ──────────────────────────────────────────────────────────────
// The drag-and-drop column area without the board header — reused by the
// Projects page when a single board is selected in the board filter.

export function BoardColumnsKanban({
  boardId, columns, projects, memberMap, canEdit,
}: {
  boardId: string
  columns: BoardColumn[]
  projects: Project[]
  memberMap: Record<string, string>
  canEdit: boolean
}) {
  const [projectColumnOverrides, setProjectColumnOverrides] = useState<Record<string, string | null>>({})
  const [columnOverrides, setColumnOverrides] = useState<Record<string, Partial<BoardColumn>>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showColSettings, setShowColSettings] = useState(false)
  const [columnError, setColumnError] = useState('')
  const [savingColumnIds, setSavingColumnIds] = useState<string[]>([])

  const localProjects = useMemo(
    () =>
      projects.map(project => ({
        ...project,
        board_column_id: projectColumnOverrides[project.id] ?? project.board_column_id ?? null,
      })),
    [projectColumnOverrides, projects]
  )

  const orderedColumns = useMemo(
    () =>
      [...columns]
        .map(column => ({ ...column, ...(columnOverrides[column.id] ?? {}) }))
        .sort((left, right) => left.sort_order - right.sort_order),
    [columnOverrides, columns]
  )

  const defaultColumnId = orderedColumns[0]?.id ?? null

  const activeProject = localProjects.find(p => p.id === activeId) ?? null

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))

  const updateColumnLocally = (columnId: string, updates: Partial<BoardColumn>) => {
    setColumnOverrides(current => ({
      ...current,
      [columnId]: { ...current[columnId], ...updates },
    }))
  }

  const persistColumnUpdate = async (
    columnId: string,
    updates: { name?: string; color?: string; is_done?: boolean }
  ) => {
    const previousColumn = orderedColumns.find(column => column.id === columnId)
    if (!previousColumn) return

    setColumnError('')
    updateColumnLocally(columnId, updates)
    setSavingColumnIds(current =>
      current.includes(columnId) ? current : [...current, columnId]
    )

    const result = await updateBoardColumn(columnId, updates)

    setSavingColumnIds(current => current.filter(id => id !== columnId))

    if (!result.success) {
      updateColumnLocally(columnId, {
        name: previousColumn.name,
        color: previousColumn.color,
        is_done: previousColumn.is_done,
      })
      setColumnError(result.error ?? 'Failed to update column.')
    }
  }

  const moveProject = async (projectId: string, newColumnId: string) => {
    const nextColumn = orderedColumns.find(column => column.id === newColumnId)
    if (!nextColumn) return

    const project = localProjects.find(item => item.id === projectId)
    if (!project || project.board_column_id === newColumnId) return

    setProjectColumnOverrides(current => ({
      ...current,
      [projectId]: newColumnId,
    }))

    const result = await moveProjectToColumn(projectId, newColumnId)
    if (!result.success) {
      setProjectColumnOverrides(current => {
        const next = { ...current }
        if (project.board_column_id) {
          next[projectId] = project.board_column_id
        } else {
          delete next[projectId]
        }
        return next
      })
      alert('Failed to move project. Please try again.')
    }
  }

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null)
    const projectId = String(e.active.id)
    const newColumnId = e.over ? String(e.over.id) : null
    if (!newColumnId) return

    await moveProject(projectId, newColumnId)
  }

  return (
    <div className="relative">
      <div className="mb-3 flex items-center justify-end">
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowColSettings(current => !current)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
              showColSettings
                ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-500 hover:text-slate-800'
            )}
          >
            <Settings2 size={13} /> Customize columns
          </button>
        )}
      </div>

      {columnError && (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {columnError}
        </div>
      )}

      {showColSettings && canEdit && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-4 text-sm font-semibold text-slate-800">Column names &amp; colors</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {orderedColumns.map(column => {
              const isSaving = savingColumnIds.includes(column.id)
              const sourceColumn = columns.find(item => item.id === column.id)

              return (
                <div
                  key={column.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3"
                >
                  <div className="h-1.5 w-full rounded-full" style={{ backgroundColor: column.color }} />
                  <input
                    value={column.name}
                    onChange={event => updateColumnLocally(column.id, { name: event.target.value })}
                    onBlur={() => {
                      const trimmed = column.name.trim()
                      if (!trimmed) {
                        setColumnError('Column name is required.')
                        updateColumnLocally(column.id, { name: sourceColumn?.name ?? 'Untitled' })
                        return
                      }
                      updateColumnLocally(column.id, { name: trimmed })
                      void persistColumnUpdate(column.id, { name: trimmed })
                    }}
                    onKeyDown={event => {
                      if (event.key === 'Enter') {
                        event.currentTarget.blur()
                      }
                    }}
                    className="w-full border-0 bg-transparent px-1 text-xs font-semibold text-slate-800 focus:rounded focus:border focus:border-indigo-300 focus:bg-white focus:outline-none"
                  />
                  <div className="flex flex-wrap gap-1">
                    {COLUMN_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => void persistColumnUpdate(column.id, { color })}
                        className="h-4 w-4 rounded-full border-2 transition-all"
                        style={{
                          backgroundColor: color,
                          borderColor: column.color === color ? '#0f172a' : 'transparent',
                        }}
                      />
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={column.is_done}
                      onChange={event => void persistColumnUpdate(column.id, { is_done: event.target.checked })}
                      className="rounded"
                    />
                    Mark as done
                  </label>
                  <p className="text-[10px] text-slate-400">
                    {isSaving ? 'Saving...' : column.is_done ? 'Done column' : 'Active column'}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-6" style={{ minHeight: 'calc(100vh - 280px)' }}>
            {orderedColumns.map(column => {
              const colProjects = localProjects.filter(project =>
                project.board_column_id === column.id ||
                (!project.board_column_id && defaultColumnId === column.id)
              )

              return (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  allColumns={orderedColumns}
                  projects={colProjects}
                  memberMap={memberMap}
                  canEdit={canEdit}
                  activeId={activeId}
                  boardId={boardId}
                  defaultColumnId={defaultColumnId}
                  onMoveProject={moveProject}
                />
              )
            })}
          </div>

          <DragOverlay>
            {activeProject && (
              <div className="w-[272px] rotate-1 opacity-95">
                <ProjectCard
                  project={activeProject}
                  memberMap={memberMap}
                  allColumns={orderedColumns}
                  defaultColumnId={defaultColumnId}
                  onMoveProject={moveProject}
                  isDragging
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  )
}

// ── Column ────────────────────────────────────────────────────────────────────

function KanbanColumn({
  column, allColumns, projects, memberMap, canEdit, activeId, boardId, defaultColumnId, onMoveProject
}: {
  column: BoardColumn
  allColumns: BoardColumn[]
  projects: Project[]
  memberMap: Record<string, string>
  canEdit: boolean
  activeId: string | null
  boardId: string
  defaultColumnId: string | null
  onMoveProject: (projectId: string, columnId: string) => Promise<void>
}) {
  const { isOver, setNodeRef } = useDroppable({ id: column.id, disabled: !canEdit })

  return (
    <div className="w-[272px] flex-shrink-0">
      {/* Column header */}
      <div
        className="mb-3 flex items-center justify-between rounded-xl border border-slate-200 border-t-4 bg-white px-3 py-2.5 shadow-sm"
        style={{ borderTopColor: column.color }}
      >
        <div className="flex items-center gap-2">
          <span className="max-w-[150px] truncate text-xs font-bold uppercase tracking-wide text-slate-700">
            {column.name}
          </span>
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
            {projects.length}
          </span>
          {column.is_done && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
              DONE
            </span>
          )}
        </div>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={cn(
          'min-h-[148px] space-y-3 rounded-2xl p-2 transition-all',
          isOver && activeId ? 'bg-indigo-50 ring-2 ring-indigo-200' : 'bg-transparent'
        )}
      >
        {projects.map(project => (
          <DraggableCard
            key={project.id}
            project={project}
            memberMap={memberMap}
            canEdit={canEdit}
            allColumns={allColumns}
            defaultColumnId={defaultColumnId}
            onMoveProject={onMoveProject}
          />
        ))}

        {projects.length === 0 && (
          <div
            className={cn(
              'rounded-xl border-2 border-dashed p-4 text-center transition-colors',
              isOver && activeId ? 'border-indigo-300 bg-white/80' : 'border-slate-200'
            )}
          >
            <p className="text-xs text-slate-400">
              {isOver && activeId ? 'Drop project here' : 'No projects'}
            </p>
          </div>
        )}

        {canEdit && (
          <Link href={`/app/projects/new?board=${boardId}&column=${column.id}`}
            className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-xs text-slate-400 hover:border-indigo-300 hover:text-indigo-600 hover:bg-white transition-colors">
            <Plus size={13} /> Add project
          </Link>
        )}
      </div>
    </div>
  )
}

// ── Draggable card wrapper ────────────────────────────────────────────────────

function DraggableCard({ project, memberMap, canEdit, allColumns, defaultColumnId, onMoveProject }: {
  project: Project
  memberMap: Record<string, string>
  canEdit: boolean
  allColumns: BoardColumn[]
  defaultColumnId: string | null
  onMoveProject: (projectId: string, columnId: string) => Promise<void>
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: project.id, disabled: !canEdit,
  })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(isDragging && 'opacity-40')}>
      <ProjectCard
        project={project}
        memberMap={memberMap}
        allColumns={allColumns}
        defaultColumnId={defaultColumnId}
        onMoveProject={onMoveProject}
        dragHandle={{ attributes, listeners }}
      />
    </div>
  )
}

// ── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  memberMap,
  allColumns,
  defaultColumnId,
  onMoveProject,
  dragHandle,
  isDragging = false,
}: {
  project: Project
  memberMap: Record<string, string>
  allColumns: BoardColumn[]
  defaultColumnId: string | null
  onMoveProject: (projectId: string, columnId: string) => Promise<void>
  dragHandle?: { attributes: DraggableAttributes; listeners: DraggableSyntheticListeners }
  isDragging?: boolean
}) {
  const [showMenu, setShowMenu] = useState(false)
  const pmName = project.project_manager
    ? (memberMap[project.project_manager] ?? project.project_manager)
    : null
  const superintendentName = project.superintendent
    ? (memberMap[project.superintendent] ?? project.superintendent)
    : null
  const permitStatus = project.permit_status || 'not_required'
  const lastUpdatedLabel = getProjectLastUpdatedLabel(project, memberMap)
  const currentColumnId = project.board_column_id ?? defaultColumnId ?? ''

  return (
    <div className={cn(
      'group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all',
      isDragging ? 'shadow-xl ring-1 ring-indigo-200' : 'hover:border-indigo-200 hover:shadow-md'
    )}>
      <div className="h-1 w-full" style={{ backgroundColor: project.color }} />
      <div className="p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <Link href={`/app/projects/${project.id}`}
            className="flex-1 text-sm font-semibold leading-snug text-slate-900 transition-colors hover:text-indigo-600">
            {project.name}
          </Link>
          <div className="flex flex-shrink-0 items-center gap-1">
            {dragHandle && (
              <button
                type="button"
                {...dragHandle.attributes}
                {...dragHandle.listeners}
                className="cursor-grab rounded p-1 text-slate-300 transition-all hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
                aria-label={`Drag ${project.name}`}
              >
                <GripVertical size={14} />
              </button>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMenu(current => !current)}
                className="rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
              >
                <MoreHorizontal size={14} />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                    <Link
                      href={`/app/projects/${project.id}/edit`}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                      <Edit size={13} /> Edit project
                    </Link>
                    <Link
                      href={`/app/gantt?project=${project.id}`}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                      <GanttChartSquare size={13} /> View Gantt
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {project.customer_name && (
          <p className="mb-2.5 truncate text-xs font-medium text-slate-500">{project.customer_name}</p>
        )}

        <div className="mb-3 space-y-1.5">
          {pmName && <InfoRow label="PM" value={pmName} />}
          {superintendentName && <InfoRow label="Super" value={superintendentName} />}
          {project.subcontractors && project.subcontractors.length > 0 && (
            <InfoRow
              label="Subs"
              value={
                project.subcontractors.slice(0, 2).join(', ') +
                (project.subcontractors.length > 2 ? ` +${project.subcontractors.length - 2}` : '')
              }
            />
          )}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {permitStatus !== 'not_required' && (
            <Badge className={cn('text-[10px]', PERMIT_COLORS[permitStatus])}>
              {PERMIT_LABELS[permitStatus]}
            </Badge>
          )}
          <Badge className={cn('text-[10px]', PRIORITY_COLORS[project.priority as ProjectPriority])}>
            {PRIORITY_LABELS[project.priority as keyof typeof PRIORITY_LABELS]}
          </Badge>
          <span className="ml-auto text-[10px] text-slate-400">{formatDate(project.end_date, 'MMM d, yy')}</span>
        </div>

        <div className="mb-3 rounded-lg bg-slate-100 px-2.5 py-2 text-[10px] leading-4 text-slate-500">
          {lastUpdatedLabel}
        </div>

        {dragHandle && currentColumnId && (
          <select
            value={currentColumnId}
            onChange={event => void onMoveProject(project.id, event.target.value)}
            className="w-full cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {allColumns.map(column => (
              <option key={column.id} value={column.id}>
                {column.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="w-8 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="truncate text-xs text-slate-700">{value}</span>
    </div>
  )
}
