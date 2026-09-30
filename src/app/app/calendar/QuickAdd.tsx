'use client'

// The type-it box. One line in, and a preview of exactly what it will do
// before anything is saved: the date it read, the job it matched, and whether
// it is adding something new or moving something that is already there.

import { useMemo, useState } from 'react'
import { ArrowRight, CalendarPlus, CornerDownLeft, MoveRight, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtRange, fmtTime } from '@/lib/calendar/dates'
import { textOn, type CalSuper } from '@/lib/calendar/model'
import { decideQuickAdd, parseQuickAdd, type QaPoolItem } from '@/lib/calendar/quickAdd'
import type { CalProject, EntryInput } from './actions'

type Result = { ok: boolean; error?: string }

export function QuickAdd({ today, projects, supers, superColors, pool, onAdd, onMove, onFocusDate }: {
  today: string
  projects: CalProject[]
  supers: CalSuper[]
  superColors: Map<string, string>
  pool: QaPoolItem[]
  onAdd: (entry: EntryInput) => Promise<Result>
  onMove: (target: QaPoolItem, start: string, end: string, time: { start: string; end: string | null } | null) => Promise<Result>
  onFocusDate: (date: string) => void
}) {
  const [text, setText] = useState('')
  const [choice, setChoice] = useState<{ sig: string; id: string | null } | null>(null)
  const [asPick, setAsPick] = useState<{ text: string; as: 'phase' | 'event' } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const qaProjects = useMemo(() => projects.map((p) => ({ id: p.id, name: p.name, jobNumber: p.jobNumber })), [projects])
  const parse = useMemo(() => parseQuickAdd(text, today, qaProjects, supers), [text, today, qaProjects, supers])
  const sig = parse.projects.map((p) => p.id).join(',')
  // A pick only holds while the line still points at the same jobs.
  const chosen = choice && choice.sig === sig ? choice.id : undefined
  const decision = useMemo(() => decideQuickAdd(parse, pool, chosen), [parse, pool, chosen])

  const projectId = chosen !== undefined ? chosen : parse.projects.length === 1 ? parse.projects[0].id : null
  const project = projects.find((p) => p.id === projectId) ?? null
  const superId = parse.superId ?? project?.superId ?? null
  const sup = supers.find((s) => s.id === superId) ?? null
  const typing = text.trim().length > 0
  const addAs: 'phase' | 'event' = decision.type === 'add'
    ? (asPick && asPick.text === text && project && !parse.startTime ? asPick.as : decision.as)
    : (project && !parse.startTime ? 'phase' : 'event')

  const finish = (res: Result, message: string, date: string) => {
    setBusy(false)
    if (!res.ok) { setError(res.error ?? 'That did not save.'); return }
    setText(''); setChoice(null); setAsPick(null); setError(null)
    setDone(message)
    onFocusDate(date)
    setTimeout(() => setDone((cur) => (cur === message ? null : cur)), 6000)
  }

  const add = async () => {
    if (!parse.startDate || !parse.endDate || !parse.title || busy) return
    setBusy(true); setError(null)
    const res = await onAdd({
      as: addAs, title: parse.title, projectId, superId: parse.superId,
      start: parse.startDate, end: parse.endDate,
      startTime: addAs === 'event' ? parse.startTime : null, endTime: addAs === 'event' ? parse.endTime : null,
    })
    finish(res, `Added ${parse.title}${project ? ` on ${project.name}` : ''}, ${fmtRange(parse.startDate, parse.endDate)}.`, parse.startDate)
  }
  const move = async () => {
    if (decision.type !== 'move' || busy) return
    setBusy(true); setError(null)
    const time = decision.target.kind === 'event' && parse.startTime ? { start: parse.startTime, end: parse.endTime } : null
    const res = await onMove(decision.target, decision.start, decision.end, time)
    finish(res, `Moved ${decision.target.title}${project ? ` on ${project.name}` : ''} to ${fmtRange(decision.start, decision.end)}.`, decision.start)
  }
  const submit = () => {
    if (decision.type === 'move') void move()
    else if (decision.type === 'add') void add()
  }

  const chip = 'inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700'

  return (
    <div className="rounded-xl border border-slate-200 bg-white" data-help="cal-quick-add">
      <div className="flex items-center gap-2 px-3 py-2">
        <Sparkles size={15} className="shrink-0 text-indigo-500" />
        <input value={text} onChange={(e) => { setText(e.target.value); setError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } if (e.key === 'Escape') setText('') }}
          placeholder="Type it: Oct 12 Gulf Breeze set cases, or: move Stuart startup to Friday"
          aria-label="Type a date, a job, and what is being done"
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
        {typing && (
          <button type="button" onClick={() => { setText(''); setError(null) }} aria-label="Clear" className="rounded p-1 text-slate-400 hover:text-slate-600"><X size={14} /></button>
        )}
      </div>

      {typing && (
        <div className="border-t border-slate-100 px-3 py-2">
          {/* What it read */}
          <div className="flex flex-wrap items-center gap-1.5">
            {parse.startDate
              ? <span className={cn(chip, 'bg-indigo-50 text-indigo-700')}>{fmtRange(parse.startDate, parse.endDate ?? parse.startDate)}</span>
              : <span className={cn(chip, 'bg-amber-50 text-amber-700')}>No date yet</span>}
            {parse.startTime && <span className={chip}>{fmtTime(parse.startTime)}{parse.endTime ? ` to ${fmtTime(parse.endTime)}` : ''}</span>}
            {project && (
              <span className={chip}>
                {project.name}
                <button type="button" onClick={() => setChoice({ sig, id: null })} aria-label="Not this job" title="Not this job" className="text-slate-400 hover:text-rose-600"><X size={11} /></button>
              </span>
            )}
            {!project && chosen === null && parse.projects.length > 0 && (
              <button type="button" onClick={() => setChoice(null)} className={cn(chip, 'text-slate-500 hover:bg-slate-200')}>No job. Undo</button>
            )}
            {sup && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ backgroundColor: superColors.get(sup.id) ?? '#64748b', color: textOn(superColors.get(sup.id) ?? '#64748b') }}>{sup.name}</span>
            )}
            {parse.title && <span className="text-xs font-semibold text-slate-800">{parse.title}</span>}
          </div>

          {/* What it will do */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {decision.type === 'need-date' && <span className="text-slate-500">Add a date, like Oct 12, 10/12, Friday, or tomorrow.</span>}
            {decision.type === 'need-title' && <span className="text-slate-500">Now say what is being done{project ? ` at ${project.name}` : ''}.</span>}
            {decision.type === 'need-project' && (
              <>
                <span className="font-medium text-slate-600">Which job?</span>
                {parse.projects.map((p) => (
                  <button key={p.id} type="button" onClick={() => setChoice({ sig, id: p.id })}
                    className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 font-medium text-indigo-700 hover:border-indigo-400">{p.name}</button>
                ))}
                <button type="button" onClick={() => setChoice({ sig, id: null })}
                  className="rounded-full border border-slate-200 px-2.5 py-1 font-medium text-slate-500 hover:border-slate-400">None of these</button>
              </>
            )}
            {decision.type === 'same' && (
              <span className="text-slate-600"><span className="font-semibold">{decision.target.title}</span> is already on {fmtRange(decision.target.start, decision.target.end)}. Nothing to change.</span>
            )}
            {decision.type === 'move' && (
              <>
                <span className="inline-flex flex-wrap items-center gap-1.5 text-slate-700">
                  <MoveRight size={13} className="text-indigo-500" />
                  Move <span className="font-semibold">{decision.target.title}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5">{fmtRange(decision.target.start, decision.target.end)}</span>
                  <ArrowRight size={11} className="text-slate-400" />
                  <span className="rounded bg-indigo-600 px-1.5 py-0.5 font-semibold text-white">{fmtRange(decision.start, decision.end)}</span>
                </span>
                <button type="button" onClick={move} disabled={busy}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                  {busy ? 'Moving' : 'Move it'} <CornerDownLeft size={12} />
                </button>
                {parse.title && (
                  <button type="button" onClick={add} disabled={busy} className="font-medium text-slate-500 hover:text-indigo-600 hover:underline">Add as new instead</button>
                )}
              </>
            )}
            {decision.type === 'add' && (
              <>
                <span className="inline-flex items-center gap-1.5 text-slate-700">
                  <CalendarPlus size={13} className="text-indigo-500" />
                  {decision.nothingToMove && <span className="text-amber-700">Nothing by that name to move.</span>}
                  {addAs === 'phase' ? <>New phase on <span className="font-semibold">{project?.name}</span>. It shows on the project and the Gantt too.</> : <>New event{project ? <> tied to <span className="font-semibold">{project.name}</span></> : ''}.</>}
                </span>
                {project && !parse.startTime && (
                  <button type="button" onClick={() => setAsPick({ text, as: addAs === 'phase' ? 'event' : 'phase' })}
                    className="font-medium text-slate-500 hover:text-indigo-600 hover:underline">
                    {addAs === 'phase' ? 'Make it an event instead' : 'Make it a phase instead'}
                  </button>
                )}
                <button type="button" onClick={add} disabled={busy}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                  {busy ? 'Adding' : addAs === 'phase' ? 'Add phase' : 'Add event'} <CornerDownLeft size={12} />
                </button>
              </>
            )}
          </div>
          {error && <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>}
        </div>
      )}
      {!typing && done && <p className="border-t border-slate-100 px-3 py-1.5 text-xs font-medium text-emerald-600">{done}</p>}
    </div>
  )
}
