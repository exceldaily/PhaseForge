'use client'

import { useState } from 'react'
import { ExternalLink, MessageSquare } from 'lucide-react'
import type { NextAction, PrioritizedCall } from '@/lib/dispatch/types'
import { getCallConditionBadges, resolveNextAction } from '@/lib/dispatch/priorityEngine'
import { formatDateTime, formatEta, titleCase } from '@/lib/dispatch/utils'

const URGENCY_BAR: Record<string, string> = {
  urgent: 'bg-rose-500',
  high: 'bg-orange-400',
  normal: 'bg-slate-400 dark:bg-slate-600',
  low: 'bg-slate-300 dark:bg-slate-700',
}

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

const NEXT_ACTION_LABELS: Record<NextAction, string> = {
  assign_vendor: 'Assign Vendor',
  request_eta: 'Request ETA',
  follow_up_vendor: 'Follow Up w/ Vendor',
  check_part_shipping: 'Check Part Shipping',
  schedule_repair: 'Schedule Repair',
  send_proposal: 'Send Proposal',
  await_customer_approval: 'Await Approval',
  close_call: 'Close Call',
  none: 'No Action Needed',
}

// Condition chips hidden on rows because a colored badge already conveys them.
const SUPPRESSED_ROW_BADGES = new Set([
  'Needs Review', // duplicates the pulsing "New" badge
  'Proposal Approved',
  'Parts Received',
  'Follow-Up',
])

export interface EtaAlertConfig {
  redHours: number
  yellowHours: number
}

// Red when the ETA is inside the red window (or blown), yellow inside the
// yellow window — thresholds are org-configurable under Manage.
export function getExpirationAlert(call: PrioritizedCall, cfg: EtaAlertConfig): 'critical' | 'warning' | null {
  if (!call.eta_scheduled || (call.status !== 'open' && call.status !== 'in_progress')) return null
  const expiresAt = new Date(call.eta_scheduled).getTime()
  if (Number.isNaN(expiresAt)) return null
  const hoursRemaining = (expiresAt - Date.now()) / (1000 * 60 * 60)
  if (hoursRemaining <= cfg.redHours) return 'critical'
  if (hoursRemaining <= cfg.yellowHours) return 'warning'
  return null
}

function expirationLabel(dateStr: string, cfg: EtaAlertConfig): string {
  const hoursRemaining = (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60)
  if (hoursRemaining <= 0) return 'Expired'
  if (hoursRemaining < 1) return 'Expires in <1h'
  if (hoursRemaining <= cfg.redHours) return `Expires in ${Math.ceil(hoursRemaining)}h`
  return `Expires within ${cfg.yellowHours}h`
}

