'use client'

// Pieces every calendar view shares, and the one visual language they all
// speak:
//   a phase   = a solid job tag (the store number) + a pale band in the job's
//               color, job name in bold, phase name in regular weight
//   an event  = an outlined pill, so it never reads as project work
//   an end date = a red flag
// The same job looks the same in every view, and one job's bars sit together.

import { Check, Diamond, Flag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtRange, fmtTime, fmtTimeShort } from '@/lib/calendar/dates'
import { groupByJob, textOn, tint, type CalItem } from '@/lib/calendar/model'

export interface DragApi {
  /** Something is mid-drag: bars stop catching the pointer so days can. */
  active: boolean
  start: (e: React.DragEvent, item: CalItem, grabbedDate: string) => void
  end: () => void
  /** Drop on a day, and on a time of day when dropped in the hour grid. */
  drop: (date: string, time?: string | null) => void
}

export interface ViewProps {
  items: CalItem[]
  today: string
  canEdit: boolean
  /** The color an item wears: its job's, or its super's, by the Color by setting. */
  colorFor: (item: CalItem) => string
  /** A small second color on the bar: the super's label when bars are colored by job. */
  dotFor: (item: CalItem) => string | null
  superName: (id: string | null) => string | null
  /** Weekdays shaded as days off (0 = Sunday). */
  restDays: number[]
  onOpen: (item: CalItem) => void
  onNew: (date: string, time?: string | null, projectId?: string | null) => void
  onShowDay: (date: string) => void
  drag: DragApi
}

export const isTimed = (i: CalItem) => !!i.startTime && i.start === i.end
export const isDone = (i: CalItem) => i.kind === 'phase' && (i.status === 'completed' || i.status === 'skipped')
export const canDrag = (i: CalItem, canEdit: boolean) => canEdit && i.kind !== 'deadline'
const sortRows = (a: CalItem, b: CalItem) =>
  Number(isTimed(a)) - Number(isTimed(b)) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.start.localeCompare(b.start) || a.title.localeCompare(b.title)

/** The words on a bar: job in bold, then what is being done. */
export function ItemLabel({ item, hideJob }: { item: CalItem; hideJob?: boolean }) {
  const job = item.jobLabel ?? item.projectName
  if (item.kind === 'deadline') return <span className="font-semibold">{hideJob ? 'Project end date' : `${job} ends`}</span>
  if (hideJob || !job) return <span className="font-semibold">{item.title}</span>
  return (
    <>
      <span className="font-bold">{job}</span>
      <span className="font-normal opacity-80"> · {item.title}</span>
    </>
  )
}

/** The job's tag on its own: store number on the job color. Used in lists and row headers. */
export function JobChip({ code, color, className }: { code: string | null | undefined; color: string; className?: string }) {
  return (
    <span style={{ backgroundColor: color, color: textOn(color) }}
      className={cn('inline-flex h-5 shrink-0 items-center justify-center rounded px-1.5 text-[10px] font-bold tabular-nums', !code && 'w-2 px-0', className)}>
      {code}
    </span>
  )
}

/** One item as a bar in a month cell, the all-day strip, or a job row. */
export function Bar({ item, color, dot, onOpen, draggable, onDragStart, onDragEnd, cutLeft, cutRight, muted, title, hideJob }: {
  item: CalItem; color: string; dot?: string | null; onOpen: () => void
  draggable: boolean; onDragStart?: (e: React.DragEvent) => void; onDragEnd?: () => void
  cutLeft?: boolean; cutRight?: boolean
  /** Dragging is in progress: let the pointer through to the day underneath. */
  muted?: boolean
  title: string
  /** The row already names the job (the Jobs view): show the phase only. */
  hideJob?: boolean
}) {
  const timed = isTimed(item)
  const done = isDone(item)
  const common = cn(
    'flex h-5 w-full min-w-0 items-center overflow-hidden whitespace-nowrap text-left text-[11px] leading-5 text-slate-900',
    muted ? 'pointer-events-none' : 'pointer-events-auto',
    draggable && 'cursor-grab active:cursor-grabbing',
    done && 'opacity-55',
  )
  const drag = draggable ? { draggable: true, onDragStart, onDragEnd } : {}
  const click = (e: React.MouseEvent) => { e.stopPropagation(); onOpen() }

  if (item.kind === 'deadline') {
    return (
      <button type="button" onClick={click} title={title}
        className={cn(common, 'gap-1 rounded border border-dashed border-rose-400 bg-white px-1.5 text-rose-700 hover:border-rose-600')}>
        <Flag size={10} className="shrink-0 fill-current" /><span className="truncate"><ItemLabel item={item} hideJob={hideJob} /></span>
      </button>
    )
  }

  if (item.kind === 'event') {
    // Outlined, rounded all the way: visibly not a phase.
    return (
      <button type="button" onClick={click} title={title} {...drag}
        style={{ borderColor: color }}
        className={cn(common, 'gap-1 rounded-full border bg-white px-1.5 hover:bg-slate-50')}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        {timed && <span className="shrink-0 font-medium text-slate-500">{fmtTimeShort(item.startTime)}</span>}
        <span className="truncate"><ItemLabel item={item} hideJob={hideJob} /></span>
      </button>
    )
  }

  // A phase: job tag, then a pale band in the job's color.
  return (
    <button type="button" onClick={click} title={title} {...drag}
      style={{ backgroundColor: tint(color, 0.17), boxShadow: `inset 0 0 0 1px ${tint(color, 0.28)}` }}
      className={cn(common, 'hover:brightness-95', cutLeft ? 'rounded-l-none' : 'rounded-l', cutRight ? 'rounded-r-none' : 'rounded-r')}>
      {hideJob
        ? <span className="h-full w-1 shrink-0" style={{ backgroundColor: color }} />
        : (
          <span style={{ backgroundColor: color, color: textOn(color) }}
            className={cn('flex h-full shrink-0 items-center text-[10px] font-bold tabular-nums', item.jobCode ? 'px-1' : 'w-1')}>
            {item.jobCode}
          </span>
        )}
      <span className="flex min-w-0 flex-1 items-center gap-1 px-1.5">
        {item.milestone && <Diamond size={9} className="shrink-0 fill-current" style={{ color }} />}
        {done && <Check size={10} className="shrink-0" />}
        <span className={cn('truncate', done && 'line-through decoration-slate-400')}><ItemLabel item={item} hideJob={hideJob} /></span>
      </span>
      {dot && <span className="mr-1 h-2 w-2 shrink-0 rounded-full ring-1 ring-white" style={{ backgroundColor: dot }} />}
    </button>
  )
}

