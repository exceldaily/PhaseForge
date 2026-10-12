'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  addExclusion, pollStatus, removeExclusion, retryAudit, reviewFinding, revealWorkerKey, saveSettings, setJobPlace, startAudit, stopAudit,
} from './actions'

export interface FindingView {
  id: string; category: string; employeeName: string | null; kalosEmployeeId: string | null; workDate: string | null
  travelType: string | null; originLabel: string | null; destLabel: string | null; jobNumbers: string[]
  recordedMinutes: number | null; estimatedMinutes: number | null; allowedMinutes: number | null; excessMinutes: number | null
  routeProvider: string | null; summary: string; evidence: Record<string, unknown>; assumptions: string[]
  reviewStatus: string; reviewNote: string | null; reviewedAt: string | null; firstSeen: string
}
export interface RunView {
  id: string; status: string; trigger: string; rangeStart: string; rangeEnd: string; phase: string | null; message: string | null
  progressCurrent: number; progressTotal: number; error: string | null; errorCode: string | null; stats: Record<string, number>
  queuedAt: string; startedAt: string | null; completedAt: string | null; cancelRequested: boolean
}
export interface ReviewLogView { id: string; findingId: string; actor: string; from: string | null; to: string; note: string | null; at: string }
interface Props {
  settings: {
    toleranceMinutes: number; includePolicyDeduction: boolean; timezone: string; scheduleEnabled: boolean; scheduleDaysBack: number
    notifyNewFlags: boolean; workerOnline: boolean; workerName: string | null; workerLastSeen: string | null
  }
  exclusions: { id: string; employeeName: string; kalosEmployeeId: string | null; note: string | null }[]
  runs: RunView[]
  findings: FindingView[]
  history: ReviewLogView[]
  projectLinks: Record<string, { projectId: string; title: string }>
  jobUrlTemplate: string | null
  periods: { current: { start: string; end: string }; previous: { start: string; end: string } }
}

