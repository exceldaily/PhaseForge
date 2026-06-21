'use client'

import { ImageOff, MapPin, CalendarClock, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/dates'
import { PRIORITY_LABELS, PRIORITY_COLORS } from '@/lib/constants'
import { PUNCH_STATUS_LABELS, PUNCH_STATUS_CHIP } from '@/lib/punch'
import { PunchItem, ProjectPriority } from '@/types/app'
import { cn } from '@/lib/utils'

interface PunchItemCardProps {
  item: PunchItem
  assigneeName: string | null
  onOpen: (item: PunchItem) => void
}

export function PunchItemCard({ item, assigneeName, onOpen }: PunchItemCardProps) {
  const heading = item.title?.trim() || item.issue_description

  return (
    <button
      onClick={() => onOpen(item)}
      className="flex w-full gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-300"
    >
      {/* Thumbnail */}
      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">
        {item.issue_photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.issue_photo_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <ImageOff size={20} />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-semibold text-slate-900">
            {item.number ? <span className="text-slate-400">#{item.number} </span> : null}
            {heading}
          </p>
          {item.status === 'completed' && (
            <CheckCircle2 size={16} className="flex-shrink-0 text-emerald-500" />
          )}
        </div>

        {item.title && (
          <p className="mt-0.5 truncate text-xs text-slate-500">{item.issue_description}</p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge className={cn('text-[10px]', PUNCH_STATUS_CHIP[item.status])}>
            {PUNCH_STATUS_LABELS[item.status]}
          </Badge>
          <Badge className={cn('text-[10px]', PRIORITY_COLORS[item.priority as ProjectPriority])}>
            {PRIORITY_LABELS[item.priority as ProjectPriority]}
          </Badge>
          {item.location && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-500">
              <MapPin size={11} /> {item.location}
            </span>
          )}
          {item.due_date && item.status !== 'completed' && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-500">
              <CalendarClock size={11} /> {formatDate(item.due_date, 'MMM d')}
            </span>
          )}
          {assigneeName && (
            <span className="ml-auto truncate text-[11px] font-medium text-slate-500">{assigneeName}</span>
          )}
        </div>
      </div>
    </button>
  )
}
