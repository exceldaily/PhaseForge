'use client'

// Agenda: the next stretch as a list, one block per day, and inside each day
// one card per job with its phases underneath. The easiest view to read on
// a phone.

import { useMemo } from 'react'
import { CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DAY_SHORT, MONTH_SHORT, addDaysIso, dayOf, dowIso, monthOf } from '@/lib/calendar/dates'
import { coversDay, type CalItem } from '@/lib/calendar/model'
import { JobGroupList, type ViewProps } from './parts'

export const AGENDA_DAYS = 30

export function AgendaView({ anchor, items, today, colorFor, dotFor, superName, onOpen, canEdit, onNew }: ViewProps & { anchor: string }) {
  const days = useMemo(() => {
    const out: { date: string; rows: CalItem[] }[] = []
    for (let i = 0; i < AGENDA_DAYS; i++) {
      const date = addDaysIso(anchor, i)
      const rows = items.filter((it) => coversDay(it, date))
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
    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50">
      {days.map(({ date, rows }) => (
        <div key={date} className="flex gap-3 border-b border-slate-200 px-3 py-3 sm:px-4">
          <button type="button" onClick={() => canEdit && onNew(date)} title={canEdit ? 'Add something on this day' : undefined}
            className="flex w-14 shrink-0 flex-col items-center self-start rounded-lg py-1 hover:bg-slate-200">
            <span className={cn('flex h-9 w-9 items-center justify-center rounded-full text-lg font-semibold',
              date === today ? 'bg-indigo-600 text-white' : 'text-slate-800')}>{dayOf(date)}</span>
            <span className={cn('text-[10px] font-semibold uppercase tracking-wide', date === today ? 'text-indigo-600' : 'text-slate-500')}>
              {MONTH_SHORT[monthOf(date) - 1]}, {DAY_SHORT[dowIso(date)]}
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <JobGroupList items={rows} colorFor={colorFor} dotFor={dotFor} superName={superName} onOpen={onOpen} />
          </div>
        </div>
      ))}
    </div>
  )
}
