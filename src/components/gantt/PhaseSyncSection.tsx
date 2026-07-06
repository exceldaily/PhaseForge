'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { CalendarClock, CheckCircle2, ExternalLink, RefreshCw, Trash2, AlertTriangle } from 'lucide-react'
import { timeAgo } from '@/components/operations/shared'
import {
  syncPhaseToCalendar, unsyncPhaseFromCalendar, getPhaseSyncStatus, saveSkipDays,
} from '@/app/app/projects/[id]/scheduleActions'

interface SyncStatus {
  connected: boolean
  calendarName: string | null
  link: { eventId: string; calendarId: string; lastPushedAt: string | null; status: string } | null
}

// Mon-first display order; codes are RFC-5545 weekday abbreviations.
const DAY_OPTIONS: { code: string; label: string }[] = [
  { code: 'MO', label: 'M' }, { code: 'TU', label: 'T' }, { code: 'WE', label: 'W' },
  { code: 'TH', label: 'T' }, { code: 'FR', label: 'F' }, { code: 'SA', label: 'S' },
  { code: 'SU', label: 'S' },
]

// Google Calendar deep link for an event on a specific calendar.
function eventUrl(calendarId: string, eventId: string) {
  const eid = Buffer.from(`${eventId} ${calendarId}`).toString('base64').replace(/=+$/, '')
  return `https://calendar.google.com/calendar/u/0/r/eventedit/${eid}`
}

export function PhaseSyncSection({ phaseId }: { phaseId: string }) {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [skipDays, setSkipDays] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const refresh = () => {
    getPhaseSyncStatus(phaseId).then((res) => {
      if ('error' in res && res.error) setError(res.error)
      else if ('connected' in res) {
        setStatus({ connected: Boolean(res.connected), calendarName: res.calendarName ?? null, link: res.link ?? null })
        setSkipDays(res.skipDays ?? [])
      }
    })
  }

  useEffect(refresh, [phaseId])

  // Toggles apply instantly; the save (and calendar re-push) is debounced so
  // rapid clicks (e.g. Fri+Sat+Sun in a row) end up in ONE consistent write.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toggleDay = (code: string) => {
    setError(null)
    setSkipDays((prev) => {
      const next = prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        startTransition(async () => {
          const res = await saveSkipDays(phaseId, next)
          if (res?.error) { setError(res.error); refresh() }
          else refresh()
        })
      }, 700)
      return next
    })
  }

  if (!status) return null

  // Don't clutter the panel when the org hasn't connected Google at all.
  if (!status.connected) {
    return (
      <div className="border-t border-slate-100 px-5 py-3">
        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <CalendarClock size={13} /> Google Calendar not connected
        </p>
      </div>
    )
  }

  const sync = () => {
    setError(null)
    startTransition(async () => {
      const res = await syncPhaseToCalendar(phaseId)
      if (res?.error) setError(res.error)
      else refresh()
    })
  }

  const unsync = () => {
    setError(null)
    startTransition(async () => {
      const res = await unsyncPhaseFromCalendar(phaseId)
      if (res?.error) setError(res.error)
      else { setStatus((s) => (s ? { ...s, link: null } : s)); refresh() }
    })
  }

  return (
    <div className="border-t border-slate-100 px-5 py-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <CalendarClock size={13} /> Google Calendar
        </p>
        {status.calendarName && (
          <span className="max-w-[130px] truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
            {status.calendarName}
          </span>
        )}
      </div>

      {status.link ? (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs text-emerald-600">
            <CheckCircle2 size={13} /> Synced
            {status.link.lastPushedAt && <span className="text-slate-400">· {timeAgo(status.link.lastPushedAt)}</span>}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={sync}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50"
            >
              <RefreshCw size={12} className={pending ? 'animate-spin' : ''} /> Re-sync
            </button>
            <a
              href={eventUrl(status.link.calendarId, status.link.eventId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
            >
              <ExternalLink size={12} /> View in Calendar
            </a>
            <button
              onClick={unsync}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-rose-500 hover:text-rose-600 disabled:opacity-50"
            >
              <Trash2 size={12} /> Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={sync}
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <RefreshCw size={13} className={pending ? 'animate-spin' : ''} />
          {pending ? 'Syncing…' : 'Sync this phase to Google Calendar'}
        </button>
      )}

      <div className="mt-3">
        <p className="mb-1.5 text-[11px] font-medium text-slate-400">
          Skip days — phase won&apos;t appear on the calendar on crossed-out days
        </p>
        <div className="flex gap-1">
          {DAY_OPTIONS.map(({ code, label }) => {
            const skipped = skipDays.includes(code)
            return (
              <button
                key={code}
                onClick={() => toggleDay(code)}
                title={skipped ? `${code}: hidden on calendar` : `${code}: shown on calendar`}
                className={`h-7 w-7 rounded-full text-[11px] font-semibold transition-all ${
                  skipped
                    ? 'bg-slate-200 text-slate-400 line-through dark:bg-slate-700'
                    : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
        {skipDays.length > 0 && status.link && (
          <p className="mt-1 text-[11px] text-slate-400">
            Shows as a weekly repeating event on the remaining days.
          </p>
        )}
      </div>

      {error && (
        <p className="mt-2 flex items-start gap-1 text-xs text-rose-600">
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" /> {error}
        </p>
      )}
    </div>
  )
}