/** "All day", a time, or a date range, for list rows. */
export function whenText(it: CalItem): string {
  if (it.startTime) return `${fmtTime(it.startTime)}${it.endTime ? ` to ${fmtTime(it.endTime)}` : ''}`
  return it.start === it.end ? 'All day' : fmtRange(it.start, it.end)
}

/**
 * A day's items as cards, one per job: the job once at the top with its tag
 * and super, its phases underneath. Used by the Agenda and the day list.
 */
export function JobGroupList({ items, colorFor, dotFor, superName, onOpen }: {
  items: CalItem[]
  colorFor: (i: CalItem) => string
  dotFor: (i: CalItem) => string | null
  superName: (id: string | null) => string | null
  onOpen: (i: CalItem) => void
}) {
  const groups = groupByJob(items)
  return (
    <div className="space-y-1.5">
      {groups.map((g) => {
        const first = g.items[0]
        const rows = [...g.items].sort(sortRows)
        if (!g.projectId) {
          return (
            <div key="none" className="space-y-0.5">
              {rows.map((it) => (
                <button key={it.key} type="button" onClick={() => onOpen(it)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-slate-100">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 bg-white" style={{ borderColor: colorFor(it) }} />
                  <span className="w-28 shrink-0 text-xs text-slate-500">{whenText(it)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{it.title}</span>
                </button>
              ))}
            </div>
          )
        }
        const color = colorFor(first)
        const supers = [...new Set(rows.map((r) => r.superId).filter(Boolean))] as string[]
        return (
          <div key={g.projectId} className="overflow-hidden rounded-lg border border-slate-200" style={{ borderLeft: `3px solid ${color}` }}>
            <div className="flex items-center gap-2 px-2 py-1" style={{ backgroundColor: tint(color, 0.1) }}>
              <JobChip code={first.jobCode} color={color} />
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{first.jobLabel ?? first.projectName}</span>
              {supers.map((id) => {
                const c = dotFor(rows.find((r) => r.superId === id)!) ?? color
                return <span key={id} className="hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold sm:inline" style={{ backgroundColor: c, color: textOn(c) }}>{superName(id)}</span>
              })}
            </div>
            <div className="divide-y divide-slate-100 bg-white">
              {rows.map((it) => (
                <button key={it.key} type="button" onClick={() => onOpen(it)}
                  className={cn('flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-slate-50', isDone(it) && 'opacity-55')}>
                  {it.kind === 'deadline'
                    ? <Flag size={11} className="shrink-0 fill-current text-rose-600" />
                    : it.kind === 'event'
                      ? <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 bg-white" style={{ borderColor: color }} />
                      : <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} />}
                  <span className="w-28 shrink-0 text-xs text-slate-500">{whenText(it)}</span>
                  <span className={cn('min-w-0 flex-1 truncate text-sm text-slate-800', isDone(it) && 'line-through decoration-slate-400')}>
                    {it.kind === 'deadline' ? 'Project end date' : it.title}
                  </span>
                  {isDone(it) && <Check size={12} className="shrink-0 text-slate-400" />}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
