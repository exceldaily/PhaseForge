'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  DndContext, closestCenter, DragOverlay,
  type DragEndEvent, type DragStartEvent,
  useDraggable, useDroppable,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus, Settings, GanttChartSquare, MoreHorizontal,
  Trash2, Edit, Search, X, GripVertical,
} from 'lucide-react'
import { moveProjectToColumn } from '../actions'
import { Board, BoardColumn, Project, ProjectPriority } from '@/types/app'
import { formatDate } from '@/lib/dates'
import { PRIORITY_LABELS, PRIORITY_COLORS } from '@/lib/constants'
import { Badge } from '@/components/ui/Badge'
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

export function BoardKanban({ board, columns, projects, memberMap, currentUserId, canEdit, canAdmin }: BoardKanbanProps) {
  const [localProjects, setLocalProjects] = useState(projects)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)

  const filtered = useMemo(() => {
    const q = deferredSearch.toLowerCase().trim()
    return q
      ? localProjects.filter(p =>
          p.name.toLowerCase().includes(q) ||
          (p.customer_name?.toLowerCase().includes(q) ?? false)
        )
      : localProjects
  }, [localProjects, deferredSearch])

  const activeProject = localProjects.find(p => p.id === activeId) ?? null

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null)
    const projectId = String(e.active.id)
    const newColumnId = e.over ? String(e.over.id) : null
    if (!newColumnId) return

    const validColumn = columns.find(c => c.id === newColumnId)
    if (!validColumn) return

    const project = localProjects.find(p => p.id === projectId)
    if (!project || project.board_column_id === newColumnId) return

    // Optimistic update
    setLocalProjects(prev => prev.map(p =>
      p.id === projectId ? { ...p, board_column_id: newColumnId } : p
    ))

    const result = await moveProjectToColumn(projectId, newColumnId)
    if (!result.success) {
      // Revert
      setLocalProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, board_column_id: project.board_column_id } : p
      ))
      alert('Failed to move project. Please try again.')
    }
  }

  const totalProjects = localProjects.length
  const doneCount = localProjects.filter(p => columns.find(c => c.id === p.board_column_id)?.is_done).length

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Board header */}
      <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: board.color }} />
          <h1 className="text-lg font-bold text-slate-900 truncate">{board.name}</h1>
          <span className="hidden sm:block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            {totalProjects} project{totalProjects !== 1 ? 's' : ''}
            {doneCount > 0 && <> · {doneCount} done</>}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Search */}
          <div className="relative hidden md:block">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search projects…"
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
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex h-full gap-4 p-4" style={{ minWidth: columns.length * 288 + 32 }}>
            {columns.map(col => {
              const colProjects = filtered.filter(p =>
                p.board_column_id === col.id ||
                // Fallback: put unassigned projects in first column
                (!p.board_column_id && col.sort_order === 0)
              )

              return (
                <KanbanColumn
                  key={col.id}
                  column={col}
                  projects={colProjects}
                  memberMap={memberMap}
                  canEdit={canEdit}
                  activeId={activeId}
                  boardId={board.id}
                />
              )
            })}
          </div>

          <DragOverlay>
            {activeProject && (
              <div className="w-[272px] rotate-1 opacity-95 shadow-2xl">
                <ProjectCard project={activeProject} memberMap={memberMap} isDragging />
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
  column, projects, memberMap, canEdit, activeId, boardId
}: {
  column: BoardColumn
  projects: Project[]
  memberMap: Record<string, string>
  canEdit: boolean
  activeId: string | null
  boardId: string
}) {
  const { isOver, setNodeRef } = useDroppable({ id: column.id, disabled: !canEdit })

  return (
    <div className="flex w-72 flex-shrink-0 flex-col">
      {/* Column header */}
      <div className="mb-3 flex items-center justify-between rounded-xl border border-t-4 bg-white px-3 py-2.5 shadow-sm"
        style={{ borderTopColor: column.color, borderColor: '#e2e8f0' }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-700 truncate max-w-[140px]">{column.name}</span>
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
            {projects.length}
          </span>
          {column.is_done && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">DONE</span>
          )}
        </div>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 space-y-3 overflow-y-auto rounded-2xl p-2 transition-colors',
          isOver && activeId ? 'bg-indigo-50 ring-2 ring-indigo-200' : 'bg-slate-100/50'
        )}
        style={{ minHeight: 200 }}
      >
        {projects.map(project => (
          <DraggableCard key={project.id} project={project} memberMap={memberMap} canEdit={canEdit} />
        ))}

        {projects.length === 0 && (
          <div className={cn(
            'flex items-center justify-center rounded-xl border-2 border-dashed py-8 text-center transition-colors',
            isOver && activeId ? 'border-indigo-300 bg-white/80' : 'border-slate-200'
          )}>
            <p className="text-xs text-slate-400">
              {isOver && activeId ? 'Drop here' : 'No projects'}
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

function DraggableCard({ project, memberMap, canEdit }: {
  project: Project; memberMap: Record<string, string>; canEdit: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: project.id, disabled: !canEdit,
  })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(isDragging && 'opacity-40')}>
      <ProjectCard project={project} memberMap={memberMap} dragHandle={{ attributes, listeners }} />
    </div>
  )
}

// ── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({ project, memberMap, dragHandle, isDragging = false }: {
  project: Project
  memberMap: Record<string, string>
  dragHandle?: { attributes: any; listeners: any }
  isDragging?: boolean
}) {
  const [showMenu, setShowMenu] = useState(false)
  const pmName = project.project_manager
    ? (memberMap[project.project_manager] ?? project.project_manager) : null

  return (
    <div className={cn(
      'group rounded-xl border bg-white overflow-hidden transition-all',
      isDragging ? 'shadow-xl ring-1 ring-indigo-200' : 'border-slate-200 hover:border-indigo-200 hover:shadow-md shadow-sm'
    )}>
      <div className="h-1 w-full" style={{ backgroundColor: project.color }} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <Link href={`/app/projects/${project.id}`}
            className="flex-1 text-sm font-semibold text-slate-900 leading-snug hover:text-indigo-600 transition-colors">
            {project.name}
          </Link>
          <div className="flex items-center gap-1 flex-shrink-0">
            {dragHandle && (
              <button {...dragHandle.attributes} {...dragHandle.listeners}
                className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600 cursor-grab active:cursor-grabbing">
                <GripVertical size={14} />
              </button>
            )}
            <div className="relative">
              <button onClick={() => setShowMenu(s => !s)}
                className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal size={14} />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                    <Link href={`/app/projects/${project.id}`}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                      <Edit size={13} /> Edit
                    </Link>
                    <Link href={`/app/gantt?project=${project.id}`}
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
          <p className="mb-2 truncate text-xs text-slate-400">{project.customer_name}</p>
        )}

        {pmName && (
          <p className="mb-2 text-xs text-slate-500">
            <span className="font-medium text-slate-400">PM </span>{pmName}
          </p>
        )}

        <div className="flex items-center justify-between">
          <Badge className={cn('text-[10px]', PRIORITY_COLORS[project.priority as ProjectPriority])}>
            {PRIORITY_LABELS[project.priority as keyof typeof PRIORITY_LABELS]}
          </Badge>
          <span className="text-[10px] text-slate-400">{formatDate(project.end_date, 'MMM d, yy')}</span>
        </div>
      </div>
    </div>
  )
}
