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
import { autoSyncPhaseIfEnabled } from '@/app/app/projects/[id]/scheduleActions'
import { useGanttStore, type ColorMode } from '@/stores/ganttStore'
import { Phase, PhaseStatus, Profile, Project, ZoomLevel } from '@/types/app'
import { cn } from '@/lib/utils'
import { getClippedBarPosition } from '@/lib/gantt'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { GanttEditPanel } from './GanttEditPanel'
import { GanttMobileList } from './GanttMobileList'
import { GanttMobileTimeline } from './GanttMobileTimeline'
import { GanttSidebar } from './GanttSidebar'
import { GanttToolbar } from './GanttToolbar'
import {
  useGanttIntel, useMoveGate, impactForMove,
  MoveImpactDialog, LookaheadModal, BaselineCompareModal, CompletionChip,
  type PendingMove, type BaselineData,
} from './GanttIntel'
import { logScheduleChange, setBaseline } from '@/app/app/projects/[id]/intelActions'
import { REASON_PROMPT_THRESHOLD_DAYS } from '@/lib/activity/log'
import { useGanttHistory, type GanttEdit } from './useGanttHistory'

interface GanttChartProps {
  projects: Project[]
  companyId: string
  members: Profile[]
  currentUserId: string
  canEdit: boolean
  canPrint: boolean
}

const ROW_HEIGHT = 40
const BASE_HEADER_HEIGHT = 56
const PROJECT_ROW_HEIGHT = 56

