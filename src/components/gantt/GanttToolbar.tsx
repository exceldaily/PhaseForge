'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, CalendarDays, CalendarRange, Target, Printer, Link2, Palette } from 'lucide-react'
import { format, parseISO } from '@/lib/dates'
import { useGanttStore } from '@/stores/ganttStore'
import { Button } from '@/components/ui/Button'
import { GanttPrintModal } from './GanttPrintModal'
import { ZoomLevel } from '@/types/app'
import { Project } from '@/types/app'

const ZOOM_LEVELS: { value: ZoomLevel; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
]

function getRangeLabel(start: Date, end: Date, zoom: ZoomLevel) {
  if (zoom === 'month' || zoom === 'quarter') {
    return `${format(start, 'MMM yyyy')} - ${format(end, 'MMM yyyy')}`
  }

  if (format(start, 'yyyy') === format(end, 'yyyy')) {
    return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`
  }

  return `${format(start, 'MMM d, yyyy')} - ${format(end, 'MMM d, yyyy')}`
}

export function GanttToolbar({
  projectCount,
  canFitTimeline,
  onFitTimeline,
  projects = [],
}: {
  projectCount: number
  canFitTimeline: boolean
  onFitTimeline: () => void
  projects?: Project[]
}) {
  const { zoom, setZoom, scrollToToday, shiftView, setViewRange, viewStart, viewEnd, collapsedProjects, selectedProjectId, shiftMode, setShiftMode, colorMode, setColorMode } = useGanttStore()
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [isPrintMenuOpen, setIsPrintMenuOpen] = useState(false)
  const [printScope, setPrintScope] = useState<'current' | 'all' | null>(null)
  const [printStyle, setPrintStyle] = useState<'chart' | 'list'>('chart')
  const [isColorMenuOpen, setIsColorMenuOpen] = useState(false)
  const datePickerRef = useRef<HTMLDivElement | null>(null)
  const printMenuRef = useRef<HTMLDivElement | null>(null)
  const colorMenuRef = useRef<HTMLDivElement | null>(null)

  const COLOR_OPTIONS: { value: 'standard' | 'status' | 'none'; label: string; hint: string }[] = [
    { value: 'standard', label: 'Standard colors', hint: 'Each task its own color' },
    { value: 'status', label: 'Status colors', hint: 'Color by task status' },
    { value: 'none', label: 'No coloring', hint: 'Neutral gray — clean print' },
  ]
  const colorLabel = COLOR_OPTIONS.find((o) => o.value === colorMode)?.label ?? 'Colors'
  const rangeLabel = getRangeLabel(viewStart, viewEnd, zoom)

  const handlePrint = (scope: 'current' | 'all') => {
    setPrintScope(scope)
    setIsPrintMenuOpen(false)
  }

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (isDatePickerOpen && !datePickerRef.current?.contains(event.target as Node)) {
        setIsDatePickerOpen(false)
      }
      if (isPrintMenuOpen && !printMenuRef.current?.contains(event.target as Node)) {
        setIsPrintMenuOpen(false)
      }
      if (isColorMenuOpen && !colorMenuRef.current?.contains(event.target as Node)) {
        setIsColorMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isDatePickerOpen, isPrintMenuOpen, isColorMenuOpen])

  const handleApplyRange = () => {
    if (!fromDate || !toDate) return

    const start = parseISO(fromDate)
    const end = parseISO(toDate)

    if (start <= end) {
      setViewRange(start, end)
    } else {
      setViewRange(end, start)
    }

    setIsDatePickerOpen(false)
  }

  return (
    <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-white via-white to-slate-50/50 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-slate-900">Gantt Chart</h1>
        <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">{projectCount} {projectCount !== 1 ? 'projects' : 'project'}</span>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <div ref={datePickerRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setFromDate(format(viewStart, 'yyyy-MM-dd'))
              setToDate(format(viewEnd, 'yyyy-MM-dd'))
              setIsDatePickerOpen((open) => !open)
            }}
            aria-expanded={isDatePickerOpen}
            className="inline-flex max-w-[18rem] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition-all hover:border-indigo-400 hover:shadow-md"
          >
            <CalendarRange size={14} className="text-slate-400" />
            <span className="truncate">{rangeLabel}</span>
            <ChevronDown
              size={14}
              className={`text-slate-400 transition-transform ${isDatePickerOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {isDatePickerOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">Choose date range</p>
                <p className="text-xs text-slate-500">Set the visible timeline window with a simple from and to date.</p>
              </div>

              <div className="mt-3 grid gap-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    From
                  </span>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(event) => setFromDate(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    To
                  </span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(event) => setToDate(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400">Current view: {rangeLabel}</span>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApplyRange}
                  disabled={!fromDate || !toDate}
                >
                  Apply
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
          <button
            type="button"
            onClick={() => shiftView('backward')}
            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            aria-label="Show earlier dates"
            title="Show earlier dates"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => shiftView('forward')}
            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            aria-label="Show later dates"
            title="Show later dates"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
          {ZOOM_LEVELS.map(({ value, label }) => (
            <button
              type="button"
              key={value}
              onClick={() => setZoom(value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                zoom === value
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Move mode: shift only this task, or this + later tasks */}
        <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm" title="What happens when you drag a task">
          <button
            type="button"
            onClick={() => setShiftMode('single')}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
              shiftMode === 'single' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'
            }`}
            title="Moving a task moves only that task"
          >
            Move 1
          </button>
          <button
            type="button"
            onClick={() => setShiftMode('cascade')}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
              shiftMode === 'cascade' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'
            }`}
            title="Moving a task shifts all later tasks in that project too"
          >
            <Link2 size={12} /> Shift later
          </button>
        </div>

        {/* Color mode */}
        <div ref={colorMenuRef} className="relative">
          <Button variant="outline" size="sm" onClick={() => setIsColorMenuOpen((o) => !o)}>
            <Palette size={14} /> {colorLabel}
            <ChevronDown size={13} className={`transition-transform ${isColorMenuOpen ? 'rotate-180' : ''}`} />
          </Button>
          {isColorMenuOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              {COLOR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => { setColorMode(option.value); setIsColorMenuOpen(false) }}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50 ${
                    colorMode === option.value ? 'bg-indigo-50' : ''
                  }`}
                >
                  <div>
                    <p className={`font-medium ${colorMode === option.value ? 'text-indigo-700' : 'text-slate-700'}`}>{option.label}</p>
                    <p className="text-[11px] text-slate-400">{option.hint}</p>
                  </div>
                  {colorMode === option.value && <span className="text-xs text-indigo-600">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <Button variant="outline" size="sm" onClick={onFitTimeline} disabled={!canFitTimeline}>
          <CalendarDays size={14} /> Fit Schedule
        </Button>

        <Button variant="outline" size="sm" onClick={scrollToToday}>
          <Target size={14} /> Today
        </Button>

        <div ref={printMenuRef} className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPrintMenuOpen(!isPrintMenuOpen)}
          >
            <Printer size={14} /> Print
          </Button>

          {isPrintMenuOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-xl">
              {/* Style selection */}
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Print Style</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPrintStyle('chart')}
                    className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      printStyle === 'chart'
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Chart
                  </button>
                  <button
                    onClick={() => setPrintStyle('list')}
                    className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      printStyle === 'list'
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    List
                  </button>
                </div>
              </div>

              {/* Scope selection */}
              <button
                onClick={() => handlePrint('current')}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 border-b border-slate-100"
              >
                <Printer size={13} className="text-slate-400" />
                <div className="text-left">
                  <p className="font-medium">Current View</p>
                  <p className="text-[11px] text-slate-400">One project</p>
                </div>
              </button>
              <button
                onClick={() => handlePrint('all')}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Printer size={13} className="text-slate-400" />
                <div className="text-left">
                  <p className="font-medium">All Projects</p>
                  <p className="text-[11px] text-slate-400">{projectCount} project{projectCount !== 1 ? 's' : ''}</p>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {printScope && (
        <GanttPrintModal
          projects={projects}
          scope={printScope}
          zoom={zoom}
          collapsedProjects={collapsedProjects}
          style={printStyle}
          selectedProjectId={selectedProjectId}
          viewStart={viewStart}
          viewEnd={viewEnd}
          onClose={() => setPrintScope(null)}
        />
      )}
    </div>
  )
}
