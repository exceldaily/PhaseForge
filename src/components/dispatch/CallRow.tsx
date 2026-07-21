'use client'

import { ExternalLink } from 'lucide-react'
import type { PrioritizedCall } from '@/lib/dispatch/types'
import { getCallConditionBadges } from '@/lib/dispatch/priorityEngine'
import { formatDate, formatEta, titleCase } from '@/lib/dispatch/utils'

const URGENCY_COLORS: Record<string, string> = {
  urgent: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  high: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  normal: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  low: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
  in_progress: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  cancelled: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
  incomplete: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
  recall: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  parts_on_order: 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
  part_received: 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
}

export function CallRow({ call, onOpen }: { call: PrioritizedCall; onOpen: () => void }) {
  const badges = getCallConditionBadges(call)
  const statusCls = STATUS_COLORS[call.status] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'

  return (
    <button onClick={onOpen}
      className="block w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
          {call.store ? `#${call.store.store_number} ${call.store.store_name}` : call.customer_name ?? 'No location'}
        </span>
        {call.store && call.customer_name && <span className="text-xs text-slate-400">{call.customer_name}</span>}
        <span className="text-xs font-semibold text-indigo-600">
          {call.tracking_url
            ? <a href={call.tracking_url} target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-0.5 hover:underline">
                {call.service_call_number} <ExternalLink size={10} />
              </a>
            : call.service_call_number}
        </span>
        {call.internal_job_number && (
          <span className="text-xs text-slate-500">Job <b>{call.internal_job_number}</b></span>
        )}
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${URGENCY_COLORS[call.urgency]}`}>
          {call.priority_level ? call.priority_level.code : call.urgency}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusCls}`}>
          {titleCase(call.status)}
        </span>
        <span className="ml-auto text-[11px] text-slate-400">
          {call.days_open}d open · started {formatDate(call.date_started)}
        </span>
      </div>

      <p className="mt-1.5 line-clamp-1 text-xs text-slate-600 dark:text-slate-300">{call.description}</p>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {call.vendors.length > 0
          ? <span>Tech: <b className="text-slate-700 dark:text-slate-200">{call.vendors.map((v) => v.name).join(', ')}</b></span>
          : <span className="text-slate-400">Unassigned</span>}
        {call.eta_scheduled && <span>ETA {formatEta(call.eta_scheduled)}</span>}
        {call.scheduled_date && <span>Scheduled {formatDate(call.scheduled_date)}</span>}
        {call.rack_circuit_case && <span>{call.rack_circuit_case}</span>}
        {badges.map((b) => (
          <span key={b} className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
            {b}
          </span>
        ))}
        {call.latest_note && (
          <span className="line-clamp-1 italic text-slate-400">
            “{call.latest_note.note_text.slice(0, 80)}{call.latest_note.note_text.length > 80 ? '…' : ''}”
          </span>
        )}
      </div>
    </button>
  )
}
