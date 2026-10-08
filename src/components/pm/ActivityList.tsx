'use client'

import { useSyncExternalStore } from 'react'
import { cn } from '@/lib/utils'
import { describeActivity, type ActivityTone } from '@/lib/pm/activityText'
import type { PmActivity } from '@/lib/pm/types'

const DOT: Record<ActivityTone, string> = { neutral: 'bg-slate-300', good: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-rose-500' }
const noop = () => () => {}

function when(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** Who did what and when. Times render in the viewer's own time zone. */
export function ActivityList({ items, names, empty = 'Nothing has happened here yet.' }: { items: PmActivity[]; names: Record<string, string>; empty?: string }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  if (!items.length) return <p className="px-4 py-6 text-center text-sm text-slate-400">{empty}</p>
  return (
    <ol className="divide-y divide-slate-100">
      {items.map((a) => {
        const { text, tone } = describeActivity(a.action, a.detail ?? {})
        return (
          <li key={a.id} className="flex gap-3 px-4 py-2.5">
            <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', DOT[tone])} />
            <p className="min-w-0 flex-1 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">{(a.actorId && names[a.actorId]) || 'System'}</span> {text}
            </p>
            <time className="shrink-0 whitespace-nowrap text-[11px] text-slate-400" dateTime={a.createdAt}>{mounted ? when(a.createdAt) : ''}</time>
          </li>
        )
      })}
    </ol>
  )
}
