'use client'

// A read-only timeline of a project's phases, small enough to sit in a card.
// Plain HTML with percentage widths, so it fills whatever box it is given
// and needs no chart library. Click anywhere to open the real Gantt.

import { differenceInDays, formatDate, parseISO } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { Phase } from '@/types/app'

interface MiniGanttProps {
  phases: Phase[]
  /** Rows to draw before collapsing the rest into "+N more". */
  maxRows?: number
  /** Show the phase names down the left. */
  labels?: boolean
  className?: string
  onOpen?: () => void
}

const STATUS_BAR: Record<string, string> = {
  completed: 'bg-emerald-500',
  in_progress: 'bg-indigo-500',
  blocked: 'bg-rose-500',
  skipped: 'bg-slate-300',
  not_started: 'bg-slate-400',
}

export function MiniGantt({ phases, maxRows = 8, labels = true, className, onOpen }: MiniGanttProps) {
  const sorted = [...phases].sort((a, b) => a.start_date.localeCompare(b.start_date) || a.sort_order - b.sort_order)
  if (!sorted.length) {
    return (
      <div className={cn('flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400', className)}>
        No phases yet
      </div>
    )
  }
  const minStart = sorted.reduce((m, p) => (p.start_date < m ? p.start_date : m), sorted[0].start_date)
  const maxEnd = sorted.reduce((m, p) => (p.end_date > m ? p.end_date : m), sorted[0].end_date)
  const start = parseISO(minStart)
  const total = Math.max(1, differenceInDays(parseISO(maxEnd), start) + 1)
  const pct = (iso: string) => Math.min(100, Math.max(0, (differenceInDays(parseISO(iso), start) / total) * 100))
  const todayIso = new Date().toISOString().slice(0, 10)
  const todayPct = todayIso >= minStart && todayIso <= maxEnd ? pct(todayIso) : null

  // Month ticks along the top.
  const ticks: { pct: number; label: string }[] = []
  const end = parseISO(maxEnd)
  if (total <= 70) {
    // Short project: a tick every week.
    const cursor = new Date(start)
    cursor.setDate(cursor.getDate() - cursor.getDay())
    while (cursor <= end) {
      const iso = cursor.toISOString().slice(0, 10)
      if (iso >= minStart) ticks.push({ pct: pct(iso), label: formatDate(cursor, 'MMM d') })
      cursor.setDate(cursor.getDate() + 7)
    }
  } else {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
    while (cursor <= end) {
      const iso = cursor.toISOString().slice(0, 10)
      if (iso >= minStart) ticks.push({ pct: pct(iso), label: formatDate(cursor, total > 200 ? 'MMM yy' : 'MMM') })
      cursor.setMonth(cursor.getMonth() + 1)
    }
  }
  if (!ticks.length || ticks[0].pct > 8) ticks.unshift({ pct: 0, label: formatDate(start, 'MMM d') })

  const rows = sorted.slice(0, maxRows)
  const extra = sorted.length - rows.length

  return (
    <div className={cn('select-none', onOpen && 'cursor-pointer', className)} onClick={onOpen} role={onOpen ? 'button' : undefined}>
      <div className="flex">
        {labels && <div className="w-28 shrink-0" />}
        <div className="relative h-4 flex-1 text-[10px] text-slate-400">
          {ticks.map((t, i) => (
            <span key={i} className="absolute top-0 -translate-x-px border-l border-slate-200 pl-1 leading-4" style={{ left: `${t.pct}%` }}>{t.label}</span>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        {rows.map((p) => {
          const left = pct(p.start_date)
          const width = Math.max(1.5, pct(p.end_date) - left + (100 / total))
          const done = Math.min(100, Math.max(0, p.percent_complete ?? (p.status === 'completed' ? 100 : 0)))
          const sameDay = p.start_date === p.end_date
          const dates = sameDay ? formatDate(p.start_date, 'MMM d') : `${formatDate(p.start_date, 'MMM d')} to ${formatDate(p.end_date, 'MMM d')}`
          // Dates sit just past the bar, or just before it when the bar runs
          // to the right edge.
          const datesRight = left + width < 72
          return (
            <div key={p.id} className="flex items-center gap-2">
              {labels && (
                <span className="w-28 shrink-0 truncate text-[11px] font-medium text-slate-600" title={p.name}>{p.name}</span>
              )}
              <div className="relative h-3.5 flex-1 rounded bg-slate-100">
                {todayPct !== null && <span className="absolute inset-y-0 border-l border-dashed border-rose-400" style={{ left: `${todayPct}%` }} />}
                <div className={cn('absolute inset-y-0 overflow-hidden rounded', STATUS_BAR[p.status] ?? 'bg-slate-400')}
                  style={{ left: `${left}%`, width: `${width}%`, backgroundColor: p.color ?? undefined }}
                  title={`${p.name}: ${formatDate(p.start_date, 'MMM d')} to ${formatDate(p.end_date, 'MMM d')}, ${done}% done`}>
                  {done > 0 && done < 100 && <div className="h-full bg-white/30" style={{ width: `${done}%` }} />}
                </div>
                <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] leading-none text-slate-500"
                  style={datesRight ? { left: `calc(${left + width}% + 6px)` } : { right: `calc(${100 - left}% + 6px)` }}>
                  {dates}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      {extra > 0 && <p className="mt-1 text-[11px] text-slate-400">{labels ? <span className="inline-block w-28" /> : null}+{extra} more phase{extra === 1 ? '' : 's'}</p>}
    </div>
  )
}
