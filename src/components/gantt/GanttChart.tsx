'use client'

import type { UIEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PHASE_STATUS_COLORS } from '@/lib/constants'
import {
  addDays,
  differenceInDays,
  format,
  formatDate,
  getTimelineHeaders,
  isOverdue,
  parseISO,
} from '@/lib/dates'
import { getPhasePercentComplete } from '@/lib/phaseProgress'
import { touchProjectAudit } from '@/lib/projectAudit'
import { useGanttStore } from '@/stores/ganttStore'
import { Phase, PhaseStatus, Profile, Project, ZoomLevel } from '@/types/app'
import { cn } from '@/lib/utils'
import { getClippedBarPosition } from '@/lib/gantt'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { GanttEditPanel } from './GanttEditPanel'
import { GanttMobileList } from './GanttMobileList'
import { GanttSidebar } from './GanttSidebar'
import { GanttToolbar } from './GanttToolbar'

interface GanttChartProps {
  projects: Project[]
  companyId: string
  members: Profile[]
  currentUserId: string
  canEdit: boolean
}

const ROW_HEIGHT = 40
const BASE_HEADER_HEIGHT = 56
const PROJECT_ROW_HEIGHT = 56

export function GanttChart({ projects: initialProjects, companyId, members, currentUserId, canEdit }: GanttChartProps) {
  const isMobile = useMediaQuery('(max-width: 767px)')
  const {
    zoom,
    viewStart,
    viewEnd,
    pixelsPerDay,
    selectedPhaseId,
    setSelectedPhase,
    collapsedProjects,
    toggleProjectCollapse,
    fitViewToRange,
    shiftMode,
    colorMode,
  } = useGanttStore()
  const [projects, setProjects] = useState(initialProjects)
  const [dragging, setDragging] = useState<{
    phaseId: string
    projectId: string
    startX: number
    origStart: string
    origEnd: string
    mode: 'move' | 'resize-right' | 'resize-left'
  } | null>(null)

  const sidebarScrollRef = useRef<HTMLDivElement | null>(null)
  const timelineScrollRef = useRef<HTMLDivElement | null>(null)
  const activeScrollSyncRef = useRef<'sidebar' | 'timeline' | null>(null)
  const hasAutoFittedRef = useRef(false)

  const totalDays = differenceInDays(viewEnd, viewStart) + 1
  const totalWidth = totalDays * pixelsPerDay
  const headerHeight = zoom === 'day' ? 64 : BASE_HEADER_HEIGHT

  const scheduleBounds = useMemo(() => {
    let earliest: Date | null = null
    let latest: Date | null = null

    const includeRange = (startDate?: string | null, endDate?: string | null) => {
      if (!startDate || !endDate) return

      const start = parseISO(startDate)
      const end = parseISO(endDate)

      if (!earliest || start < earliest) earliest = start
      if (!latest || end > latest) latest = end
    }

    projects.forEach((project) => {
      includeRange(project.start_date, project.end_date)
      ;(project.phases || []).forEach((phase) => includeRange(phase.start_date, phase.end_date))
    })

    return earliest && latest ? { start: earliest, end: latest } : null
  }, [projects])

  const memberMap = useMemo(
    () => Object.fromEntries(members.map((member) => [member.id, member])) as Record<string, Profile>,
    [members]
  )

  const selectedPhase = projects.flatMap((project) => project.phases || []).find((phase) => phase.id === selectedPhaseId) || null
  const selectedProject = projects.find((project) => (project.phases || []).some((phase) => phase.id === selectedPhaseId)) || null

  const syncVerticalScroll = useCallback((source: 'sidebar' | 'timeline', scrollTop: number) => {
    const target = source === 'sidebar' ? timelineScrollRef.current : sidebarScrollRef.current
    if (!target) return

    if (activeScrollSyncRef.current && activeScrollSyncRef.current !== source) {
      return
    }

    activeScrollSyncRef.current = source
    target.scrollTop = scrollTop

    requestAnimationFrame(() => {
      if (activeScrollSyncRef.current === source) {
        activeScrollSyncRef.current = null
      }
    })
  }, [])

  const handleSidebarScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    syncVerticalScroll('sidebar', event.currentTarget.scrollTop)
  }, [syncVerticalScroll])

  const handleTimelineScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    syncVerticalScroll('timeline', event.currentTarget.scrollTop)
  }, [syncVerticalScroll])

  const handleProjectToggle = useCallback((projectId: string) => {
    const project = projects.find((item) => item.id === projectId)
    if (!project) return

    const projectHasSelectedPhase = (project.phases || []).some((phase) => phase.id === selectedPhaseId)
    if (projectHasSelectedPhase) {
      setSelectedPhase(null)
    }

    toggleProjectCollapse(projectId)
  }, [projects, selectedPhaseId, setSelectedPhase, toggleProjectCollapse])

  const handleMouseDown = useCallback((
    event: React.MouseEvent,
    phaseId: string,
    projectId: string,
    mode: 'move' | 'resize-right' | 'resize-left'
  ) => {
    if (!canEdit) return

    event.preventDefault()
    const phase = projects.find((project) => project.id === projectId)?.phases?.find((item) => item.id === phaseId)
    if (!phase) return

    setDragging({
      phaseId,
      projectId,
      startX: event.clientX,
      origStart: phase.start_date,
      origEnd: phase.end_date,
      mode,
    })
  }, [projects, canEdit])

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (!dragging) return

    const dx = event.clientX - dragging.startX
    const daysDelta = Math.round(dx / pixelsPerDay)
    if (daysDelta === 0) return

    setProjects((currentProjects) => currentProjects.map((project) => {
      if (project.id !== dragging.projectId) return project

      return {
        ...project,
        phases: (project.phases || []).map((phase) => {
          if (phase.id !== dragging.phaseId) return phase

          const origStart = parseISO(dragging.origStart)
          const origEnd = parseISO(dragging.origEnd)

          if (dragging.mode === 'move') {
            return {
              ...phase,
              start_date: format(addDays(origStart, daysDelta), 'yyyy-MM-dd'),
              end_date: format(addDays(origEnd, daysDelta), 'yyyy-MM-dd'),
            }
          }

          if (dragging.mode === 'resize-right') {
            const newEnd = addDays(origEnd, daysDelta)
            if (newEnd <= origStart) return phase

            return { ...phase, end_date: format(newEnd, 'yyyy-MM-dd') }
          }

          const newStart = addDays(origStart, daysDelta)
          if (newStart >= origEnd) return phase

          return { ...phase, start_date: format(newStart, 'yyyy-MM-dd') }
        }),
      }
    }))
  }, [dragging, pixelsPerDay])

  const handleMouseUp = useCallback(async () => {
    if (!dragging) return

    const snapshot = dragging
    setDragging(null)

    const phase = projects.find((project) => project.id === snapshot.projectId)?.phases?.find((item) => item.id === snapshot.phaseId)
    if (!phase) return

    // Net days the moved phase shifted (only meaningful for a 'move' drag).
    const deltaDays = differenceInDays(parseISO(phase.start_date), parseISO(snapshot.origStart))

    // Cascade: when in "move this + later" mode and the bar was moved (not
    // resized), shift every later phase in the same project by the same delta,
    // preserving each task's duration.
    const shouldCascade = shiftMode === 'cascade' && snapshot.mode === 'move' && deltaDays !== 0

    const project = projects.find((p) => p.id === snapshot.projectId)
    const cascadePhases = shouldCascade && project
      ? (project.phases || []).filter(
          (p) => p.id !== snapshot.phaseId && p.start_date >= snapshot.origStart
        )
      : []

    // Build the optimistic shifted versions for the cascade set.
    const cascadeUpdates = cascadePhases.map((p) => ({
      id: p.id,
      origStart: p.start_date,
      origEnd: p.end_date,
      start_date: format(addDays(parseISO(p.start_date), deltaDays), 'yyyy-MM-dd'),
      end_date: format(addDays(parseISO(p.end_date), deltaDays), 'yyyy-MM-dd'),
    }))

    if (cascadeUpdates.length > 0) {
      setProjects((currentProjects) =>
        currentProjects.map((proj) => {
          if (proj.id !== snapshot.projectId) return proj
          const byId = new Map(cascadeUpdates.map((u) => [u.id, u]))
          return {
            ...proj,
            phases: (proj.phases || []).map((p) => {
              const u = byId.get(p.id)
              return u ? { ...p, start_date: u.start_date, end_date: u.end_date } : p
            }),
          }
        })
      )
    }

    const supabase = createClient()
    const updatedAt = new Date().toISOString()

    // Persist the moved phase plus any cascaded phases.
    const writes = [
      supabase
        .from('phases')
        .update({ start_date: phase.start_date, end_date: phase.end_date, updated_at: updatedAt })
        .eq('id', phase.id),
      ...cascadeUpdates.map((u) =>
        supabase
          .from('phases')
          .update({ start_date: u.start_date, end_date: u.end_date, updated_at: updatedAt })
          .eq('id', u.id)
      ),
    ]

    const results = await Promise.all(writes)
    const failed = results.some((r) => r.error)

    if (failed) {
      // Revert the moved phase and every cascaded phase to their originals.
      setProjects((currentProjects) =>
        currentProjects.map((proj) => {
          if (proj.id !== snapshot.projectId) return proj
          const revertById = new Map(cascadeUpdates.map((u) => [u.id, u]))
          return {
            ...proj,
            phases: (proj.phases || []).map((p) => {
              if (p.id === snapshot.phaseId) {
                return { ...p, start_date: snapshot.origStart, end_date: snapshot.origEnd }
              }
              const u = revertById.get(p.id)
              return u ? { ...p, start_date: u.origStart, end_date: u.origEnd } : p
            }),
          }
        })
      )
      return
    }

    await touchProjectAudit(supabase, snapshot.projectId, currentUserId, updatedAt)
  }, [currentUserId, dragging, projects, shiftMode])

  const handlePhaseUpdate = useCallback((updatedPhase: Phase) => {
    setProjects((currentProjects) => currentProjects.map((project) => ({
      ...project,
      phases: (project.phases || []).map((phase) => phase.id === updatedPhase.id ? updatedPhase : phase),
    })))
  }, [])

  const handleFitTimeline = useCallback(() => {
    if (!scheduleBounds) return

    fitViewToRange(scheduleBounds.start, scheduleBounds.end)
  }, [fitViewToRange, scheduleBounds])

  useEffect(() => {
    if (!scheduleBounds || hasAutoFittedRef.current) return

    handleFitTimeline()
    hasAutoFittedRef.current = true
  }, [handleFitTimeline, scheduleBounds])

  useEffect(() => {
    if (!timelineScrollRef.current) return

    timelineScrollRef.current.scrollLeft = 0
  }, [viewStart, viewEnd])

  if (isMobile) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-shrink-0 border-b border-slate-200 bg-white px-4 py-3">
          <h1 className="text-lg font-bold text-slate-900">Gantt Chart</h1>
          <p className="text-xs text-slate-400 mt-0.5">{projects.length} project{projects.length !== 1 ? 's' : ''} · Tap a phase to view details</p>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <GanttMobileList
              projects={projects}
              selectedPhaseId={selectedPhaseId}
              onSelectPhase={(phase) => {
                setSelectedPhase(selectedPhaseId === phase.id ? null : phase.id)
              }}
            />
          </div>
          {selectedPhase && selectedProject && (
            <GanttEditPanel
              key={selectedPhase.id}
              phase={selectedPhase}
              project={selectedProject}
              companyId={companyId}
              members={members}
              currentUserId={currentUserId}
              onClose={() => setSelectedPhase(null)}
              onUpdate={handlePhaseUpdate}
              canEdit={canEdit}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex h-full flex-col"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <GanttToolbar
        projectCount={projects.length}
        canFitTimeline={Boolean(scheduleBounds)}
        onFitTimeline={handleFitTimeline}
        projects={projects}
      />

      <div className="flex flex-1 overflow-hidden border-t border-slate-200">
        <GanttSidebar
          projects={projects}
          headerHeight={headerHeight}
          rowHeight={ROW_HEIGHT}
          projectRowHeight={PROJECT_ROW_HEIGHT}
          rowsRef={sidebarScrollRef}
          onRowsScroll={handleSidebarScroll}
        />

        <div
          ref={timelineScrollRef}
          onScroll={handleTimelineScroll}
          className="flex-1 overflow-auto bg-gradient-to-br from-white via-slate-50 to-slate-100/50"
        >
          <div style={{ width: totalWidth, minWidth: '100%' }}>
            <GanttTimelineHeader
              viewStart={viewStart}
              viewEnd={viewEnd}
              zoom={zoom}
              pixelsPerDay={pixelsPerDay}
              height={headerHeight}
            />

            <div className="relative">
              {projects.map((project) => {
                const isCollapsed = collapsedProjects.has(project.id)
                const phases = project.phases || []

                return (
                  <div key={project.id}>
                    <ProjectSummaryRow
                      project={project}
                      viewStart={viewStart}
                      viewEnd={viewEnd}
                      pixelsPerDay={pixelsPerDay}
                      totalDays={totalDays}
                      rowHeight={PROJECT_ROW_HEIGHT}
                      zoom={zoom}
                      isCollapsed={isCollapsed}
                      onToggleCollapse={() => handleProjectToggle(project.id)}
                    />

                    {!isCollapsed && phases.map((phase) => (
                      <GanttPhaseRow
                        key={phase.id}
                        phase={phase}
                        assignee={phase.assigned_to ? memberMap[phase.assigned_to] ?? null : null}
                        viewStart={viewStart}
                        viewEnd={viewEnd}
                        pixelsPerDay={pixelsPerDay}
                        totalDays={totalDays}
                        rowHeight={ROW_HEIGHT}
                        zoom={zoom}
                        isSelected={selectedPhaseId === phase.id}
                        onSelect={() => setSelectedPhase(selectedPhaseId === phase.id ? null : phase.id)}
                        onMouseDown={(event, mode) => handleMouseDown(event, phase.id, project.id, mode)}
                        isDragging={dragging?.phaseId === phase.id}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {selectedPhase && selectedProject && (
          <GanttEditPanel
            key={selectedPhase.id}
            phase={selectedPhase}
            project={selectedProject}
            companyId={companyId}
            members={members}
            currentUserId={currentUserId}
            onClose={() => setSelectedPhase(null)}
            onUpdate={handlePhaseUpdate}
            canEdit={canEdit}
          />
        )}
      </div>
    </div>
  )
}

function GanttTimelineHeader({
  viewStart,
  viewEnd,
  zoom,
  pixelsPerDay,
  height,
}: {
  viewStart: Date
  viewEnd: Date
  zoom: ZoomLevel
  pixelsPerDay: number
  height: number
}) {
  const headers = getTimelineHeaders(zoom, viewStart, viewEnd)
  const cellWidth = zoom === 'day' ? pixelsPerDay : zoom === 'week' ? pixelsPerDay * 7 : pixelsPerDay * 30

  return (
    <div className="sticky top-0 z-10 flex border-b border-slate-200 bg-gradient-to-b from-white to-slate-50 shadow-sm" style={{ height }}>
      {headers.map((header, index) => (
        <div
          key={index}
          className={cn(
            'flex flex-shrink-0 items-center justify-center border-r border-slate-100 text-xs font-semibold transition-colors',
            header.isToday
              ? 'bg-gradient-to-b from-indigo-50 to-indigo-25 text-indigo-700 border-r-indigo-200'
              : header.isWeekend
                ? 'bg-slate-50/60 text-slate-500'
                : 'text-slate-700 bg-white'
          )}
          style={{ width: cellWidth, minWidth: cellWidth }}
        >
          <div className="flex flex-col items-center justify-center gap-1 leading-tight">
            {zoom === 'day' && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {format(header.date, 'MMM')}
              </span>
            )}
            <span className="font-semibold">{header.label}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function GridLines({ totalDays, pixelsPerDay, zoom }: { totalDays: number; pixelsPerDay: number; zoom: ZoomLevel }) {
  const interval = zoom === 'day' ? 1 : zoom === 'week' ? 7 : 30
  const lines: number[] = []

  for (let day = 0; day <= totalDays; day += interval) {
    lines.push(day)
  }

  return (
    <>
      {lines.map((day) => (
        <div
          key={day}
          className="absolute bottom-0 top-0 border-r border-slate-100"
          style={{ left: day * pixelsPerDay }}
        />
      ))}
    </>
  )
}

function TodayLine({ viewStart, pixelsPerDay }: { viewStart: Date; pixelsPerDay: number }) {
  const today = new Date()
  const offset = differenceInDays(today, viewStart) * pixelsPerDay + pixelsPerDay / 2
  if (offset < 0) return null

  return (
    <div
      className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-rose-500"
      style={{ left: offset }}
    >
      <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-rose-500" />
    </div>
  )
}

function ProjectSummaryRow({
  project,
  viewStart,
  viewEnd,
  pixelsPerDay,
  totalDays,
  rowHeight,
  zoom,
  isCollapsed,
  onToggleCollapse,
}: {
  project: Project
  viewStart: Date
  viewEnd: Date
  pixelsPerDay: number
  totalDays: number
  rowHeight: number
  zoom: ZoomLevel
  isCollapsed: boolean
  onToggleCollapse: () => void
}) {
  const { left, width, clippedStart, clippedEnd, startsAfterView, endsBeforeView } = getClippedBarPosition(
    project.start_date,
    project.end_date,
    viewStart,
    viewEnd,
    pixelsPerDay
  )
  const barWidth = clippedStart || clippedEnd ? width : Math.max(width, 28)
  const showProjectName = barWidth > 88
  const showDateRange = barWidth > 220

  return (
    <div
      className="relative cursor-pointer border-b border-slate-200 bg-slate-50 transition-colors hover:bg-slate-100/80"
      style={{ height: rowHeight }}
      onClick={onToggleCollapse}
    >
      <GridLines totalDays={totalDays} pixelsPerDay={pixelsPerDay} zoom={zoom} />
      <TodayLine viewStart={viewStart} pixelsPerDay={pixelsPerDay} />

      {width > 0 && (
        <div
          className={cn(
            'absolute top-1/2 flex -translate-y-1/2 items-center gap-3 px-3 text-white shadow-sm',
            !clippedStart && 'rounded-l-lg',
            !clippedEnd && 'rounded-r-lg',
            isCollapsed ? 'opacity-100' : 'opacity-90'
          )}
          style={{
            left,
            width: barWidth,
            height: rowHeight - 18,
            backgroundColor: project.color,
          }}
        >
          {showProjectName && (
            <span className="min-w-0 flex-1 truncate text-xs font-semibold">{project.name}</span>
          )}
          {showDateRange && (
            <span className="flex-shrink-0 text-[10px] font-medium text-white/90">
              {formatDate(project.start_date, 'MMM d')} - {formatDate(project.end_date, 'MMM d')}
            </span>
          )}
        </div>
      )}

      {width === 0 && (
        <div
          className={cn(
            'absolute top-1/2 max-w-64 -translate-y-1/2 truncate rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm',
            startsAfterView ? 'right-3' : 'left-3'
          )}
        >
          {project.name} {endsBeforeView ? `ended ${formatDate(project.end_date, 'MMM d')}` : `starts ${formatDate(project.start_date, 'MMM d')}`}
        </div>
      )}
    </div>
  )
}

function GanttPhaseRow({
  phase,
  assignee,
  viewStart,
  viewEnd,
  pixelsPerDay,
  totalDays,
  rowHeight,
  zoom,
  isSelected,
  onSelect,
  onMouseDown,
  isDragging,
}: {
  phase: Phase
  assignee: Profile | null
  viewStart: Date
  viewEnd: Date
  pixelsPerDay: number
  totalDays: number
  rowHeight: number
  zoom: ZoomLevel
  isSelected: boolean
  onSelect: () => void
  onMouseDown: (event: React.MouseEvent, mode: 'move' | 'resize-right' | 'resize-left') => void
  isDragging: boolean | undefined
}) {
  const { left, width, clippedStart, clippedEnd } = getClippedBarPosition(
    phase.start_date,
    phase.end_date,
    viewStart,
    viewEnd,
    pixelsPerDay
  )
  const visibleWidth = clippedStart || clippedEnd ? width : Math.max(width, 20)
  const overdue = isOverdue(phase.end_date, phase.status)
  const barColor = phase.color || PHASE_STATUS_COLORS[phase.status as PhaseStatus]
  const percentComplete = getPhasePercentComplete(phase)
  const isMilestone = Boolean(phase.is_milestone)
  const isCriticalPath = Boolean(phase.is_critical_path)
  const assignedTrade = phase.assigned_trade?.trim() || null
  const barWidth = isMilestone ? Math.max(visibleWidth, 18) : visibleWidth
  const showName = isMilestone ? barWidth > 52 : barWidth > 60
  const showPercent = barWidth > 116
  const showAssigneeBadge = Boolean(assignee) && barWidth > 150
  const showTradeBadge = !assignee && Boolean(assignedTrade) && barWidth > 146
  const showMilestoneLabel = isMilestone && barWidth <= 52
  const barTitle = [
    phase.name,
    `${percentComplete}% complete`,
    assignee ? `Assigned to ${assignee.full_name}` : assignedTrade ? `Assigned to ${assignedTrade}` : 'Unassigned',
    isMilestone ? 'Milestone' : null,
    isCriticalPath ? 'Critical path' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="relative border-b border-slate-100/50 transition-colors hover:bg-indigo-50/20" style={{ height: rowHeight }}>
      <GridLines totalDays={totalDays} pixelsPerDay={pixelsPerDay} zoom={zoom} />
      <TodayLine viewStart={viewStart} pixelsPerDay={pixelsPerDay} />

      {width > 0 && (
        <div
          className={cn(
            'absolute top-1/2 flex -translate-y-1/2 items-center select-none overflow-visible transition-all duration-150',
            !clippedStart && 'rounded-l-lg',
            !clippedEnd && 'rounded-r-lg',
            isSelected ? 'ring-2 ring-indigo-600 ring-offset-2 shadow-xl' : 'shadow-md hover:shadow-lg',
            isDragging ? 'cursor-grabbing opacity-90 shadow-2xl' : 'cursor-grab',
            overdue && phase.status !== 'completed' && 'ring-1 ring-rose-500',
            isCriticalPath && 'border-2 border-dashed border-rose-300'
          )}
          style={{
            left,
            width: barWidth,
            height: rowHeight - 8,
            backgroundColor: barColor,
            opacity: isDragging ? 0.9 : 1,
          }}
          title={barTitle}
          onClick={onSelect}
          onMouseDown={(event) => onMouseDown(event, 'move')}
        >
          {!clippedStart && (
            <div
              className="absolute bottom-0 left-0 top-0 w-2 cursor-ew-resize rounded-l-md hover:bg-black/10"
              onMouseDown={(event) => {
                event.stopPropagation()
                onMouseDown(event, 'resize-left')
              }}
            />
          )}

          <div className="pointer-events-none flex min-w-0 flex-1 items-center gap-2 px-2">
            {isMilestone && (
              <span className="h-2.5 w-2.5 flex-shrink-0 rotate-45 rounded-[2px] border border-white/80 bg-white/70" />
            )}

            {showAssigneeBadge && assignee && (
              <span
                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-black/15 text-[9px] font-bold text-white"
                title={assignee.full_name}
              >
                {getInitials(assignee.full_name)}
              </span>
            )}

            {showTradeBadge && assignedTrade && (
              <span
                className="max-w-24 flex-shrink-0 truncate rounded-full bg-black/15 px-2 py-0.5 text-[10px] font-medium text-white/90"
                title={assignedTrade}
              >
                {assignedTrade}
              </span>
            )}

            {showName && (
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-white drop-shadow-sm">
                {phase.name}
              </span>
            )}

            {showPercent && (
              <span className="flex-shrink-0 text-[10px] font-semibold text-white/90">
                {percentComplete}%
              </span>
            )}
          </div>

          {!clippedEnd && (
            <div
              className="absolute bottom-0 right-0 top-0 w-2 cursor-ew-resize rounded-r-md hover:bg-black/10"
              onMouseDown={(event) => {
                event.stopPropagation()
                onMouseDown(event, 'resize-right')
              }}
            />
          )}
        </div>
      )}

      {width > 0 && isMilestone && (
        <>
          <div
            className="pointer-events-none absolute top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 rotate-45 border-2 border-white shadow-sm"
            style={{
              left: left + Math.max(barWidth - 7, 0),
              backgroundColor: barColor,
            }}
          />
          {showMilestoneLabel && (
            <span
              className="pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 whitespace-nowrap text-[11px] font-semibold text-slate-700"
              style={{ left: left + barWidth + 10 }}
            >
              {phase.name}
            </span>
          )}
        </>
      )}
    </div>
  )
}

function getInitials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}
