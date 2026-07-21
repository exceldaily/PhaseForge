'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, PhoneCall, Plus, Trash2 } from 'lucide-react'
import {
  addOnCallParticipant, removeOnCallParticipant, renameOnCallParticipant,
  reorderOnCallParticipants, updateOnCallSettings,
} from '@/app/app/dispatch/actions'
import {
  buildPeriods, parseLocalDate, periodIndexForDate, periodsOverlappingRange,
  type OnCallInterval, type OnCallParticipant, type OnCallPeriod, type OnCallSettings,
} from '@/lib/dispatch/onCall'

type ViewMode = 'week' | 'month' | 'year'

// How often on-call passes to the next name. The Week/Month/Year tabs are only
// for navigating the calendar — they never change the rotation itself.
const INTERVAL_LABELS: Record<OnCallInterval, string> = {
  week: 'Rotates weekly (standard)',
  biweek: 'Rotates every 2 weeks',
  month: 'Rotates monthly',
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// A stable palette so each roster member keeps a consistent color across views.
const PERSON_COLORS = [
  'bg-sky-100 text-sky-800 ring-sky-200 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/30',
  'bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/30',
  'bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/30',
  'bg-purple-100 text-purple-800 ring-purple-200 dark:bg-purple-400/10 dark:text-purple-300 dark:ring-purple-400/30',
  'bg-rose-100 text-rose-800 ring-rose-200 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/30',
  'bg-teal-100 text-teal-800 ring-teal-200 dark:bg-teal-400/10 dark:text-teal-300 dark:ring-teal-400/30',
  'bg-indigo-100 text-indigo-800 ring-indigo-200 dark:bg-indigo-400/10 dark:text-indigo-300 dark:ring-indigo-400/30',
  'bg-orange-100 text-orange-800 ring-orange-200 dark:bg-orange-400/10 dark:text-orange-300 dark:ring-orange-400/30',
]

const inputCls = 'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

function fmtRange(p: OnCallPeriod): string {
  const endInclusive = new Date(p.end.getTime() - 1)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${p.start.toLocaleDateString('en-US', opts)} – ${endInclusive.toLocaleDateString('en-US', opts)}`
}

function todayLocalIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function OnCallClient({ participants, settings, canEdit }: {
  participants: OnCallParticipant[]
  settings: OnCallSettings | null
  canEdit: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('week')
  const [newName, setNewName] = useState('')
  const now = new Date()
  const [monthCursor, setMonthCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [yearCursor, setYearCursor] = useState(now.getFullYear())

  const anchorIso = settings?.anchor_date ?? todayLocalIso()
  const interval: OnCallInterval = settings?.rotation_interval ?? 'week'
  const anchor = useMemo(() => parseLocalDate(anchorIso), [anchorIso])

  const colorByParticipant = useMemo(() => {
    const map = new Map<string, string>()
    participants.forEach((p, i) => map.set(p.id, PERSON_COLORS[i % PERSON_COLORS.length]))
    return map
  }, [participants])

  const currentIndex = periodIndexForDate(anchor, interval, now)
  const currentPeriods = useMemo(
    () => buildPeriods(participants, anchor, interval, currentIndex, 13),
    [participants, anchor, interval, currentIndex],
  )
  const monthPeriods = useMemo(() => {
    const start = new Date(monthCursor.year, monthCursor.month, 1)
    const end = new Date(monthCursor.year, monthCursor.month + 1, 1)
    return periodsOverlappingRange(participants, anchor, interval, start, end)
  }, [participants, anchor, interval, monthCursor])
  const yearPeriods = useMemo(() => {
    const start = new Date(yearCursor, 0, 1)
    const end = new Date(yearCursor + 1, 0, 1)
    return periodsOverlappingRange(participants, anchor, interval, start, end)
  }, [participants, anchor, interval, yearCursor])

  async function run(action: () => Promise<{ error?: string } | { ok?: boolean }>) {
    setError(null)
    const res = await action()
    if (res && 'error' in res && res.error) setError(res.error)
    else router.refresh()
  }

  function move(id: string, dir: -1 | 1) {
    const ids = participants.map((p) => p.id)
    const i = ids.indexOf(id)
    const j = i + dir
    if (i === -1 || j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    void run(() => reorderOnCallParticipants(ids))
  }

  const onCallNow = currentPeriods[0]
  const upNext = currentPeriods[1]

  function personBadge(p: OnCallPeriod, big = false) {
    if (!p.participant) return <span className="text-xs text-slate-400">No one yet, add names to the roster</span>
    return (
      <span className={`rounded-full font-semibold ring-1 ${big ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'} ${colorByParticipant.get(p.participant.id)}`}>
        {p.participant.name}
      </span>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-100 p-4 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4">
          <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">On Call</h1>
          <p className="text-xs text-slate-500">
            The rotation auto-maps from the roster order. Add, remove, or reorder names and the whole year updates.
          </p>
        </div>

        {error && <p className="mb-3 text-xs text-rose-600">{error}</p>}

        {/* Now / next banner */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50/60 px-4 py-3 dark:border-indigo-900 dark:bg-indigo-950/30">
            <PhoneCall size={18} className="shrink-0 text-indigo-500" />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">On call now · {fmtRange(onCallNow)}</p>
              <div className="mt-1">{personBadge(onCallNow, true)}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Up next · {fmtRange(upNext)}</p>
              <div className="mt-1">{personBadge(upNext, true)}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
          {/* Schedule views */}
          <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1">
                {(['week', 'month', 'year'] as ViewMode[]).map((v) => (
                  <button key={v} onClick={() => setView(v)}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium capitalize ${view === v ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    {v}
                  </button>
                ))}
              </div>
              {view === 'month' && (
                <div className="flex items-center gap-2 text-xs">
                  <button onClick={() => setMonthCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 }))}
                    className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">←</button>
                  <span className="w-32 text-center font-medium text-slate-700 dark:text-slate-200">{MONTH_NAMES[monthCursor.month]} {monthCursor.year}</span>
                  <button onClick={() => setMonthCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 }))}
                    className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">→</button>
                </div>
              )}
              {view === 'year' && (
                <div className="flex items-center gap-2 text-xs">
                  <button onClick={() => setYearCursor((y) => y - 1)}
                    className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">←</button>
                  <span className="w-16 text-center font-medium text-slate-700 dark:text-slate-200">{yearCursor}</span>
                  <button onClick={() => setYearCursor((y) => y + 1)}
                    className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">→</button>
                </div>
              )}
            </div>

            {view === 'week' && (
              <ul className="space-y-1.5">
                {currentPeriods.map((p) => (
                  <li key={p.index}
                    className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs ${
                      p.index === currentIndex
                        ? 'border-indigo-300 bg-indigo-50/60 dark:border-indigo-800 dark:bg-indigo-950/30'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}>
                    <span className={`font-medium ${p.index === currentIndex ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500'}`}>
                      {fmtRange(p)}
                      {p.index === currentIndex && <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">NOW</span>}
                    </span>
                    {personBadge(p)}
                  </li>
                ))}
              </ul>
            )}

            {view === 'month' && (
              <ul className="space-y-1.5">
                {monthPeriods.map((p) => (
                  <li key={p.index}
                    className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs ${
                      p.index === currentIndex ? 'border-indigo-300 bg-indigo-50/60 dark:border-indigo-800 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700'
                    }`}>
                    <span className="font-medium text-slate-500">{fmtRange(p)}</span>
                    {personBadge(p)}
                  </li>
                ))}
              </ul>
            )}

            {view === 'year' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {MONTH_NAMES.map((monthName, monthIdx) => {
                  const monthShifts = yearPeriods.filter((p) => {
                    // A shift belongs to the month it starts in; shifts that began
                    // in December of the prior year show under January.
                    const s = p.start
                    return s.getFullYear() === yearCursor
                      ? s.getMonth() === monthIdx
                      : monthIdx === 0 && s.getFullYear() < yearCursor
                  })
                  if (monthShifts.length === 0) return null
                  return (
                    <div key={monthName} className="rounded-md border border-slate-200 p-2 dark:border-slate-700">
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{monthName}</p>
                      <ul className="space-y-1">
                        {monthShifts.map((p) => (
                          <li key={p.index}
                            className={`flex items-center justify-between gap-2 rounded border px-2 py-1 text-[11px] ${
                              p.index === currentIndex ? 'border-indigo-300 bg-indigo-50/60 dark:border-indigo-800 dark:bg-indigo-950/30' : 'border-transparent'
                            }`}>
                            <span className="text-slate-500">{fmtRange(p)}</span>
                            {personBadge(p)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Roster + settings */}
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Rotation Roster</h2>
              <p className="mb-3 text-[11px] text-slate-400">Order here = rotation order. #1 starts on the rotation start date.</p>
              <ul className="space-y-1.5">
                {participants.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1.5 dark:border-slate-700">
                    <span className="w-5 text-center font-mono text-[10px] text-slate-400">{i + 1}</span>
                    <input key={`${p.id}-${p.name}`} defaultValue={p.name} readOnly={!canEdit}
                      onBlur={(e) => {
                        const v = e.target.value.trim()
                        if (canEdit && v && v !== p.name) void run(() => renameOnCallParticipant(p.id, v))
                      }}
                      className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-slate-700 outline-none hover:border-slate-200 focus:border-indigo-400 dark:text-slate-200 dark:hover:border-slate-700" />
                    {canEdit && (
                      <>
                        <button onClick={() => move(p.id, -1)} disabled={i === 0}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800" aria-label="Move up">
                          <ArrowUp size={13} />
                        </button>
                        <button onClick={() => move(p.id, 1)} disabled={i === participants.length - 1}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800" aria-label="Move down">
                          <ArrowDown size={13} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Remove ${p.name} from the rotation? The whole schedule re-maps.`)) {
                              void run(() => removeOnCallParticipant(p.id))
                            }
                          }}
                          className="rounded p-1 text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40" aria-label="Remove">
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </li>
                ))}
                {participants.length === 0 && (
                  <li className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-400 dark:border-slate-700">
                    No names yet. Add your first below.
                  </li>
                )}
              </ul>
              {canEdit && (
                <form className="mt-2 flex gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const v = newName.trim()
                    if (!v) return
                    setNewName('')
                    void run(() => addOnCallParticipant(v))
                  }}>
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add a name…" className={inputCls} />
                  <button type="submit" className="flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
                    <Plus size={13} /> Add
                  </button>
                </form>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Rotation Settings</h2>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Rotation starts on</label>
              <input type="date" key={anchorIso} defaultValue={anchorIso} readOnly={!canEdit}
                onChange={(e) => {
                  if (canEdit && e.target.value) void run(() => updateOnCallSettings({ anchor_date: e.target.value, rotation_interval: interval }))
                }}
                className={`${inputCls} mb-3`} />
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Shift length</label>
              <select value={interval} disabled={!canEdit}
                onChange={(e) => void run(() => updateOnCallSettings({ anchor_date: anchorIso, rotation_interval: e.target.value }))}
                className={inputCls}>
                {(Object.keys(INTERVAL_LABELS) as OnCallInterval[]).map((k) => (
                  <option key={k} value={k}>{INTERVAL_LABELS[k]}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
