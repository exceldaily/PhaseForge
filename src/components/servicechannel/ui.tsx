'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { INTERNAL_STATUS_LABELS, OBSERVATION_LABELS, type InternalStatus, type ObservationState } from '@/lib/servicechannel/types'

const NAV = [
  { href: '/app/servicechannel', label: 'Overview', exact: true },
  { href: '/app/servicechannel/work-orders', label: 'Work Orders' },
  { href: '/app/servicechannel/import', label: 'Import Center' },
  { href: '/app/servicechannel/settings', label: 'Settings' },
]

export function ScNav() {
  const pathname = usePathname()
  return (
    <nav className="sticky top-0 z-20 border-b border-slate-200 bg-white print:hidden" aria-label="ServiceChannel">
      <div className="flex gap-1 overflow-x-auto px-3 sm:px-5">
        {NAV.map((n) => {
          const active = n.exact ? pathname === n.href : pathname.startsWith(n.href)
          return (
            <Link key={n.href} href={n.href}
              className={cn('whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                active ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800')}>
              {n.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

/** ServiceChannel's own status, shown as it was observed. */
export function OfficialChip({ status, statusExt }: { status: string | null; statusExt: string | null }) {
  const tone = statusExt === 'UNSATISFACTORY' ? 'bg-rose-50 text-rose-700 ring-rose-200'
    : /COMPLETED/.test(status ?? '') ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : statusExt ? 'bg-indigo-50 text-indigo-700 ring-indigo-200' : 'bg-slate-100 text-slate-700 ring-slate-200'
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', tone)} title="Official ServiceChannel status, as last observed">
      <span className="truncate">{status ?? 'Unknown'}{statusExt ? ` / ${statusExt}` : ''}</span>
    </span>
  )
}

const INTERNAL_TONE: Record<InternalStatus, string> = {
  new: 'bg-slate-100 text-slate-700', needs_verification: 'bg-amber-50 text-amber-800', assigned: 'bg-sky-50 text-sky-700', accepted: 'bg-sky-100 text-sky-800',
  in_progress: 'bg-indigo-50 text-indigo-700', waiting_customer: 'bg-amber-50 text-amber-800', waiting_parts: 'bg-amber-50 text-amber-800', waiting_approval: 'bg-amber-50 text-amber-800',
  blocked: 'bg-rose-50 text-rose-700', pending_verification: 'bg-violet-50 text-violet-700', verified_resolved: 'bg-emerald-50 text-emerald-700',
}

export function InternalChip({ status }: { status: InternalStatus }) {
  return <span className={cn('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', INTERNAL_TONE[status] ?? 'bg-slate-100 text-slate-700')} title="PhaseForge follow-up status">{INTERNAL_STATUS_LABELS[status] ?? status}</span>
}

export function ObservationChip({ state }: { state: string }) {
  const s = state as ObservationState
  const tone = s === 'observed' ? 'text-emerald-700' : s === 'manually_verified' ? 'text-sky-700' : s === 'needs_verification' ? 'text-rose-700' : 'text-amber-700'
  return <span className={cn('text-[11px] font-medium', tone)}>{OBSERVATION_LABELS[s] ?? state}</span>
}

export const fmtDate = (d: string | null | undefined) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '-')
export const fmtWhen = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-')
export const scLink = (tracking: string) => `https://www.servicechannel.com/sc/wo/Workorders/index?id=${encodeURIComponent(tracking)}`
export const cx = cn
