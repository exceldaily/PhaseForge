'use client'

// Pieces every calendar view shares: the bar that stands for one item, and
// the drag contract between a bar and the day it is dropped on.

import { Check, Diamond, Flag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtTimeShort } from '@/lib/calendar/dates'
import { textOn, type CalItem } from '@/lib/calendar/model'

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
  colorFor: (item: CalItem) => string
  superName: (id: string | null) => string | null
  onOpen: (item: CalItem) => void
  onNew: (date: string, time?: string | null) => void
  onShowDay: (date: string) => void
  drag: DragApi
}

export const isTimed = (i: CalItem) => !!i.startTime && i.start === i.end
export const isDone = (i: CalItem) => i.kind === 'phase' && (i.status === 'completed' || i.status === 'skipped')
export const canDrag = (i: CalItem, canEdit: boolean) => canEdit && i.kind !== 'deadline'

/**
 * Job first, then what is being done: "Gulf Breeze · Set cases". The job is
 * what people scan a busy day for. Something with no job is just its title,
 * and an end date reads "Gulf Breeze ends".
 */
export function ItemLabel({ item }: { item: CalItem }) {
  if (item.kind === 'deadline') return <span className="font-semibold">{item.projectName} ends</span>
  if (!item.projectName) return <span className="font-semibold">{item.title}</span>
  return (
    <>
      <span className="font-semibold">{item.projectName}</span>
      <span className="opacity-90"> · {item.title}</span>
    </>
  )
}

/** One item as a bar in a month cell or the all-day strip. */
export function Bar({ item, color, onOpen, draggable, onDragStart, onDragEnd, cutLeft, cutRight, muted, title }: {
  item: CalItem; color: string; onOpen: () => void
  draggable: boolean; onDragStart?: (e: React.DragEvent) => void; onDragEnd?: () => void
  cutLeft?: boolean; cutRight?: boolean
  /** Dragging is in progress: let the pointer through to the day underneath. */
  muted?: boolean
  title: string
}) {
  const timed = isTimed(item)
  const done = isDone(item)
  const common = cn(
    'flex h-5 w-full min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap px-1.5 text-left text-[11px] leading-5',
    muted ? 'pointer-events-none' : 'pointer-events-auto',
    draggable && 'cursor-grab active:cursor-grabbing',
    done && 'opacity-60',
  )
  const drag = draggable ? { draggable: true, onDragStart, onDragEnd } : {}
  const click = (e: React.MouseEvent) => { e.stopPropagation(); onOpen() }

  if (item.kind === 'deadline') {
    return (
      <button type="button" onClick={click} title={title}
        className={cn(common, 'rounded border border-rose-300 bg-rose-50 text-rose-700 hover:border-rose-500')}>
        <Flag size={10} className="shrink-0" /><span className="truncate"><ItemLabel item={item} /></span>
      </button>
    )
  }
  if (timed) {
    return (
      <button type="button" onClick={click} title={title} {...drag}
        className={cn(common, 'rounded text-slate-700 hover:bg-slate-100')}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="shrink-0 text-slate-500">{fmtTimeShort(item.startTime)}</span>
        <span className="truncate"><ItemLabel item={item} /></span>
      </button>
    )
  }
  return (
    <button type="button" onClick={click} title={title} {...drag}
      style={{ backgroundColor: color, color: textOn(color) }}
      className={cn(common, 'hover:brightness-95', cutLeft ? 'rounded-l-none' : 'rounded-l', cutRight ? 'rounded-r-none' : 'rounded-r')}>
      {item.milestone && <Diamond size={9} className="shrink-0 fill-current" />}
      {done && <Check size={10} className="shrink-0" />}
      <span className="truncate"><ItemLabel item={item} /></span>
    </button>
  )
}