export function GanttChart({ projects: initialProjects, companyId, members, currentUserId, canEdit, canPrint }: GanttChartProps) {
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
  const [mobileView, setMobileView] = useState<'timeline' | 'list'>('timeline')

  // Server refetches (board filter change, router.refresh) hand down a new
  // project list — adopt it, otherwise the chart keeps showing the first load.
  useEffect(() => {
    setProjects(initialProjects)
  }, [initialProjects])

  // Schedule intelligence: dependencies, baselines, CPM per project.
  const intel = useGanttIntel(projects)
  const [showCritical, setShowCritical] = useState(false)
  const [showBaseline, setShowBaseline] = useState(true)
  const [showLookahead, setShowLookahead] = useState(false)
  const [compareProjectId, setCompareProjectId] = useState<string | null>(null)
  const moveGate = useMoveGate()
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

  /**
   * The single place phase dates are written. Optimistic first, reverted as a
   * whole if any row fails, so a partial cascade can never be left on screen.
   * Undo and redo go through here too rather than reimplementing the write.
   */
  const writePhaseDates = useCallback(async (
    projectId: string,
    rows: { id: string; start: string; end: string }[],
  ): Promise<boolean> => {
    if (!rows.length) return true
    const before = new Map<string, { start: string; end: string }>()
    setProjects((currentProjects) => currentProjects.map((project) => {
      if (project.id !== projectId) return project
      const byId = new Map(rows.map((r) => [r.id, r]))
      return {
        ...project,
        phases: (project.phases || []).map((phase) => {
          const row = byId.get(phase.id)
          if (!row) return phase
          before.set(phase.id, { start: phase.start_date, end: phase.end_date })
          return { ...phase, start_date: row.start, end_date: row.end }
        }),
      }
    }))

    const supabase = createClient()
    const updatedAt = new Date().toISOString()
    const results = await Promise.all(rows.map((r) =>
      supabase.from('phases')
        .update({ start_date: r.start, end_date: r.end, updated_at: updatedAt })
        .eq('id', r.id)))

    if (results.some((r) => r.error)) {
      setProjects((currentProjects) => currentProjects.map((project) => {
        if (project.id !== projectId) return project
        return {
          ...project,
          phases: (project.phases || []).map((phase) => {
            const orig = before.get(phase.id)
            return orig ? { ...phase, start_date: orig.start, end_date: orig.end } : phase
          }),
        }
      }))
      return false
    }

    await touchProjectAudit(supabase, projectId, currentUserId, updatedAt)
    for (const r of rows) autoSyncPhaseIfEnabled(r.id).catch(() => {})
    return true
  }, [currentUserId])

  /** Same contract as writePhaseDates, for the inline percent handle. */
  const writePhasePercents = useCallback(async (
    projectId: string,
    rows: { id: string; percent: number }[],
  ): Promise<boolean> => {
    if (!rows.length) return true
    const before = new Map<string, number>()
    setProjects((currentProjects) => currentProjects.map((project) => {
      if (project.id !== projectId) return project
      const byId = new Map(rows.map((r) => [r.id, r]))
      return {
        ...project,
        phases: (project.phases || []).map((phase) => {
          const row = byId.get(phase.id)
          if (!row) return phase
          before.set(phase.id, getPhasePercentComplete(phase))
          return { ...phase, percent_complete: row.percent }
        }),
      }
    }))

    const supabase = createClient()
    const updatedAt = new Date().toISOString()
    const results = await Promise.all(rows.map((r) =>
      supabase.from('phases')
        .update({ percent_complete: r.percent, updated_at: updatedAt })
        .eq('id', r.id)))

    if (results.some((r) => r.error)) {
      setProjects((currentProjects) => currentProjects.map((project) => {
        if (project.id !== projectId) return project
        return {
          ...project,
          phases: (project.phases || []).map((phase) => {
            const orig = before.get(phase.id)
            return orig === undefined ? phase : { ...phase, percent_complete: orig }
          }),
        }
      }))
      return false
    }

    await touchProjectAudit(supabase, projectId, currentUserId, updatedAt)
    return true
  }, [currentUserId])

  // Undo / redo. An entry whose phases are no longer loaded (the board filter
  // changed, someone deleted the phase) is dropped rather than half-applied.
  const applyEdit = useCallback(async (edit: GanttEdit, direction: 'undo' | 'redo'): Promise<boolean> => {
    const project = projects.find((p) => p.id === edit.projectId)
    const phases = new Map((project?.phases || []).map((p) => [p.id, p]))

    if (edit.kind === 'dates') {
      const rows = edit.phases.flatMap((p) => {
        const live = phases.get(p.id)
        if (!live) return []
        // Only touch a phase that still holds the value this entry left it at.
        // If it was changed since — in the side panel, or by a teammate — that
        // newer edit wins rather than being silently rolled back.
        const expect = direction === 'undo' ? p.to : p.from
        if (live.start_date !== expect.start || live.end_date !== expect.end) return []
        const next = direction === 'undo' ? p.from : p.to
        return [{ id: p.id, start: next.start, end: next.end }]
      })
      if (!rows.length) return false
      return writePhaseDates(edit.projectId, rows)
    }

    const rows = edit.phases.flatMap((p) => {
      const live = phases.get(p.id)
      if (!live) return []
      const expect = direction === 'undo' ? p.to : p.from
      if (getPhasePercentComplete(live) !== expect) return []
      return [{ id: p.id, percent: direction === 'undo' ? p.from : p.to }]
    })
    if (!rows.length) return false
    return writePhasePercents(edit.projectId, rows)
  }, [projects, writePhaseDates, writePhasePercents])

  const history = useGanttHistory(applyEdit)

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

  /**
   * Commits a gated or ungated schedule change: writes the rows, records
   * undo history, and logs the timeline event (with the reason when given).
   */
  const commitScheduleChange = useCallback(async (input: {
    projectId: string
    phase: Phase
    mode: 'move' | 'resize'
    from: { start: string; end: string }
    cascadeUpdates: { id: string; name: string; origStart: string; origEnd: string; start_date: string; end_date: string }[]
    reason: string | null
  }) => {
    const { projectId, phase, mode, from, cascadeUpdates, reason } = input
    if (cascadeUpdates.length > 0) {
      setProjects((currentProjects) =>
        currentProjects.map((proj) => {
          if (proj.id !== projectId) return proj
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

    const rows = [
      { id: phase.id, start: phase.start_date, end: phase.end_date },
      ...cascadeUpdates.map((u) => ({ id: u.id, start: u.start_date, end: u.end_date })),
    ]
    const ok = await writePhaseDates(projectId, rows)
    if (!ok) return

    // Record both sides so Undo restores exact dates rather than re-deriving
    // a delta, which would drift if anything else moved in between.
    history.push({
      kind: 'dates',
      projectId,
      label: cascadeUpdates.length
        ? `move "${phase.name}" and ${cascadeUpdates.length} later phase${cascadeUpdates.length === 1 ? '' : 's'}`
        : `${mode === 'move' ? 'move' : 'resize'} "${phase.name}"`,
      phases: [
        { id: phase.id, from, to: { start: phase.start_date, end: phase.end_date } },
        ...cascadeUpdates.map((u) => ({
          id: u.id,
          from: { start: u.origStart, end: u.origEnd },
          to: { start: u.start_date, end: u.end_date },
        })),
      ],
    })

    // One event on the universal timeline, cascade summarized inside it.
    void logScheduleChange({
      projectId,
      phaseId: phase.id,
      phaseName: phase.name,
      kind: mode,
      from,
      to: { start: phase.start_date, end: phase.end_date },
      reason,
      cascaded: cascadeUpdates.map((u) => ({
        name: u.name,
        from: { start: u.origStart, end: u.origEnd },
        to: { start: u.start_date, end: u.end_date },
      })),
    })
  }, [history, writePhaseDates])

  // Cascade rows computed at drag end, consumed when the dialog resolves.
  const pendingCascadeRef = useRef<{ id: string; name: string; origStart: string; origEnd: string; start_date: string; end_date: string }[]>([])

  const handleMouseUp = useCallback(async () => {
    if (!dragging) return

    const snapshot = dragging
    setDragging(null)

    const project = projects.find((p) => p.id === snapshot.projectId)
    const phase = project?.phases?.find((item) => item.id === snapshot.phaseId)
    if (!phase || !project) return

    const startDelta = differenceInDays(parseISO(phase.start_date), parseISO(snapshot.origStart))
    const endDelta = differenceInDays(parseISO(phase.end_date), parseISO(snapshot.origEnd))
    if (startDelta === 0 && endDelta === 0) return
    const deltaDays = snapshot.mode === 'move' ? startDelta : endDelta

    // Legacy cascade mode: shift every later phase in the project.
    const shouldCascade = shiftMode === 'cascade' && snapshot.mode === 'move' && deltaDays !== 0
    const cascadePhases = shouldCascade
      ? (project.phases || []).filter((p) => p.id !== snapshot.phaseId && p.start_date >= snapshot.origStart)
      : []
    const cascadeUpdates = cascadePhases.map((p) => ({
      id: p.id,
      name: p.name,
      origStart: p.start_date,
      origEnd: p.end_date,
      start_date: format(addDays(parseISO(p.start_date), deltaDays), 'yyyy-MM-dd'),
      end_date: format(addDays(parseISO(p.end_date), deltaDays), 'yyyy-MM-dd'),
    }))

    const from = { start: snapshot.origStart, end: snapshot.origEnd }

    // Dependency impact: what a delayed finish pushes downstream. Computed
    // against the ORIGINAL dates so the math sees the schedule as it stood.
    const deps = intel.depsByProject.get(project.id) ?? []
    const origPhases = (project.phases || []).map((p) =>
      p.id === phase.id ? { ...p, start_date: snapshot.origStart, end_date: snapshot.origEnd } : p)
    const impact = endDelta !== 0 && deps.length > 0 && !shouldCascade
      ? impactForMove({ ...project, phases: origPhases }, deps, phase.id, endDelta)
      : { affected: [], completionDeltaDays: 0, newCompletionDate: null, cycleError: false }

    const askReason = Math.abs(deltaDays) >= REASON_PROMPT_THRESHOLD_DAYS
    // Communicate before cascading: any downstream movement, or any move big
    // enough to deserve a reason, goes through the dialog first.
    if ((impact.affected.length > 0 || askReason) && canEdit) {
      pendingCascadeRef.current = cascadeUpdates
      moveGate.setPending({
        phase,
        projectId: project.id,
        kind: snapshot.mode === 'move' ? 'move' : 'resize',
        deltaDays,
        from,
        to: { start: phase.start_date, end: phase.end_date },
        impact,
        askReason,
      })
      return
    }

    await commitScheduleChange({
      projectId: project.id, phase, mode: snapshot.mode === 'move' ? 'move' : 'resize',
      from, cascadeUpdates, reason: null,
    })
  }, [canEdit, commitScheduleChange, dragging, intel.depsByProject, moveGate, projects, shiftMode])

  /** Dialog resolution: apply (optionally with downstream) or revert. */
  const resolvePendingMove = useCallback(async (reason: string | null, applyDownstream: boolean) => {
    const pending = moveGate.pending
    if (!pending) return
    moveGate.clear()
    const project = projects.find((p) => p.id === pending.projectId)
    const phase = project?.phases?.find((p) => p.id === pending.phase.id)
    if (!phase || !project) return

    // Downstream rows from the dependency impact, when accepted.
    const downstream = applyDownstream
      ? pending.impact.affected.map((a) => {
          const orig = (project.phases || []).find((p) => p.id === a.id)
          return orig ? {
            id: a.id, name: a.name,
            origStart: orig.start_date, origEnd: orig.end_date,
            start_date: a.newStart, end_date: a.newEnd,
          } : null
        }).filter((x): x is NonNullable<typeof x> => !!x)
      : []
    // Legacy shiftMode cascade and dependency-driven rows never coexist:
    // impact is only computed when the cascade mode is off.
    const cascadeUpdates = [...pendingCascadeRef.current, ...downstream]
    pendingCascadeRef.current = []

    await commitScheduleChange({
      projectId: pending.projectId, phase, mode: pending.kind,
      from: pending.from, cascadeUpdates, reason,
    })
  }, [commitScheduleChange, moveGate, projects])

  const cancelPendingMove = useCallback(() => {
    const pending = moveGate.pending
    if (!pending) return
    moveGate.clear()
    pendingCascadeRef.current = []
    // Put the dragged bar back where it was.
    setProjects((currentProjects) => currentProjects.map((proj) => {
      if (proj.id !== pending.projectId) return proj
      return {
        ...proj,
        phases: (proj.phases || []).map((p) =>
          p.id === pending.phase.id ? { ...p, start_date: pending.from.start, end_date: pending.from.end } : p),
      }
    }))
  }, [moveGate])


  useEffect(() => {
    if (!canEdit) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); history.undo() }
      else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); history.redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canEdit, history])

  const handlePhaseUpdate = useCallback((updatedPhase: Phase) => {
    setProjects((currentProjects) => currentProjects.map((project) => ({
      ...project,
      phases: (project.phases || []).map((phase) => phase.id === updatedPhase.id ? updatedPhase : phase),
    })))
  }, [])

  // Inline percent edit straight from a Gantt bar.
  const handlePhasePercent = useCallback(async (phaseId: string, projectId: string, rawPercent: number) => {
    const percent = Math.max(0, Math.min(100, Math.round(rawPercent)))

    const project = projects.find((p) => p.id === projectId)
    const target = (project?.phases || []).find((p) => p.id === phaseId)
    if (!target) return
    const previous = getPhasePercentComplete(target)
    if (previous === percent) return

    const ok = await writePhasePercents(projectId, [{ id: phaseId, percent }])
    if (!ok) return

    history.push({
      kind: 'percent',
      projectId,
      label: `set "${target.name}" to ${percent}%`,
      phases: [{ id: phaseId, from: previous, to: percent }],
    })
  }, [history, projects, writePhasePercents])

  // Click-and-drag panning on empty timeline background.
  const panRef = useRef<{ startX: number; scrollLeft: number } | null>(null)

  const handleTimelinePanStart = useCallback((event: React.MouseEvent) => {
    if (event.button !== 0) return
    // Let bar drags (move/resize) handle their own mousedown.
    if ((event.target as HTMLElement).closest('[data-bar]')) return
    const el = timelineScrollRef.current
    if (!el) return

    panRef.current = { startX: event.clientX, scrollLeft: el.scrollLeft }

    const handleMove = (e: MouseEvent) => {
      if (!panRef.current || !timelineScrollRef.current) return
      timelineScrollRef.current.scrollLeft = panRef.current.scrollLeft - (e.clientX - panRef.current.startX)
    }
    const handleUp = () => {
      panRef.current = null
      el.style.cursor = ''
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    el.style.cursor = 'grabbing'
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
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
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900">Gantt</h1>
              <p className="mt-0.5 truncate text-xs text-slate-400">
                {projects.length} project{projects.length !== 1 ? 's' : ''} · tap a bar for details
              </p>
            </div>
            {/* Timeline ⇄ List toggle */}
            <div className="flex flex-shrink-0 items-center rounded-lg bg-slate-100 p-0.5">
              <button
                onClick={() => setMobileView('timeline')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                  mobileView === 'timeline' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                )}
              >
                Timeline
              </button>
              <button
                onClick={() => setMobileView('list')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                  mobileView === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                )}
              >
                List
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden bg-white">
          {mobileView === 'timeline' ? (
            <GanttMobileTimeline
              projects={projects}
              selectedPhaseId={selectedPhaseId}
              onSelectPhase={(phase) => setSelectedPhase(phase.id)}
            />
          ) : (
            <div className="h-full overflow-y-auto bg-white">
              <GanttMobileList
                projects={projects}
                selectedPhaseId={selectedPhaseId}
                onSelectPhase={(phase) => setSelectedPhase(phase.id)}
              />
            </div>
          )}
        </div>

        {/* Full-screen detail sheet on mobile */}
        {selectedPhase && selectedProject && (
          <div className="fixed inset-0 z-50 flex flex-col bg-white">
            <GanttEditPanel scheduleIntel={selectedProject ? {
                allPhases: selectedProject.phases ?? [],
                deps: intel.depsByProject.get(selectedProject.id) ?? [],
                float: (() => { const a = intel.analyses.get(selectedProject.id); return a?.ok ? (a.phases.get(selectedPhase?.id ?? "")?.totalFloat ?? null) : null })(),
                isCritical: (() => { const a = intel.analyses.get(selectedProject.id); return a?.ok ? a.criticalIds.has(selectedPhase?.id ?? "") : false })(),
                baseline: intel.baselines.get(selectedProject.id)?.phases.get(selectedPhase?.id ?? "") ?? null,
                onDepsChanged: intel.reload,
              } : undefined}
              key={selectedPhase.id}
              phase={selectedPhase}
              project={selectedProject}
              companyId={companyId}
              members={members}
              currentUserId={currentUserId}
              onClose={() => setSelectedPhase(null)}
              onUpdate={handlePhaseUpdate}
              canEdit={canEdit}
              mobile
            />
          </div>
        )}
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
        canPrint={canPrint}
        projects={projects}
        history={canEdit ? history : undefined}
        scheduleIntel={{
          showCritical,
          onToggleCritical: () => setShowCritical((v) => !v),
          showBaseline,
          onToggleBaseline: () => setShowBaseline((v) => !v),
          hasBaseline: projects.length === 1 && intel.baselines.has(projects[0]?.id),
          canBaseline: canEdit && projects.length === 1,
          onSetBaseline: async () => {
            const p = projects[0]
            if (!p) return
            const existing = intel.baselines.has(p.id)
            if (existing && !confirm('Replace the current baseline? The old one is kept in history, and future variance is measured against the new one.')) return
            const res = await setBaseline(p.id)
            if (res.ok) intel.reload()
            else alert(res.error ?? 'Could not set the baseline.')
          },
          onCompare: () => { const p = projects[0]; if (p && intel.baselines.has(p.id)) setCompareProjectId(p.id) },
          onLookahead: () => setShowLookahead(true),
          completionChip: projects.length === 1
            ? <CompletionChip project={projects[0]} baseline={intel.baselines.get(projects[0].id) ?? null} />
            : null,
          cycleWarning: projects.some((p) => { const a = intel.analyses.get(p.id); return a ? !a.ok : false }),
        }}
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
          onMouseDown={handleTimelinePanStart}
          className="flex-1 cursor-grab overflow-auto bg-gradient-to-br from-white via-slate-50 to-slate-100/50 active:cursor-grabbing"
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
                      colorMode={colorMode}
                      isCollapsed={isCollapsed}
                      onToggleCollapse={() => handleProjectToggle(project.id)}
                    />

                    {!isCollapsed && phases.map((phase) => (
                      <GanttPhaseRow
                        key={phase.id}
                        phase={showCritical && (() => { const a = intel.analyses.get(project.id); return a?.ok ? a.criticalIds.has(phase.id) : false })()
                          ? { ...phase, is_critical_path: true }
                          : { ...phase, is_critical_path: false }}
                        baselineBar={showBaseline ? (intel.baselines.get(project.id)?.phases.get(phase.id) ?? null) : null}
                        assignee={phase.assigned_to ? memberMap[phase.assigned_to] ?? null : null}
                        viewStart={viewStart}
                        viewEnd={viewEnd}
                        pixelsPerDay={pixelsPerDay}
                        totalDays={totalDays}
                        rowHeight={ROW_HEIGHT}
                        zoom={zoom}
                        isSelected={selectedPhaseId === phase.id}
                        colorMode={colorMode}
                        canEdit={canEdit}
                        onSelect={() => setSelectedPhase(selectedPhaseId === phase.id ? null : phase.id)}
                        onMouseDown={(event, mode) => handleMouseDown(event, phase.id, project.id, mode)}
                        onPercentChange={(pct) => handlePhasePercent(phase.id, project.id, pct)}
                        isDragging={dragging?.phaseId === phase.id}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {moveGate.pending && (
          <MoveImpactDialog
            pending={moveGate.pending}
            onApply={(reason, applyDownstream) => void resolvePendingMove(reason, applyDownstream)}
            onCancel={cancelPendingMove}
          />
        )}
        {showLookahead && (
          <LookaheadModal projects={projects} depsByProject={intel.depsByProject} onClose={() => setShowLookahead(false)} />
        )}
        {compareProjectId && intel.baselines.get(compareProjectId) && (
          <BaselineCompareModal
            project={projects.find((p) => p.id === compareProjectId) as Project}
            baseline={intel.baselines.get(compareProjectId) as BaselineData}
            onClose={() => setCompareProjectId(null)}
          />
        )}

        {selectedPhase && selectedProject && (
          <GanttEditPanel scheduleIntel={selectedProject ? {
                allPhases: selectedProject.phases ?? [],
                deps: intel.depsByProject.get(selectedProject.id) ?? [],
                float: (() => { const a = intel.analyses.get(selectedProject.id); return a?.ok ? (a.phases.get(selectedPhase?.id ?? "")?.totalFloat ?? null) : null })(),
                isCritical: (() => { const a = intel.analyses.get(selectedProject.id); return a?.ok ? a.criticalIds.has(selectedPhase?.id ?? "") : false })(),
                baseline: intel.baselines.get(selectedProject.id)?.phases.get(selectedPhase?.id ?? "") ?? null,
                onDepsChanged: intel.reload,
              } : undefined}
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
  // Normalize "today" to local midnight so it aligns exactly with bars, whose
  // start dates are parsed from date-only strings (also local midnight). Using
  // raw new Date() (with a time component) drifts against bar math in day zoom.
  const now = new Date()
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const offset = differenceInDays(todayMidnight, viewStart) * pixelsPerDay + pixelsPerDay / 2
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
  colorMode,
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
  colorMode: ColorMode
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
  const neutral = colorMode === 'none'
  const barColor = neutral ? '#cbd5e1' : project.color
  const textClass = neutral ? 'text-slate-700' : 'text-white'

  return (
    <div
      className="relative cursor-pointer border-b border-slate-200 bg-slate-50 transition-colors hover:bg-slate-100/80"
      style={{ height: rowHeight }}
      data-bar
      onClick={onToggleCollapse}
    >
      <GridLines totalDays={totalDays} pixelsPerDay={pixelsPerDay} zoom={zoom} />
      <TodayLine viewStart={viewStart} pixelsPerDay={pixelsPerDay} />

      {width > 0 && (
        <div
          className={cn(
            'absolute top-1/2 flex -translate-y-1/2 items-center gap-3 px-3 shadow-sm',
            textClass,
            !clippedStart && 'rounded-l-lg',
            !clippedEnd && 'rounded-r-lg',
            isCollapsed ? 'opacity-100' : 'opacity-90'
          )}
          style={{
            left,
            width: barWidth,
            height: rowHeight - 18,
            backgroundColor: barColor,
          }}
        >
          {showProjectName && (
            <span className="min-w-0 flex-1 truncate text-xs font-semibold">{project.name}</span>
          )}
          {showDateRange && (
            <span className={cn('flex-shrink-0 text-[10px] font-medium', neutral ? 'text-slate-500' : 'text-white/90')}>
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
  colorMode,
  canEdit,
  onSelect,
  onMouseDown,
  onPercentChange,
  isDragging,
  baselineBar = null,
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
  colorMode: ColorMode
  canEdit: boolean
  onSelect: () => void
  onMouseDown: (event: React.MouseEvent, mode: 'move' | 'resize-right' | 'resize-left') => void
  onPercentChange: (percent: number) => void
  isDragging: boolean | undefined
  /** Baseline window for this phase; renders as a ghost bar underneath. */
  baselineBar?: { start: string; end: string } | null
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
  const statusColor = PHASE_STATUS_COLORS[phase.status as PhaseStatus]
  const barColor =
    colorMode === 'none' ? '#cbd5e1'
    : colorMode === 'status' ? statusColor
    : (phase.color || statusColor)
  const neutral = colorMode === 'none'
  const percentComplete = getPhasePercentComplete(phase)
  const isMilestone = Boolean(phase.is_milestone)
  const isCriticalPath = Boolean(phase.is_critical_path)
  const assignedTrade = phase.assigned_trade?.trim() || null
  const barWidth = isMilestone ? Math.max(visibleWidth, 18) : visibleWidth
  const showLeftDate = !isMilestone && barWidth > 78
  const showPercent = barWidth > 44
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

      {baselineBar && (() => {
        const b = getClippedBarPosition(baselineBar.start, baselineBar.end, viewStart, viewEnd, pixelsPerDay)
        if (b.width <= 0) return null
        const drifted = baselineBar.start !== phase.start_date || baselineBar.end !== phase.end_date
        return (
          <div
            className={cn('pointer-events-none absolute rounded-sm border',
              drifted ? 'border-slate-400/70 bg-slate-300/30' : 'border-slate-300/50 bg-slate-200/20')}
            style={{ left: b.left, width: Math.max(b.width, 6), height: 5, bottom: 3 }}
            title={`Baseline: ${formatDate(baselineBar.start, 'MMM d')} – ${formatDate(baselineBar.end, 'MMM d')}`}
          />
        )
      })()}

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
          data-bar
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

          <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
            {isMilestone && (
              <span className="pointer-events-none h-2.5 w-2.5 flex-shrink-0 rotate-45 rounded-[2px] border border-white/80 bg-white/70" />
            )}

            {/* Date on the LEFT side of the bar */}
            {showLeftDate && (
              <span className={cn('pointer-events-none flex-shrink-0 text-[10px] font-medium tabular-nums', neutral ? 'text-slate-500' : 'text-white/85')}>
                {formatDate(phase.start_date, 'MMM d')}
              </span>
            )}

            <span className="pointer-events-none min-w-0 flex-1" />

            {/* Percent complete INSIDE the bar — editable */}
            {showPercent && (
              <EditablePercent
                value={percentComplete}
                canEdit={canEdit}
                neutral={neutral}
                onChange={onPercentChange}
              />
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
        <div
          className="pointer-events-none absolute top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 rotate-45 border-2 border-white shadow-sm"
          style={{
            left: left + Math.max(barWidth - 7, 0),
            backgroundColor: barColor,
          }}
        />
      )}

      {/* Phase name rendered OUTSIDE the bar, on the right */}
      {width > 0 && !showMilestoneLabel && (
        <span
          className="pointer-events-none absolute top-1/2 z-10 max-w-[40%] -translate-y-1/2 truncate whitespace-nowrap text-xs font-medium text-slate-700"
          style={{ left: left + barWidth + 8 }}
          title={phase.name}
        >
          {phase.name}
        </span>
      )}

      {width > 0 && showMilestoneLabel && (
        <span
          className="pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 whitespace-nowrap text-[11px] font-semibold text-slate-700"
          style={{ left: left + barWidth + 10 }}
        >
          {phase.name}
        </span>
      )}
    </div>
  )
}

function EditablePercent({
  value,
  canEdit,
  neutral,
  onChange,
}: {
  value: number
  canEdit: boolean
  neutral: boolean
  onChange: (percent: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const commit = () => {
    setEditing(false)
    const next = Math.max(0, Math.min(100, Math.round(Number(draft) || 0)))
    if (next !== value) onChange(next)
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={0}
        max={100}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft(String(value)); setEditing(false) }
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-10 flex-shrink-0 rounded bg-white/95 px-1 text-[10px] font-semibold text-slate-800 outline-none ring-1 ring-indigo-400"
      />
    )
  }

  return (
    <span
      role={canEdit ? 'button' : undefined}
      onClick={(e) => {
        if (!canEdit) return
        e.stopPropagation()
        setEditing(true)
      }}
      onMouseDown={(e) => { if (canEdit) e.stopPropagation() }}
      className={cn(
        'flex-shrink-0 rounded px-1 text-[10px] font-semibold tabular-nums',
        neutral ? 'text-slate-600' : 'text-white/90',
        canEdit ? 'cursor-pointer hover:bg-black/10' : 'pointer-events-none'
      )}
      title={canEdit ? 'Click to edit % complete' : undefined}
    >
      {value}%
    </span>
  )
}
