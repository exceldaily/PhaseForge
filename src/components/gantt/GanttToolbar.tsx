'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, CalendarDays, CalendarRange, Target } from 'lucide-react'
import { format, parseISO } from '@/lib/dates'
import { useGanttStore } from '@/stores/ganttStore'
import { Button } from '@/components/ui/Button'
import { ZoomLevel } from '@/types/app'

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
}: {
  projectCount: number
  canFitTimeline: boolean
  onFitTimeline: () => void
}) {
  const { zoom, setZoom, scrollToToday, shiftView, setViewRange, viewStart, viewEnd } = useGanttStore()
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const datePickerRef = useRef<HTMLDivElement | null>(null)
  const rangeLabel = getRangeLabel(viewStart, viewEnd, zoom)

  useEffect(() => {
    if (!isDatePickerOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!datePickerRef.current?.contains(event.target as Node)) {
        setIsDatePickerOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isDatePickerOpen])

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
    <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-slate-900">Gantt Chart</h1>
        <span className="text-sm text-slate-400">{projectCount} project{projectCount !== 1 ? 's' : ''}</span>
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
            className="inline-flex max-w-[18rem] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-white"
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

        <Button variant="outline" size="sm" onClick={onFitTimeline} disabled={!canFitTimeline}>
          <CalendarDays size={14} /> Fit Schedule
        </Button>

        <Button variant="outline" size="sm" onClick={scrollToToday}>
          <Target size={14} /> Today
        </Button>
      </div>
    </div>
  )
}
