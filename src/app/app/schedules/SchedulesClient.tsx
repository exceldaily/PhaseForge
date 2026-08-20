'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Plus, Printer, Trash2, ClipboardCopy, X, UserPlus, ListTree, ZoomIn, ZoomOut } from 'lucide-react'
import {
  addDirectoryProject, addScheduleJob, addTeam, copyWeek, deleteDirectoryProject,
  deleteScheduleJob, deleteTeam, setDayTechs, setWeekTech, updateRoster, renameRosterMember, updateScheduleJob,
  setDepartmentStyle, type ScheduleStyle,
} from './actions'
import { GridSchedule, buildGridCopy, type GridCell } from './GridSchedule'

interface Job {
  id: string; title: string; job_number: string | null; shift_label: string | null
  sort_order: number; days: Record<number, string[]>
  cells?: Record<number, GridCell[]>
}
interface Team { id: string; name: string; roster: string[]; division: string | null }
interface DirEntry { id: string; title: string; job_number: string | null; division: string | null }

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

interface WeekTeam { id: string; name: string; division: string | null; roster: string[]; jobs: Job[] }

export function SchedulesClient({
  teams, teamId, weekStart, jobs, canEdit, jobUrlTemplate = null, directory = [],
  division = '', divisions = [], hasAnyTeams = true, allWeek = [],
  scheduleStyle = 'crew', shiftOptions = ['Days', 'Nights', 'Travel Day', 'As needed'],
}: {
  teams: Team[]; teamId: string | null; weekStart: string; jobs: Job[]; canEdit: boolean
  jobUrlTemplate?: string | null; directory?: DirEntry[]
  division?: string; divisions?: string[]; hasAnyTeams?: boolean
  allWeek?: WeekTeam[]
  scheduleStyle?: ScheduleStyle; shiftOptions?: string[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newMember, setNewMember] = useState('')
  const [showAddTeam, setShowAddTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamDivision, setNewTeamDivision] = useState('')
  const [dirTitle, setDirTitle] = useState('')
  const [dirJob, setDirJob] = useState('')
  // New directory projects default to '*' = All departments (visible in every
  // department's list). Kept across team switches so the default sticks.
  const [dirDivision, setDirDivision] = useState('*')
  const [showProjects, setShowProjects] = useState(false)   // mobile project list
  const [renaming, setRenaming] = useState<string | null>(null)  // crew chip being renamed
  const [renameTo, setRenameTo] = useState('')
  const [zoom, setZoom] = useState(() => {
    if (typeof window === 'undefined') return 1
    const saved = Number(localStorage.getItem('pf-sched-zoom'))
    return saved >= 0.5 && saved <= 1.2 ? saved : 1
  })
  useEffect(() => { localStorage.setItem('pf-sched-zoom', String(zoom)) }, [zoom])
  const [peekDivision, setPeekDivision] = useState(division)
  const [prevDivision, setPrevDivision] = useState(division)
  const weekEnd = shiftDate(weekStart, 6)
  const team = teams.find((t) => t.id === teamId) ?? null
  const roster = team?.roster ?? []

  // Follow the department selector: new projects default to what's on screen.
  // (Render-time state adjustment — React's sanctioned alternative to a
  // setState-in-effect, which lints as a cascading-render risk.)
  if (prevDivision !== division) {
    setPrevDivision(division)
    setPeekDivision(division)
    // dirDivision (the "add to" target) deliberately keeps its value — default
    // '*' (All) — across team switches so All stays the default.
  }

  const divLabel = (d: string) => (d === '__all__' ? 'All departments' : d === '*' ? 'All' : d || 'General')
  // The sidebar can "peek" at another department's project list without leaving
  // the current team's week (cycle button). Projects tagged '*' (All) show in
  // every department's list, so a job can be shared by General, Startup, etc.
  const dirEntries = peekDivision === '__all__'
    ? directory
    : directory.filter((p) => (p.division ?? '') === peekDivision || p.division === '*')
  const cyclePeek = (dir: 1 | -1) => {
    if (divisions.length < 2) return
    const i = divisions.indexOf(peekDivision)
    const next = divisions[((i < 0 ? 0 : i) + dir + divisions.length) % divisions.length]
    setPeekDivision(next)
  }

  // Live mirror of each job block's local edits so Copy for email always
  // matches the screen (saves no longer invalidate the route cache, so the
  // server props can lag behind by design).
  const liveRef = useRef<Record<string, Partial<Job>>>({})
  const report = (id: string, snap: Partial<Job>) => {
    liveRef.current[id] = { ...liveRef.current[id], ...snap }
  }
  const liveJobs = (): Job[] => jobs.map((j) => ({ ...j, ...liveRef.current[j.id] }))

  const nav = (t: string | null, w: string, d: string = division) =>
    router.push(`/app/schedules?division=${encodeURIComponent(d)}&team=${t ?? ''}&week=${w}`)
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
  const saveRename = () => {
    const target = renaming
    if (!target || !teamId) { setRenaming(null); return }
    const next = renameTo.trim()
    setRenaming(null)
    if (!next || next === target) return
    run(() => renameRosterMember(teamId, target, next), `Renamed ${target} to ${next}`)
  }
  const removeMember = (name: string) => {
    if (!teamId) return
    if (!confirm(`Remove ${name} from ${team?.name}'s crew? (Existing schedules keep their names.)`)) return
    run(() => updateRoster(teamId, roster.filter((r) => r !== name)))
  }

  // Rich copy: pasting into Gmail/Outlook reproduces the bordered-table format
  // (grey banding, yellow shift chip, Job# hyperlinked). Plain-text fallback
  // included for SMS/plain editors. Reused per-team by "Copy all".
  // The day label is deliberately fixed in every email table.  Name columns
  // are measured from names only (never from the header), then capped so a
  // large crew remains comfortable inside Gmail's compose area.  Names may
  // wrap within a capped cell, but are never hidden or ellipsized.
  const measureCols = (allJobs: Job[]) => {
    const DAY_COL_PX = 132
    // Every name column is sized to fit the LONGEST name so nothing wraps
    // mid-word ("Abraha m"). Gmail's compose area scrolls horizontally, so a
    // wide table for a big crew is fine — legibility beats compactness.
    const CHAR_PX = 7.8              // Arial 11px upper-bound per char
    const CELL_PADDING_PX = 20       // cell padding + breathing room
    let longestName = 4
    for (const j of allJobs) {
      for (const n of new Set(Object.values(j.days).flat())) longestName = Math.max(longestName, n.length)
    }
    const nameColPx = Math.min(180, Math.max(56, Math.ceil(longestName * CHAR_PX + CELL_PADDING_PX)))
    return { nameColPx, dayColPx: DAY_COL_PX }
  }

  const buildTeamCopy = (
    teamName: string, current: Job[], teamRoster: string[],
    metrics: { nameColPx: number; dayColPx: number },
  ) => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    // All presentation is on tables/cells: Gmail retains this reliably when a
    // user pastes the ClipboardItem.  Width attributes back up the inline
    // widths because Gmail is more consistent with table attributes than CSS.
    const cell = 'border:1px solid #000;padding:3px 7px;font-family:Arial,sans-serif;font-size:11px;line-height:15px;'
    const { nameColPx, dayColPx: DAY_COL_PX } = metrics
    const blocks = current.map((j) => {
      const url = jobUrl(jobUrlTemplate, j.job_number)
      const jobCell = j.job_number
        ? `Job#${url ? `<a href="${url}">${esc(j.job_number)}</a>` : esc(j.job_number)}`
        : ''
      // Only days with someone assigned make the email — a one-day job prints
      // as a single row, not a week of blanks.
      const visibleDays = Array.from({ length: 7 }, (_, d) => d)
        .filter((d) => (j.days[d] ?? []).length > 0)
      // Fixed column per person for the whole job: roster order first, then any
      // extra (legacy/typed) names. A tech who's off one day leaves an empty
      // cell in HIS column instead of shifting everyone else's names left.
      const weekNames = new Set(visibleDays.flatMap((d) => j.days[d] ?? []))
      const columns = [
        ...teamRoster.filter((n) => weekNames.has(n)),
        ...[...weekNames].filter((n) => !teamRoster.includes(n)),
      ]
      const techCols = columns.length
      const tableW = DAY_COL_PX + techCols * nameColPx

      const rows = visibleDays.map((d, i) => {
        const grey = i % 2 === 0
        const onDay = new Set(j.days[d] ?? [])
        const techCells = columns.map((n) =>
          `<td width="${nameColPx}" style="${cell}width:${nameColPx}px;text-align:center;white-space:nowrap;${grey ? 'background:#d9d9d9;' : ''}">${onDay.has(n) ? esc(n) : '&nbsp;'}</td>`,
        ).join('')
        return `<tr><td width="${DAY_COL_PX}" style="${cell}width:${DAY_COL_PX}px;font-weight:bold;text-align:center;white-space:nowrap;${grey ? 'background:#d9d9d9;' : ''}">${DAY_FULL[d]} ${mmdd(shiftDate(weekStart, d))}</td>${techCells}</tr>`
      }).join('')
      // Gmail equalizes fixed-layout columns off the first non-spanning row, so
      // an invisible sizing row pins the day column and each tech column.
      const sizingRow = `<tr><td width="${DAY_COL_PX}" style="width:${DAY_COL_PX}px;border:0;padding:0;font-size:0;line-height:0;height:0;"></td>` +
        Array.from({ length: techCols }, () => `<td width="${nameColPx}" style="width:${nameColPx}px;border:0;padding:0;font-size:0;line-height:0;height:0;"></td>`).join('') +
        `</tr>`
      const grid = `<table cellspacing="0" cellpadding="0" border="0" width="${tableW}" style="border-collapse:collapse;table-layout:fixed;width:${tableW}px;">${sizingRow}${rows}</table>`

      // The title box is now its OWN one-line bordered box ABOVE the grid, not a
      // colspan row inside it — so a 1-person job no longer squeezes the store
      // name into 3 wrapped lines. It sizes to its content on one line and does
      // not need to match the grid width below it.
      const titleBox = `<table cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin-bottom:2px;"><tr>` +
        `<td style="border:1px solid #000;padding:5px 9px;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;white-space:nowrap;">${esc(j.title)}</td>` +
        `${jobCell ? `<td style="border:1px solid #000;border-left:0;padding:5px 9px;font-family:Arial,sans-serif;font-size:11px;white-space:nowrap;">${jobCell}</td>` : ''}` +
        `${j.shift_label ? `<td style="border:1px solid #000;border-left:0;background:#ffff00;padding:5px 9px;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;white-space:nowrap;">${esc(j.shift_label)}</td>` : ''}` +
        `</tr></table>`

      return `<div style="margin-bottom:18px;">${titleBox}${grid}</div>`
    }).join('')
    const html = `<div><p style="font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">WEEKLY SCHEDULE ${mmdd(weekStart)}-${mmdd(weekEnd)} — ${esc(teamName)} Team</p>${blocks}</div>`

    const lines: string[] = [`${teamName} — WEEKLY SCHEDULE ${mmdd(weekStart)}-${mmdd(weekEnd)}`, '']
    for (const j of current) {
      lines.push(`${j.title}${j.job_number ? `  (Job# ${j.job_number})` : ''}${j.shift_label ? `  — ${j.shift_label}` : ''}`)
      for (let d = 0; d < 7; d++) {
        const techs = j.days[d] ?? []
        if (!techs.length) continue // only days with someone assigned
        lines.push(`  ${DAY_NAMES[d]} ${mmdd(shiftDate(weekStart, d))}: ${techs.join(', ')}`)
      }
      lines.push('')
    }
    return { html, plain: lines.join('\n') }
  }

  const writeClipboard = async (html: string, plain: string) => {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ])
      setMsg('Copied — paste into Gmail/Outlook for the full table format (plain text in SMS).')
    } catch {
      await navigator.clipboard.writeText(plain)
      setMsg('Copied as plain text (rich copy not supported in this browser).')
    }
  }

  const copyForEmail = async () => {
    const jobsNow = liveJobs()
    if (scheduleStyle === 'grid') {
      const { html, plain } = buildGridCopy(team?.name ?? 'Team', jobsNow, weekStart, jobUrlTemplate)
      await writeClipboard(html, plain)
      return
    }
    const { html, plain } = buildTeamCopy(team?.name ?? 'Team', jobsNow, roster, measureCols(jobsNow))
    await writeClipboard(html, plain)
  }

  // Every team's schedule for this week in one copy, separated per team. The
  // on-screen team uses its live (possibly unsaved) edits; others use saved
  // data. Column widths are measured across ALL teams so every table lines up.
  const copyAllForEmail = async () => {
    // Grid departments copy their own teams in the grid layout; crew departments
    // keep the all-teams crew copy. (Styles differ per department, so a single
    // "everything" copy across mixed styles would be inconsistent — grid scopes
    // to the current department.)
    if (scheduleStyle === 'grid') {
      const gridTeams = (division === '__all__'
        ? allWeek
        : allWeek.filter((t) => (t.division ?? '') === division))
        .map((t) => ({ ...t, jobsNow: t.id === teamId ? liveJobs() : t.jobs }))
      if (gridTeams.length === 0) { setMsg('No schedules on this week yet.'); return }
      const sections = gridTeams.map((t) => buildGridCopy(t.name, t.jobsNow, weekStart, jobUrlTemplate))
      await writeClipboard(
        sections.map((s) => s.html).join('<br>'),
        sections.map((s) => s.plain).join('\n\n' + '='.repeat(40) + '\n\n'),
      )
      return
    }
    const perTeam = allWeek.map((t) => ({ ...t, jobsNow: t.id === teamId ? liveJobs() : t.jobs }))
    // Each team sizes its own name columns (so one long name elsewhere can't
    // widen everyone); the constant day column keeps them aligned.
    const sections = perTeam.map((t) => buildTeamCopy(t.name, t.jobsNow, t.roster, measureCols(t.jobsNow)))
    if (sections.length === 0) { setMsg('No schedules on this week yet.'); return }
    await writeClipboard(
      sections.map((s) => s.html).join('<br>'),
      sections.map((s) => s.plain).join('\n\n' + '='.repeat(40) + '\n\n'),
    )
  }

  if (!hasAnyTeams && directory.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center">
        <CalendarDays size={40} className="mx-auto text-slate-300" />
        <h1 className="mt-3 text-lg font-semibold text-slate-800 dark:text-slate-100">Schedules</h1>
        <p className="mt-1 text-sm text-slate-500">Add superintendents in Settings → Scheduling first — each becomes a team tab here.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col md:h-full">
      {/* ── Controls ── */}
      <div className="border-b border-slate-200 bg-white px-3 py-2.5 sm:px-4 sm:py-3 print:hidden dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <CalendarDays size={16} className="text-indigo-500" /><span className="hidden sm:inline">Schedules</span>
          </span>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700">
            <button aria-label="Previous week" onClick={() => nav(teamId, shiftDate(weekStart, -7))} className="p-2 sm:p-1.5 text-slate-500 hover:text-indigo-600"><ChevronLeft size={16} /></button>
            <span className="px-1 text-sm font-medium text-slate-700 dark:text-slate-200">{mmdd(weekStart)} – {mmdd(weekEnd)}</span>
            <button aria-label="Next week" onClick={() => nav(teamId, shiftDate(weekStart, 7))} className="p-2 sm:p-1.5 text-slate-500 hover:text-indigo-600"><ChevronRight size={16} /></button>
          </div>
          {/* Always visible on phones: the job list lives in a drawer there, and
              zoom shrinks the week so a 7-day grid fits a narrow screen. */}
          <button onClick={() => setShowProjects((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-medium lg:hidden ${showProjects ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>
            <ListTree size={13} /> Job list
          </button>
          <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <button aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
              className="p-2 text-slate-500 hover:text-indigo-600 sm:p-1.5"><ZoomOut size={15} /></button>
            <span className="min-w-9 text-center text-[11px] font-semibold text-slate-500">{Math.round(zoom * 100)}%</span>
            <button aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(1.2, +(z + 0.1).toFixed(2)))}
              className="p-2 text-slate-500 hover:text-indigo-600 sm:p-1.5"><ZoomIn size={15} /></button>
          </div>
          <div className="flex w-full items-center gap-x-2 gap-y-1 overflow-x-auto pb-0.5 sm:w-auto sm:flex-wrap sm:overflow-visible sm:pb-0">
            {divisions.length > 0 && (
              <select
                value={division}
                onChange={(e) => nav(null, weekStart, e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                {divisions.map((d) => <option key={d} value={d}>{divLabel(d)}</option>)}
              </select>
            )}
            {canEdit && (
              <select
                value={scheduleStyle}
                title={`Schedule style for the ${divLabel(division)} department`}
                onChange={(e) => {
                  const style = e.target.value as ScheduleStyle
                  startTransition(async () => {
                    const res = await setDepartmentStyle({ division, style, shiftOptions })
                    if ('error' in res && res.error) setError(res.error)
                    else router.refresh()
                  })
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-500 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <option value="crew">Crew grid</option>
                <option value="grid">Startup grid</option>
              </select>
            )}
            {teams.map((t) => (
              <span key={t.id} className="group relative">
                <button onClick={() => nav(t.id, weekStart)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${t.id === teamId ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}>
                  {t.name}
                </button>
                {canEdit && t.id === teamId && (
                  <button
                    title="Delete this team"
                    onClick={() => {
                      if (!confirm(`Delete team "${t.name}"? Their saved weekly schedules are deleted too. This cannot be undone.`)) return
                      run(() => deleteTeam(t.id))
                    }}
                    className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white group-hover:flex pointer-coarse:flex"
                  >✕</button>
                )}
              </span>
            ))}
            {canEdit && (
              showAddTeam ? (
                <span className="flex items-center gap-1">
                  <input autoFocus value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="Team / super name"
                    className="w-32 rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800" />
                  <input value={newTeamDivision} onChange={(e) => setNewTeamDivision(e.target.value)} placeholder="Division (optional)" list="division-options"
                    className="w-32 rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800" />
                  <datalist id="division-options">
                    {divisions.filter(Boolean).map((d) => <option key={d} value={d} />)}
                  </datalist>
                  <button onClick={() => {
                    const n = newTeamName.trim(); if (!n) return
                    const dv = newTeamDivision.trim()
                    setShowAddTeam(false); setNewTeamName(''); setNewTeamDivision('')
                    setError(null); setMsg(null)
                    startTransition(async () => {
                      const res = await addTeam(n, dv)
                      if ('error' in res && res.error) setError(res.error)
                      // Jump to the new team (it may live in a different department).
                      else nav(('id' in res ? res.id : null) ?? null, weekStart, dv)
                    })
                  }} className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white">Add</button>
                  <button onClick={() => setShowAddTeam(false)} className="px-1 text-xs text-slate-400">✕</button>
                </span>
              ) : (
                <button onClick={() => { setNewTeamDivision(division === '__all__' ? '' : division); setShowAddTeam(true) }}
                  className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-400 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-600">
                  + Team
                </button>
              )
            )}
          </div>
          <div className="flex w-full gap-1.5 overflow-x-auto sm:ml-auto sm:w-auto sm:flex-wrap sm:gap-2">
            {canEdit && (
              <>
                <button onClick={() => teamId && run(() => copyWeek(teamId, shiftDate(weekStart, -7), weekStart))} disabled={pending}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 sm:py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300">
                  <Copy size={13} /> <span className="whitespace-nowrap"><span className="sm:hidden">Last wk</span><span className="hidden sm:inline">Copy last week</span></span>
                </button>
                <button onClick={() => teamId && run(() => addScheduleJob({ superintendentId: teamId, weekStart, title: 'New Job', sortOrder: jobs.length }))} disabled={pending}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-2 sm:py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                  <Plus size={13} /> <span className="whitespace-nowrap">Add job</span>
                </button>
              </>
            )}
            <button onClick={copyForEmail} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 sm:py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:text-slate-300">
              <ClipboardCopy size={13} /> <span className="whitespace-nowrap"><span className="sm:hidden">Copy</span><span className="hidden sm:inline">Copy for email</span></span>
            </button>
            <button onClick={copyAllForEmail} title="Copy every team's schedule for this week in one shot"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 sm:py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:text-slate-300">
              <ClipboardCopy size={13} /> <span className="whitespace-nowrap">Copy all</span>
            </button>
            <button onClick={() => window.print()} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 sm:py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:text-slate-300">
              <Printer size={13} /> <span className="whitespace-nowrap"><span className="sm:hidden">Print</span><span className="hidden sm:inline">Print / PDF</span></span>
            </button>
          </div>
        </div>

        {/* ── Crew roster ── */}
        {canEdit && team && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{team.name}&apos;s crew:</span>
            {roster.map((name) => (
              <span key={name} className="group inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {renaming === name ? (
                  <input autoFocus value={renameTo} onChange={(e) => setRenameTo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(null) }}
                    onBlur={saveRename}
                    className="w-28 bg-transparent text-xs font-medium outline-none" />
                ) : (
                  /* Tap the name to swap in a different person — the week's
                     assignments follow the rename instead of being lost. */
                  <button onClick={() => { setRenaming(name); setRenameTo(name) }}
                    title="Tap to rename or replace this person" className="underline-offset-2 hover:underline">
                    {name}
                  </button>
                )}
                {/* pointer-coarse: tablets/phones have no hover — keep the ✕ visible */}
                <button onClick={() => removeMember(name)} className="text-slate-400 opacity-0 transition group-hover:opacity-100 pointer-coarse:opacity-100 hover:text-rose-500"><X size={11} /></button>
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
      <div className="relative flex flex-1 md:min-h-0">
        {/* ── Project directory (persistent job list / history) ── */}
        <aside className={`${showProjects ? 'block' : 'hidden'} absolute inset-x-0 top-0 z-20 max-h-[70vh] overflow-y-auto border-b border-slate-200 bg-white p-3 shadow-lg lg:static lg:z-auto lg:block lg:max-h-none lg:w-64 lg:flex-shrink-0 lg:border-b-0 lg:border-r lg:shadow-none print:hidden dark:border-slate-800 dark:bg-slate-900`}>
          <div className="mb-2 flex items-center gap-1">
            {divisions.length > 1 && (
              <button onClick={() => cyclePeek(-1)} title="Previous department's projects"
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800"><ChevronLeft size={13} /></button>
            )}
            <p className="flex-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              {divLabel(peekDivision)} Projects
              {peekDivision !== division && <span className="ml-1 normal-case text-indigo-400">(peeking)</span>}
            </p>
            {divisions.length > 1 && (
              <button onClick={() => cyclePeek(1)} title="Next department's projects"
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800"><ChevronRight size={13} /></button>
            )}
          </div>
          {canEdit && (
            <div className="mb-3 space-y-1.5">
              <input value={dirTitle} onChange={(e) => setDirTitle(e.target.value)} placeholder="Project name"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800" />
              <div className="flex gap-1.5">
                <input value={dirJob} onChange={(e) => setDirJob(e.target.value)} placeholder="Job#"
                  onKeyDown={(e) => e.key === 'Enter' && dirTitle.trim() && (setDirTitle(''), setDirJob(''), run(() => addDirectoryProject(dirTitle, dirJob, dirDivision)))}
                  className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800" />
                <button
                  onClick={() => { if (!dirTitle.trim()) return; const t = dirTitle, j = dirJob; setDirTitle(''); setDirJob(''); run(() => addDirectoryProject(t, j, dirDivision)) }}
                  className="rounded-md bg-indigo-600 px-2.5 text-xs font-medium text-white hover:bg-indigo-700">
                  <Plus size={13} />
                </button>
              </div>
              {divisions.length > 1 && (
                <select value={dirDivision} onChange={(e) => setDirDivision(e.target.value)}
                  title="Which department(s) can see this project. All = every department."
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-500 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800">
                  <option value="*">→ All departments</option>
                  {divisions.map((d) => <option key={d} value={d}>→ {divLabel(d)} only</option>)}
                </select>
              )}
            </div>
          )}
          {dirEntries.length === 0 ? (
            <p className="text-xs text-slate-400">No {divLabel(peekDivision)} projects yet — add name + Job#. Click one to drop it onto the current week.</p>
          ) : (
            <div className="space-y-0.5">
              {dirEntries.map((p) => (
                <div key={p.id} className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <button
                    disabled={!canEdit || !teamId}
                    title={canEdit ? 'Add to this week' : undefined}
                    onClick={() => teamId && run(() => addScheduleJob({
                      superintendentId: teamId, weekStart, title: p.title,
                      jobNumber: p.job_number ?? undefined, sortOrder: jobs.length,
                    }), `${p.title} added to ${team?.name}'s week.`)}
                    className="min-w-0 flex-1 truncate text-left text-xs font-medium text-slate-700 hover:text-indigo-600 dark:text-slate-200"
                  >
                    {p.title}
                  </button>
                  {p.job_number && (
                    jobUrl(jobUrlTemplate, p.job_number)
                      ? <a href={jobUrl(jobUrlTemplate, p.job_number)!} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] font-semibold text-indigo-500 hover:underline">{p.job_number}</a>
                      : <span className="text-[10px] text-slate-400">{p.job_number}</span>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => { if (confirm(`Remove "${p.title}" from the project list?`)) run(() => deleteDirectoryProject(p.id)) }}
                      className="hidden text-slate-300 hover:text-rose-500 group-hover:block pointer-coarse:block"><X size={11} /></button>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>

        {scheduleStyle === 'grid' && team ? (
          <GridSchedule
            teamName={team.name} weekStart={weekStart} jobs={jobs} roster={roster}
            shiftOptions={shiftOptions} canEdit={canEdit} jobUrlTemplate={jobUrlTemplate} zoom={zoom}
            onChanged={() => router.refresh()}
            reportCells={(jobId, cells) => report(jobId, { cells })}
          />
        ) : (
        <div className="schedule-print-root flex-1 bg-slate-100 p-3 sm:p-4 md:overflow-y-auto dark:bg-slate-950 print:overflow-visible print:bg-white print:p-0">
          <div suppressHydrationWarning style={zoom === 1 ? undefined : { transform: `scale(${zoom})`, transformOrigin: 'top left', width: `${100 / zoom}%` }}>
        {/* Wide cap: big rosters (12+ names) need room so day rows keep chips on
            one line. Print is unaffected — the print root is forced to 7.5in. */}
        <div className="mx-auto max-w-[1400px] space-y-4">
          <div className="hidden text-center print:block">
            <h1 className="text-lg font-bold">WEEKLY SCHEDULE {mmdd(weekStart)}–{mmdd(weekEnd)}</h1>
            <p className="mb-3 inline-block bg-yellow-300 px-3 py-0.5 text-sm font-bold">{team?.name} Team</p>
          </div>

          {jobs.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400 print:hidden">
              {team
                ? <>No jobs on {team.name}&apos;s week — &ldquo;Add job&rdquo; or &ldquo;Copy last week&rdquo;.</>
                : <>No teams in {divLabel(division)} yet — use &ldquo;+ Team&rdquo; to add one.</>}
            </p>
          ) : jobs.map((job) => (
            <JobBlock key={`${job.id}-${weekStart}`} job={job} weekStart={weekStart} roster={roster} canEdit={canEdit}
              urlTemplate={jobUrlTemplate} report={report} onChanged={() => router.refresh()} />
          ))}
        </div>
          </div>
        </div>
        )}
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

function JobBlock({ job, weekStart, roster, canEdit, urlTemplate, report, onChanged }: {
  job: Job; weekStart: string; roster: string[]; canEdit: boolean
  urlTemplate: string | null
  report: (id: string, snap: Partial<Job>) => void
  onChanged: () => void
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
    setDays((cur) => {
      const next = Object.fromEntries(Array.from({ length: 7 }, (_, d) => {
        const list = cur[d] ?? []
        return [d, turnOn ? [...new Set([...list, name])] : list.filter((t) => t !== name)]
      }))
      report(job.id, { days: next })
      return next
    })
    void setWeekTech(job.id, name, turnOn)
  }

  const toggleDay = (d: number, name: string) => {
    setDays((cur) => {
      const list = cur[d] ?? []
      const next = list.includes(name) ? list.filter((t) => t !== name) : [...list, name]
      void setDayTechs(job.id, d, next)
      const all = { ...cur, [d]: next }
      report(job.id, { days: all })
      return all
    })
  }

  const addToDay = (d: number, name: string) => {
    setDays((cur) => {
      const list = cur[d] ?? []
      if (list.includes(name)) return cur
      const next = [...list, name]
      void setDayTechs(job.id, d, next)
      const all = { ...cur, [d]: next }
      report(job.id, { days: all })
      return all
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
          onChange={(e) => { setTitle(e.target.value); report(job.id, { title: e.target.value }); saveHeader({ title: e.target.value }) }}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-bold text-slate-900 outline-none dark:text-slate-100" />
        <span className="flex items-center gap-1 text-xs text-slate-500">
          Job#
          <input value={jobNumber} readOnly={!canEdit} placeholder="—"
            onChange={(e) => { setJobNumber(e.target.value); report(job.id, { job_number: e.target.value }); saveHeader({ jobNumber: e.target.value }) }}
            className="w-20 bg-transparent font-semibold text-indigo-600 outline-none" />
          {urlTemplate && jobNumber.trim() && (
            <a href={urlTemplate.replace('{job}', encodeURIComponent(jobNumber.trim()))}
              target="_blank" rel="noopener noreferrer" title="Open job in Kalos"
              className="text-indigo-500 hover:text-indigo-700 print:hidden">↗</a>
          )}
        </span>
        <input value={shift} readOnly={!canEdit} placeholder="Shift…"
          onChange={(e) => { setShift(e.target.value); report(job.id, { shift_label: e.target.value }); saveHeader({ shiftLabel: e.target.value }) }}
          className="w-24 rounded bg-yellow-300 px-2 py-0.5 text-center text-xs font-bold text-slate-900 outline-none" />
        {canEdit && (
          <button onClick={remove} className="p-1 text-rose-400 hover:text-rose-600 print:hidden"><Trash2 size={14} /></button>
        )}
      </div>

      {/* "This week" quick-assign row */}
      {/* Day grid — "This week" is the FIRST table row (not a separate flex
          block) so its name column starts at the same x as every weekday row;
          otherwise the header names sit left of the day names and look ragged. */}
      <table className="w-full border-collapse text-sm">
        <tbody>
          {canEdit && roster.length > 0 && (
            <tr className="border-b border-slate-200 bg-indigo-50/50 dark:border-slate-700 dark:bg-indigo-950/20 print:hidden">
              <td className="w-32 border-r border-slate-200 px-3 py-2 align-top text-[11px] font-semibold uppercase tracking-wide text-indigo-400 dark:border-slate-700">
                This week
              </td>
              <td className="px-2 py-2">
                <div className="flex flex-wrap gap-1">
                  {roster.map((name) => (
                    <Chip key={name} name={name} on={onAllDays(name)} onClick={() => toggleWeek(name)} />
                  ))}
                </div>
              </td>
            </tr>
          )}
          {Array.from({ length: 7 }, (_, d) => {
            const assigned = days[d] ?? []
            return (
              <tr key={d} onPointerEnter={() => dragEnterRow(d)} className={`border-b border-slate-200 last:border-0 dark:border-slate-700 ${d % 2 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/40 print:bg-slate-100'}`}>
                <td className="w-32 border-r border-slate-200 px-3 py-1.5 align-top text-[13px] font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200">
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
      className={`select-none rounded-full font-medium transition-colors print:hidden ${onPointerDown ? 'pointer-fine:[touch-action:none]' : ''} ${small ? 'px-2 py-0.5 pointer-coarse:py-1 text-[11px]' : 'px-2.5 py-1 pointer-coarse:py-1.5 text-xs'} ${on
        ? 'bg-indigo-600 text-white'
        : 'bg-white text-slate-400 ring-1 ring-inset ring-slate-200 hover:text-slate-600 hover:ring-slate-300 dark:bg-slate-800 dark:ring-slate-700'}`}
    >
      {name}
    </button>
  )
}
