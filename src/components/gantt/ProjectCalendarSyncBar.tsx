'use client'

import { useEffect, useState, useTransition } from 'react'
import { CalendarCheck, RefreshCw, AlertTriangle, Zap, ZapOff } from 'lucide-react'
import {
  getProjectSyncStatus, syncAllProjectPhases, setProjectAutoSync,
} from '@/app/app/projects/[id]/scheduleActions'

interface Status {
  connected: boolean
  calendarName: string | null
  autoSync: boolean
  syncedCount: number
  phaseCount: number
}

// Project-level calendar banner shown above the Gantt: one-click "sync all
// phases", auto-sync toggle, and live synced/total count. Renders nothing when
// the org has no Google connection (keeps the Gantt clean for everyone else).
export function ProjectCalendarSyncBar({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const refresh = () => {
    getProjectSyncStatus(projectId).then((res) => {
      if ('error' in res && res.error) return
      if ('connected' in res) {
        setStatus({
          connected: Boolean(res.connected), calendarName: res.calendarName ?? null,
          autoSync: Boolean(res.autoSync), syncedCount: res.syncedCount ?? 0, phaseCount: res.phaseCount ?? 0,
        })
      }
    })
  }
  useEffect(refresh, [projectId])

  if (!status || !status.connected) return null

  const syncAll = () => {
    setError(null); setMsg(null)
    startTransition(async () => {
      const res = await syncAllProjectPhases(projectId)
      if (res?.error) setError(res.error)
      else if (res?.ok) {
        setMsg(`Synced ${res.synced} of ${res.total} phase${res.total === 1 ? '' : 's'} to ${status.calendarName ?? 'Google Calendar'}.`)
        if (res.failures?.length) setError(res.failures[0])
        refresh()
      }
    })
  }

  const toggleAuto = () => {
    setError(null); setMsg(null)
    startTransition(async () => {
      const res = await setProjectAutoSync(projectId, !status.autoSync)
      if (res?.error) setError(res.error); else refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/50">
      <span className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
        <CalendarCheck size={15} className="text-indigo-500" />
        Calendar
        {status.calendarName && (
          <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800">{status.calendarName}</span>
        )}
      </span>

      <span className="text-xs text-slate-400">
        {status.syncedCount} of {status.phaseCount} phase{status.phaseCount === 1 ? '' : 's'} synced
      </span>

      <button
        onClick={syncAll}
        disabled={pending || status.phaseCount === 0}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        <RefreshCw size={13} className={pending ? 'animate-spin' : ''} />
        {status.syncedCount > 0 ? 'Re-sync all phases' : 'Sync all phases to calendar'}
      </button>

      <button
        onClick={toggleAuto}
        disabled={pending}
        title={status.autoSync ? 'New/edited phases sync automatically' : 'Turn on auto-sync for this project'}
        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
          status.autoSync
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
            : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
        }`}
      >
        {status.autoSync ? <Zap size={12} /> : <ZapOff size={12} />}
        Auto-sync {status.autoSync ? 'on' : 'off'}
      </button>

      {msg && <span className="text-xs text-emerald-600">{msg}</span>}
      {error && (
        <span className="inline-flex items-center gap-1 text-xs text-rose-600">
          <AlertTriangle size={12} /> {error}
        </span>
      )}
    </div>
  )
}
