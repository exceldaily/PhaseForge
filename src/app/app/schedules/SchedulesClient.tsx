'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Plus, Printer, Trash2, ClipboardCopy, X, UserPlus } from 'lucide-react'
import {
  addScheduleJob, copyWeek, deleteScheduleJob, setDayTechs, setWeekTech,
  updateRoster, updateScheduleJob,
} from './actions'

interface Job {
  id: string; title: string; job_number: string | null; shift_label: string | null
  sort_order: number; days: Record<number, string[]>
}
interface Team { id: string; name: string; roster: string[] }

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

export function SchedulesClient({ teams, teamId, weekStart, jobs, canEdit, jobUrlTemplate = null }: {
  teams: Team[]; teamId: string | null; weekStart: string; jobs: Job[]; canEdit: boolean
  jobUrlTemplate?: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newMember, setNewMember] = useState('')
  const weekEnd = shiftDate(weekStart, 6)
  const team = teams.find((t) => t.id === teamId) ?? null
  const roster = team?.roster ?? []

  const nav = (t: string | null, w: string) => router.push(`/app/schedules?team=${t ?? ''}&week=${w}`)
  const run = (fn: () => Promise<{ error?: string } | undefined | { ok?: boolean; error?: undefined }>, okMsg?: string) => {
    setError(null); setMsg(null)
    startTransition(async () => {
      const res = await fn()
      if (res && 'error' in res && res.error) setError(res.error)
      else { if (okMsg) setMsg(okMsg); router.refresh() }
    })
  }

  const addMember = () => {
    const name = newMember.trim()
    if (!name || !teamId) return
    setNewMember('')
    run(() => updateRoster(teamId, [...roster, name]))
  }
  const removeMember = (name: string) => {
    if (!teamId) return
    if (!confirm(`Remove ${name} from ${team?.name}'s crew? (Existing schedules keep their names.)`)) return
    run(() => updateRoster(teamId, roster.filter((r) => r !== name)))
  }

  // Rich copy: pasting into Gmail/Outlook reproduces the bordered-table format
  // (grey banding, yellow shift chip, Job# hyperlinked). Plain-text fallback
  // included for SMS/plain editors.
  const copyForEmail = async () => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const cellBase = 'border:1px solid #000;padding:4px 10px;font-family:Arial,sans-serif;font-size:13px;'
    const blocks = jobs.map((j) => {
      const url = jobUrl(jobUrlTemplate, j.job_number)
      const jobCell = j.job_number
        ? `Job#${url ? `<a href="${url}" style="color:#1a73e8;">${esc(j.job_number)}</a>` : esc(j.job_number)}`
        : ''
      const rows = Array.from({ length: 7 }, (_, d) => {
        const grey = d % 2 === 0
        const techs = (j.days[d] ?? []).map(esc)
        const techCells = techs.length
          ? techs.map((t) => `<td style="${cellBase}text-align:center;${grey ? 'background:#d9d9d9;' : ''}">${t}</td>`).join('')
          : `<td style="${cellBase}${grey ? 'background:#d9d9d9;' : ''}" colspan="5">&nbsp;</td>`
        return `<tr><td style="${cellBase}font-weight:bold;${grey ? 'background:#d9d9d9;' : ''}">${DAY_FULL[d]} ${mmdd(shiftDate(weekStart, d))}</td>${techCells}</tr>`
      }).join('')
      return `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:18px;min-width:520px;">
        <tr>
          <td style="${cellBase}font-weight:bold;font-size:15px;">${esc(j.title)}</td>
          <td style="${cellBase}text-align:center;">${jobCell}</td>
          <td style="${cellBase}font-weight:bold;text-align:center;">${mmdd(weekStart)}-${mmdd(weekEnd)}</td>
          <td style="${cellBase}background:#ffff00;font-weight:bold;text-align:center;">${esc(j.shift_label ?? '')}</td>
        </tr>
        ${rows}
      </table>`
    }).join('')
    const html = `<div><p style="font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">WEEKLY SCHEDULE ${mmdd(weekStart)}-${mmdd(weekEnd)} — ${esc(team?.name ?? '')} Team</p>${blocks}</div>`

    const lines: string[] = [`${team?.name ?? 'Team'} — WEEKLY SCHEDULE ${mmdd(weekStart)}-${mmdd(weekEnd)}`, '']
    for (const j of jobs) {
      lines.push(`${j.title}${j.job_number ? `  (Job# ${j.job_number})` : ''}${j.shift_label ? `  — ${j.shift_label}` : ''}`)
      for (let d = 0; d < 7; d++) {
        const techs = j.days[d] ?? []
        lines.push(`  ${DAY_NAMES[d]} ${mmdd(shiftDate(weekStart, d))}: ${techs.length ? techs.join(', ') : '—'}`)
      }
      lines.push('')
    }
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([lines.join('\n')], { type: 'text/plain' }),
        }),
      ])
      setMsg('Copied — paste into Gmail/Outlook for the full table format (plain text in SMS).')
    } catch {
      await navigator.clipboard.writeText(lines.join('\n'))
      setMsg('Copied as plain text (rich copy not supported in this browser).')
    }
  }

  if (teams.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center">
        <CalendarDays size={40} className="mx-auto text-slate-300" />
        <h1 className="mt-3 text-lg font-semibold text-slate-800 dark:text-slate-100">Schedules</h1>
        <p className="mt-1 text-sm text-slate-500">Add superintendents in Settings → Scheduling first — each becomes a team tab here.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Controls ── */}
      <div className="border-b border-slate-200 bg-white px-4 py-3 print:hidden dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <CalendarDays size={16} className="text-indigo-500" /> Schedules
          </span>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700">
            <button onClick={() => nav(teamId, shiftDate(weekStart, -7))} className="p-1.5 text-slate-500 hover:text-indigo-600"><ChevronLeft size={16} /></button>
            <span className="px-1 text-sm font-medium text-slate-700 dark:text-slate-200">{mmdd(weekStart)} – {mmdd(weekEnd)}</span>
            <button onClick={() => nav(teamId, shiftDate(weekStart, 7))} className="p-1.5 text-slate-500 hover:text-indigo-600"><ChevronRight size={16} /></button>
          </div>
          <div className="flex flex-wrap gap-1">
            {teams.map((t) => (
              <button key={t.id} onClick={() => nav(t.id, weekStart)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${t.id === teamId ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}>
                {t.name}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {canEdit && (
              <>
                <button onClick={() => teamId && run(() => copyWeek(teamId, shiftDate(weekStart, -7), weekStart))} disabled={pending}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300">
                  <Copy size={13} /> Copy last week
                </button>
                <button onClick={() => teamId && run(() => addScheduleJob({ superintendentId: teamId, weekStart, title: 'New Job', sortOrder: jobs.length }))} disabled={pending}
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                  <Plus size={13} /> Add job
                </button>
              </>
            )}
            <button onClick={copyForEmail} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:text-slate-300">
              <ClipboardCopy size={13} /> Copy for email
            </button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:text-slate-300">
              <Printer size={13} /> Print / PDF
            </button>
          </div>
        </div>

        {/* ── Crew roster ── */}
        {canEdit && team && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{team.name}&apos;s crew:</span>
            {roster.map((name) => (
              <span key={name} className="group inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {name}
                <button onClick={() => removeMember(name)} className="text-slate-400 opacity-0 transition group-hover:opacity-100 hover:text-rose-500"><X size={11} /></button>
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <UserPlus size={13} className="text-slate-400" />
              <input
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addMember()}
                onBlur={addMember}
                placeholder="Add crew member…"
                className="w-32 rounded-md border border-dashed border-slate-300 bg-transparent px-2 py-0.5 text-xs outline-none focus:border-indigo-400 dark:border-slate-600"
              />
            </span>
          </div>
        )}
        {msg && <p className="mt-1.5 text-xs text-emerald-600">{msg}</p>}
        {error && <p className="mt-1.5 text-xs text-rose-600">{error}</p>}
      </div>

      {/* ── Sheet ── */}
      <div className="schedule-print-root flex-1 overflow-y-auto bg-slate-100 p-4 dark:bg-slate-950 print:overflow-visible print:bg-white print:p-0">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="hidden text-center print:block">
            <h1 className="text-lg font-bold">WEEKLY SCHEDULE {mmdd(weekStart)}–{mmdd(weekEnd)}</h1>
            <p className="mb-3 inline-block bg-yellow-300 px-3 py-0.5 text-sm font-bold">{team?.name} Team</p>
          </div>

          {jobs.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400 print:hidden">
              No jobs on {team?.name}&apos;s week — &ldquo;Add job&rdquo; or &ldquo;Copy last week&rdquo;.
            </p>
          ) : jobs.map((job) => (
            <JobBlock key={`${job.id}-${weekStart}`} job={job} weekStart={weekStart} roster={roster} canEdit={canEdit}
              urlTemplate={jobUrlTemplate} onChanged={() => router.refresh()} />
          ))}
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: portrait; margin: 0.5in; }
          body * { visibility: hidden !important; }
          .schedule-print-root, .schedule-print-root * { visibility: visible !important; }
          .schedule-print-root { position: absolute !important; inset: 0 !important; width: 7.5in !important; }
          .schedule-print-root input { border: none !important; }
          .schedule-print-root input::placeholder { color: transparent !important; }
          .schedule-print-root table, .schedule-print-root td, .schedule-print-root th {
            border: 1px solid #000 !important; border-collapse: collapse !important;
          }
        }
      `}</style>
    </div>
  )
}

function JobBlock({ job, weekStart, roster, canEdit, urlTemplate, onChanged }: {
  job: Job; weekStart: string; roster: string[]; canEdit: boolean
  urlTemplate: string | null; onChanged: () => void
}) {
  const [title, setTitle] = useState(job.title)
  const [jobNumber, setJobNumber] = useState(job.job_number ?? '')
  const [shift, setShift] = useState(job.shift_label ?? '')
  // Local optimistic copy of day assignments for instant chip feedback.
  const [days, setDays] = useState<Record<number, string[]>>(
    Object.fromEntries(Array.from({ length: 7 }, (_, d) => [d, job.days[d] ?? []])),
  )
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const debounced = (key: string, fn: () => void) => {
    if (timers.current[key]) clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(fn, 700)
  }
  const saveHeader = (patch: { title?: string; jobNumber?: string; shiftLabel?: string }) =>
    debounced('header', () => { void updateScheduleJob(job.id, patch) })

  // Every roster name that's on all 7 days (drives the "This week" chip state).
  const onAllDays = (name: string) => Array.from({ length: 7 }, (_, d) => days[d] ?? []).every((l) => l.includes(name))

  const toggleWeek = (name: string) => {
    const turnOn = !onAllDays(name)
    setDays((cur) => Object.fromEntries(Array.from({ length: 7 }, (_, d) => {
      const list = cur[d] ?? []
      return [d, turnOn ? [...new Set([...list, name])] : list.filter((t) => t !== name)]
    })))
    void setWeekTech(job.id, name, turnOn)
  }

  const toggleDay = (d: number, name: string) => {
    setDays((cur) => {
      const list = cur[d] ?? []
      const next = list.includes(name) ? list.filter((t) => t !== name) : [...list, name]
      void setDayTechs(job.id, d, next)
      return { ...cur, [d]: next }
    })
  }

  const addToDay = (d: number, name: string) => {
    setDays((cur) => {
      const list = cur[d] ?? []
      if (list.includes(name)) return cur
      const next = [...list, name]
      void setDayTechs(job.id, d, next)
      return { ...cur, [d]: next }
    })
  }

  // Spreadsheet-style drag-fill: press a name chip and drag across day rows to
  // assign that tech to every row you pass. A press without moving = normal
  // toggle (handled on pointer-up so drags never accidentally toggle off).
  const drag = useRef<{ name: string; fromDay: number; moved: boolean } | null>(null)
  useEffect(() => {
    const up = () => {
      const d = drag.current
      drag.current = null
      if (d && !d.moved) toggleDay(d.fromDay, d.name)
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const startDrag = (d: number, name: string) => { drag.current = { name, fromDay: d, moved: false } }
  const dragEnterRow = (d: number) => {
    const cur = drag.current
    if (!cur || d === cur.fromDay && !cur.moved) return
    if (!cur.moved) { cur.moved = true; addToDay(cur.fromDay, cur.name) }
    addToDay(d, cur.name)
  }

  const remove = () => {
    if (!confirm(`Delete "${title}" from this week?`)) return
    void deleteScheduleJob(job.id).then(onChanged)
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 print:break-inside-avoid print:rounded-none print:border-black print:shadow-none">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b-2 border-slate-800 bg-slate-50 px-3 py-2 dark:border-slate-500 dark:bg-slate-800/60 print:bg-white">
        <input value={title} readOnly={!canEdit}
          onChange={(e) => { setTitle(e.target.value); saveHeader({ title: e.target.value }) }}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-bold text-slate-900 outline-none dark:text-slate-100" />
        <span className="flex items-center gap-1 text-xs text-slate-500">
          Job#
          <input value={jobNumber} readOnly={!canEdit} placeholder="—"
            onChange={(e) => { setJobNumber(e.target.value); saveHeader({ jobNumber: e.target.value }) }}
            className="w-20 bg-transparent font-semibold text-indigo-600 outline-none" />
          {urlTemplate && jobNumber.trim() && (
            <a href={urlTemplate.replace('{job}', encodeURIComponent(jobNumber.trim()))}
              target="_blank" rel="noopener noreferrer" title="Open job in Kalos"
              className="text-indigo-500 hover:text-indigo-700 print:hidden">↗</a>
          )}
        </span>
        <input value={shift} readOnly={!canEdit} placeholder="DAYS 8AM"
          onChange={(e) => { setShift(e.target.value); saveHeader({ shiftLabel: e.target.value }) }}
          className="w-24 rounded bg-yellow-300 px-2 py-0.5 text-center text-xs font-bold text-slate-900 outline-none" />
        {canEdit && (
          <button onClick={remove} className="p-1 text-rose-400 hover:text-rose-600 print:hidden"><Trash2 size={14} /></button>
        )}
      </div>

      {/* "This week" quick-assign row */}
      {canEdit && roster.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-indigo-50/50 px-3 py-2 dark:border-slate-700 dark:bg-indigo-950/20 print:hidden">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-400">This week:</span>
          {roster.map((name) => (
            <Chip key={name} name={name} on={onAllDays(name)} onClick={() => toggleWeek(name)} />
          ))}
        </div>
      )}

      {/* Day grid */}
      <table className="w-full border-collapse text-sm">
        <tbody>
          {Array.from({ length: 7 }, (_, d) => {
            const assigned = days[d] ?? []
            return (
              <tr key={d} onPointerEnter={() => dragEnterRow(d)} className={`border-b border-slate-200 last:border-0 dark:border-slate-700 ${d % 2 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/40 print:bg-slate-100'}`}>
                <td className="w-32 border-r border-slate-200 px-3 py-1.5 text-[13px] font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200">
                  {DAY_NAMES[d]} {mmdd(shiftDate(weekStart, d))}
                </td>
                <td className="px-2 py-1">
                  {canEdit ? (
                    <div className="flex flex-wrap gap-1">
                      {roster.map((name) => (
                        <Chip key={name} name={name} small on={assigned.includes(name)}
                          onPointerDown={() => startDrag(d, name)} />
                      ))}
                      {/* Names not on the roster (legacy/typed) still shown, removable */}
                      {assigned.filter((n) => !roster.includes(n)).map((name) => (
                        <Chip key={name} name={name} small on
                          onPointerDown={() => startDrag(d, name)} />
                      ))}
                    </div>
                  ) : (
                    <span className="px-1 text-slate-800 dark:text-slate-100">{assigned.join(', ') || '—'}</span>
                  )}
                  {/* Print shows plain names, not chips */}
                  <span className="hidden font-medium print:inline">{canEdit ? (assigned.join(', ') || '—') : ''}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Chip({ name, on, onClick, onPointerDown, small }: {
  name: string; on: boolean; onClick?: () => void; onPointerDown?: () => void; small?: boolean
}) {
  return (
    <button
      onClick={onClick}
      onPointerDown={onPointerDown}
      style={onPointerDown ? { touchAction: 'none' } : undefined}
      className={`select-none rounded-full font-medium transition-colors print:hidden ${small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} ${on
        ? 'bg-indigo-600 text-white'
        : 'bg-white text-slate-400 ring-1 ring-inset ring-slate-200 hover:text-slate-600 hover:ring-slate-300 dark:bg-slate-800 dark:ring-slate-700'}`}
    >
      {name}
    </button>
  )
}
