'use client'

// The dialogs: add or edit one thing on the calendar, confirm a big phase
// move, and the list of everything on one day.

import { useState } from 'react'
import Link from 'next/link'
import { ExternalLink, GanttChartSquare, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { SCHEDULE_CHANGE_REASONS } from '@/lib/activity/log'
import { fmtDay, fmtRange } from '@/lib/calendar/dates'
import { LABEL_COLORS, coversDay, textOn, type CalItem, type CalSuper } from '@/lib/calendar/model'
import type { CalProject, MoveGate } from './actions'
import { JobGroupList } from './parts'

export interface Draft {
  /** 'new' adds; the others edit the thing they name. */
  mode: 'new' | 'event' | 'phase'
  id: string | null
  as: 'phase' | 'event'
  title: string
  projectId: string | null
  /** '' follows the job's super. */
  superId: string
  start: string
  end: string
  allDay: boolean
  startTime: string
  endTime: string
  notes: string
  color: string | null
  status?: string | null
}

export function draftFor(item: CalItem, ownSuperId: string | null): Draft {
  return {
    mode: item.kind === 'phase' ? 'phase' : 'event', id: item.id, as: item.kind === 'phase' ? 'phase' : 'event',
    title: item.title, projectId: item.projectId, superId: ownSuperId ?? '',
    start: item.start, end: item.end, allDay: !item.startTime, startTime: item.startTime ?? '08:00', endTime: item.endTime ?? '',
    notes: item.notes ?? '', color: item.kind === 'event' ? item.color : null, status: item.status,
  }
}

export function newDraft(date: string, time: string | null, projectId: string | null): Draft {
  const end = time ? `${String(Math.min(23, Number(time.slice(0, 2)) + 1)).padStart(2, '0')}:${time.slice(3, 5)}` : ''
  return {
    mode: 'new', id: null, as: projectId && !time ? 'phase' : 'event', title: '', projectId, superId: '',
    start: date, end: date, allDay: !time, startTime: time ?? '08:00', endTime: end, notes: '', color: null,
  }
}

const field = 'w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-400'
const label = 'mb-1 block text-xs font-medium text-slate-600'

export function EntryEditor({ draft, projects, supers, superColors, canEdit, busy, error, onChange, onSave, onDelete, onClose }: {
  draft: Draft
  projects: CalProject[]
  supers: CalSuper[]
  superColors: Map<string, string>
  canEdit: boolean
  busy: boolean
  error: string | null
  onChange: (d: Draft) => void
  onSave: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch })
  const project = projects.find((p) => p.id === draft.projectId) ?? null
  const jobSuper = supers.find((s) => s.id === project?.superId) ?? null
  const isPhase = draft.as === 'phase'
  const title = draft.mode === 'new' ? 'Add to the calendar' : draft.mode === 'phase' ? 'Project phase' : 'Event'
  const ro = !canEdit

  return (
    <Modal open onClose={onClose} title={title} size="md">
      <form className="space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); if (canEdit) onSave() }}>
        {draft.mode === 'new' && (
          <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs font-medium" role="tablist">
            {([['phase', 'Phase on a job'], ['event', 'Event']] as const).map(([v, text]) => (
              <button key={v} type="button" role="tab" aria-selected={draft.as === v}
                onClick={() => set({ as: v, ...(v === 'phase' ? { allDay: true } : {}) })}
                className={cn('flex-1 rounded-md px-2 py-1.5', draft.as === v ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>{text}</button>
            ))}
          </div>
        )}
        {draft.mode === 'new' && (
          <p className="text-xs text-slate-500">
            {isPhase
              ? 'A phase is part of the job. It shows up on the project and the Gantt, and moving it here moves it there.'
              : 'An event is anything that is not a phase: a meeting, an inspection, a delivery. It can have a time.'}
          </p>
        )}

        <div>
          <label className={label} htmlFor="cal-title">{isPhase ? 'Phase name' : 'What is happening'}</label>
          <input id="cal-title" autoFocus={draft.mode === 'new'} value={draft.title} readOnly={ro} onChange={(e) => set({ title: e.target.value })}
            placeholder={isPhase ? 'Set cases, Startup, Rack set' : 'Safety meeting, Inspection'} className={field} />
        </div>

        <div>
          <label className={label} htmlFor="cal-job">Job</label>
          {draft.mode === 'phase' ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-800">
              <span className="font-medium">{project?.name ?? 'Unknown job'}</span>
              {project && (
                <>
                  <Link href={`/app/projects/${project.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"><ExternalLink size={11} /> Open project</Link>
                  <Link href={`/app/gantt?project=${project.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"><GanttChartSquare size={11} /> Open in Gantt</Link>
                </>
              )}
            </p>
          ) : (
            <select id="cal-job" value={draft.projectId ?? ''} disabled={ro} onChange={(e) => set({ projectId: e.target.value || null })} className={field}>
              <option value="">{isPhase ? 'Pick a job' : 'No job'}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="cal-start">Starts</label>
            <input id="cal-start" type="date" value={draft.start} readOnly={ro}
              onChange={(e) => set({ start: e.target.value, end: draft.end < e.target.value ? e.target.value : draft.end })} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="cal-end">Ends</label>
            <input id="cal-end" type="date" value={draft.end} min={draft.start} readOnly={ro} onChange={(e) => set({ end: e.target.value })} className={field} />
          </div>
        </div>

        {!isPhase && (
          <div>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
              <input type="checkbox" checked={draft.allDay} disabled={ro} onChange={(e) => set({ allDay: e.target.checked })} /> All day
            </label>
            {!draft.allDay && (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <label className={label} htmlFor="cal-st">From</label>
                  <input id="cal-st" type="time" step={900} value={draft.startTime} readOnly={ro} onChange={(e) => set({ startTime: e.target.value })} className={field} />
                </div>
                <div>
                  <label className={label} htmlFor="cal-et">To (optional)</label>
                  <input id="cal-et" type="time" step={900} value={draft.endTime} readOnly={ro} onChange={(e) => set({ endTime: e.target.value })} className={field} />
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <label className={label} htmlFor="cal-super">Super label</label>
          <div className="flex items-center gap-2">
            <select id="cal-super" value={draft.superId} disabled={ro} onChange={(e) => set({ superId: e.target.value })} className={field}>
              <option value="">{project ? `Same as the job${jobSuper ? ` (${jobSuper.name})` : ' (none set)'}` : 'None'}</option>
              {supers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.division ? ` (${s.division})` : ''}</option>)}
            </select>
            {(() => {
              const s = supers.find((x) => x.id === (draft.superId || project?.superId))
              const c = s ? superColors.get(s.id) : null
              return c ? <span className="shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold" style={{ backgroundColor: c, color: textOn(c) }}>{s!.name}</span> : null
            })()}
          </div>
        </div>

        {!isPhase && (
          <>
            <div>
              <span className={label}>Color</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" disabled={ro} onClick={() => set({ color: null })}
                  className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', draft.color ? 'border-slate-200 text-slate-500' : 'border-indigo-400 bg-indigo-50 text-indigo-700')}>Use the label color</button>
                {LABEL_COLORS.map((c) => (
                  <button key={c.hex} type="button" disabled={ro} title={c.label} aria-label={c.label} onClick={() => set({ color: c.hex })}
                    style={{ backgroundColor: c.hex }} className={cn('h-5 w-5 rounded-full', draft.color === c.hex && 'ring-2 ring-slate-900 ring-offset-1')} />
                ))}
              </div>
            </div>
            <div>
              <label className={label} htmlFor="cal-notes">Notes</label>
              <textarea id="cal-notes" rows={2} value={draft.notes} readOnly={ro} onChange={(e) => set({ notes: e.target.value })} className={field} />
            </div>
          </>
        )}

        {draft.mode === 'phase' && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            This is the same phase the project and the Gantt show. Changing its name or dates here changes it there.
            Anything with EMS in the name is filed under Electrical.
            {draft.status ? ` Status: ${draft.status.replace(/_/g, ' ')}.` : ''} Status, percent, checklists, and deleting live on the Gantt.
          </p>
        )}
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          {canEdit && draft.mode === 'event' && (
            <button type="button" onClick={onDelete} disabled={busy} className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:underline"><Trash2 size={13} /> Delete</button>
          )}
          <span className="ml-auto flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>{canEdit ? 'Cancel' : 'Close'}</Button>
            {canEdit && <Button type="submit" size="sm" loading={busy}>{draft.mode === 'new' ? 'Add' : 'Save'}</Button>}
          </span>
        </div>
      </form>
    </Modal>
  )
}

/** Shown before a phase move big enough to ask about, or one that pushes other phases. */
export function MoveGateDialog({ gate, busy, onCancel, onConfirm }: {
  gate: MoveGate; busy: boolean; onCancel: () => void
  onConfirm: (reason: string | null, applyDownstream: boolean) => void
}) {
  const [reason, setReason] = useState('')
  const [downstream, setDownstream] = useState(true)
  const days = Math.abs(gate.deltaDays)
  return (
    <Modal open onClose={onCancel} title="Move this phase?" size="md">
      <div className="space-y-3 p-5 text-sm text-slate-700">
        <p>
          <span className="font-semibold text-slate-900">{gate.phaseName}</span> on <span className="font-semibold text-slate-900">{gate.projectName}</span> goes from{' '}
          <span className="rounded bg-slate-100 px-1.5 py-0.5">{fmtRange(gate.from.start, gate.from.end)}</span> to{' '}
          <span className="rounded bg-indigo-600 px-1.5 py-0.5 font-semibold text-white">{fmtRange(gate.to.start, gate.to.end)}</span>,{' '}
          {days} day{days === 1 ? '' : 's'} {gate.deltaDays > 0 ? 'later' : 'earlier'}. This changes the project schedule and the Gantt.
        </p>
        {gate.affected.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-800">
              {gate.affected.length} phase{gate.affected.length === 1 ? '' : 's'} depend on it and would have to shift
              {gate.completionDeltaDays > 0 ? `, pushing the finish ${gate.completionDeltaDays} day${gate.completionDeltaDays === 1 ? '' : 's'}` : ''}.
            </p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-amber-900">
              {gate.affected.slice(0, 8).map((a) => <li key={a.id}>{a.name}: {fmtRange(a.newStart, a.newEnd)} ({a.deltaDays} day{a.deltaDays === 1 ? '' : 's'} later)</li>)}
              {gate.affected.length > 8 && <li>and {gate.affected.length - 8} more</li>}
            </ul>
            <label className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-amber-900">
              <input type="checkbox" checked={downstream} onChange={(e) => setDownstream(e.target.checked)} /> Move those too
            </label>
          </div>
        )}
        <div>
          <label className={label} htmlFor="cal-reason">Why is it moving? {gate.askReason ? '' : '(optional)'}</label>
          <select id="cal-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={field}>
            <option value="">No reason given</option>
            {SCHEDULE_CHANGE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-slate-400">The reason is saved on the project timeline with the move.</p>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onCancel}>Leave it</Button>
          <Button size="sm" loading={busy} onClick={() => onConfirm(reason || null, gate.affected.length > 0 && downstream)}>Move it</Button>
        </div>
      </div>
    </Modal>
  )
}

/** Everything on one day, from "+N more" or a day number. */
export function DayList({ date, items, colorFor, dotFor, superName, canEdit, onOpen, onNew, onWeek, onClose }: {
  date: string; items: CalItem[]
  colorFor: (i: CalItem) => string; dotFor: (i: CalItem) => string | null; superName: (id: string | null) => string | null
  canEdit: boolean; onOpen: (i: CalItem) => void; onNew: () => void; onWeek: () => void; onClose: () => void
}) {
  const rows = items.filter((i) => coversDay(i, date))
  return (
    <Modal open onClose={onClose} title={fmtDay(date, true)} size="md">
      <div className="p-4">
        {rows.length === 0 && <p className="py-4 text-center text-sm text-slate-400">Nothing on this day.</p>}
        <div className="max-h-[60vh] overflow-y-auto pr-0.5">
          <JobGroupList items={rows} colorFor={colorFor} dotFor={dotFor} superName={superName} onOpen={onOpen} />
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
          <button type="button" onClick={onWeek} className="text-xs font-medium text-indigo-600 hover:underline">Open this day</button>
          {canEdit && <Button size="sm" className="ml-auto" onClick={onNew}>Add here</Button>}
        </div>
      </div>
    </Modal>
  )
}
