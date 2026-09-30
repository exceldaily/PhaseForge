'use client'

// The left rail: a small month to jump around with, the supers and their
// label colors, and what kinds of things to show.

import { useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MONTH_LONG, addDaysIso, addMonthsIso, dayOf, monthOf, monthWeeks, startOfWeekIso, weekDays, yearOf } from '@/lib/calendar/dates'
import { LABEL_COLORS, divisionKey, textOn, type CalKind, type CalSuper } from '@/lib/calendar/model'
import type { CalProject } from './actions'

export function MiniMonth({ anchor, today, view, onPick }: {
  anchor: string; today: string; view: string; onPick: (date: string) => void
}) {
  // The little month can browse on its own; it snaps back when the big one moves.
  const [shown, setShown] = useState(anchor)
  const [lastAnchor, setLastAnchor] = useState(anchor)
  if (lastAnchor !== anchor) { setLastAnchor(anchor); setShown(anchor) }
  const weeks = monthWeeks(shown)
  const weekOfAnchor = startOfWeekIso(anchor)
  return (
    <div>
      <div className="mb-1 flex items-center">
        <span className="text-xs font-semibold text-slate-700">{MONTH_LONG[monthOf(shown) - 1]} {yearOf(shown)}</span>
        <button type="button" onClick={() => setShown(addMonthsIso(shown, -1))} aria-label="Previous month" className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><ChevronLeft size={14} /></button>
        <button type="button" onClick={() => setShown(addMonthsIso(shown, 1))} aria-label="Next month" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><ChevronRight size={14} /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-medium text-slate-400">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="py-0.5">{d}</span>)}
      </div>
      {weeks.map((ws) => (
        <div key={ws} className={cn('grid grid-cols-7 rounded-full', view === 'week' && ws === weekOfAnchor && 'bg-indigo-50')}>
          {weekDays(ws).map((date) => (
            <button key={date} type="button" onClick={() => onPick(date)}
              className={cn('mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[11px]',
                date === today ? 'bg-indigo-600 font-semibold text-white'
                  : date === anchor && view !== 'month' ? 'bg-indigo-100 font-semibold text-indigo-700'
                    : monthOf(date) !== monthOf(shown) ? 'text-slate-300 hover:bg-slate-100' : 'text-slate-700 hover:bg-slate-100')}>
              {dayOf(date)}
            </button>
          ))}
        </div>
      ))}
      <button type="button" onClick={() => onPick(addDaysIso(today, 0))} className="mt-1 text-[11px] font-medium text-indigo-600 hover:underline">Back to today</button>
    </div>
  )
}

function Tick({ on, color, onClick, label }: { on: boolean; color: string; onClick: () => void; label: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} onClick={onClick}
      style={on ? { backgroundColor: color, borderColor: color, color: textOn(color) } : { borderColor: color }}
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 bg-white">
      {on && <Check size={11} strokeWidth={3} />}
    </button>
  )
}

const KINDS: { kind: CalKind; label: string; color: string; hint: string }[] = [
  { kind: 'phase', label: 'Project phases', color: '#4f46e5', hint: 'The phases on every project, the same ones the Gantt shows.' },
  { kind: 'event', label: 'Events', color: '#0b8f8f', hint: 'Meetings, inspections, and anything else that is not a phase.' },
  { kind: 'deadline', label: 'Project end dates', color: '#e11d48', hint: 'A flag on the day each project is due to finish.' },
]

export function Rail({
  anchor, today, view, onPick, supers, superColors, division, hiddenSupers, onToggleSuper, onSuperColor,
  hiddenKinds, onToggleKind, workWeek, onWorkWeek, projects, projectId, onProject, canEdit,
}: {
  anchor: string; today: string; view: string; onPick: (date: string) => void
  supers: CalSuper[]; superColors: Map<string, string>; division: string
  hiddenSupers: Set<string>; onToggleSuper: (id: string) => void; onSuperColor: (id: string, hex: string) => void
  hiddenKinds: Set<CalKind>; onToggleKind: (k: CalKind) => void
  workWeek: boolean; onWorkWeek: (on: boolean) => void
  projects: CalProject[]; projectId: string | null; onProject: (id: string | null) => void
  canEdit: boolean
}) {
  const [palette, setPalette] = useState<string | null>(null)
  const shownSupers = supers.filter((s) => !division || divisionKey(s.division) === divisionKey(division))
  return (
    <div className="space-y-5">
      <MiniMonth anchor={anchor} today={today} view={view} onPick={onPick} />

      <section data-help="cal-supers">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Supers</p>
        <div className="space-y-0.5">
          {shownSupers.map((s) => {
            const color = superColors.get(s.id) ?? '#64748b'
            return (
              <div key={s.id} className="group relative flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-100">
                <Tick on={!hiddenSupers.has(s.id)} color={color} onClick={() => onToggleSuper(s.id)} label={`Show ${s.name}`} />
                <button type="button" onClick={() => onToggleSuper(s.id)} className="min-w-0 flex-1 truncate text-left text-sm text-slate-700">{s.name}</button>
                {canEdit && (
                  <button type="button" onClick={() => setPalette(palette === s.id ? null : s.id)} aria-label={`Label color for ${s.name}`} title="Change label color"
                    className={cn('rounded p-0.5 text-slate-400 hover:text-indigo-600', palette === s.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100')}>
                    <Palette size={13} />
                  </button>
                )}
                {palette === s.id && (
                  <div className="absolute left-5 top-7 z-30 flex w-[132px] flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
                    {LABEL_COLORS.map((c) => (
                      <button key={c.hex} type="button" title={c.label} aria-label={`${c.label} for ${s.name}`}
                        onClick={() => { onSuperColor(s.id, c.hex); setPalette(null) }}
                        style={{ backgroundColor: c.hex }}
                        className={cn('h-5 w-5 rounded-full', color === c.hex && 'ring-2 ring-slate-900 ring-offset-1')} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          <div className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-100">
            <Tick on={!hiddenSupers.has('none')} color="#64748b" onClick={() => onToggleSuper('none')} label="Show items with no super" />
            <button type="button" onClick={() => onToggleSuper('none')} className="min-w-0 flex-1 truncate text-left text-sm text-slate-500">No super</button>
          </div>
        </div>
      </section>

      <section data-help="cal-show">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Show</p>
        <div className="space-y-0.5">
          {KINDS.map((k) => (
            <div key={k.kind} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-100" title={k.hint}>
              <Tick on={!hiddenKinds.has(k.kind)} color={k.color} onClick={() => onToggleKind(k.kind)} label={`Show ${k.label}`} />
              <button type="button" onClick={() => onToggleKind(k.kind)} className="min-w-0 flex-1 truncate text-left text-sm text-slate-700">{k.label}</button>
            </div>
          ))}
        </div>
      </section>

      <section data-help="cal-workweek">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Work week</p>
        <div className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-100">
          <Tick on={workWeek} color="#4f46e5" onClick={() => onWorkWeek(!workWeek)} label="Monday to Thursday work week" />
          <button type="button" onClick={() => onWorkWeek(!workWeek)} className="min-w-0 flex-1 truncate text-left text-sm text-slate-700">Monday to Thursday</button>
        </div>
        <p className="mt-1 px-1.5 text-[11px] leading-snug text-slate-400">
          Phases skip Friday, Saturday, and Sunday, unless the phase starts or ends on that day.
        </p>
      </section>

      <section data-help="cal-project">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Job</p>
        <select value={projectId ?? ''} onChange={(e) => onProject(e.target.value || null)}
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-400">
          <option value="">Every job</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </section>
    </div>
  )
}
