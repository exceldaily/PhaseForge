'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Plus, Printer, Trash2, ClipboardCopy } from 'lucide-react'
import { addScheduleJob, copyWeek, deleteScheduleJob, setDayTechs, updateScheduleJob } from './actions'

interface Job {
  id: string; title: string; job_number: string | null; shift_label: string | null
  sort_order: number; days: Record<number, string[]>
}
interface Team { id: string; name: string }

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function shiftDate(weekStart: string, days: number): string {
  const d = new Date(`${weekStart}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function mmdd(iso: string) { return `${iso.slice(5, 7)}/${iso.slice(8, 10)}` }

export function SchedulesClient({ teams, teamId, weekStart, jobs, canEdit }: {
  teams: Team[]; teamId: string | null; weekStart: string; jobs: Job[]; canEdit: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const weekEnd = shiftDate(weekStart, 6)
  const team = teams.find((t) => t.id === teamId) ?? null

  const nav = (t: string | null, w: string) => router.push(`/app/schedules?team=${t ?? ''}&week=${w}`)

  const addJob = () => {
    if (!teamId) return
    startTransition(async () => {
      const res = await addScheduleJob({
        superintendentId: teamId, weekStart, title: 'New Job',
        sortOrder: jobs.length,
      })
      if (res?.error) setError(res.error); else router.refresh()
    })
  }

  const doCopyWeek = () => {
    if (!teamId) return
    setError(null); setMsg(null)
    startTransition(async () => {
      const res = await copyWeek(teamId, shiftDate(weekStart, -7), weekStart)
      if (res?.error) setError(res.error)
      else { setMsg(`Copied ${res.copied} job${res.copied === 1 ? '' : 's'} from last week.`); router.refresh() }
    })
  }

  // Plain-text version of this team's week for pasting into email/text.
  const copyAsText = async () => {
    const lines: string[] = [`${team?.name ?? 'Team'} — WEEKLY SCHEDULE ${mmdd(weekStart)}-${mmdd(weekEnd)}`, '']
    for (const j of jobs) {
      lines.push(`${j.title}${j.job_number ? `  (Job# ${j.job_number})` : ''}${j.shift_label ? `  — ${j.shift_label}` : ''}`)
      for (let d = 0; d < 7; d++) {
        const techs = j.days[d] ?? []
        lines.push(`  ${DAY_NAMES[d]} ${mmdd(shiftDate(weekStart, d))}: ${techs.length ? techs.join(', ') : '—'}`)
      }
      lines.push('')
    }
    await navigator.clipboard.writeText(lines.join('\n'))
    setMsg('Schedule copied — paste it into a text or email.')
  }

  if (teams.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center">
        <CalendarDays size={40} className="mx-auto text-slate-300" />
        <h1 className="mt-3 text-lg font-semibold text-slate-800 dark:text-slate-100">Schedules</h1>
        <p className="mt-1 text-sm text-slate-500">
          Add your superintendents in Settings → Scheduling first — each one becomes a team tab here
          (Miller, Betancourt, Venezia, Darrow…).
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Controls (hidden in print) ── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 print:hidden dark:border-slate-800 dark:bg-slate-900">
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
            <button
              key={t.id}
              onClick={() => nav(t.id, weekStart)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${t.id === teamId
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}
            >
              {t.name}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap gap-2">
          {canEdit && (
            <>
              <button onClick={doCopyWeek} disabled={pending} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300">
                <Copy size={13} /> Copy last week
              </button>
              <button onClick={addJob} disabled={pending} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                <Plus size={13} /> Add job
              </button>
            </>
          )}
          <button onClick={copyAsText} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:text-slate-300">
            <ClipboardCopy size={13} /> Copy as text
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:text-slate-300">
            <Printer size={13} /> Print / PDF
          </button>
        </div>
        {msg && <span className="w-full text-xs text-emerald-600">{msg}</span>}
        {error && <span className="w-full text-xs text-rose-600">{error}</span>}
      </div>

      {/* ── Printable sheet ── */}
      <div className="schedule-print-root flex-1 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-950 print:overflow-visible print:bg-white print:p-0">
        <div className="mx-auto max-w-4xl space-y-5">
          <div className="hidden text-center print:block">
            <h1 className="text-lg font-bold">WEEKLY SCHEDULE {mmdd(weekStart)}–{mmdd(weekEnd)}</h1>
            <p className="text-sm font-semibold" style={{ background: '#fde047', display: 'inline-block', padding: '2px 12px' }}>{team?.name} Team</p>
          </div>

          {jobs.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400 print:hidden">
              No jobs on {team?.name}&apos;s week yet — “Add job” or “Copy last week”.
            </p>
          ) : jobs.map((job) => (
            <JobBlock key={job.id} job={job} weekStart={weekStart} canEdit={canEdit} onChanged={() => router.refresh()} />
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
        }
      `}</style>
    </div>
  )
}

