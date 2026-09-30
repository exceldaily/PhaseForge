'use client'

// The month grid: six Sunday-first weeks, bars that run across days, and a
// "+N more" when a day has more than fits.

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { DAY_SHORT, MONTH_SHORT, addDaysIso, dayOf, fmtDay, fmtRange, fmtTime, monthOf, monthWeeks, weekDays } from '@/lib/calendar/dates'
import { fitWeek, layoutWeek, type CalItem } from '@/lib/calendar/model'
import { Bar, canDrag, type ViewProps } from './parts'

const HEAD = 26   // room for the day number
const LANE = 22   // one bar plus its gap

export function describe(item: CalItem, superName: string | null): string {
  const when = item.startTime
    ? `${fmtDay(item.start)}, ${fmtTime(item.startTime)}${item.endTime ? ` to ${fmtTime(item.endTime)}` : ''}`
    : fmtRange(item.start, item.end)
  const what = item.kind === 'deadline' ? `${item.projectName} ends` : item.title
  return [what, item.kind !== 'deadline' ? item.projectName : null, when, superName].filter(Boolean).join('\n')
}

export function MonthView({ anchor, items, today, canEdit, colorFor, superName, onOpen, onNew, onShowDay, drag }: ViewProps & { anchor: string }) {
  const weeks = useMemo(() => monthWeeks(anchor), [anchor])
  const gridRef = useRef<HTMLDivElement>(null)
  const [maxLanes, setMaxLanes] = useState(4)
  const [over, setOver] = useState<string | null>(null)

  // How many bars fit in a week row depends on how tall the window is.
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const measure = () => setMaxLanes(Math.max(2, Math.floor((el.clientHeight / 6 - HEAD - 2) / LANE)))
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const month = monthOf(anchor)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7 border-b border-slate-200">
        {DAY_SHORT.map((d) => (
          <div key={d} className="px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">{d}</div>
        ))}
      </div>
      <div ref={gridRef} className="grid min-h-[480px] flex-1 grid-rows-6">
        {weeks.map((weekStart) => {
          const days = weekDays(weekStart)
          const { segments } = layoutWeek(items, weekStart)
          const { visible, more } = fitWeek(segments, maxLanes)
          return (
            <div key={weekStart} className="relative min-h-0 border-b border-slate-200 last:border-b-0">
              {/* The days: numbers, click to add, drop to move. */}
              <div className="absolute inset-0 grid grid-cols-7">
                {days.map((date) => {
                  const other = monthOf(date) !== month
                  const isToday = date === today
                  return (
                    <div key={date}
                      onClick={() => canEdit && onNew(date)}
                      onDragOver={(e) => { if (drag.active) { e.preventDefault(); if (over !== date) setOver(date) } }}
                      onDragLeave={() => setOver((cur) => (cur === date ? null : cur))}
                      onDrop={(e) => { e.preventDefault(); setOver(null); drag.drop(date) }}
                      className={cn(
                        'border-r border-slate-200 last:border-r-0',
                        other && 'bg-slate-50/70',
                        canEdit && 'cursor-pointer hover:bg-indigo-50/40',
                        over === date && 'bg-indigo-100/70 ring-1 ring-inset ring-indigo-400',
                      )}>
                      <div className="flex justify-center pt-1">
                        <button type="button" onClick={(e) => { e.stopPropagation(); onShowDay(date) }}
                          title={`Open ${fmtDay(date)}`}
                          className={cn(
                            'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-medium hover:bg-slate-200',
                            isToday ? 'bg-indigo-600 text-white hover:bg-indigo-700' : other ? 'text-slate-400' : 'text-slate-700',
                          )}>
                          {dayOf(date) === 1 ? `${MONTH_SHORT[monthOf(date) - 1]} 1` : dayOf(date)}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* The bars, laid over the days. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 grid grid-cols-7 content-start gap-y-0.5"
                style={{ top: HEAD, gridAutoRows: LANE - 2 }}>
                {visible.map((seg) => (
                  <div key={seg.key} className="min-w-0 px-0.5"
                    style={{ gridColumn: `${seg.col + 1} / span ${seg.span}`, gridRow: seg.lane + 1 }}>
                    <Bar item={seg.item} color={colorFor(seg.item)} title={describe(seg.item, superName(seg.item.superId))}
                      cutLeft={seg.startsBefore} cutRight={seg.endsAfter} muted={drag.active}
                      onOpen={() => onOpen(seg.item)}
                      draggable={canDrag(seg.item, canEdit)}
                      onDragStart={(e) => {
                        // Which day of the bar was grabbed, so a long bar moves by that day and not by its start.
                        const r = e.currentTarget.getBoundingClientRect()
                        const idx = Math.max(0, Math.min(seg.span - 1, Math.floor((e.clientX - r.left) / (r.width / seg.span))))
                        drag.start(e, seg.item, addDaysIso(days[seg.col], idx))
                      }}
                      onDragEnd={drag.end} />
                  </div>
                ))}
                {more.map((n, col) => n > 0 && (
                  <div key={`more-${col}`} className="min-w-0 px-0.5" style={{ gridColumn: col + 1, gridRow: Math.max(1, maxLanes) }}>
                    <button type="button" onClick={(e) => { e.stopPropagation(); onShowDay(days[col]) }}
                      className={cn('h-5 w-full truncate rounded px-1.5 text-left text-[11px] font-semibold leading-5 text-slate-600 hover:bg-slate-200',
                        drag.active ? 'pointer-events-none' : 'pointer-events-auto')}>
                      +{n} more
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
