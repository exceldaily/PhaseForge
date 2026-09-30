'use client'

// Week and Day: an all-day strip on top for phases and all-day events, and
// an hour grid under it for anything with a time.

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { DAY_SHORT, dayOf, dowIso, fmtDay, fmtTime, hhmmOf } from '@/lib/calendar/dates'
import { fitWeek, layoutTimed, layoutWeek, splitTimed, tint } from '@/lib/calendar/model'
import { Bar, ItemLabel, canDrag, type ViewProps } from './parts'
import { describe } from './MonthView'

const HOUR = 48
const STRIP_LANES = 8
const hourLabel = (h: number) => (h === 0 ? '' : fmtTime(`${String(h).padStart(2, '0')}:00`))

export function TimeGrid({ days, items, today, nowMinutes, canEdit, colorFor, dotFor, superName, restDays, onOpen, onNew, onShowDay, drag }: ViewProps & {
  days: string[]
  /** Minutes past midnight right now, for the red line. */
  nowMinutes: number | null
}) {
  const n = days.length
  const scrollRef = useRef<HTMLDivElement>(null)
  const [over, setOver] = useState<string | null>(null)
  const { timed, allDay } = useMemo(() => splitTimed(items), [items])
  const strip = useMemo(() => {
    const { segments } = layoutWeek(allDay, days[0], n)
    return { ...fitWeek(segments, STRIP_LANES, n), lanes: Math.min(STRIP_LANES, Math.max(1, ...segments.map((s) => s.lane + 1))) }
  }, [allDay, days, n])

  // Open on the working day, not on midnight.
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 6 * HOUR - 12 }, [])

  const cols = { gridTemplateColumns: `56px repeat(${n}, minmax(0, 1fr))` }
  const timeAt = (e: React.MouseEvent | React.DragEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    return hhmmOf(Math.max(0, Math.min(23.5 * 60, Math.floor(((e.clientY - r.top) / HOUR) * 2) * 30)))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Day headers */}
      <div className="grid border-b border-slate-200" style={cols}>
        <div />
        {days.map((date) => (
          <button key={date} type="button" onClick={() => onShowDay(date)} title={`Open ${fmtDay(date)}`}
            className={cn('flex flex-col items-center gap-0.5 border-l border-slate-200 py-1.5 hover:bg-slate-50', restDays.includes(dowIso(date)) && 'bg-slate-100')}>
            <span className={cn('text-[11px] font-semibold uppercase tracking-wide', date === today ? 'text-indigo-600' : restDays.includes(dowIso(date)) ? 'text-slate-400' : 'text-slate-500')}>{DAY_SHORT[dowIso(date)]}</span>
            <span className={cn('flex h-8 w-8 items-center justify-center rounded-full text-lg font-medium',
              date === today ? 'bg-indigo-600 text-white' : restDays.includes(dowIso(date)) ? 'text-slate-400' : 'text-slate-800')}>{dayOf(date)}</span>
          </button>
        ))}
      </div>

      {/* All-day strip */}
      <div className="relative border-b border-slate-300" style={{ minHeight: strip.lanes * 22 + 8 }}>
        <div className="absolute inset-0 grid" style={cols}>
          <div className="flex items-start justify-end pr-2 pt-1 text-[10px] font-medium uppercase text-slate-400">All day</div>
          {days.map((date) => (
            <div key={date}
              onClick={() => canEdit && onNew(date)}
              onDragOver={(e) => { if (drag.active) { e.preventDefault(); if (over !== `a${date}`) setOver(`a${date}`) } }}
              onDragLeave={() => setOver((cur) => (cur === `a${date}` ? null : cur))}
              onDrop={(e) => { e.preventDefault(); setOver(null); drag.drop(date) }}
              className={cn('border-l border-slate-200', restDays.includes(dowIso(date)) && 'bg-slate-100', canEdit && 'cursor-pointer hover:bg-indigo-50/40',
                over === `a${date}` && 'bg-indigo-100/70 ring-1 ring-inset ring-indigo-400')} />
          ))}
        </div>
        <div className="pointer-events-none relative grid content-start gap-y-0.5 py-1" style={{ ...cols, gridAutoRows: 20 }}>
          {strip.visible.map((seg) => (
            <div key={seg.key} className="min-w-0 px-0.5" style={{ gridColumn: `${seg.col + 2} / span ${seg.span}`, gridRow: seg.lane + 1 }}>
              <Bar item={seg.item} color={colorFor(seg.item)} dot={dotFor(seg.item)} title={describe(seg.item, superName(seg.item.superId))}
                cutLeft={seg.startsBefore} cutRight={seg.endsAfter} muted={drag.active}
                onOpen={() => onOpen(seg.item)} draggable={canDrag(seg.item, canEdit)}
                onDragStart={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  const idx = Math.max(0, Math.min(seg.span - 1, Math.floor((e.clientX - r.left) / (r.width / seg.span))))
                  drag.start(e, seg.item, days[seg.col + idx])
                }}
                onDragEnd={drag.end} />
            </div>
          ))}
          {strip.more.map((count, col) => count > 0 && (
            <div key={`more-${col}`} className="min-w-0 px-0.5" style={{ gridColumn: col + 2, gridRow: STRIP_LANES }}>
              <button type="button" onClick={() => onShowDay(days[col])}
                className={cn('h-5 w-full truncate rounded px-1.5 text-left text-[11px] font-semibold leading-5 text-indigo-600 hover:bg-indigo-50',
                  drag.active ? 'pointer-events-none' : 'pointer-events-auto')}>
                +{count} more
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Hours */}
      <div ref={scrollRef} className="min-h-[320px] flex-1 overflow-y-auto">
        <div className="relative grid" style={{ ...cols, height: 24 * HOUR }}>
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="absolute right-2 -translate-y-1/2 text-[10px] font-medium text-slate-400" style={{ top: h * HOUR }}>{hourLabel(h)}</div>
            ))}
          </div>
          {days.map((date) => {
            const boxes = layoutTimed(timed.filter((i) => i.start === date))
            return (
              <div key={date}
                onClick={(e) => { if (canEdit && e.target === e.currentTarget) onNew(date, timeAt(e)) }}
                onDragOver={(e) => { if (drag.active) { e.preventDefault(); if (over !== date) setOver(date) } }}
                onDragLeave={() => setOver((cur) => (cur === date ? null : cur))}
                onDrop={(e) => { e.preventDefault(); setOver(null); drag.drop(date, timeAt(e)) }}
                className={cn('relative border-l border-slate-200', canEdit && 'cursor-pointer', over === date ? 'bg-indigo-50' : restDays.includes(dowIso(date)) && 'bg-slate-100')}
                style={{ backgroundImage: 'linear-gradient(to bottom, rgb(226 232 240) 1px, transparent 1px)', backgroundSize: `100% ${HOUR}px` }}>
                {date === today && nowMinutes !== null && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: (nowMinutes / 60) * HOUR }}>
                    <span className="-ml-1 h-2 w-2 rounded-full bg-rose-500" /><span className="h-px flex-1 bg-rose-500" />
                  </div>
                )}
                {boxes.map((b) => {
                  const color = colorFor(b.item)
                  return (
                    <button key={b.item.key} type="button" onClick={(e) => { e.stopPropagation(); onOpen(b.item) }}
                      title={describe(b.item, superName(b.item.superId))}
                      draggable={canDrag(b.item, canEdit)}
                      onDragStart={(e) => drag.start(e, b.item, date)} onDragEnd={drag.end}
                      style={{
                        top: (b.startMin / 60) * HOUR + 1, height: Math.max(20, ((b.endMin - b.startMin) / 60) * HOUR - 2),
                        left: `calc(${(b.col / b.cols) * 100}% + 2px)`, width: `calc(${100 / b.cols}% - 4px)`,
                        backgroundColor: '#ffffff', backgroundImage: `linear-gradient(${tint(color, 0.1)}, ${tint(color, 0.1)})`,
                        borderColor: color, borderLeftWidth: 4,
                      }}
                      className={cn('absolute overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-tight text-slate-900 shadow-sm hover:brightness-95',
                        drag.active && 'pointer-events-none', canDrag(b.item, canEdit) && 'cursor-grab')}>
                      <span className="block truncate font-medium text-slate-500">{fmtTime(b.item.startTime)}{b.item.endTime ? ` to ${fmtTime(b.item.endTime)}` : ''}</span>
                      <span className="block truncate">{b.item.jobCode && <span className="mr-1 font-bold tabular-nums" style={{ color }}>{b.item.jobCode}</span>}<ItemLabel item={b.item} /></span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
