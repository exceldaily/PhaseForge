import Link from 'next/link'
import type { Alert } from '@/lib/servicechannel/alerts'

const TONE = { high: 'border-rose-200 bg-rose-50 text-rose-900', medium: 'border-amber-200 bg-amber-50 text-amber-900', low: 'border-slate-200 bg-slate-50 text-slate-800' }

/** Management alerts: one row per condition, each a link to where it is handled. Server component. */
export function AlertsPanel({ alerts, compact }: { alerts: Alert[]; compact?: boolean }) {
  if (!alerts.length) return <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">No management alerts. Thresholds are set under Settings.</div>
  return (
    <ul className={compact ? 'grid gap-2 sm:grid-cols-2 xl:grid-cols-3' : 'space-y-2'}>
      {alerts.map((a) => (
        <li key={a.key}>
          <Link href={a.href} className={`flex items-start gap-3 rounded-xl border p-3 hover:ring-1 hover:ring-indigo-300 ${TONE[a.severity]}`}>
            <span className="min-w-[2.5rem] text-2xl font-bold tabular-nums">{a.count}</span>
            <span className="min-w-0"><span className="block text-sm font-semibold">{a.title}</span>{!compact && <span className="block text-xs opacity-80">{a.detail}</span>}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
