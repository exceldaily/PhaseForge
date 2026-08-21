'use client'

// Startup-style schedule: rows = jobs, columns = Sun–Sat, each cell holds one
// or more person+shift assignments (e.g. "Max Johnson (Nights)"). Cell state is
// held centrally here (not per-row) so drag-to-fill can copy one cell across a
// row or column. The person picker renders in a fixed-position layer so it is
// never clipped by the scroll container.

import { useEffect, useRef, useState } from 'react'
import { GripVertical, Plus, Trash2, X, ChevronDown } from 'lucide-react'
import { deleteScheduleJob, updateScheduleJob, setGridCell, setShiftOptions } from './actions'
import type { RowReorder } from './useRowReorder'

export interface GridCell { name: string; shift: string }

interface GridJob {
  id: string; title: string; job_number: string | null; shift_label: string | null
  sort_order: number; cells?: Record<number, GridCell[]>
}
type CellMap = Record<string, Record<number, GridCell[]>>

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function shiftDate(weekStart: string, days: number): string {
  const d = new Date(`${weekStart}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function mmdd(iso: string) { return `${iso.slice(5, 7)}/${iso.slice(8, 10)}` }
function jobUrl(template: string | null, jobNumber: string | null): string | null {
  if (!template || !jobNumber?.trim()) return null
  return template.replace('{job}', encodeURIComponent(jobNumber.trim()))
}
function shiftColor(shift: string): string {
  const s = shift.toLowerCase()
  if (s.includes('travel')) return '#c0392b'
  if (s.includes('night')) return '#6d28d9'
  if (s.includes('as need')) return '#b45309'
  return '#15803d'
}

export function GridSchedule({
  teamName, weekStart, jobs, roster, shiftOptions, division, canEdit, jobUrlTemplate,
  onChanged, reportCells, reorder, zoom = 1,
}: {
  teamName: string
  weekStart: string
  jobs: GridJob[]
  roster: string[]
  shiftOptions: string[]
  division: string
  canEdit: boolean
  jobUrlTemplate: string | null
  onChanged: () => void
  reportCells: (jobId: string, cells: Record<number, GridCell[]>) => void
  /** Row reorder state, owned by the page so both layouts share one order. */
  reorder: RowReorder<GridJob>
  zoom?: number
}) {
  // Central cell state: jobId → day → entries. Re-seeded when the job set
  // changes (add/delete job, week change) via the key on each job id list.
  const seed = (): CellMap => Object.fromEntries(
    jobs.map((j) => [j.id, Object.fromEntries(Array.from({ length: 7 }, (_, d) => [d, j.cells?.[d] ?? []]))]),
  )
  const [cells, setCells] = useState<CellMap>(seed)
  // Re-seed when the job set changes (add/delete job, week nav) — the render-
  // time state adjustment React sanctions instead of a ref read in render.
  const jobKey = jobs.map((j) => j.id).join(',')
  const [prevKey, setPrevKey] = useState(jobKey)
  if (prevKey !== jobKey) { setPrevKey(jobKey); setCells(seed()) }

  const [editor, setEditor] = useState<{ jobId: string; day: number; top: number; left: number; up: boolean; idx?: number } | null>(null)
  // Drag-to-fill: press a cell and drag across others to copy its entries.
  const drag = useRef<{ src: GridCell[]; from: string; moved: boolean } | null>(null)

  const persist = (jobId: string, day: number, entries: GridCell[]) => {
    setCells((cur) => {
      const forJob = { ...(cur[jobId] ?? {}), [day]: entries }
      const next = { ...cur, [jobId]: forJob }
      reportCells(jobId, forJob)
      return next
    })
    void setGridCell(jobId, day, entries)
  }

  useEffect(() => {
    const up = () => { drag.current = null }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  const onCellDown = (jobId: string, day: number) => {
    if (!canEdit) return
    drag.current = { src: cells[jobId]?.[day] ?? [], from: `${jobId}:${day}`, moved: false }
  }
  const onCellEnter = (jobId: string, day: number) => {
    const d = drag.current
    if (!d) return
    if (`${jobId}:${day}` === d.from && !d.moved) return
    d.moved = true
    persist(jobId, day, d.src.map((e) => ({ ...e })))
  }

  const openEditor = (jobId: string, day: number, el: HTMLElement, idx?: number) => {
    const r = el.getBoundingClientRect()
    const up = r.bottom + 210 > window.innerHeight
    setEditor({ jobId, day, top: up ? r.top : r.bottom, left: Math.min(r.left, window.innerWidth - 230), up, idx })
  }

  return (
    <div className="schedule-print-root flex-1 overflow-x-auto bg-slate-100 p-3 sm:p-4 md:overflow-auto dark:bg-slate-950 print:overflow-visible print:bg-white print:p-0">
      <div className="hidden text-center print:block">
        <h1 className="text-lg font-bold">STARTUP SCHEDULE {mmdd(weekStart)}–{mmdd(shiftDate(weekStart, 6))}</h1>
        <p className="mb-3 inline-block bg-yellow-300 px-3 py-0.5 text-sm font-bold">{teamName}</p>
      </div>
      {canEdit && (
        <p className="mb-2 text-[11px] text-slate-400 print:hidden">Tip: tap &ldquo;add&rdquo; to place a person, press a cell and drag across the row/column to copy it, or drag a row by its grip to reorder the week.</p>
      )}
      <div className="min-w-[900px] overflow-hidden rounded-lg border-2 border-slate-400 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900 print:rounded-none print:border-black print:shadow-none"
        style={zoom === 1 ? undefined : { transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-800 text-white print:bg-slate-200 print:text-black">
              <th className="w-56 border-2 border-slate-600 px-3 py-2 text-left text-xs font-bold uppercase tracking-wide print:border-black">Job</th>
              {DAY_NAMES.map((dn, d) => (
                <th key={d} className="border-2 border-slate-600 px-2 py-2 text-center text-[11px] font-bold uppercase print:border-black">
                  {dn}<br /><span className="font-medium opacity-80">{mmdd(shiftDate(weekStart, d))}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                No jobs on {teamName}&apos;s week yet — use &ldquo;Add job&rdquo;.
              </td></tr>
            ) : reorder.ordered.map((job) => (
              <GridRow key={job.id} job={job} cells={cells[job.id] ?? {}} canEdit={canEdit}
                rowRef={reorder.rowRef(job.id)} gripProps={reorder.handleProps(job.id)}
                dragging={reorder.dragId === job.id}
                jobUrlTemplate={jobUrlTemplate} onChanged={onChanged}
                onRemove={(day, idx) => persist(job.id, day, (cells[job.id]?.[day] ?? []).filter((_, i) => i !== idx))}
                onOpenEditor={(day, el) => openEditor(job.id, day, el)}
                onEditEntry={(day, idx, el) => openEditor(job.id, day, el, idx)}
                onCellDown={(day) => onCellDown(job.id, day)}
                onCellEnter={(day) => onCellEnter(job.id, day)} />
            ))}
          </tbody>
        </table>
      </div>

      {editor && canEdit && (() => {
        const list = cells[editor.jobId]?.[editor.day] ?? []
        const existing = editor.idx != null ? list[editor.idx] : undefined
        return (
          <CellEditor roster={roster} shiftOptions={shiftOptions} division={division} onShiftsChanged={onChanged}
            top={editor.top} left={editor.left} up={editor.up}
            existing={existing}
            onAdd={(entry) => {
              const next = editor.idx != null
                ? list.map((e, i) => (i === editor.idx ? entry : e))   // replace in place
                : [...list, entry]
              persist(editor.jobId, editor.day, next)
              setEditor(null)
            }}
            onRemove={editor.idx != null ? () => {
              persist(editor.jobId, editor.day, list.filter((_, i) => i !== editor.idx))
              setEditor(null)
            } : undefined}
            onClose={() => setEditor(null)} />
        )
      })()}
    </div>
  )
}

function GridRow({
  job, cells, canEdit, jobUrlTemplate, onChanged, onRemove, onOpenEditor, onEditEntry, onCellDown, onCellEnter,
  rowRef, gripProps, dragging,
}: {
  job: GridJob; cells: Record<number, GridCell[]>; canEdit: boolean
  jobUrlTemplate: string | null; onChanged: () => void
  onRemove: (day: number, idx: number) => void
  onOpenEditor: (day: number, el: HTMLElement) => void
  onEditEntry: (day: number, idx: number, el: HTMLElement) => void
  onCellDown: (day: number) => void
  onCellEnter: (day: number) => void
  rowRef: (el: HTMLElement | null) => void
  gripProps: React.ComponentProps<'button'>
  dragging: boolean
}) {
  const [title, setTitle] = useState(job.title)
  const [jobNumber, setJobNumber] = useState(job.job_number ?? '')
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const debounced = (key: string, fn: () => void) => {
    if (timers.current[key]) clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(fn, 700)
  }
  const url = jobUrl(jobUrlTemplate, jobNumber)

  return (
    <tr ref={rowRef}
      className={`border-b-2 border-slate-300 odd:bg-white even:bg-slate-100 dark:border-slate-600 dark:odd:bg-slate-900 dark:even:bg-slate-800/60 ${
        dragging ? 'relative z-10 opacity-90 shadow-lg outline outline-2 outline-indigo-500' : ''
      }`}>
      <td className="w-56 border-r-2 border-slate-300 px-2 py-1.5 align-top dark:border-slate-600">
        <div className="flex items-start gap-1">
          {canEdit && (
            <button {...gripProps} data-help="sched-reorder" aria-label={`Reorder ${title}`} title="Drag to reorder this job"
              className="-ml-1 mt-0.5 shrink-0 rounded p-1 text-slate-300 hover:bg-slate-200 hover:text-indigo-600 active:cursor-grabbing dark:hover:bg-slate-800 print:hidden">
              <GripVertical size={14} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <input value={title} readOnly={!canEdit}
              onChange={(e) => { setTitle(e.target.value); debounced('title', () => void updateScheduleJob(job.id, { title: e.target.value })) }}
              className="w-full bg-transparent text-[13px] font-bold text-slate-900 outline-none dark:text-slate-100" />
            <div className="flex items-center gap-1 text-[11px] text-slate-500">
              Job#
              <input value={jobNumber} readOnly={!canEdit} placeholder="—"
                onChange={(e) => { setJobNumber(e.target.value); debounced('job', () => void updateScheduleJob(job.id, { jobNumber: e.target.value })) }}
                className="w-24 bg-transparent font-semibold text-indigo-600 outline-none" />
              {url && <a href={url} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-700 print:hidden" title="Open job">↗</a>}
              {canEdit && (
                <button onClick={() => { if (confirm(`Delete "${title}" from this week?`)) void deleteScheduleJob(job.id).then(onChanged) }}
                  className="ml-auto text-rose-400 hover:text-rose-600 print:hidden"><Trash2 size={12} /></button>
              )}
            </div>
          </div>
        </div>
      </td>

      {Array.from({ length: 7 }, (_, d) => {
        const entries = cells[d] ?? []
        return (
          <td key={d}
            onPointerDown={() => onCellDown(d)}
            onPointerEnter={() => onCellEnter(d)}
            className="border-r-2 border-slate-300 px-1.5 py-1 align-top last:border-r-0 pointer-fine:[touch-action:none] dark:border-slate-600">
            <div className="flex flex-col gap-0.5">
              {entries.map((e, i) => (
                <span key={i} className="group inline-flex items-center gap-1 text-[12px] font-semibold leading-tight"
                  style={{ color: shiftColor(e.shift) }}>
                  {canEdit ? (
                    <button onPointerDown={(ev) => ev.stopPropagation()}
                      onClick={(ev) => onEditEntry(d, i, ev.currentTarget)}
                      title="Tap to change this person or shift"
                      className="text-left underline-offset-2 pointer-coarse:py-0.5 hover:underline">
                      {e.name}{e.shift ? ` (${e.shift})` : ''}
                    </button>
                  ) : (
                    <span>{e.name}{e.shift ? ` (${e.shift})` : ''}</span>
                  )}
                  {canEdit && (
                    <button onPointerDown={(ev) => ev.stopPropagation()} onClick={() => onRemove(d, i)}
                      aria-label={`Remove ${e.name}`}
                      className="-m-1 shrink-0 p-1 text-slate-300 opacity-0 transition group-hover:opacity-100 pointer-coarse:opacity-100 hover:text-rose-500 print:hidden"><X size={12} /></button>
                  )}
                </span>
              ))}
              {canEdit && (
                <button onPointerDown={(ev) => ev.stopPropagation()} onClick={(ev) => onOpenEditor(d, ev.currentTarget)}
                  className="mt-0.5 inline-flex w-fit items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium text-slate-400 pointer-coarse:px-2 pointer-coarse:py-1 pointer-coarse:text-[12px] hover:bg-slate-200 hover:text-indigo-600 dark:hover:bg-slate-800 print:hidden">
                  <Plus size={10} /> add
                </button>
              )}
            </div>
          </td>
        )
      })}
    </tr>
  )
}

function CellEditor({ roster, shiftOptions, division, onShiftsChanged, top, left, up, onAdd, onClose, existing, onRemove }: {
  roster: string[]; shiftOptions: string[]; division: string; top: number; left: number; up: boolean
  onAdd: (e: GridCell) => void; onClose: () => void; onShiftsChanged: () => void
  existing?: GridCell; onRemove?: () => void
}) {
  // Shift notes are a department setting, edited right here so you can fix the
  // list at the moment you notice it is wrong instead of hunting for a
  // settings page. Local copy keeps the popover responsive while it saves.
  const [manage, setManage] = useState(false)
  const [shifts, setShifts] = useState(shiftOptions)
  const [newShift, setNewShift] = useState('')
  const [name, setName] = useState(existing?.name ?? '')
  const [shift, setShift] = useState(existing?.shift ?? shiftOptions[0] ?? '')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDoc = (ev: Event) => { if (ref.current && !ref.current.contains(ev.target as Node)) onClose() }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
    }
  }, [onClose])
  const add = () => { if (name.trim()) onAdd({ name: name.trim(), shift }) }
  const saveShifts = (next: string[]) => {
    setShifts(next)
    if (shift && !next.includes(shift)) setShift(next[0] ?? '')
    void setShiftOptions(division, next).then(onShiftsChanged)
  }
  const addShift = () => {
    const v = newShift.trim()
    if (!v || shifts.includes(v)) { setNewShift(''); return }
    setNewShift('')
    saveShifts([...shifts, v])
  }
  // Fixed layer so the scroll container can never clip it; flips above the cell
  // when there isn't room below.
  const phone = typeof window !== 'undefined' && window.innerWidth < 640
  const style: React.CSSProperties = phone
    ? { position: 'fixed', left: 8, right: 8, top: 8, zIndex: 60 }
    : up
      ? { position: 'fixed', left, bottom: window.innerHeight - top + 4, zIndex: 60 }
      : { position: 'fixed', left, top: top + 4, zIndex: 60 }
  return (
    <div ref={ref} style={style} className="w-auto rounded-lg border border-slate-300 bg-white p-2 shadow-2xl sm:w-52 dark:border-slate-700 dark:bg-slate-900">
      {manage ? (
        <>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Shift notes for {division || 'this department'}
          </p>
          <div className="mb-1.5 flex flex-col gap-1">
            {shifts.map((sn) => (
              <span key={sn} className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {sn}
                <button onClick={() => saveShifts(shifts.filter((x) => x !== sn))} aria-label={`Remove ${sn}`}
                  className="ml-auto p-0.5 text-slate-400 hover:text-rose-500"><X size={13} /></button>
              </span>
            ))}
            {shifts.length === 0 && (
              <span className="text-[11px] text-slate-400">No shift notes. Names will show without one.</span>
            )}
          </div>
          <div className="mb-1.5 flex gap-1">
            <input value={newShift} onChange={(e) => setNewShift(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addShift() }}
              placeholder="e.g. Swing, On call"
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800" />
            <button onClick={addShift} disabled={!newShift.trim()}
              className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">Add</button>
          </div>
          <p className="mb-1.5 text-[10px] leading-snug text-slate-400">
            Applies to every team in this department. Names already scheduled keep the note they were given.
          </p>
          <button onClick={() => setManage(false)}
            className="w-full rounded border border-slate-300 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300">Done</button>
        </>
      ) : (
        <>
          <input autoFocus={!phone} value={name} onChange={(e) => setName(e.target.value)} list="grid-roster-names"
            onKeyDown={(e) => { if (e.key === 'Enter') add(); if (e.key === 'Escape') onClose() }}
            placeholder="Person's name" className="mb-1.5 w-full rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800" />
          <datalist id="grid-roster-names">{roster.map((r) => <option key={r} value={r} />)}</datalist>
          {roster.length > 0 && (
            <div className="mb-1.5 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
              {roster.map((r) => (
                <button key={r} onClick={() => setName(r)}
                  className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                    name === r ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}>{r}</button>
              ))}
            </div>
          )}
          <div className="relative mb-1.5">
            <select value={shift} onChange={(e) => setShift(e.target.value)}
              className="w-full appearance-none rounded border border-slate-300 px-2 py-1 pr-6 text-xs outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800">
              <option value="">No shift note</option>
              {shifts.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1.5 text-slate-400" />
          </div>
          <button onClick={() => setManage(true)}
            className="mb-1.5 text-[11px] font-medium text-indigo-600 hover:underline">Add or remove shift notes</button>
          <div className="flex gap-1">
            <button onClick={add} disabled={!name.trim()} className="flex-1 rounded bg-indigo-600 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              {existing ? 'Replace' : 'Add'}
            </button>
            {onRemove && (
              <button onClick={onRemove} title="Remove this person from the day"
                className="rounded border border-rose-200 px-2 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50">Remove</button>
            )}
            <button onClick={onClose} className="rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-500 dark:border-slate-600">✕</button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Copy-for-email builder (jobs × days HTML table) ─────────────────────────

export function buildGridCopy(
  teamName: string, jobs: GridJob[], weekStart: string, jobUrlTemplate: string | null,
): { html: string; plain: string } {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const cell = 'border:1px solid #000;padding:4px 7px;font-family:Arial,sans-serif;font-size:12px;vertical-align:top;'
  const head = `<td style="${cell}background:#333;color:#fff;font-weight:bold;">Job</td>` +
    DAY_NAMES.map((dn, d) => `<td style="${cell}background:#333;color:#fff;text-align:center;font-weight:bold;white-space:nowrap;">${dn} ${mmdd(shiftDate(weekStart, d))}</td>`).join('')
  const rows = jobs.map((j, ri) => {
    const grey = ri % 2 === 1
    const url = jobUrl(jobUrlTemplate, j.job_number)
    const jobCell = `<td style="${cell}${grey ? 'background:#f0f0f0;' : ''}"><b>${esc(j.title)}</b>${j.job_number ? `<br><span style="font-size:11px;">Job#${url ? `<a href="${url}">${esc(j.job_number)}</a>` : esc(j.job_number)}</span>` : ''}</td>`
    const dayCells = Array.from({ length: 7 }, (_, d) => {
      const entries = j.cells?.[d] ?? []
      const inner = entries.map((e) => `<span style="color:${shiftColor(e.shift)};font-weight:bold;">${esc(e.name)}${e.shift ? ` (${esc(e.shift)})` : ''}</span>`).join('<br>')
      return `<td style="${cell}${grey ? 'background:#f0f0f0;' : ''}text-align:center;">${inner || '&nbsp;'}</td>`
    }).join('')
    return `<tr>${jobCell}${dayCells}</tr>`
  }).join('')
  const html = `<div><p style="font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">STARTUP SCHEDULE ${mmdd(weekStart)}-${mmdd(shiftDate(weekStart, 6))} — ${esc(teamName)}</p>` +
    `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;"><tr>${head}</tr>${rows}</table></div>`

  const lines = [`${teamName} — STARTUP SCHEDULE ${mmdd(weekStart)}-${mmdd(shiftDate(weekStart, 6))}`, '']
  for (const j of jobs) {
    lines.push(`${j.title}${j.job_number ? `  (Job# ${j.job_number})` : ''}`)
    for (let d = 0; d < 7; d++) {
      const entries = j.cells?.[d] ?? []
      if (!entries.length) continue
      lines.push(`  ${DAY_NAMES[d]} ${mmdd(shiftDate(weekStart, d))}: ${entries.map((e) => `${e.name}${e.shift ? ` (${e.shift})` : ''}`).join(', ')}`)
    }
    lines.push('')
  }
  return { html, plain: lines.join('\n') }
}
