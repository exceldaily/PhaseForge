'use client'

// The company calendar: Month, Week, Day, and Agenda over the same items.
// Project phases are the real phases (edit here, it changes on the project
// and the Gantt); events are everything else. Filters for division, super,
// kind, and job all stack.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ChevronLeft, ChevronRight, Plus, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { departmentLabel } from '@/lib/chat/systemEvents'
import {
  DAY_LONG, MONTH_LONG, MONTH_SHORT, addDaysIso, addMonthsIso, dayOf, diffDaysIso, dowIso, hhmmOf, minutesOf,
  monthOf, monthWeeks, startOfWeekIso, weekDays, yearOf,
} from '@/lib/calendar/dates'
import {
  DEFAULT_ITEM_COLOR, listDivisions, passesFilter, superColor, type CalItem, type CalKind,
} from '@/lib/calendar/model'
import type { QaPoolItem } from '@/lib/calendar/quickAdd'
import {
  createEntry, deleteEvent, loadCalendar, moveEvent, movePhase, setSuperColor, updateEvent, updatePhase,
  type CalendarData, type CalendarRefs, type EntryInput, type MoveGate,
} from './actions'
import { MonthView } from './MonthView'
import { TimeGrid } from './TimeGrid'
import { AGENDA_DAYS, AgendaView } from './AgendaView'
import { Rail } from './Rail'
import { QuickAdd } from './QuickAdd'
import { DayList, EntryEditor, MoveGateDialog, draftFor, newDraft, type Draft } from './EntryEditor'
import type { DragApi } from './parts'

export type CalView = 'month' | 'week' | 'day' | 'agenda'
const VIEWS: { id: CalView; label: string; key: string }[] = [
  { id: 'month', label: 'Month', key: 'm' }, { id: 'week', label: 'Week', key: 'w' },
  { id: 'day', label: 'Day', key: 'd' }, { id: 'agenda', label: 'Agenda', key: 'a' },
]

const pad = (n: number) => String(n).padStart(2, '0')
function localToday(): string { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function localMinutes(): number { const d = new Date(); return d.getHours() * 60 + d.getMinutes() }

function readPref<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback } catch { return fallback }
}
function writePref(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode */ } }

interface Props {
  refs: CalendarRefs
  initial: CalendarData
  canEdit: boolean
  serverToday: string
  initialAnchor: string | null
  initialView: CalView | null
  initialProjectId: string | null
}

const noop = () => () => {}

/** Saved view and filters live in this browser, so the calendar waits for it before drawing. */
export function CalendarClient(props: Props) {
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  if (!mounted) return <div className="flex h-full min-h-[640px] items-center justify-center text-sm text-slate-400">Loading the calendar</div>
  return <Calendar {...props} />
}

type MoveAsk = { id: string; start: string; end: string; gate: MoveGate }

