'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  pointerWithin,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Search, Settings, Settings2, Trash2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { addBoardColumn, deleteBoardColumn, moveProjectToColumn, updateBoardColumn } from '../actions'
import { createClient } from '@/lib/supabase/client'
import { ProjectBoardCard, type ProjectBoardStageOption } from '@/components/projects/ProjectBoardCard'
import { StickyHScroll } from '@/components/ui/StickyHScroll'
import { getProjectBoardState } from '@/lib/projectBoard'
import { COLUMN_COLORS } from '@/lib/constants'
import { Board, BoardColumn, Project } from '@/types/app'
import { cn, validateHexColor } from '@/lib/utils'

// Drop based on where the pointer is (correct for columns of differing
// heights); fall back to closest-corners over a gap/header.
const dropCollision: CollisionDetection = (args) => {
  const pointer = pointerWithin(args)
  return pointer.length > 0 ? pointer : closestCorners(args)
}

interface BoardKanbanProps {
  board: Board
  columns: BoardColumn[]
  projects: Project[]
  memberMap: Record<string, string>
  currentUserId: string
  canEdit: boolean
  canAdmin: boolean
}

export function BoardKanban({ board, columns, projects, memberMap, canEdit, canAdmin }: BoardKanbanProps) {
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)

  const filtered = useMemo(() => {
    const query = deferredSearch.toLowerCase().trim()
    if (!query) return projects

    return projects.filter((project) =>
      project.name.toLowerCase().includes(query) ||
      (project.customer_name?.toLowerCase().includes(query) ?? false) ||
      (project.job_location?.toLowerCase().includes(query) ?? false)
    )
  }, [projects, deferredSearch])

  const doneCount = filtered.filter((project) =>
    columns.find((column) => column.id === project.board_column_id)?.is_done
  ).length

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-shrink-0 items-center justify-between flex-wrap gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: validateHexColor(board.color) }} />
            <h1 className="truncate text-lg font-bold text-slate-900">{board.name}</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {filtered.length} project{filtered.length === 1 ? '' : 's'}
            {doneCount > 0 ? ` | ${doneCount} done` : ''}
          </p>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <div className="relative hidden md:block">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search projects..."
              className="w-56 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-8 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {canEdit && (
            <Link
              href={`/app/projects/new?board=${board.id}`}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              <Plus size={14} /> New Project
            </Link>
          )}

          {canAdmin && (
            <Link
              href={`/app/boards/${board.id}/settings`}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              <Settings size={14} /> Settings
            </Link>
          )}
        </div>
      </div>

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

