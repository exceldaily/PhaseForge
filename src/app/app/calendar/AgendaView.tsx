'use client'

// Agenda: the next stretch as a plain list, one block per day. The easiest
// view to read on a phone.

import { useMemo } from 'react'
import { CalendarDays, Flag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DAY_SHORT, MONTH_SHORT, addDaysIso, dayOf, dowIso, fmtRange, fmtTime, monthOf } from '@/lib/calendar/dates'
import { coversDay, textOn, type CalItem } from '@/lib/calendar/model'
import { isDone, isTimed, type ViewProps } from './parts'

export const AGENDA_DAYS = 30

export function AgendaView({ anchor, items, today, colorFor, superName, onOpen, canEdit, onNew }: ViewProps & { anchor: string }) {
  const days = useMemo(() => {
    const out: { date: string; rows: CalItem[] }[] = []
    for (let i = 0; i < AGENDA_DAYS; i++) {
      const date = addDaysIso(anchor, i)
      const rows = items.filter((it) => coversDay(it, date))
        .sort((a, b) => Number(isTimed(a)) - Number(isTimed(b)) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.title.localeCompare(b.title))
      if (rows.length) out.push({ date, rows })
    }
    return out
  }, [anchor, items])

  if (!days.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
        <CalendarDays size={28} className="text-slate-300" />
        <p className="mt-2 text-sm font-medium text-slate-600">Nothing on the calendar for these {AGENDA_DAYS} days</p>
        <p className="mt-1 max-w-sm text-xs text-slate-400">Type a line in the box above, or check the filters on the left if you expected to see something.</p>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {days.map(({ date, rows }) => (
        <div key={date} className="flex gap-3 border-b border-slate-200 px-3 py-2.5 sm:px-4">
          <button type="button" onClick={() => canEdit && onNew(date)} title={canEdit ? 'Add something on this day' : undefined}
            className="flex w-14 shrink-0 flex-col items-center rounded-lg py-1 hover:bg-slate-100">
            <span className={cn('flex h-8 w-8 items-center justify-center rounded-full text-base font-semibold',
              date === today ? 'bg-indigo-600 text-white' : 'text-slate-800')}>{dayOf(date)}</span>
            <span className={cn('text-[10px] font-semibold uppercase tracking-wide', date === today ? 'text-indigo-600' : 'text-slate-500')}>
              {MONTH_SHORT[monthOf(date) - 1]}, {DAY_SHORT[dowIso(date)]}
            </span>
          </button>
          <div className="min-w-0 flex-1 space-y-1">
            {rows.map((it) => {
              const color = colorFor(it)
              const sup = superName(it.superId)
              return (
                <button key={it.key} type="button" onClick={() => onOpen(it)}
                  className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100', isDone(it) && 'opacity-60')}>
                  {it.kind === 'deadline'
                    ? <Flag size={12} className="shrink-0 text-rose-600" />
                    : <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
                  <span className="w-28 shrink-0 text-xs text-slate-500">
                    {it.startTime ? `${fmtTime(it.startTime)}${it.endTime ? ` to ${fmtTime(it.endTime)}` : ''}` : it.start === it.end ? 'All day' : fmtRange(it.start, it.end)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                    {it.projectName
                      ? <><span className="font-semibold">{it.projectName}</span><span className="text-slate-500"> · {it.kind === 'deadline' ? 'Project end date' : it.title}</span></>
                      : <span className="font-semibold">{it.title}</span>}
                  </span>
                  {sup && (
                    <span className="hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold sm:inline" style={{ backgroundColor: color, color: textOn(color) }}>{sup}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
