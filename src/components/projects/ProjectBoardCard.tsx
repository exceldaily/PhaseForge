'use client'

import { useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Activity,
  CheckSquare,
  ClipboardList,
  Edit,
  ExternalLink,
  GanttChartSquare,
  GripVertical,
  Layers,
  MapPin,
  MoreHorizontal,
  Paperclip,
  Trash2,
} from 'lucide-react'
import { TransferToBoardModal } from '@/components/projects/TransferToBoardModal'
import { type DraggableAttributes, type DraggableSyntheticListeners } from '@dnd-kit/core'
import { Badge } from '@/components/ui/Badge'
import {
  PROJECT_HEALTH_META,
  getProjectBoardState,
} from '@/lib/projectBoard'
import { PRIORITY_COLORS, PRIORITY_LABELS } from '@/lib/constants'
import { Project, ProjectPriority } from '@/types/app'
import { cn, safeExternalUrl } from '@/lib/utils'

export interface ProjectBoardStageOption {
  id: string
  label: string
}

const CARD_ACTION_SELECTOR = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  'label',
  '[data-card-action="true"]',
].join(', ')

interface ProjectBoardCardProps {
  project: Project
  memberMap: Record<string, string>
  stageLabel: string
  stageColor: string
  currentStageId: string
  stageOptions: ProjectBoardStageOption[]
  canEdit: boolean
  onStageChange?: (projectId: string, stageId: string) => Promise<void>
  onDelete?: (projectId: string) => Promise<void>
  onCardClick?: (projectId: string) => void
  dragHandle?: { attributes: DraggableAttributes; listeners: DraggableSyntheticListeners }
  isDragging?: boolean
  isSelected?: boolean
}

function MetricTile({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string | number
  tone?: 'default' | 'danger'
}) {
  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-2',
        tone === 'danger'
          ? 'border-rose-100 bg-rose-50/70'
          : 'border-slate-200 bg-white/80'
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p
        className={cn(
          'mt-1 text-sm font-semibold',
          tone === 'danger' ? 'text-rose-700' : 'text-slate-800'
        )}
      >
        {value}
      </p>
    </div>
  )
}