function Calendar({ refs, initial, canEdit, initialAnchor, initialView, initialProjectId }: Props) {
  const [today, setToday] = useState(localToday)
  const [nowMinutes, setNowMinutes] = useState<number | null>(localMinutes)
  const [view, setView] = useState<CalView>(() => initialView ?? readPref<CalView>('pf-cal-view', window.innerWidth < 640 ? 'agenda' : 'month'))
  const [anchor, setAnchor] = useState(() => initialAnchor ?? localToday())
  const [data, setData] = useState(initial)
  const [supers, setSupers] = useState(refs.supers)
  const [division, setDivision] = useState(() => readPref('pf-cal-division', ''))
  const [hiddenSupers, setHiddenSupers] = useState(() => new Set(readPref<string[]>('pf-cal-hidden-supers', [])))
  const [hiddenKinds, setHiddenKinds] = useState(() => new Set(readPref<CalKind[]>('pf-cal-hidden-kinds', ['deadline'])))
  const [projectId, setProjectId] = useState(initialProjectId)
  const [railOpen, setRailOpen] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ask, setAsk] = useState<MoveAsk | null>(null)
  const [dayList, setDayList] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ item: CalItem; offset: number } | null>(null)

  // The clock: today's circle and the red line keep up without a reload.
  useEffect(() => {
    const id = setInterval(() => { setToday(localToday()); setNowMinutes(localMinutes()) }, 60000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => { writePref('pf-cal-view', view) }, [view])
  useEffect(() => { writePref('pf-cal-division', division) }, [division])
  useEffect(() => { writePref('pf-cal-hidden-supers', [...hiddenSupers]) }, [hiddenSupers])
  useEffect(() => { writePref('pf-cal-hidden-kinds', [...hiddenKinds]) }, [hiddenKinds])
  useEffect(() => {
    const q = new URLSearchParams({ d: anchor, v: view })
    if (projectId) q.set('project', projectId)
    window.history.replaceState(null, '', `?${q.toString()}`)
  }, [anchor, view, projectId])

  /* ── What is on screen ── */
  const range = useMemo(() => {
    if (view === 'month') { const w = monthWeeks(anchor); return { from: w[0], to: addDaysIso(w[5], 6) } }
    if (view === 'week') { const ws = startOfWeekIso(anchor); return { from: ws, to: addDaysIso(ws, 6) } }
    if (view === 'day') return { from: anchor, to: anchor }
    return { from: anchor, to: addDaysIso(anchor, AGENDA_DAYS - 1) }
  }, [view, anchor])

  // Fetch a wider window whenever the screen walks off the loaded one.
  const stale = range.from < data.from || range.to > data.to
  useEffect(() => {
    if (!stale) return
    let alive = true
    void loadCalendar({ from: addDaysIso(range.from, -60), to: addDaysIso(range.to, 60) })
      .then((d) => { if (alive) setData(d) })
      .catch(() => { if (alive) setToast('Could not load that part of the calendar. Check your connection.') })
    return () => { alive = false }
  }, [stale, range.from, range.to])

  const reload = useCallback(async () => {
    try { setData(await loadCalendar({ from: data.from, to: data.to })) } catch { /* the next move retries */ }
  }, [data.from, data.to])

  const divisions = useMemo(() => listDivisions(supers), [supers])
  const superColors = useMemo(() => new Map(supers.map((s, i) => [s.id, superColor(s, i)])), [supers])
  const superNames = useMemo(() => new Map(supers.map((s) => [s.id, s.name])), [supers])
  const projectColors = useMemo(() => new Map(refs.projects.map((p) => [p.id, p.color])), [refs.projects])
  const colorFor = useCallback((item: CalItem) => {
    if (item.kind === 'deadline') return '#e11d48'
    if (item.kind === 'event' && item.color) return item.color
    return (item.superId && superColors.get(item.superId)) || item.color || (item.projectId && projectColors.get(item.projectId)) || DEFAULT_ITEM_COLOR
  }, [superColors, projectColors])
  const superName = useCallback((id: string | null) => (id ? superNames.get(id) ?? null : null), [superNames])

  const filter = useMemo(() => ({ division: divisions.includes(division) ? division : '', hiddenSupers, hiddenKinds, projectId }), [division, divisions, hiddenSupers, hiddenKinds, projectId])
  const items = useMemo(() => data.items.filter((i) => passesFilter(i, filter)), [data.items, filter])
  const filtersOn = (filter.division ? 1 : 0) + hiddenSupers.size + (projectId ? 1 : 0)

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 6000) }

  /* ── Moving ── */
  const patchLocal = (key: string, patch: Partial<CalItem>) =>
    setData((d) => ({ ...d, items: d.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) }))

  const runPhaseMove = useCallback(async (id: string, start: string, end: string, confirmed?: { reason: string | null; downstream: boolean }) => {
    const res = await movePhase({ id, start, end, ...(confirmed ? { confirmed: true, reason: confirmed.reason, applyDownstream: confirmed.downstream } : {}) })
    if ('gate' in res && res.gate) { setAsk({ id, start, end, gate: res.gate }); await reload(); return { ok: true as const } }
    if (!res.ok) { await reload(); return { ok: false as const, error: 'error' in res ? res.error : 'That did not save.' } }
    await reload()
    return { ok: true as const }
  }, [reload])

  const moveItem = useCallback(async (item: CalItem | QaPoolItem, start: string, end: string, time?: { start: string; end: string | null } | null) => {
    const key = `${item.kind}:${item.id}`
    if (item.kind === 'phase') {
      patchLocal(key, { start, end })
      return runPhaseMove(item.id, start, end)
    }
    patchLocal(key, { start, end, ...(time ? { startTime: time.start, endTime: time.end } : {}) })
    const res = await moveEvent({ id: item.id, start, end, ...(time ? { startTime: time.start, endTime: time.end } : {}) })
    await reload()
    return res.ok ? { ok: true as const } : { ok: false as const, error: res.error }
  }, [reload, runPhaseMove])

  const drag: DragApi = {
    active: dragging,
    start: (e, item, grabbedDate) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', item.key)
      dragRef.current = { item, offset: diffDaysIso(item.start, grabbedDate) }
      // After the browser has taken its drag image, or the drag is cancelled.
      setTimeout(() => setDragging(true), 0)
    },
    end: () => { dragRef.current = null; setDragging(false) },
    drop: (date, time) => {
      const d = dragRef.current
      dragRef.current = null
      setDragging(false)
      if (!d) return
      const start = addDaysIso(date, -d.offset)
      const end = addDaysIso(start, diffDaysIso(d.item.start, d.item.end))
      let when: { start: string; end: string | null } | null = null
      if (time && d.item.kind === 'event' && d.item.start === d.item.end) {
        // Dropped on the hour grid: take the new time, keep the length.
        const length = d.item.startTime && d.item.endTime ? minutesOf(d.item.endTime) - minutesOf(d.item.startTime) : 60
        when = { start: time, end: hhmmOf(Math.min(24 * 60 - 1, minutesOf(time) + length)) }
      }
      if (start === d.item.start && !when) return
      void moveItem(d.item, start, end, when).then((res) => { if (!res.ok) flash(res.error ?? 'That did not save.') })
    },
  }

  /* ── Adding and editing ── */
  const openItem = (item: CalItem) => {
    setDayList(null); setError(null)
    if (item.kind === 'deadline') { window.location.assign(`/app/projects/${item.projectId}`); return }
    setDraft(draftFor(item, item.ownSuperId ?? null))
  }
  const openNew = (date: string, time?: string | null) => { setDayList(null); setError(null); setDraft(newDraft(date, time ?? null, projectId)) }

  const entryOf = (d: Draft): EntryInput => ({
    as: d.as, title: d.title, projectId: d.projectId, superId: d.superId || null, start: d.start, end: d.end,
    startTime: d.as === 'event' && !d.allDay ? d.startTime : null,
    endTime: d.as === 'event' && !d.allDay ? d.endTime || null : null,
    notes: d.notes, color: d.color,
  })

  const saveDraft = async () => {
    if (!draft || busy) return
    setBusy(true); setError(null)
    const done = (res: { ok: boolean; error?: string }) => {
      setBusy(false)
      if (!res.ok) { setError(res.error ?? 'That did not save.'); return }
      setDraft(null)
    }
    if (draft.mode === 'new') {
      const res = await createEntry(entryOf(draft))
      await reload()
      done(res.ok ? { ok: true } : { ok: false, error: res.error })
      if (res.ok) setAnchor(draft.start)
      return
    }
    if (draft.mode === 'event') {
      const e = entryOf(draft)
      const res = await updateEvent({ id: draft.id!, title: e.title, projectId: e.projectId, superId: e.superId, start: e.start, end: e.end, startTime: e.startTime, endTime: e.endTime, notes: e.notes, color: e.color })
      await reload()
      done(res.ok ? { ok: true } : { ok: false, error: res.error })
      return
    }
    // A phase: name and label save straight away; dates go through the move rules.
    const before = data.items.find((i) => i.key === `phase:${draft.id}`)
    const meta = await updatePhase({ id: draft.id!, name: draft.title, superId: draft.superId || null })
    if (!meta.ok) { await reload(); done({ ok: false, error: meta.error }); return }
    if (before && (before.start !== draft.start || before.end !== draft.end)) {
      const res = await runPhaseMove(draft.id!, draft.start, draft.end)
      done(res.ok ? { ok: true } : { ok: false, error: res.error })
      return
    }
    await reload()
    done({ ok: true })
  }

  const removeDraft = async () => {
    if (!draft || draft.mode !== 'event' || busy) return
    if (!confirm(`Delete "${draft.title}" from the calendar?`)) return
    setBusy(true)
    const res = await deleteEvent({ id: draft.id! })
    await reload()
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    setDraft(null)
  }

  const confirmAsk = async (reason: string | null, downstream: boolean) => {
    if (!ask) return
    setBusy(true)
    patchLocal(`phase:${ask.id}`, { start: ask.start, end: ask.end })
    const res = await runPhaseMove(ask.id, ask.start, ask.end, { reason, downstream })
    setBusy(false)
    setAsk(null)
    if (!res.ok) flash(res.error ?? 'That did not save.')
  }

  const changeSuperColor = (id: string, hex: string) => {
    setSupers((cur) => cur.map((s) => (s.id === id ? { ...s, color: hex } : s)))
    void setSuperColor({ superId: id, color: hex }).then((res) => { if (!res.ok) flash(res.error) })
  }
  const toggle = <T,>(set: Set<T>, v: T) => { const next = new Set(set); if (next.has(v)) next.delete(v); else next.add(v); return next }

  /* ── Getting around ── */
  const step = useCallback((dir: 1 | -1) => {
    setAnchor((a) => view === 'month' ? addMonthsIso(`${a.slice(0, 8)}01`, dir) : view === 'week' ? addDaysIso(a, 7 * dir) : view === 'day' ? addDaysIso(a, dir) : addDaysIso(a, AGENDA_DAYS * dir))
  }, [view])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable))) return
      if (document.querySelector('[data-cal-modal]')) return
      const k = e.key.toLowerCase()
      if (k === 't') setAnchor(localToday())
      else if (k === 'arrowleft' || k === 'k') step(-1)
      else if (k === 'arrowright' || k === 'j') step(1)
      else { const v = VIEWS.find((x) => x.key === k); if (v) setView(v.id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  const heading = useMemo(() => {
    if (view === 'month') return `${MONTH_LONG[monthOf(anchor) - 1]} ${yearOf(anchor)}`
    if (view === 'day') return `${DAY_LONG[dowIso(anchor)]}, ${MONTH_LONG[monthOf(anchor) - 1]} ${dayOf(anchor)}, ${yearOf(anchor)}`
    const from = view === 'week' ? startOfWeekIso(anchor) : anchor
    const to = view === 'week' ? addDaysIso(from, 6) : addDaysIso(from, AGENDA_DAYS - 1)
    const a = `${MONTH_SHORT[monthOf(from) - 1]} ${dayOf(from)}`
    const b = monthOf(from) === monthOf(to) ? `${dayOf(to)}` : `${MONTH_SHORT[monthOf(to) - 1]} ${dayOf(to)}`
    return `${a} to ${b}, ${yearOf(to)}`
  }, [view, anchor])

  const viewProps = { items, today, canEdit, colorFor, superName, onOpen: openItem, onNew: openNew, onShowDay: setDayList, drag }
  const modalOpen = !!draft || !!ask || !!dayList

  const rail = (
    <Rail anchor={anchor} today={today} view={view} onPick={(d) => { setAnchor(d); setRailOpen(false) }}
      supers={supers} superColors={superColors} division={filter.division}
      hiddenSupers={hiddenSupers} onToggleSuper={(id) => setHiddenSupers((s) => toggle(s, id))} onSuperColor={changeSuperColor}
      hiddenKinds={hiddenKinds} onToggleKind={(k) => setHiddenKinds((s) => toggle(s, k))}
      projects={refs.projects} projectId={projectId} onProject={setProjectId} canEdit={canEdit} />
  )

  return (
    <div className="flex h-full min-h-[640px] flex-col bg-white">
      {modalOpen && <span data-cal-modal hidden />}
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2.5 sm:px-4">
        <button type="button" onClick={() => setAnchor(today)} data-help="cal-today"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Today</button>
        <div className="flex items-center">
          <button type="button" onClick={() => step(-1)} aria-label="Previous" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><ChevronLeft size={18} /></button>
          <button type="button" onClick={() => step(1)} aria-label="Next" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><ChevronRight size={18} /></button>
        </div>
        <h1 className="mr-auto text-lg font-semibold text-slate-900 sm:text-xl">{heading}</h1>
        {stale && <span className="text-xs text-slate-400">Loading</span>}

        {divisions.length > 0 && (
          <div className="flex items-center rounded-lg border border-slate-200 p-0.5 text-xs font-medium" data-help="cal-division">
            <button type="button" onClick={() => setDivision('')}
              className={cn('rounded-md px-2.5 py-1', !filter.division ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100')}>All divisions</button>
            {divisions.map((d) => (
              <button key={d} type="button" onClick={() => setDivision(d)}
                className={cn('rounded-md px-2.5 py-1', filter.division === d ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100')}>{departmentLabel(d)}</button>
            ))}
          </div>
        )}
        <div className="flex items-center rounded-lg border border-slate-200 p-0.5 text-xs font-medium" data-help="cal-views">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" onClick={() => setView(v.id)} title={`${v.label} (${v.key.toUpperCase()})`}
              className={cn('rounded-md px-2.5 py-1', view === v.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>{v.label}</button>
          ))}
        </div>
        <button type="button" onClick={() => setRailOpen((o) => !o)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 lg:hidden">
          <SlidersHorizontal size={13} /> Filters{filtersOn ? ` (${filtersOn})` : ''}
        </button>
        {canEdit && (
          <button type="button" onClick={() => openNew(view === 'month' && monthOf(anchor) !== monthOf(today) ? anchor : view === 'month' ? today : anchor)} data-help="cal-new"
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">
            <Plus size={15} /> New
          </button>
        )}
      </div>

      {canEdit && (
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 sm:px-4">
          <QuickAdd today={today} projects={refs.projects} supers={supers} superColors={superColors} pool={data.pool}
            onAdd={async (entry) => { const res = await createEntry(entry); await reload(); return res.ok ? { ok: true } : { ok: false, error: res.error } }}
            onMove={(target, start, end, time) => moveItem(target, start, end, time)}
            onFocusDate={setAnchor} />
        </div>
      )}

      {/* ── Body ── */}
      <div className="relative flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-slate-200 p-3 lg:block">{rail}</aside>
        {railOpen && (
          <div className="absolute inset-0 z-40 flex lg:hidden">
            <div className="w-72 max-w-[85%] overflow-y-auto border-r border-slate-200 bg-white p-3 shadow-xl">
              <div className="mb-2 flex items-center"><span className="text-sm font-semibold text-slate-800">Filters</span>
                <button type="button" onClick={() => setRailOpen(false)} aria-label="Close filters" className="ml-auto rounded p-1 text-slate-400 hover:text-slate-600"><X size={16} /></button></div>
              {rail}
            </div>
            <button type="button" aria-label="Close filters" onClick={() => setRailOpen(false)} className="flex-1 bg-slate-900/30" />
          </div>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-auto">
          <div className={cn('flex min-h-0 flex-1 flex-col', view === 'week' && 'min-w-[720px]', view === 'month' && 'min-w-[560px]')}>
            {view === 'month' && <MonthView anchor={anchor} {...viewProps} />}
            {view === 'week' && <TimeGrid days={weekDays(startOfWeekIso(anchor))} nowMinutes={nowMinutes} {...viewProps} />}
            {view === 'day' && <TimeGrid days={[anchor]} nowMinutes={nowMinutes} {...viewProps} />}
            {view === 'agenda' && <AgendaView anchor={anchor} {...viewProps} />}
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-xl">{toast}</div>
      )}
      {dayList && (
        <DayList date={dayList} items={items} colorFor={colorFor} superName={superName} canEdit={canEdit}
          onOpen={openItem} onNew={() => openNew(dayList)} onWeek={() => { setAnchor(dayList); setView('day'); setDayList(null) }} onClose={() => setDayList(null)} />
      )}
      {draft && (
        <EntryEditor draft={draft} projects={refs.projects} supers={supers} superColors={superColors} canEdit={canEdit}
          busy={busy} error={error} onChange={setDraft} onSave={saveDraft} onDelete={removeDraft} onClose={() => { setDraft(null); setError(null) }} />
      )}
      {ask && <MoveGateDialog gate={ask.gate} busy={busy} onCancel={() => setAsk(null)} onConfirm={confirmAsk} />}
    </div>
  )
}
