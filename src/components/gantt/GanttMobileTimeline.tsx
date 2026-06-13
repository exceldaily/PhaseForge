'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, CalendarDays, Maximize2 } from 'lucide-react'
import { PHASE_STATUS_COLORS } from '@/lib/constants'
import { differenceInDays, format, formatDate, getTimelineHeaders, parseISO } from '@/lib/dates'
import { getClippedBarPosition } from '@/lib/gantt'
import { getPhasePercentComplete } from '@/lib/phaseProgress'
import { useGanttStore } from '@/stores/ganttStore'
import { Phase, PhaseStatus, Project, ZoomLevel } from '@/types/app'
import { cn } from '@/lib/utils'

interface GanttMobileTimelineProps {
  projects: Project[]
  selectedPhaseId: string | null
  onSelectPhase: (phase: Phase, project: Project) => void
}

const NAME_COL = 124
const HEADER_H = 44
const PROJECT_ROW_H = 44
const PHASE_ROW_H = 36

const ZOOMS: { value: ZoomLevel; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
]

export function GanttMobileTimeline({ projects, selectedPhaseId, onSelectPhase }: GanttMobileTimelineProps) {
  const {
    zoom,
    setZoom,
    viewStart,
    viewEnd,
    pixelsPerDay,
    colorMode,
    collapsedProjects,
    toggleProjectCollapse,
    fitViewToRange,
    scrollToToday,
    shiftView,
    setViewRange,
  } = useGanttStore()

  const [showRange, setShowRange] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const openRange = () => {
    setFromDate(format(viewStart, 'yyyy-MM-dd'))
    setToDate(format(viewEnd, 'yyyy-MM-dd'))
    setShowRange((v) => !v)
  }

  const applyRange = () => {
    if (!fromDate || !toDate) return
    const start = parseISO(fromDate)
    const end = parseISO(toDate)
    setViewRange(start <= end ? start : end, start <= end ? end : start)
    setShowRange(false)
  }

  const totalDays = differenceInDays(viewEnd, viewStart) + 1
  const totalWidth = totalDays * pixelsPerDay
  const cellWidth = zoom === 'day' ? pixelsPerDay : zoom === 'week' ? pixelsPerDay * 7 : pixelsPerDay * 30

  const scheduleBounds = useMemo(() => {
    let earliest: Date | null = null
    let latest: Date | null = null
    const include = (s?: string | null, e?: string | null) => {
      if (!s || !e) return
      const start = parseISO(s)
      const end = parseISO(e)
      if (!earliest || start < earliest) earliest = start
      if (!latest || end > latest) latest = end
    }
    projects.forEach((p) => {
      include(p.start_date, p.end_date)
      ;(p.phases || []).forEach((ph) => include(ph.start_date, ph.end_date))
    })
    return earliest && latest ? { start: earliest as Date, end: latest as Date } : null
  }, [projects])

  // Fit to the whole schedule once, so the bars are actually on-screen.
  const hasFitted = useRef(false)
  useEffect(() => {
    if (!scheduleBounds || hasFitted.current) return
    fitViewToRange(scheduleBounds.start, scheduleBounds.end)
    hasFitted.current = true
  }, [scheduleBounds, fitViewToRange])

  const headers = getTimelineHeaders(zoom, viewStart, viewEnd)
  const neutral = colorMode === 'none'

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Controls */}
      <div className="flex-shrink-0 space-y-2 border-b border-slate-200 bg-white px-3 py-2">
        {/* Zoom (Day → Quarter = zoom out) */}
        <div className="flex items-center rounded-lg bg-slate-100 p-0.5">
          {ZOOMS.map((z) => (
            <button
              key={z.value}
              onClick={() => setZoom(z.value)}
              className={cn(
                'flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors',
                zoom === z.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              )}
            >
              {z.label}
            </button>
          ))}
        </div>

        {/* Navigation: prev · Today · next · Fit · date range */}
        <div className="flex items-center gap-1.5">
          <button onClick={() => shiftView('backward')} className="rounded-lg border border-slate-200 p-2 text-slate-600 active:bg-slate-50" aria-label="Earlier">
            <ChevronLeft size={15} />
          </button>
          <button onClick={scrollToToday} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 active:bg-slate-50">
            Today
          </button>
          <button onClick={() => shiftView('forward')} className="rounded-lg border border-slate-200 p-2 text-slate-600 active:bg-slate-50" aria-label="Later">
            <ChevronRight size={15} />
          </button>
          <div className="flex-1" />
          <button
            onClick={() => scheduleBounds && fitViewToRange(scheduleBounds.start, scheduleBounds.end)}
            disabled={!scheduleBounds}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 active:bg-slate-50 disabled:opacity-40"
          >
            <Maximize2 size={13} /> Fit
          </button>
          <button
            onClick={openRange}
            className={cn(
              'flex items-center rounded-lg border p-2 active:bg-slate-50',
              showRange ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'
            )}
            aria-label="Pick date range"
          >
            <CalendarDays size={15} />
          </button>
        </div>

        {/* Date range picker */}
        {showRange && (
          <div className="flex items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <label className="flex-1 text-[11px] font-medium text-slate-500">
              From
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" />
            </label>
            <label className="flex-1 text-[11px] font-medium text-slate-500">
              To
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" />
            </label>
            <button onClick={applyRange} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white active:bg-indigo-700">
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Scrollable Gantt: frozen name column + frozen header via sticky. */}
      <div className="relative flex-1 overflow-auto overscroll-contain bg-white">
        <div style={{ width: NAME_COL + totalWidth }}>
          {/* Header row */}
          <div className="sticky top-0 z-20 flex" style={{ height: HEADER_H }}>
            <div
              className="sticky left-0 z-30 flex flex-shrink-0 items-center border-b border-r border-slate-200 bg-white px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400"
              style={{ width: NAME_COL }}
            >
              Phase
            </div>
            <div className="relative flex border-b border-slate-200 bg-white" style={{ width: totalWidth }}>
              {headers.map((h, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex flex-shrink-0 items-center justify-center border-r border-slate-100 text-[11px] font-semibold',
                    h.isToday ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600'
                  )}
                  style={{ width: cellWidth, minWidth: cellWidth }}
                >
                  {h.label}
                </div>
              ))}
            </div>
          </div>

          {/* Body rows */}
          {projects.map((project) => {
            const isCollapsed = collapsedProjects.has(project.id)
            const phases = project.phases || []
            const projectPos = getClippedBarPosition(project.start_date, project.end_date, viewStart, viewEnd, pixelsPerDay)
            const projectBarColor = neutral ? '#cbd5e1' : project.color

            return (
              <div key={project.id}>
                {/* Project summary row */}
                <button
                  type="button"
                  onClick={() => toggleProjectCollapse(project.id)}
                  className="flex w-full bg-slate-50 text-left active:bg-slate-100"
                  style={{ height: PROJECT_ROW_H }}
                >
                  <div
                    className="sticky left-0 z-10 flex flex-shrink-0 items-center gap-1.5 border-b border-r border-slate-200 bg-slate-50 px-2"
                    style={{ width: NAME_COL }}
                  >
                    <span className="flex-shrink-0 text-slate-400">
                      {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </span>
                    <span className="truncate text-xs font-semibold text-slate-800">{project.name}</span>
                  </div>
                  <div className="relative border-b border-slate-200" style={{ width: totalWidth }}>
                    {projectPos.width > 0 && (
                      <div
                        className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full opacity-80"
                        style={{ left: projectPos.left, width: projectPos.width, backgroundColor: projectBarColor }}
                      />
                    )}
                  </div>
                </button>

                {/* Phase rows */}
                {!isCollapsed && phases.map((phase) => {
                  const pos = getClippedBarPosition(phase.start_date, phase.end_date, viewStart, viewEnd, pixelsPerDay)
                  const statusColor = PHASE_STATUS_COLORS[phase.status as PhaseStatus]
                  const barColor = neutral ? '#cbd5e1' : colorMode === 'status' ? statusColor : (phase.color || statusColor)
                  const isSelected = selectedPhaseId === phase.id
                  const barWidth = Math.max(pos.width, 6)
                  const pct = getPhasePercentComplete(phase)

                  return (
                    <button
                      key={phase.id}
                      type="button"
                      onClick={() => onSelectPhase(phase, project)}
                      className={cn('flex w-full text-left active:bg-indigo-50', isSelected && 'bg-indigo-50/60')}
                      style={{ height: PHASE_ROW_H }}
                    >
                      <div
                        className={cn(
                          'sticky left-0 z-10 flex flex-shrink-0 items-center border-b border-r border-slate-100 px-2 pl-4',
                          isSelected ? 'bg-indigo-50' : 'bg-white'
                        )}
                        style={{ width: NAME_COL }}
                      >
                        <span className="truncate text-xs text-slate-700">{phase.name}</span>
                      </div>
                      <div className="relative border-b border-slate-100" style={{ width: totalWidth }}>
                        {pos.width > 0 && (
                          <div
                            className={cn(
                              'absolute top-1/2 flex h-5 -translate-y-1/2 items-center justify-end overflow-hidden rounded-md px-1.5 shadow-sm',
                              isSelected && 'ring-2 ring-indigo-500'
                            )}
                            style={{ left: pos.left, width: barWidth, backgroundColor: barColor }}
                          >
                            {barWidth > 34 && (
                              <span className={cn('text-[9px] font-semibold tabular-nums', neutral ? 'text-slate-600' : 'text-white')}>
                                {pct}%
                              </span>
                            )}
                          </div>
                        )}
                        {/* Date label trailing the bar when there's room */}
                        {pos.width > 0 && (
                          <span
                            className="pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[9px] text-slate-400"
                            style={{ left: pos.left + barWidth + 4 }}
                          >
                            {formatDate(phase.start_date, 'MMM d')}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}

          {/* bottom breathing room so the last row clears the screen edge */}
          <div style={{ height: 24 }} />
        </div>
      </div>

      <p className="flex-shrink-0 border-t border-slate-200 bg-white px-3 py-1.5 text-center text-[10px] text-slate-400">
        Swipe to scroll · {format(viewStart, 'MMM d')} – {format(viewEnd, 'MMM d, yyyy')} · tap a bar for details
      </p>
    </div>
  )
}
