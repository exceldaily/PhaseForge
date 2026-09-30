'use client'

// "Active now" / "Yesterday, 3:12 PM" for one person. Rendered only in the
// browser, because the words depend on the viewer's clock and time zone.

import { useSyncExternalStore } from 'react'
import { cn } from '@/lib/utils'
import { activityLabel, pageName, type ActivityRow, type ActivityTone } from '@/lib/presence'

const DOT: Record<ActivityTone, string> = {
  now: 'bg-emerald-500', today: 'bg-emerald-400', week: 'bg-amber-400', stale: 'bg-slate-300', never: 'bg-slate-200',
}
const TEXT: Record<ActivityTone, string> = {
  now: 'text-emerald-700 font-semibold', today: 'text-slate-700', week: 'text-slate-600', stale: 'text-slate-500', never: 'text-slate-400',
}

const noop = () => () => {}
const exact = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export function LastActive({ row, compact }: { row: ActivityRow | undefined; compact?: boolean }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  if (!mounted) return <span className="text-xs text-slate-300">...</span>
  const label = activityLabel(row, new Date())
  const page = label.signInOnly ? null : pageName(row?.lastPath)
  const title = [
    label.at ? `${label.signInOnly ? 'Last sign-in' : 'Last active'}: ${exact(label.at)}` : 'Has not signed in yet',
    page ? `Last on ${page}` : null,
    row?.lastSignInAt && !label.signInOnly ? `Last sign-in: ${exact(row.lastSignInAt)}` : null,
    label.signInOnly ? 'No activity recorded yet, only the sign-in. This fills in the next time they use the site.' : null,
  ].filter(Boolean).join('\n')
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', compact ? 'text-xs' : 'text-sm')} title={title}>
      <span className={cn('h-2 w-2 shrink-0 rounded-full', DOT[label.tone], label.tone === 'now' && 'ring-2 ring-emerald-200')} />
      <span className={cn('truncate', TEXT[label.tone])}>{label.text}</span>
      {page && !compact && <span className="hidden truncate text-xs text-slate-400 lg:inline">on {page}</span>}
    </span>
  )
}
