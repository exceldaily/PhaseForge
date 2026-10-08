'use client'

// The small pieces every Preventative Maintenance screen shares, so a status
// or a progress bar looks the same on the dashboard, the tracker, and the
// technician's phone.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AlertTriangle, CalendarClock, Filter, Package, RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { blockersOf, cycleDocsPct, cyclePct, isOverdue } from '@/lib/pm/progress'
import { fmtDate } from '@/lib/pm/quarters'
import { BLOCKER_LABEL, STATUS_LABEL, STATUS_SHORT, STATUS_TONE, type PmBlocker, type PmCycle, type PmRole, type PmStatus } from '@/lib/pm/types'

const NAV: { href: string; label: string; exact?: boolean; hide?: (role: PmRole) => boolean }[] = [
  { href: '/app/pm', label: 'PM Dashboard', exact: true },
  { href: '/app/pm/stores', label: 'Store Directory' },
  { href: '/app/pm/tracker', label: 'Quarterly Tracker' },
  { href: '/app/pm/my', label: 'My PMs' },
  { href: '/app/pm/materials', label: 'Materials' },
  { href: '/app/pm/deficiencies', label: 'Deficiencies' },
  { href: '/app/pm/reports', label: 'Reports' },
  { href: '/app/pm/settings', label: 'Settings' },
]

export function PmNav({ role }: { role: PmRole }) {
  const pathname = usePathname()
  // The technician's checklist is a full-screen job: no tab strip to scroll past.
  if (/^\/app\/pm\/jobs\/[^/]+\/work/.test(pathname)) return null
  return (
    <nav className="sticky top-0 z-20 border-b border-slate-200 bg-white print:hidden" aria-label="Preventative Maintenance">
      <div className="flex gap-1 overflow-x-auto px-3 sm:px-5" data-help="pm-nav">
        {NAV.filter((n) => !n.hide?.(role)).map((n) => {
          const active = n.exact ? pathname === n.href : pathname.startsWith(n.href) || (n.href === '/app/pm/tracker' && pathname.startsWith('/app/pm/jobs'))
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

export function PmPage({ title, subtitle, actions, children }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-none space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export function StatusChip({ status, short, className }: { status: PmStatus; short?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_TONE[status].chip, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_TONE[status].dot)} />
      {short ? STATUS_SHORT[status] : STATUS_LABEL[status]}
    </span>
  )
}

const BLOCKER_ICON: Record<PmBlocker, ReactNode> = {
  waiting_filters: <Filter size={10} />, waiting_parts: <Package size={10} />, return_visit: <RotateCcw size={10} />, blocking_deficiency: <AlertTriangle size={10} />,
}

/** The blockers that sit beside the status: filters, parts, return visit. */
export function BlockerChips({ cycle, compact }: { cycle: Pick<PmCycle, 'waitingFilters' | 'waitingParts' | 'returnVisitNeeded' | 'blockingDeficiencies'>; compact?: boolean }) {
  const list = blockersOf(cycle)
  if (!list.length) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {list.map((b) => (
        <span key={b} title={BLOCKER_LABEL[b]} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-rose-200">
          {BLOCKER_ICON[b]}{!compact && BLOCKER_LABEL[b]}
        </span>
      ))}
    </span>
  )
}

export function OverdueChip({ cycle, today }: { cycle: Pick<PmCycle, 'dueDate' | 'status'>; today: string }) {
  if (!isOverdue(cycle, today)) return null
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
      <CalendarClock size={10} /> Overdue since {fmtDate(cycle.dueDate, today)}
    </span>
  )
}

export function ProgressBar({ value, label, tone = 'indigo', small, showValue = true }: {
  value: number; label?: string; tone?: 'indigo' | 'emerald' | 'violet' | 'slate'; small?: boolean; showValue?: boolean
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)))
  const fill = v >= 100 ? 'bg-emerald-500' : tone === 'violet' ? 'bg-violet-500' : tone === 'emerald' ? 'bg-emerald-500' : tone === 'slate' ? 'bg-slate-400' : 'bg-indigo-500'
  return (
    <div className="min-w-0">
      {(label || showValue) && (
        <div className={cn('mb-1 flex items-baseline justify-between gap-2', small ? 'text-[10px]' : 'text-xs')}>
          {label && <span className="truncate font-medium text-slate-600">{label}</span>}
          {showValue && <span className="ml-auto font-semibold tabular-nums text-slate-800">{v}%</span>}
        </div>
      )}
      <div className={cn('overflow-hidden rounded-full bg-slate-200', small ? 'h-1.5' : 'h-2.5')} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? 'Progress'}>
        <div className={cn('h-full rounded-full transition-all', fill)} style={{ width: `${v}%` }} />
      </div>
    </div>
  )
}

/** Checklist % and Documentation %, side by side, from a PM's stored counts. */
export function CycleBars({ cycle, small }: { cycle: Pick<PmCycle, 'checklistDone' | 'checklistTotal' | 'docsDone' | 'docsTotal' | 'templateVersionId'>; small?: boolean }) {
  if (!cycle.templateVersionId) return <span className="text-[11px] text-slate-400">Checklist not started</span>
  return (
    <div className={cn('grid gap-1.5', small ? 'min-w-[120px]' : 'grid-cols-2 gap-3')}>
      <ProgressBar value={cyclePct(cycle)} label={small ? undefined : `Checklist ${cycle.checklistDone}/${cycle.checklistTotal}`} small={small} />
      {!small && <ProgressBar value={cycleDocsPct(cycle)} label={`Documentation ${cycle.docsDone}/${cycle.docsTotal}`} tone="violet" />}
    </div>
  )
}

export function Stat({ label, value, hint, tone = 'slate', href, active }: {
  label: string; value: ReactNode; hint?: string; tone?: 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet'; href?: string; active?: boolean
}) {
  const color = { slate: 'text-slate-900', indigo: 'text-indigo-700', emerald: 'text-emerald-700', amber: 'text-amber-700', rose: 'text-rose-700', sky: 'text-sky-700', violet: 'text-violet-700' }[tone]
  const body = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn('mt-1 text-2xl font-bold tabular-nums', color)}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </>
  )
  const cls = cn('block rounded-xl border bg-white p-3', active ? 'border-indigo-400 ring-1 ring-indigo-300' : 'border-slate-200', href && 'transition-colors hover:border-indigo-300')
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center">
      {icon && <div className="mx-auto mb-2 flex justify-center text-slate-300">{icon}</div>}
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-xs text-slate-500">{children}</div>}
    </div>
  )
}

export function Card({ title, actions, children, className, id }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn('min-w-0 rounded-xl border border-slate-200 bg-white', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
          {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
          {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export const fieldCls = 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-500'
export const labelCls = 'mb-1 block text-xs font-medium text-slate-600'

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className={labelCls}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{children}</p>
}