export function CallRow({ call, onOpen, etaAlert }: {
  call: PrioritizedCall
  onOpen: () => void
  etaAlert?: EtaAlertConfig
}) {
  const cfg = etaAlert ?? { redHours: 12, yellowHours: 24 }
  const [showNote, setShowNote] = useState(false)
  const alert = getExpirationAlert(call, cfg)
  const nextAction = resolveNextAction(call)
  const badges = getCallConditionBadges(call).filter((b) => !SUPPRESSED_ROW_BADGES.has(b))
  const statusCls = STATUS_COLORS[call.status] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'

  return (
    <div role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      className={`group flex w-full cursor-pointer items-stretch gap-3 rounded-lg border bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-indigo-300 dark:bg-slate-900 ${
        alert === 'critical'
          ? 'border-rose-300 bg-rose-50/80 hover:bg-rose-50 dark:border-rose-500/50 dark:bg-rose-500/10'
          : alert === 'warning'
            ? 'border-amber-300 bg-amber-50/80 hover:bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10'
            : call.needs_acknowledgment
              ? 'border-sky-300 dark:border-sky-500/40'
              : 'border-slate-200 dark:border-slate-700'
      }`}>
      <span className={`w-1 shrink-0 rounded-full ${URGENCY_BAR[call.urgency]}`} />

      <div className="min-w-0 flex-1">
        {/* Badges line */}
        <div className="flex flex-wrap items-center gap-1.5">
          {call.needs_acknowledgment && (
            <span className="animate-pulse rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800 ring-1 ring-sky-300 dark:bg-sky-400/15 dark:text-sky-300 dark:ring-sky-400/40">New</span>
          )}
          <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
            {call.store ? `#${call.store.store_number}` : ''}
          </span>
          <span className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
            {call.store ? call.store.store_name : call.customer_name ?? 'No location'}
          </span>
          {call.store && call.customer_name && <span className="text-xs text-slate-400">{call.customer_name}</span>}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${URGENCY_COLORS[call.urgency]}`}>
            {call.priority_level ? `${call.priority_level.code} · ${call.priority_level.label}` : call.urgency}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusCls}`}>
            {titleCase(call.status)}
          </span>
          {call.part_status !== 'none' && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
              {titleCase(call.part_status)}
            </span>
          )}
          {call.proposal_status !== 'none' && (
            <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
              Proposal: {titleCase(call.proposal_status)}
            </span>
          )}
          {badges.map((b) => (
            <span key={b} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              {b}
            </span>
          ))}
        </div>

        {/* Number + description line */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {call.tracking_url ? (
            <a href={call.tracking_url} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 font-mono font-semibold text-indigo-600 underline decoration-dotted underline-offset-2 hover:opacity-80">
              {call.service_call_number} <ExternalLink size={10} />
            </a>
          ) : (
            <span className="font-mono font-semibold text-slate-400">{call.service_call_number}</span>
          )}
          {call.internal_job_number && <span className="font-mono text-slate-400">Job #{call.internal_job_number}</span>}
          <span className="truncate">&ldquo;{call.description}&rdquo;</span>
        </div>

        {/* Meta line */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <span>
            Tech/Vendor:{' '}
            {call.vendors.length > 0
              ? <b className="text-slate-700 dark:text-slate-200">{call.vendors.map((v) => v.name).join(', ')}</b>
              : <span className="font-medium text-rose-600 dark:text-rose-400">Unassigned</span>}
          </span>
          <span>
            ETA: {call.eta_scheduled ? formatEta(call.eta_scheduled) : <span className="font-medium text-orange-600 dark:text-orange-400">None</span>}
          </span>
          {alert && call.eta_scheduled && (
            <span className={`font-bold ${alert === 'critical' ? 'text-rose-700 dark:text-rose-400' : 'text-amber-700 dark:text-amber-400'}`}>
              {expirationLabel(call.eta_scheduled, cfg)}
            </span>
          )}
          {call.nte != null && (
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              NTE: ${Number(call.nte).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
          <span>{call.days_open}d open</span>
          <span>Updated {formatDateTime(call.updated_at)}</span>
          {call.latest_note && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowNote((s) => !s) }}
              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <MessageSquare size={11} /> {showNote ? 'Hide note' : 'Latest note'}
            </button>
          )}
        </div>

        {call.latest_note && showNote && (
          <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
            <span className="italic">&ldquo;{call.latest_note.note_text}&rdquo;</span>
            <span className="mt-0.5 block text-[10px] text-slate-400">{formatDateTime(call.latest_note.created_at)}</span>
          </div>
        )}

        {call.manager_note && (
          <div className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-800 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300">
            Manager Note: <span className="font-normal">{call.manager_note}</span>
          </div>
        )}
      </div>

      {/* Right rail: suggested next action + priority score */}
      <div className="flex shrink-0 flex-col items-end justify-between gap-1">
        {nextAction !== 'none' && (
          <span className="whitespace-nowrap rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/30">
            → {NEXT_ACTION_LABELS[nextAction]}
          </span>
        )}
        <span className="font-mono text-[10px] text-slate-300 dark:text-slate-600">{Math.round(call.priority_score)}</span>
      </div>
    </div>
  )
}