function JobBlock({ job, weekStart, canEdit, onChanged }: {
  job: Job; weekStart: string; canEdit: boolean; onChanged: () => void
}) {
  const [title, setTitle] = useState(job.title)
  const [jobNumber, setJobNumber] = useState(job.job_number ?? '')
  const [shift, setShift] = useState(job.shift_label ?? '')
  const [days, setDays] = useState<Record<number, string>>(
    Object.fromEntries(Array.from({ length: 7 }, (_, d) => [d, (job.days[d] ?? []).join(', ')])),
  )
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const debounced = (key: string, fn: () => void) => {
    if (timers.current[key]) clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(fn, 700)
  }

  const saveHeader = (patch: { title?: string; jobNumber?: string; shiftLabel?: string }) =>
    debounced('header', () => { void updateScheduleJob(job.id, patch) })

  const saveDay = (d: number, value: string) =>
    debounced(`day-${d}`, () => { void setDayTechs(job.id, d, value.split(',')) })

  const remove = () => {
    if (!confirm(`Delete "${title}" from this week?`)) return
    void deleteScheduleJob(job.id).then(onChanged)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 print:break-inside-avoid print:rounded-none print:border-black">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-300 px-3 py-2 dark:border-slate-700 print:border-black">
        <input
          value={title} readOnly={!canEdit}
          onChange={(e) => { setTitle(e.target.value); saveHeader({ title: e.target.value }) }}
          className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-900 outline-none dark:text-slate-100"
        />
        <span className="flex items-center gap-1 text-xs text-slate-500">
          Job#
          <input
            value={jobNumber} readOnly={!canEdit} placeholder="—"
            onChange={(e) => { setJobNumber(e.target.value); saveHeader({ jobNumber: e.target.value }) }}
            className="w-20 bg-transparent font-medium text-indigo-600 outline-none"
          />
        </span>
        <input
          value={shift} readOnly={!canEdit} placeholder="DAYS 8AM"
          onChange={(e) => { setShift(e.target.value); saveHeader({ shiftLabel: e.target.value }) }}
          className="w-24 rounded bg-yellow-200 px-2 py-0.5 text-center text-xs font-bold text-slate-900 outline-none print:bg-yellow-200"
        />
        {canEdit && (
          <button onClick={remove} className="p-1 text-rose-400 hover:text-rose-600 print:hidden"><Trash2 size={14} /></button>
        )}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {Array.from({ length: 7 }, (_, d) => (
            <tr key={d} className={d % 2 ? 'bg-white dark:bg-slate-900' : 'bg-slate-100 dark:bg-slate-800/60 print:bg-slate-100'}>
              <td className="w-40 border-r border-slate-200 px-3 py-1.5 font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200 print:border-black">
                {DAY_NAMES[d]} {mmdd(shiftDate(weekStart, d))}
              </td>
              <td className="px-3 py-1.5">
                <input
                  value={days[d]} readOnly={!canEdit}
                  placeholder={canEdit ? 'Tech names, comma separated' : ''}
                  onChange={(e) => { setDays((cur) => ({ ...cur, [d]: e.target.value })); saveDay(d, e.target.value) }}
                  className="w-full bg-transparent text-slate-800 outline-none dark:text-slate-100"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