export function ProjectBoardCard({
  project,
  memberMap,
  stageLabel,
  stageColor,
  currentStageId,
  stageOptions,
  canEdit,
  onStageChange,
  onDelete,
  onCardClick,
  dragHandle,
  isDragging = false,
  isSelected = false,
}: ProjectBoardCardProps) {
  const searchParams = useSearchParams()
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showAddToBoard, setShowAddToBoard] = useState(false)

  const pmName = project.project_manager
    ? memberMap[project.project_manager] || project.project_manager
    : null
  const superintendentName = project.superintendent
    ? memberMap[project.superintendent] || project.superintendent
    : null
  const state = getProjectBoardState(project)
  const healthMeta = PROJECT_HEALTH_META[state.health]

  const detailHref = `/app/projects/${project.id}`
  const editHref = `${detailHref}/edit`
  const boardParam = searchParams.get('board')
  const ganttHref = `/app/gantt?project=${project.id}${boardParam ? `&board=${boardParam}` : ''}`
  const tasksHref = `${detailHref}?tab=tasks`
  const activityHref = `${detailHref}?tab=activity`
  const filesHref = `${detailHref}?tab=files`
  const punchHref = `${detailHref}?tab=punch`
  const showPunchButton = project.show_punch_on_card !== false
  const punchOpen = project.punch_open_count ?? 0
  const punchDone = project.punch_completed_count ?? 0
  const primaryProjectHref = canEdit ? editHref : detailHref
  const primaryProjectLabel = canEdit ? 'Edit Project' : 'Open Project'
  const showMenuButton = canEdit || Boolean(onDelete)

  const handleCardClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!onCardClick) return

    const target = event.target as HTMLElement | null
    if (target?.closest(CARD_ACTION_SELECTOR)) return

    onCardClick(project.id)
  }

  return (
    <div
      onClick={handleCardClick}
      className={cn(
        'group overflow-hidden rounded-3xl border bg-white shadow-sm transition-all',
        onCardClick && 'cursor-pointer',
        isDragging
          ? 'border-indigo-200 shadow-xl ring-1 ring-indigo-200'
          : isSelected
            ? 'border-indigo-300 shadow-lg ring-1 ring-indigo-100'
            : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
      )}
    >
      <div className="h-1.5 w-full" style={{ backgroundColor: stageColor }} />

      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge className={cn('border text-[10px] font-semibold', healthMeta.pillClassName)}>
                <span className={cn('mr-1.5 inline-block h-1.5 w-1.5 rounded-full', healthMeta.dotClassName)} />
                {healthMeta.label}
              </Badge>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {stageLabel}
              </span>
              {state.needsAttentionToday && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
                  Action today
                </span>
              )}
            </div>

            <h3 className="line-clamp-2 text-base font-semibold leading-6 text-slate-900">
              {project.name}
            </h3>

            <div className="mt-2 space-y-1 text-xs text-slate-500">
              {project.customer_name && (
                <p className="truncate font-medium text-slate-600">{project.customer_name}</p>
              )}
              {(pmName || superintendentName) && (
                <p className="truncate">
                  {pmName ? `PM ${pmName}` : 'PM unassigned'}
                  {pmName && superintendentName ? ' | ' : ''}
                  {superintendentName ? `Super ${superintendentName}` : ''}
                </p>
              )}
              {project.job_location && (
                <p className="flex items-center gap-1 truncate">
                  <MapPin size={11} className="flex-shrink-0 text-slate-400" />
                  <span className="truncate">{project.job_location}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1" data-card-action="true">
            {dragHandle && (
              <button
                type="button"
                {...dragHandle.attributes}
                {...dragHandle.listeners}
                onClick={(event) => event.stopPropagation()}
                className="touch-none cursor-grab rounded-xl p-2 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
                aria-label={`Drag ${project.name}`}
              >
                <GripVertical size={16} />
              </button>
            )}

            {showMenuButton && (
              <div className="relative" data-card-action="true">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setShowMenu((current) => !current)
                  }}
                  data-help="projects-menu"
                  className="rounded-xl p-2 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  aria-label={`Project actions for ${project.name}`}
                >
                  <MoreHorizontal size={16} />
                </button>

                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                    <div
                      className="absolute right-0 top-full z-20 mt-1 w-44 rounded-2xl border border-slate-200 bg-white py-1 shadow-lg"
                      data-card-action="true"
                    >
                      {canEdit && (
                        <Link
                          href={`${detailHref}/edit`}
                          onClick={() => setShowMenu(false)}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Edit size={13} /> Edit project
                        </Link>
                      )}
                      <Link
                        href={ganttHref}
                        onClick={() => setShowMenu(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <GanttChartSquare size={13} /> View Gantt
                      </Link>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            setShowMenu(false)
                            setShowAddToBoard(true)
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Layers size={13} /> Add to Board
                        </button>
                      )}
                      {onDelete && (
                        <>
                          <div className="my-1 border-t border-slate-100" />
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setShowMenu(false)
                              setShowDeleteConfirm(true)
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className={cn('rounded-2xl border p-3', healthMeta.softCardClassName)}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Progress</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{state.stageProgressLabel}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-semibold tracking-tight text-slate-900">{state.progressPercent}%</p>
              <p className="text-[11px] text-slate-500">{state.dueLabel}</p>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/70">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                state.health === 'delayed'
                  ? 'bg-rose-500'
                  : state.health === 'at_risk'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              )}
              style={{ width: `${state.progressPercent}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] font-medium text-slate-600">{state.actionLabel}</p>
        </div>

        <div className="grid grid-cols-2 gap-2" data-card-action="true">
          <MetricTile label="Open Work" value={state.openPhases} />
          <MetricTile label="Blocked" value={state.blockedPhases} tone={state.blockedPhases > 0 ? 'danger' : 'default'} />
          <MetricTile label="Activity" value={state.activityCount} />
          <MetricTile label="Updated" value={state.updatedLabel.replace('Updated ', '')} />
        </div>

        <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          <span className="font-medium text-slate-600">{state.updatedLabel}</span>
          <Badge className={cn('text-[10px]', PRIORITY_COLORS[project.priority as ProjectPriority])}>
            {PRIORITY_LABELS[project.priority as ProjectPriority]}
          </Badge>
        </div>

        {project.links && project.links.length > 0 && (
          <div className="flex flex-wrap gap-2" data-card-action="true">
            {project.links.map((link, i) => {
              const href = safeExternalUrl(link.url)
              if (!href) return null
              return (
                <a
                  key={i}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-indigo-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50"
                >
                  <ExternalLink size={11} className="flex-shrink-0" />
                  <span className="truncate">{link.label}</span>
                </a>
              )
            })}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Link
            href={ganttHref}
            onClick={(event) => event.stopPropagation()}
            className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            <GanttChartSquare size={15} /> View Gantt
          </Link>
          <Link
            href={primaryProjectHref}
            onClick={(event) => event.stopPropagation()}
            className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            {primaryProjectLabel}
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-2" data-card-action="true">
          <Link
            href={tasksHref}
            onClick={(event) => event.stopPropagation()}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-2 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <CheckSquare size={12} /> Tasks
          </Link>
          <Link
            href={activityHref}
            onClick={(event) => event.stopPropagation()}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-2 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <Activity size={12} /> Activity
          </Link>
          <Link
            href={filesHref}
            onClick={(event) => event.stopPropagation()}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-2 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <Paperclip size={12} /> Files
          </Link>
        </div>

        {showPunchButton && (
          <Link
            href={punchHref}
            onClick={(event) => event.stopPropagation()}
            data-card-action="true"
            className="flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
          >
            <ClipboardList size={13} />
            Punch List
            <span className="font-medium text-indigo-500">· {punchOpen} open · {punchDone} done</span>
          </Link>
        )}

        {canEdit && onStageChange && (
          <select
            value={currentStageId}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => void onStageChange(project.id, event.target.value)}
            data-card-action="true"
            className="w-full cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {stageOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {showDeleteConfirm && onDelete && (
        <div className="px-4 pb-4" data-card-action="true">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
            <p className="mb-1 text-xs font-semibold text-rose-800">Delete &ldquo;{project.name}&rdquo;?</p>
            <p className="mb-3 text-xs text-rose-600">This permanently deletes the project and its phases.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  void onDelete(project.id)
                }}
                className="flex-1 rounded-xl bg-rose-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-700"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  setShowDeleteConfirm(false)
                }}
                className="flex-1 rounded-xl border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddToBoard && (
        <div data-card-action="true" onClick={(event) => event.stopPropagation()}>
          <TransferToBoardModal
            projectId={project.id}
            projectName={project.name}
            currentBoardId={project.board_id ?? null}
            onClose={() => setShowAddToBoard(false)}
          />
        </div>
      )}
    </div>
  )
}
