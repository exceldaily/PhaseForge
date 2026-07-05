'use client'

// Small shared building blocks for operations pages: page header, status pills,
// empty states, and relative timestamps. Keep these dumb and reusable.

import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export function OpsPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

const STATUS_STYLES: Record<string, string> = {
  // generic
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  inactive: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  prospect: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  on_hold: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  do_not_use: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  // calls
  open: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  assigned: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  waiting_vendor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  waiting_parts: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  waiting_customer: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  waiting_quote: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  follow_up: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  closed: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  cancelled: 'bg-slate-100 text-slate-400 line-through dark:bg-slate-800 dark:text-slate-500',
  // assets
  in_service: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  needs_attention: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  out_of_service: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  retired: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
  // invoices
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  ready: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  sent: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  overdue: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  void: 'bg-slate-100 text-slate-400 line-through dark:bg-slate-800 dark:text-slate-500',
  // staff
  on_leave: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  terminated: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
}

export function StatusPill({ status, label }: { status: string; label?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium',
      STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
    )}>
      {label ?? status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
    </span>
  )
}

export function PriorityDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function daysOpen(createdAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000))
}

export function RecordLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-indigo-600 hover:underline dark:text-indigo-400">
      {children}
    </Link>
  )
}