export function BoardColumnsKanban({
  boardId,
  columns,
  projects,
  memberMap,
  canEdit,
}: {
  boardId: string
  columns: BoardColumn[]
  projects: Project[]
  memberMap: Record<string, string>
  canEdit: boolean
}) {
  const router = useRouter()
  const [projectColumnOverrides, setProjectColumnOverrides] = useState<Record<string, string | null>>({})
  const [deletedProjectIds, setDeletedProjectIds] = useState<string[]>([])
  const [columnOverrides, setColumnOverrides] = useState<Record<string, Partial<BoardColumn>>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  )
  const [showColSettings, setShowColSettings] = useState(false)
  const [columnError, setColumnError] = useState('')
  const [savingColumnIds, setSavingColumnIds] = useState<string[]>([])
  const [deletingColumnIds, setDeletingColumnIds] = useState<string[]>([])
  const [addingColumn, setAddingColumn] = useState(false)
  const [newColName, setNewColName] = useState('')
  const [newColColor, setNewColColor] = useState<string>(COLUMN_COLORS[0])

  const localProjects = useMemo(
    () =>
      projects
        .filter((project) => !deletedProjectIds.includes(project.id))
        .map((project) => ({
          ...project,
          board_column_id: projectColumnOverrides[project.id] ?? project.board_column_id ?? null,
        })),
    [projectColumnOverrides, projects, deletedProjectIds]
  )

  const orderedColumns = useMemo(
    () =>
      [...columns]
        .map((column) => ({ ...column, ...(columnOverrides[column.id] ?? {}) }))
        .sort((left, right) => left.sort_order - right.sort_order),
    [columnOverrides, columns]
  )

  const stageOptions = useMemo<ProjectBoardStageOption[]>(
    () => orderedColumns.map((column) => ({ id: column.id, label: column.name })),
    [orderedColumns]
  )

  const defaultColumnId = orderedColumns[0]?.id ?? null
  const activeProject = localProjects.find((project) => project.id === activeId) ?? null

  const updateColumnLocally = (columnId: string, updates: Partial<BoardColumn>) => {
    setColumnOverrides((current) => ({
      ...current,
      [columnId]: { ...current[columnId], ...updates },
    }))
  }

  const persistColumnUpdate = async (
    columnId: string,
    updates: { name?: string; color?: string; is_done?: boolean }
  ) => {
    const previousColumn = orderedColumns.find((column) => column.id === columnId)
    if (!previousColumn) return

    setColumnError('')
    updateColumnLocally(columnId, updates)
    setSavingColumnIds((current) => (current.includes(columnId) ? current : [...current, columnId]))

    const result = await updateBoardColumn(columnId, updates)
    setSavingColumnIds((current) => current.filter((id) => id !== columnId))

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
    const nextColumn = orderedColumns.find((column) => column.id === newColumnId)
    if (!nextColumn) return

    const project = localProjects.find((item) => item.id === projectId)
    if (!project || project.board_column_id === newColumnId) return

    setProjectColumnOverrides((current) => ({
      ...current,
      [projectId]: newColumnId,
    }))

    const result = await moveProjectToColumn(projectId, newColumnId)
    if (!result.success) {
      setProjectColumnOverrides((current) => {
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

  const handleDeleteProject = async (projectId: string) => {
    const supabase = createClient()
    // Remove any linked Google Calendar events before links cascade away.
    try {
      const { unsyncAllProjectPhases } = await import('@/app/app/projects/[id]/scheduleActions')
      await unsyncAllProjectPhases(projectId)
    } catch { /* never block delete */ }
    // Remove phases first so none are orphaned if the FK doesn't cascade.
    await supabase.from('phases').delete().eq('project_id', projectId)
    const { error } = await supabase.from('projects').delete().eq('id', projectId)
    if (error) {
      alert('Failed to delete project. Please try again.')
      return
    }
    setDeletedProjectIds((current) => [...current, projectId])
    router.refresh()
  }

  const handleAddColumn = async () => {
    const trimmedName = newColName.trim()
    if (!trimmedName) {
      setColumnError('Column name is required.')
      return
    }

    setAddingColumn(true)
    setColumnError('')

    const result = await addBoardColumn(boardId, { name: trimmedName, color: newColColor })
    if (result.success) {
      setNewColName('')
      setNewColColor(COLUMN_COLORS[0])
      router.refresh()
    } else {
      setColumnError(result.error ?? 'Failed to add column.')
    }

    setAddingColumn(false)
  }

  const handleDeleteColumn = async (columnId: string) => {
    if (!confirm('Delete this column? Projects in it will move to the first remaining column.')) {
      return
    }

    setDeletingColumnIds((current) => [...current, columnId])
    setColumnError('')

    const result = await deleteBoardColumn(columnId, boardId)
    setDeletingColumnIds((current) => current.filter((id) => id !== columnId))

    if (!result.success) {
      setColumnError(result.error ?? 'Failed to delete column.')
      return
    }

    router.refresh()
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null)
    const projectId = String(event.active.id)
    const newColumnId = event.over ? String(event.over.id) : null
    if (!newColumnId) return

    await moveProject(projectId, newColumnId)
  }

  return (
    <div className="relative space-y-4 p-4">
      {canEdit && (
        <div className="flex items-center justify-end">
          <button
            type="button"
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
      )}

      {columnError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {columnError}
        </div>
      )}

      {showColSettings && canEdit && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-4 text-sm font-semibold text-slate-800">Column names &amp; colors</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {orderedColumns.map((column) => {
              const isSaving = savingColumnIds.includes(column.id)
              const isDeleting = deletingColumnIds.includes(column.id)
              const sourceColumn = columns.find((item) => item.id === column.id)

              return (
                <div key={column.id} className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: column.color }} />
                    {!isDeleting ? (
                      <button
                        type="button"
                        onClick={() => void handleDeleteColumn(column.id)}
                        className="text-slate-400 transition-colors hover:text-rose-600"
                        aria-label={`Delete ${column.name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400">Deleting...</span>
                    )}
                  </div>
                  <input
                    value={column.name}
                    onChange={(event) => updateColumnLocally(column.id, { name: event.target.value })}
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
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                    }}
                    disabled={isDeleting}
                    className="w-full border-0 bg-transparent px-1 text-xs font-semibold text-slate-800 focus:rounded focus:border focus:border-indigo-300 focus:bg-white focus:outline-none disabled:opacity-50"
                  />
                  <div className="flex flex-wrap gap-1">
                    {COLUMN_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => void persistColumnUpdate(column.id, { color })}
                        disabled={isDeleting}
                        className="h-4 w-4 rounded-full border-2 transition-all disabled:opacity-50"
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
                      onChange={(event) => void persistColumnUpdate(column.id, { is_done: event.target.checked })}
                      disabled={isDeleting}
                      className="rounded"
                    />
                    Mark as done
                  </label>
                  <p className="text-[10px] text-slate-400">
                    {isDeleting ? 'Deleting...' : isSaving ? 'Saving...' : column.is_done ? 'Done column' : 'Active column'}
                  </p>
                </div>
              )
            })}

            <div className="flex flex-col gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-white p-3">
              <div className="h-1.5 w-full rounded-full bg-slate-200" />
              <input
                type="text"
                value={newColName}
                onChange={(event) => setNewColName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleAddColumn()
                }}
                placeholder="New column name"
                disabled={addingColumn}
                className="w-full border-0 bg-transparent px-1 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:rounded focus:border focus:border-indigo-300 focus:bg-white focus:outline-none disabled:opacity-50"
              />
              <div className="flex flex-wrap gap-1">
                {COLUMN_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewColColor(color)}
                    disabled={addingColumn}
                    className="h-4 w-4 rounded-full border-2 transition-all disabled:opacity-50"
                    style={{
                      backgroundColor: color,
                      borderColor: newColColor === color ? '#0f172a' : 'transparent',
                    }}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => void handleAddColumn()}
                disabled={addingColumn || !newColName.trim()}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={12} /> {addingColumn ? 'Adding...' : 'Add Column'}
              </button>
            </div>
          </div>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={dropCollision} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <StickyHScroll className="pb-2" style={{ minHeight: 'calc(100vh - 280px)' }}>
          {orderedColumns.map((column) => {
            const columnProjects = localProjects.filter((project) =>
              project.board_column_id === column.id ||
              (!project.board_column_id && defaultColumnId === column.id)
            )

            return (
              <KanbanColumn
                key={column.id}
                column={column}
                projects={columnProjects}
                canEdit={canEdit}
                memberMap={memberMap}
                activeId={activeId}
                onMoveProject={moveProject}
                onDeleteProject={canEdit ? handleDeleteProject : undefined}
                stageOptions={stageOptions}
              />
            )
          })}
        </StickyHScroll>

        <DragOverlay>
          {activeProject ? (
            <div className="w-[320px] rotate-1 opacity-95">
              <ProjectBoardCard
                project={activeProject}
                canEdit={false}
                memberMap={memberMap}
                stageLabel={orderedColumns.find((column) => column.id === (activeProject.board_column_id ?? defaultColumnId))?.name ?? 'Project'}
                stageColor={orderedColumns.find((column) => column.id === (activeProject.board_column_id ?? defaultColumnId))?.color ?? '#6366f1'}
                currentStageId={activeProject.board_column_id ?? defaultColumnId ?? ''}
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
  projects,
  canEdit,
  memberMap,
  activeId,
  onMoveProject,
  onDeleteProject,
  stageOptions,
}: {
  column: BoardColumn
  projects: Project[]
  canEdit: boolean
  memberMap: Record<string, string>
  activeId: string | null
  onMoveProject: (projectId: string, columnId: string) => Promise<void>
  onDeleteProject?: (projectId: string) => Promise<void>
  stageOptions: ProjectBoardStageOption[]
}) {
  const { isOver, setNodeRef } = useDroppable({ id: column.id, disabled: !canEdit })

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
            <p className="text-xs font-bold uppercase tracking-wide text-slate-700">{column.name}</p>
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
          // Each column scrolls its own cards when the list is long, so a busy
          // stage doesn't stretch the whole page. Header above stays put.
          'min-h-[220px] max-h-[calc(100vh-320px)] overflow-y-auto space-y-4 rounded-[28px] border border-slate-200 bg-slate-50/70 p-3 transition-all print:max-h-none print:overflow-visible',
          isOver && activeId ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-200' : ''
        )}
      >
        {projects.map((project) => (
          <DraggableCard
            key={project.id}
            project={project}
            memberMap={memberMap}
            canEdit={canEdit}
            stageOptions={stageOptions}
            column={column}
            onMoveProject={onMoveProject}
            onDeleteProject={onDeleteProject}
          />
        ))}

        {projects.length === 0 && (
          <div
            className={cn(
              'rounded-2xl border-2 border-dashed p-5 text-center transition-colors',
              isOver && activeId ? 'border-indigo-300 bg-white/80' : 'border-slate-200 bg-white/60'
            )}
          >
            <p className="text-xs font-medium text-slate-400">
              {isOver && activeId ? 'Drop project here' : 'No projects in this stage'}
            </p>
          </div>
        )}

        {canEdit && (
          <Link
            href={`/app/projects/new?board=${column.board_id}&column=${column.id}`}
            className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 px-3 py-2.5 text-xs font-medium text-slate-400 transition-colors hover:border-indigo-300 hover:bg-white hover:text-indigo-600"
          >
            <Plus size={13} /> Add project
          </Link>
        )}
      </div>
    </div>
  )
}

function DraggableCard({
  project,
  memberMap,
  canEdit,
  stageOptions,
  column,
  onMoveProject,
  onDeleteProject,
}: {
  project: Project
  memberMap: Record<string, string>
  canEdit: boolean
  stageOptions: ProjectBoardStageOption[]
  column: BoardColumn
  onMoveProject: (projectId: string, columnId: string) => Promise<void>
  onDeleteProject?: (projectId: string) => Promise<void>
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
      <ProjectBoardCard
        project={project}
        canEdit={canEdit}
        memberMap={memberMap}
        stageLabel={column.name}
        stageColor={column.color}
        currentStageId={project.board_column_id ?? column.id}
        stageOptions={stageOptions}
        onStageChange={onMoveProject}
        onDelete={onDeleteProject}
        dragHandle={{ attributes, listeners }}
      />
    </div>
  )
}
