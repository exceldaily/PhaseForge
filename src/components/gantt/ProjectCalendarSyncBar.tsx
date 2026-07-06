'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { CalendarCheck, RefreshCw, AlertTriangle, Zap, ZapOff, Trash2, X } from 'lucide-react'
import {
  getProjectSyncStatus, syncAllProjectPhases, unsyncAllProjectPhases,
  setProjectAutoSync, saveProjectSkipDays, setProjectSuperintendent,
} from '@/app/app/projects/[id]/scheduleActions'
import { DayChips } from '@/components/gantt/DayChips'

interface PhaseRow { id: string; name: string; start: string; end: string; synced: boolean }
interface Status {
  connected: boolean
  calendarName: string | null
  autoSync: boolean
  projectSkipDays: string[]
  superintendentId: string | null
  superintendents: { id: string; name: string }[]
  syncedCount: number
  phases: PhaseRow[]
}

// Project-level calendar bar above the Gantt: pick-and-sync phases, desync
// all, auto-sync toggle, and project-wide default skip days.
export function ProjectCalendarSyncBar({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [confirmDesync, setConfirmDesync] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [skipDays, setSkipDays] = useState<string[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const refresh = () => {
    getProjectSyncStatus(projectId).then((res) => {
      if ('error' in res && res.error) return
      if ('connected' in res) {
        const s: Status = {
          connected: Boolean(res.connected), calendarName: res.calendarName ?? null,
          autoSync: Boolean(res.autoSync), projectSkipDays: res.projectSkipDays ?? [],
          superintendentId: res.superintendentId ?? null,
          superintendents: res.superintendents ?? [],
          syncedCount: res.syncedCount ?? 0, phases: res.phases ?? [],
        }
        setStatus(s)
        setSkipDays(s.projectSkipDays)
      }
    })
  }
  useEffect(refresh, [projectId])

  // Declared before any early return — hook order must be stable.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (!status || !status.connected) return null
  const phaseCount = status.phases.length

  const openPicker = () => {
    setSelected(new Set(status.phases.map((p) => p.id)))  // default: all
    setShowPicker(true)
    setMsg(null); setError(null)
  }

  const runSync = () => {
    const ids = [...selected]
    if (!ids.length) { setError('Select at least one phase'); return }
    setError(null); setMsg(null)
    startTransition(async () => {
      const res = await syncAllProjectPhases(projectId, ids)
      if (res?.error) setError(res.error)
      else if (res?.ok) {
        setShowPicker(false)
        setMsg(`Synced ${res.synced} of ${res.total} phase${res.total === 1 ? '' : 's'} to ${status.calendarName ?? 'Google Calendar'}.`)
        if (res.failures?.length) setError(res.failures[0])
        refresh()
      }
    })
  }

  const runDesync = () => {
    setError(null); setMsg(null)
    startTransition(async () => {
      const res = await unsyncAllProjectPhases(projectId)
      setConfirmDesync(false)
      if (res?.error) setError(res.error)
      else if (res?.ok) { setMsg(`Removed ${res.removed} event${res.removed === 1 ? '' : 's'} from the calendar. Auto-sync is off.`); refresh() }
    })
  }

  const toggleAuto = () => {
    setError(null); setMsg(null)
    startTransition(async () => {
      const res = await setProjectAutoSync(projectId, !status.autoSync)
      if (res?.error) setError(res.error); else refresh()
    })
  }

  // Debounced project skip-days save (re-pushes all linked events server-side).
  const onSkipChange = (next: string[]) => {
    setSkipDays(next)
    setMsg(null); setError(null)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      startTransition(async () => {
        const res = await saveProjectSkipDays(projectId, next)
        if (res?.error) { setError(res.error); refresh() }
        else if (res?.ok) { setMsg(res.repushed ? `Updated ${res.repushed} calendar event${res.repushed === 1 ? '' : 's'}.` : null); refresh() }
      })
    }, 700)
  }

  return (
    <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
          <CalendarCheck size={15} className="text-indigo-500" />
          Calendar
          {status.calendarName && (
            <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800">{status.calendarName}</span>
          )}
        </span>

        <span className="text-xs text-slate-400">
          {status.syncedCount} of {phaseCount} phase{phaseCount === 1 ? '' : 's'} synced
        </span>

        <button
          onClick={openPicker}
          disabled={pending || phaseCount === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <RefreshCw size={13} className={pending ? 'animate-spin' : ''} />
          Sync phases…
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

        {status.superintendents.length > 0 && (
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            Super:
            <select
              value={status.superintendentId ?? ''}
              disabled={pending}
              onChange={(e) => {
                const id = e.target.value || null
                setMsg(null); setError(null)
                startTransition(async () => {
                  const res = await setProjectSuperintendent(projectId, id)
                  if (res?.error) setError(res.error)
                  else if (res?.ok) {
                    setMsg(res.repushed ? `Superintendent set — updated ${res.repushed} calendar event${res.repushed === 1 ? '' : 's'}.` : 'Superintendent set.')
                    refresh()
                  }
                })
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">—</option>
              {status.superintendents.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
        )}

        <span className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-slate-400">Skip days (whole project):</span>
          <DayChips value={skipDays} onChange={onSkipChange} size="sm" />
        </span>

        {status.syncedCount > 0 && (
          <button
            onClick={() => setConfirmDesync(true)}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-900/20"
          >
            <Trash2 size={12} /> Desync project
          </button>
        )}

        {msg && <span className="text-xs text-emerald-600">{msg}</span>}
        {error && (
          <span className="inline-flex items-center gap-1 text-xs text-rose-600">
            <AlertTriangle size={12} /> {error}
          </span>
        )}
      </div>

      {/* ── Phase picker modal ── */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowPicker(false)}>
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Choose phases to sync</h3>
              <button onClick={() => setShowPicker(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
            </div>
            <div className="px-5 py-3">
              <label className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2 text-sm font-medium text-slate-700 dark:border-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={selected.size === status.phases.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(status.phases.map((p) => p.id)) : new Set())}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                Select all ({status.phases.length})
              </label>
              <div className="max-h-72 space-y-0.5 overflow-y-auto">
                {status.phases.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={(e) => {
                        setSelected((cur) => {
                          const next = new Set(cur)
                          if (e.target.checked) next.add(p.id); else next.delete(p.id)
                          return next
                        })
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                    <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{p.name}</span>
                    <span className="text-[11px] text-slate-400">{p.start} → {p.end}</span>
                    {p.synced && <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-900/30">synced</span>}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3.5 dark:border-slate-800">
              {error && <span className="text-xs text-rose-600">{error}</span>}
              <button
                onClick={runSync}
                disabled={pending}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <RefreshCw size={14} className={pending ? 'animate-spin' : ''} />
                {pending ? 'Syncing…' : `Sync ${selected.size} phase${selected.size === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Desync confirmation ── */}
      {confirmDesync && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDesync(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Remove this project from the calendar?</h3>
            <p className="mt-1.5 text-sm text-slate-500">
              All {status.syncedCount} synced event{status.syncedCount === 1 ? '' : 's'} will be deleted from
              {' '}{status.calendarName ?? 'Google Calendar'} and auto-sync will turn off. Your phases in PhaseForge are not affected.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmDesync(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">Cancel</button>
              <button onClick={runDesync} disabled={pending} className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">
                {pending ? 'Removing…' : 'Remove events'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