const CATEGORY: Record<string, { label: string; tone: string }> = {
  excessive_travel: { label: 'Excessive travel', tone: 'bg-rose-50 text-rose-700 ring-rose-200' },
  jobsite_transition: { label: 'Jobsite transition', tone: 'bg-rose-50 text-rose-700 ring-rose-200' },
  impossible_transition: { label: 'Impossible transition', tone: 'bg-rose-50 text-rose-700 ring-rose-200' },
  overlap: { label: 'Overlapping entries', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  missing_travel: { label: 'Missing travel', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  unexplained_gap: { label: 'Unexplained gap', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  unable_to_verify: { label: 'Unable to verify', tone: 'bg-slate-100 text-slate-700 ring-slate-200' },
  unmatched_job: { label: 'Unmatched job', tone: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
}
const REVIEW: Record<string, string> = {
  pending: 'Pending review', justified: 'Justified', correction_needed: 'Correction needed', resolved: 'Resolved', unable_to_verify: 'Unable to verify',
}
const TRAVEL: Record<string, string> = { home_to_job: 'Home to job', job_to_job: 'Job to job', job_to_home: 'Job to home', unknown: 'Unknown' }
const STATUS_TONE: Record<string, string> = {
  queued: 'bg-slate-100 text-slate-700', running: 'bg-indigo-100 text-indigo-700', completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700', cancelled: 'bg-slate-100 text-slate-500',
}

const dur = (m: number | null) => {
  if (m === null) return '-'
  const a = Math.abs(m), h = Math.floor(a / 60), r = a % 60
  return `${m < 0 ? '-' : ''}${h ? `${h}h ` : ''}${r}m`
}
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-')
const day = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : '-')
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

function Chip({ cat }: { cat: string }) {
  const c = CATEGORY[cat] ?? { label: cat, tone: 'bg-slate-100 text-slate-700 ring-slate-200' }
  return <span className={cx('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', c.tone)}>{c.label}</span>
}

export function PayrollAuditClient(props: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'findings' | 'runs' | 'settings'>('findings')
  const [selected, setSelected] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  const [live, setLive] = useState<{ workerOnline: boolean; workerName: string | null; run: RunView | null }>({
    workerOnline: props.settings.workerOnline, workerName: props.settings.workerName, run: null,
  })
  const [range, setRange] = useState({ start: props.periods.current.start, end: props.periods.current.end })

  const active = props.runs.find((r) => r.status === 'queued' || r.status === 'running') ?? null
  const latest = props.runs[0] ?? null

  // Live progress. Real counters from the worker, polled while a run is open.
  const refreshLive = useCallback(async () => {
    const r = await pollStatus()
    if (!r.ok) return
    const run = r.run as null | Record<string, unknown>
    setLive((prev) => {
      const nowTerminal = run && ['completed', 'failed', 'cancelled'].includes(run.status as string)
      const wasOpen = prev.run && ['queued', 'running'].includes(prev.run.status)
      if (nowTerminal && wasOpen) router.refresh()
      return {
        workerOnline: r.workerOnline, workerName: r.workerName ?? null,
        run: run ? {
          id: run.id as string, status: run.status as string, trigger: '', rangeStart: '', rangeEnd: '', phase: (run.phase as string | null) ?? null,
          message: (run.message as string | null) ?? null, progressCurrent: Number(run.progress_current), progressTotal: Number(run.progress_total),
          error: (run.error as string | null) ?? null, errorCode: (run.error_code as string | null) ?? null, stats: {}, queuedAt: '', startedAt: null,
          completedAt: (run.completed_at as string | null) ?? null, cancelRequested: !!run.cancel_requested,
        } : null,
      }
    })
  }, [router])

  useEffect(() => {
    const first = setTimeout(() => void refreshLive(), 0)
    const t = setInterval(() => { if (document.visibilityState === 'visible') void refreshLive() }, 4000)
    return () => { clearTimeout(first); clearInterval(t) }
  }, [refreshLive])

  const run = live.run && active && live.run.id === active.id ? live.run : active
  const openRun = run && (run.status === 'queued' || run.status === 'running') ? run : null

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => start(async () => {
    const r = await fn()
    setMsg({ ok: r.ok, text: r.ok ? okText : (r.error ?? 'Something went wrong.') })
    if (r.ok) router.refresh()
    void refreshLive()
  })

  const findings = props.findings
  const counts = useMemo(() => {
    const by = (c: string[]) => findings.filter((f) => c.includes(f.category)).length
    return {
      excessive: by(['excessive_travel']), transition: by(['jobsite_transition', 'impossible_transition']),
      unverifiable: by(['unable_to_verify']), unmatched: by(['unmatched_job']), pending: findings.filter((f) => f.reviewStatus === 'pending').length,
      integrity: by(['overlap', 'missing_travel', 'unexplained_gap']),
    }
  }, [findings])
  const lastGood = props.runs.find((r) => r.status === 'completed') ?? null
  const failed = props.runs.filter((r) => r.status === 'failed').length
  const completed = props.runs.filter((r) => r.status === 'completed').length

  return (
    <div className="mx-auto max-w-none space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Payroll Audit</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Reads Kalos timesheets through the signed-in worker browser and checks recorded travel against road drive time. Read only: nothing here changes payroll.
          </p>
        </div>
        <div className={cx('rounded-full px-3 py-1 text-xs font-semibold', live.workerOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
          {live.workerOnline ? `Worker online${live.workerName ? `: ${live.workerName}` : ''}` : 'Worker offline'}
        </div>
      </div>

      {!live.workerOnline && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          The audit worker is not connected. You can still queue an audit and it will start when the worker comes online
          (queued runs expire after 24 hours). Setup is under the Settings tab.
        </div>
      )}
      {msg && (
        <div className={cx('rounded-lg border p-3 text-sm', msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900')}>{msg.text}</div>
      )}
      {latest?.status === 'failed' && !openRun && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <span>
            <strong>{latest.errorCode === 'auth_expired' ? 'Kalos sign-in expired.' : 'The last audit failed.'}</strong> {latest.error}
          </span>
          <button className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" disabled={pending}
            onClick={() => act(() => retryAudit(latest.id), 'Audit queued again.')}>Retry failed audit</button>
        </div>
      )}

      {/* Controls */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            disabled={pending || !!openRun}
            onClick={() => act(() => startAudit({ period: 'current' }), 'Audit queued for the current pay period.')}>Run audit now</button>
          <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={pending || !!openRun} onClick={() => act(() => startAudit({ period: 'current' }), 'Audit queued for the current pay period.')}>
            Audit current pay period
          </button>
          <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={pending || !!openRun} onClick={() => act(() => startAudit({ period: 'previous' }), 'Audit queued for the previous pay period.')}>
            Audit previous pay period
          </button>
          <div className="flex items-end gap-2">
            <label className="text-xs font-medium text-slate-500">From
              <input type="date" value={range.start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
                className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
            </label>
            <label className="text-xs font-medium text-slate-500">To
              <input type="date" value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
                className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
            </label>
            <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              disabled={pending || !!openRun} onClick={() => act(() => startAudit({ start: range.start, end: range.end }), 'Audit queued for the selected dates.')}>
              Audit date range
            </button>
          </div>
          <div className="ml-auto flex gap-2">
            {!openRun && latest && latest.status !== 'queued' && latest.status !== 'running' && (
              <button className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                disabled={pending} onClick={() => act(() => retryAudit(latest.id), `Audit queued again for ${latest.rangeStart} to ${latest.rangeEnd}.`)}>
                Run {latest.rangeStart} to {latest.rangeEnd} again
              </button>
            )}
            {openRun && (
              <button className="rounded-md border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                disabled={pending || openRun.cancelRequested} onClick={() => act(() => stopAudit(openRun.id), 'Stopping the audit.')}>Stop audit</button>
            )}
            <a href="/api/payroll-audit/export" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Export audit report</a>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Pay weeks run Saturday to Friday. Current: {props.periods.current.start} to {props.periods.current.end}. Timezone: {props.settings.timezone}.
        </p>

        {openRun && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">
                {openRun.status === 'queued' ? 'Queued' : openRun.phase ?? 'Running'}{openRun.message ? `: ${openRun.message}` : ''}
              </span>
              {openRun.progressTotal > 0 && <span className="tabular-nums text-slate-500">{openRun.progressCurrent} of {openRun.progressTotal}</span>}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-indigo-600 transition-all"
                style={{ width: `${openRun.progressTotal ? Math.min(100, (openRun.progressCurrent / openRun.progressTotal) * 100) : openRun.status === 'running' ? 4 : 0}%` }} />
            </div>
            {openRun.cancelRequested && <p className="mt-1 text-[11px] text-slate-500">Stop requested. The worker finishes the timesheet it is on, then stops.</p>}
          </div>
        )}
      </section>

      {/* Overview */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {[
          ['Technicians reviewed', lastGood?.stats.employeesReviewed ?? '-', 'last good run'],
          ['Entries checked', lastGood?.stats.entriesChecked ?? '-', 'last good run'],
          ['Travel entries', lastGood?.stats.travelEntries ?? '-', 'last good run'],
          ['Excessive travel', counts.excessive, 'open findings'],
          ['Jobsite transitions', counts.transition, 'open findings'],
          ['Unable to verify', counts.unverifiable, 'open findings'],
          ['Unmatched jobs', counts.unmatched, 'open findings'],
          ['Runs ok / failed', `${completed} / ${failed}`, 'last 25 runs'],
        ].map(([label, value, hint]) => (
          <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>
          </div>
        ))}
      </section>
      <p className="text-xs text-slate-500">
        Last successful audit: {lastGood ? `${when(lastGood.completedAt)} (${lastGood.rangeStart} to ${lastGood.rangeEnd})` : 'none yet'}. Data integrity items to review: {counts.integrity}.
        Awaiting review: {counts.pending}.
      </p>

      <nav className="flex gap-1 border-b border-slate-200">
        {(['findings', 'runs', 'settings'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cx('border-b-2 px-3 py-2 text-sm font-medium capitalize', tab === t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800')}>{t}</button>
        ))}
      </nav>

      {tab === 'findings' && <FindingsTab {...props} selected={selected} setSelected={setSelected} pending={pending}
        onReview={(id, status, note) => act(() => reviewFinding({ id, status: status as 'pending', note }), 'Review saved.')} />}
      {tab === 'runs' && <RunsTab runs={props.runs} pending={pending} onRetry={(id) => act(() => retryAudit(id), 'Audit queued again.')} />}
      {tab === 'settings' && <SettingsTab {...props} pending={pending} act={act} />}
    </div>
  )
}

/* ── Findings ───────────────────────────────────────────────────────────── */

function FindingsTab(p: Props & { selected: string | null; setSelected: (id: string | null) => void; pending: boolean; onReview: (id: string, status: string, note: string) => void }) {
  const [f, setF] = useState({ tech: '', from: '', to: '', job: '', category: '', review: '', minExcess: '', travel: '' })
  const techs = useMemo(() => [...new Set(p.findings.map((x) => x.employeeName).filter((x): x is string => !!x))].sort(), [p.findings])
  const rows = useMemo(() => p.findings.filter((x) => {
    if (f.tech && x.employeeName !== f.tech) return false
    if (f.from && (!x.workDate || x.workDate < f.from)) return false
    if (f.to && (!x.workDate || x.workDate > f.to)) return false
    if (f.job && !x.jobNumbers.some((j) => j.includes(f.job.trim()))) return false
    if (f.category && x.category !== f.category) return false
    if (f.review && x.reviewStatus !== f.review) return false
    if (f.travel && x.travelType !== f.travel) return false
    if (f.minExcess && (x.excessMinutes ?? -1) < Number(f.minExcess)) return false
    return true
  }), [p.findings, f])
  const sel = p.findings.find((x) => x.id === p.selected) ?? null
  const input = 'rounded-md border border-slate-300 px-2 py-1.5 text-sm'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <select className={input} value={f.tech} onChange={(e) => setF({ ...f, tech: e.target.value })}>
          <option value="">All technicians</option>{techs.map((t) => <option key={t}>{t}</option>)}
        </select>
        <input type="date" className={input} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="From date" />
        <input type="date" className={input} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="To date" />
        <input className={cx(input, 'w-28')} placeholder="Job number" value={f.job} onChange={(e) => setF({ ...f, job: e.target.value })} />
        <select className={input} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
          <option value="">All finding types</option>{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className={input} value={f.review} onChange={(e) => setF({ ...f, review: e.target.value })}>
          <option value="">Any review status</option>{Object.entries(REVIEW).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={input} value={f.travel} onChange={(e) => setF({ ...f, travel: e.target.value })}>
          <option value="">Any travel type</option>{Object.entries(TRAVEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className={cx(input, 'w-32')} type="number" min={0} placeholder="Min minutes over" value={f.minExcess} onChange={(e) => setF({ ...f, minExcess: e.target.value })} />
        <button className="text-xs font-medium text-slate-500 underline" onClick={() => setF({ tech: '', from: '', to: '', job: '', category: '', review: '', minExcess: '', travel: '' })}>Clear</button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              {['Technician', 'Date', 'From', 'To', 'Recorded', 'Est. drive', 'Over est.', 'Allowed', 'Finding', 'Review'].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} onClick={() => p.setSelected(r.id)} className={cx('cursor-pointer hover:bg-slate-50', p.selected === r.id && 'bg-indigo-50/60')}>
                <td className="px-3 py-2 font-medium text-slate-900">{r.employeeName ?? '-'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{day(r.workDate)}</td>
                <td className="px-3 py-2 text-slate-600">{r.originLabel ?? '-'}</td>
                <td className="px-3 py-2 text-slate-600">{r.destLabel ?? (r.jobNumbers.length ? `Job ${r.jobNumbers[0]}` : '-')}</td>
                <td className="px-3 py-2 tabular-nums">{dur(r.recordedMinutes)}</td>
                <td className="px-3 py-2 tabular-nums">{dur(r.estimatedMinutes)}</td>
                <td className={cx('px-3 py-2 tabular-nums', (r.excessMinutes ?? 0) > 0 && 'font-semibold text-rose-700')}>{r.excessMinutes === null ? '-' : dur(r.excessMinutes)}</td>
                <td className="px-3 py-2 tabular-nums">{dur(r.allowedMinutes)}</td>
                <td className="px-3 py-2"><Chip cat={r.category} /></td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{REVIEW[r.reviewStatus] ?? r.reviewStatus}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={10} className="px-3 py-10 text-center text-sm text-slate-500">
                {p.findings.length ? 'No findings match these filters.' : 'No findings yet. Run an audit once the worker is online.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {sel && <FindingDetail key={sel.id} f={sel} {...p} onClose={() => p.setSelected(null)} />}
    </div>
  )
}

function FindingDetail({ f, history, projectLinks, jobUrlTemplate, pending, onReview, onClose }: Props & {
  f: FindingView; pending: boolean; onReview: (id: string, status: string, note: string) => void; onClose: () => void
}) {
  const [status, setStatus] = useState(f.reviewStatus)
  const [note, setNote] = useState(f.reviewNote ?? '')
  const log = history.filter((h) => h.findingId === f.id)
  const kalosJob = (j: string) => (jobUrlTemplate ? jobUrlTemplate.replace('{job}', encodeURIComponent(j)) : null)
  const entries = (f.evidence.entries as { key: string; job: string | null; start: string; end: string; hours: number | null }[] | undefined) ?? []

  return (
    <section className="rounded-xl border border-indigo-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2"><Chip cat={f.category} /><h2 className="text-base font-bold text-slate-900">{f.employeeName ?? 'Job'}{f.workDate ? `, ${day(f.workDate)}` : ''}</h2></div>
          <p className="mt-1 text-sm text-slate-600">{f.summary}</p>
        </div>
        <button className="text-sm text-slate-500 hover:text-slate-800" onClick={onClose}>Close</button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {[
          ['Origin', f.originLabel], ['Destination', f.destLabel], ['Travel type', f.travelType ? TRAVEL[f.travelType] : null],
          ['Recorded', f.recordedMinutes === null ? null : dur(f.recordedMinutes)], ['Estimated drive', f.estimatedMinutes === null ? null : dur(f.estimatedMinutes)],
          ['Allowed (estimate + tolerance)', f.allowedMinutes === null ? null : dur(f.allowedMinutes)], ['Over the estimate', f.excessMinutes === null ? null : dur(f.excessMinutes)],
          ['Routing', f.routeProvider ? `${f.routeProvider.toUpperCase()} (current, no traffic history)` : null],
        ].map(([k, v]) => (
          <div key={String(k)}><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k}</dt><dd className="mt-0.5 text-slate-900">{v ?? '-'}</dd></div>
        ))}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {f.kalosEmployeeId && (
          <a className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-indigo-700 hover:bg-slate-50" target="_blank" rel="noreferrer"
            href={`https://live.kalosflorida.com/timesheet/${f.kalosEmployeeId}?startOnWeek=true`}>Open Kalos timesheet</a>
        )}
        {f.jobNumbers.map((j) => (
          <span key={j} className="flex gap-1">
            {projectLinks[j] && <a className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-indigo-700 hover:bg-slate-50" href={`/app/projects/${projectLinks[j].projectId}`}>PhaseForge job {j}</a>}
            {kalosJob(j) && <a className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-indigo-700 hover:bg-slate-50" target="_blank" rel="noreferrer" href={kalosJob(j)!}>Kalos job {j}</a>}
            {!projectLinks[j] && !kalosJob(j) && <span className="rounded-md bg-slate-100 px-3 py-1.5 text-slate-600">Job {j}</span>}
          </span>
        ))}
      </div>

      {entries.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Supporting timesheet entries</h3>
          <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
            {entries.map((e) => <li key={e.key}>{e.start} to {e.end}{e.hours !== null ? ` (${e.hours}h)` : ''}{e.job ? `, job ${e.job}` : ''}</li>)}
          </ul>
        </div>
      )}
      {f.assumptions.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Routing assumptions</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">{f.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        A flag is a prompt to look, not a conclusion. Traffic, approved stops, closures, and parts pickups can all explain extra time.
      </p>

      <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[220px_1fr_auto]">
        <select className="rounded-md border border-slate-300 px-2 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          {Object.entries(REVIEW).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Reviewer note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
        <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={pending}
          onClick={() => onReview(f.id, status, note)}>Save review</button>
      </div>
      {log.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-slate-500">
          {log.map((h) => <li key={h.id}>{when(h.at)}: {h.actor} set {REVIEW[h.to] ?? h.to}{h.from && h.from !== h.to ? ` (was ${REVIEW[h.from] ?? h.from})` : ''}{h.note ? ` - "${h.note}"` : ''}</li>)}
        </ul>
      )}
    </section>
  )
}

/* ── Runs ───────────────────────────────────────────────────────────────── */

function RunsTab({ runs, pending, onRetry }: { runs: RunView[]; pending: boolean; onRetry: (id: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
          <tr>{['Queued', 'Range', 'Trigger', 'Status', 'Technicians', 'Entries', 'New flags', 'Detail', ''].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {runs.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap px-3 py-2 text-slate-600">{when(r.queuedAt)}</td>
              <td className="whitespace-nowrap px-3 py-2">{r.rangeStart} to {r.rangeEnd}</td>
              <td className="px-3 py-2 capitalize text-slate-600">{r.trigger}</td>
              <td className="px-3 py-2"><span className={cx('rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', STATUS_TONE[r.status])}>{r.status}</span></td>
              <td className="px-3 py-2 tabular-nums">{r.stats.employeesReviewed ?? r.stats.employeesScanned ?? '-'}</td>
              <td className="px-3 py-2 tabular-nums">{r.stats.entriesChecked ?? '-'}</td>
              <td className="px-3 py-2 tabular-nums">{r.stats.newFlags ?? '-'}</td>
              <td className="max-w-xs px-3 py-2 text-xs text-slate-500">{r.error ?? r.message ?? ''}</td>
              <td className="px-3 py-2">
                {r.status !== 'queued' && r.status !== 'running' && (
                  <button className="text-xs font-semibold text-indigo-700 disabled:opacity-50" disabled={pending} onClick={() => onRetry(r.id)}>
                    {r.status === 'completed' ? 'Run again' : 'Retry'}
                  </button>
                )}
              </td>
            </tr>
          ))}
          {!runs.length && <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-500">No audits have run yet.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

/* ── Settings ───────────────────────────────────────────────────────────── */

function SettingsTab(p: Props & { pending: boolean; act: (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => void }) {
  const s = p.settings
  const [tol, setTol] = useState(String(s.toleranceMinutes))
  const [ded, setDed] = useState(s.includePolicyDeduction)
  const [sch, setSch] = useState(s.scheduleEnabled)
  const [days, setDays] = useState(String(s.scheduleDaysBack))
  const [notify, setNotify] = useState(s.notifyNewFlags)
  const [exName, setExName] = useState('')
  const [exId, setExId] = useState('')
  const [key, setKey] = useState<{ companyId: string; key: string } | null>(null)
  const [keyErr, setKeyErr] = useState<string | null>(null)
  const [places, setPlaces] = useState<Record<string, string>>({})
  const unmatched = p.findings.filter((x) => x.category === 'unmatched_job')

  const reveal = async (rotate: boolean) => {
    const r = await revealWorkerKey(rotate)
    if (r.ok) { setKey({ companyId: r.companyId, key: r.key }); setKeyErr(null) } else setKeyErr(r.error)
  }
  const box = 'rounded-xl border border-slate-200 bg-white p-4'
  const input = 'rounded-md border border-slate-300 px-2 py-1.5 text-sm'

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={box}>
        <h2 className="text-sm font-bold text-slate-900">Travel rule</h2>
        <p className="mt-1 text-xs text-slate-500">Allowed travel = estimated drive + tolerance. A long drive is never a flag by itself; only time past the allowance is.</p>
        <label className="mt-3 block text-xs font-medium text-slate-600">Tolerance (minutes)
          <input type="number" min={0} max={600} className={cx(input, 'mt-1 block w-28')} value={tol} onChange={(e) => setTol(e.target.value)} />
        </label>
        <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-1" checked={ded} onChange={(e) => setDed(e.target.checked)} />
          <span>Add back Kalos travel policy deductions before comparing<br />
            <span className="text-xs text-slate-500">Off compares the paid duration shown on the timesheet. On compares what was reported before Kalos deducted time.</span></span>
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={sch} onChange={(e) => setSch(e.target.checked)} /> Queue a daily audit automatically
        </label>
        <label className="mt-2 block text-xs font-medium text-slate-600">Look back (days) for scheduled audits
          <input type="number" min={1} max={31} className={cx(input, 'mt-1 block w-28')} value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Notify administrators when an audit finishes
        </label>
        <button className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={p.pending}
          onClick={() => p.act(() => saveSettings({ toleranceMinutes: Number(tol), includePolicyDeduction: ded, scheduleEnabled: sch, scheduleDaysBack: Number(days), notifyNewFlags: notify }), 'Settings saved.')}>
          Save settings
        </button>
      </section>

      <section className={box}>
        <h2 className="text-sm font-bold text-slate-900">Excluded from the audit</h2>
        <p className="mt-1 text-xs text-slate-500">Matched by name; a first name alone works (like Yeriel). Their timesheets are not read, and they never appear in findings, counts, or exports.</p>
        <ul className="mt-3 divide-y divide-slate-100">
          {p.exclusions.map((e) => (
            <li key={e.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-slate-900">{e.employeeName}{' '}
                <span className="text-xs text-slate-400">{e.kalosEmployeeId ? `Kalos id ${e.kalosEmployeeId}` : 'matched by name until first audit'}</span></span>
              <button className="text-xs font-semibold text-rose-700 disabled:opacity-50" disabled={p.pending} onClick={() => p.act(() => removeExclusion(e.id), 'Removed.')}>Remove</button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <input className={cx(input, 'flex-1')} placeholder="Full name as in Kalos" value={exName} onChange={(e) => setExName(e.target.value)} />
          <input className={cx(input, 'w-32')} placeholder="Kalos id (optional)" value={exId} onChange={(e) => setExId(e.target.value)} />
          <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50" disabled={p.pending || !exName.trim()}
            onClick={() => p.act(() => addExclusion({ name: exName, kalosEmployeeId: exId }), 'Added.')}>Add</button>
        </div>
      </section>

      <section className={box}>
        <h2 className="text-sm font-bold text-slate-900">Unmatched jobs</h2>
        <p className="mt-1 text-xs text-slate-500">Jobs on timesheets with no address in PhaseForge. Type the address once and it is used from then on.</p>
        {unmatched.length === 0 && <p className="mt-3 text-sm text-slate-500">None right now.</p>}
        <ul className="mt-3 space-y-2">
          {unmatched.map((u) => {
            const job = u.jobNumbers[0]
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-20 font-semibold text-slate-900">Job {job}</span>
                <input className={cx(input, 'min-w-[200px] flex-1')} placeholder="Street, city, state" value={places[job] ?? ''} onChange={(e) => setPlaces({ ...places, [job]: e.target.value })} />
                <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50" disabled={p.pending || !(places[job] ?? '').trim()}
                  onClick={() => p.act(() => setJobPlace({ jobNumber: job, address: places[job] }), `Job ${job} located. Run the audit again to use it.`)}>Save address</button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className={box}>
        <h2 className="text-sm font-bold text-slate-900">Local audit worker</h2>
        <p className="mt-1 text-xs text-slate-500">
          The worker runs on your Windows computer in its own Chrome profile. It signs each request with the key below; it never sends Kalos passwords or cookies here.
          Setup steps are in scripts/payroll-audit-worker/README.md.
        </p>
        <p className="mt-2 text-sm text-slate-700">
          Status: {s.workerOnline ? 'online' : 'offline'}{s.workerLastSeen ? `, last seen ${when(s.workerLastSeen)}` : ', never connected'}.
        </p>
        <div className="mt-3 flex gap-2">
          <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700" onClick={() => void reveal(false)}>Show worker key</button>
          <button className="rounded-md border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700"
            onClick={() => { if (window.confirm('Rotate the worker key? The current worker stops working until you update its key.')) void reveal(true) }}>Rotate key</button>
        </div>
        {keyErr && <p className="mt-2 text-xs text-rose-700">{keyErr}</p>}
        {key && (
          <pre className="mt-3 overflow-x-auto rounded-md bg-slate-900 p-3 text-xs leading-5 text-slate-100">{`PHASEFORGE_URL=${typeof window !== 'undefined' ? window.location.origin : ''}
PAYROLL_AUDIT_COMPANY_ID=${key.companyId}
PAYROLL_AUDIT_WORKER_KEY=${key.key}`}</pre>
        )}
      </section>
    </div>
  )
}
