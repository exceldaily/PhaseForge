'use client'

// The project Overview tab: what needs attention, why, and what is coming,
// before anyone opens a single sub-page. Everything here is deterministic
// data from the shared health and schedule engines — the "Why?" panel prints
// the actual deductions, never a vague summary.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, Activity as ActivityIcon, ArrowRight, CalendarClock,
  ChevronDown, ClipboardList, FileDiff, Flag, GitBranch, HelpCircle, Target,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/dates'
import { PROJECT_HEALTH_META } from '@/lib/projectBoard'
import type { CommandCenterData } from '@/lib/commandCenter'
import type { ActivityLog, Profile, Project } from '@/types/app'
import type { AttentionItem } from '@/lib/projectHealth'

type ShellTab = 'overview' | 'gantt' | 'tasks' | 'punch' | 'activity' | 'files'

interface CommandCenterProps {
  project: Project
  data: CommandCenterData
  members: Profile[]
  activityLogs: ActivityLog[]
  onNavigate: (tab: ShellTab) => void
}

const SEVERITY_META: Record<AttentionItem['severity'], { dot: string; row: string }> = {
  critical: { dot: 'bg-rose-500', row: 'border-rose-100 bg-rose-50/60' },
  warning:  { dot: 'bg-amber-500', row: 'border-amber-100 bg-amber-50/60' },
  info:     { dot: 'bg-slate-400', row: 'border-slate-200 bg-white' },
}

function componentTone(score: number): string {
  if (score >= 80) return 'text-emerald-600'
  if (score >= 60) return 'text-amber-600'
  return 'text-rose-600'
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(iso, 'MMM d')
}

export function CommandCenter({ project, data, members, activityLogs, onNavigate }: CommandCenterProps) {
  const [showWhy, setShowWhy] = useState(false)
  const [horizon, setHorizon] = useState<7 | 14 | 30>(14)

  const { intel, baseline, variance, schedule, upcoming } = data
  const health = intel.health
  const facts = intel.facts
  const meta = PROJECT_HEALTH_META[health.level]
  const memberMap = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m.full_name])), [members])

  const pmName = project.project_manager ? (memberMap[project.project_manager] ?? project.project_manager) : null
  const superName = project.superintendent ?? null

  const horizonEnd = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + horizon)
    return d.toISOString().slice(0, 10)
  }, [horizon])
  const visibleUpcoming = upcoming.filter((u) => u.date <= horizonEnd)

  const slip = facts.slipDays
  const planEnd = facts.baselineEnd ?? project.end_date

  const attentionTargets: Record<AttentionItem['target'], () => void> = {
    'gantt': () => onNavigate('gantt'),
    'tasks': () => onNavigate('tasks'),
    'punch': () => onNavigate('punch'),
    'activity': () => onNavigate('activity'),
    'overview': () => {},
    'change-orders': () => { window.location.href = `/app/projects/${project.id}/change-orders` },
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-5">

      {/* ── Header facts ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {project.job_number ? `Job ${project.job_number}` : 'Project'}
              {project.customer_name ? ` · ${project.customer_name}` : ''}
            </p>
            <h2 className="mt-0.5 truncate text-lg font-bold text-slate-900">{project.name}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {[pmName && `PM ${pmName}`, superName && `Super ${superName}`].filter(Boolean).join(' · ') || 'No PM assigned'}
            </p>
          </div>
          <div className="flex items-center gap-3 text-right">
            <div>
              <p className="text-[11px] font-medium text-slate-400">Completion</p>
              <p className="text-xl font-bold text-slate-900">{facts.progressPercent}%</p>
            </div>
            <div className={cn('rounded-xl border px-3 py-2 text-center', meta.pillClassName)}>
              <p className="text-xl font-bold leading-none">{health.score}</p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide">{meta.label}</p>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-slate-100 pt-3 text-xs sm:grid-cols-4">
          <div>
            <p className="text-slate-400">{baseline ? 'Baseline start' : 'Planned start'}</p>
            <p className="font-semibold text-slate-700">
              {formatDate((baseline?.projectStart ?? project.start_date) || project.start_date, 'MMM d, yyyy')}
            </p>
          </div>
          <div>
            <p className="text-slate-400">{baseline ? 'Baseline finish' : 'Planned finish'}</p>
            <p className="font-semibold text-slate-700">{planEnd ? formatDate(planEnd, 'MMM d, yyyy') : '—'}</p>
          </div>
          <div>
            <p className="text-slate-400">Scheduled completion</p>
            <p className="font-semibold text-slate-700">
              {facts.scheduledCompletion ? formatDate(facts.scheduledCompletion, 'MMM d, yyyy') : '—'}
            </p>
          </div>
          <div>
            <p className="text-slate-400">Schedule position</p>
            <p className={cn('font-semibold', slip > 0 ? 'text-rose-600' : 'text-emerald-600')}>
              {slip > 0 ? `${slip} day${slip === 1 ? '' : 's'} behind` : 'On plan'}
              {facts.lastActivityAt && <span className="ml-2 font-normal text-slate-400">updated {relTime(facts.lastActivityAt)}</span>}
            </p>
          </div>
        </div>

        {schedule.cycleIds && (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            The schedule contains a circular dependency, so the critical path cannot be calculated.
            Review the dependencies on the affected phases in the Gantt.
          </p>
        )}
      </section>

      {/* ── Health breakdown + why ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Project health</h3>
          {health.reasons.length > 0 && (
            <button onClick={() => setShowWhy((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
              <HelpCircle size={13} />
              {showWhy ? 'Hide the reasons' : `Why is this project ${meta.label.toLowerCase()}?`}
              <ChevronDown size={13} className={cn('transition-transform', showWhy && 'rotate-180')} />
            </button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {health.components.map((c) => (
            <div key={c.key} className="rounded-lg border border-slate-100 px-3 py-2">
              <p className="text-[11px] text-slate-400">{c.label}</p>
              <p className={cn('text-lg font-bold', componentTone(c.score))}>{c.score}</p>
            </div>
          ))}
        </div>
        {showWhy && (
          <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
            {health.reasons.map((r) => (
              <li key={r} className="flex gap-2 text-xs text-slate-600">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />{r}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Needs attention ── */}
      {health.attention.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <AlertTriangle size={15} className="text-amber-500" /> Needs attention
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
              {health.attention.length}
            </span>
          </h3>
          <div className="mt-3 space-y-1.5">
            {health.attention.map((a, i) => (
              <button key={i} onClick={attentionTargets[a.target]}
                className={cn('flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition hover:border-slate-300', SEVERITY_META[a.severity].row)}>
                <span className={cn('h-2 w-2 shrink-0 rounded-full', SEVERITY_META[a.severity].dot)} />
                <span className="flex-1 font-medium text-slate-700">{a.text}</span>
                <ArrowRight size={13} className="shrink-0 text-slate-400" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Metric cards ── */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          icon={<CalendarClock size={14} />}
          title="Schedule"
          onClick={() => onNavigate('gantt')}
          rows={[
            [slip > 0 ? `${slip}d behind` : 'On plan', slip > 0 ? 'bad' : 'good'],
            [`${facts.overduePhases} overdue`, facts.overduePhases > 0 ? 'bad' : 'muted'],
            [`${schedule.criticalCount} critical`, 'muted'],
          ]}
        />
        <MetricCard
          icon={<Target size={14} />}
          title="Progress"
          onClick={() => onNavigate('tasks')}
          rows={[
            [`${facts.completedPhases} / ${facts.totalPhases} phases`, 'plain'],
            [`${facts.progressPercent}% complete`, 'plain'],
            facts.blockedPhases > 0 ? [`${facts.blockedPhases} blocked`, 'bad'] : ['No blockers', 'muted'],
          ]}
        />
        <MetricCard
          icon={<FileDiff size={14} />}
          title="Change orders"
          href={`/app/projects/${project.id}/change-orders`}
          rows={[
            [`${facts.openCoCount} open`, facts.openCoCount > 0 ? 'plain' : 'muted'],
            [facts.pendingCoValue > 0 ? `${fmtMoney(facts.pendingCoValue)} pending` : 'Nothing pending', 'muted'],
            [facts.approvedCoValue > 0 ? `${fmtMoney(facts.approvedCoValue)} approved` : '—', 'muted'],
          ]}
        />
        <MetricCard
          icon={<ClipboardList size={14} />}
          title="Punch list"
          onClick={() => onNavigate('punch')}
          rows={[
            [`${facts.openPunchCount} open`, facts.openPunchCount > 0 ? 'plain' : 'muted'],
            [`${facts.overduePunchCount} overdue`, facts.overduePunchCount > 0 ? 'bad' : 'muted'],
            ['', 'muted'],
          ]}
        />
      </section>

      {/* ── Baseline variance ── */}
      {variance && baseline ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <GitBranch size={15} className="text-slate-400" /> Against the baseline
            </h3>
            <span className="text-[11px] text-slate-400">set {formatDate(baseline.createdAt, 'MMM d, yyyy')}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            <div>
              <p className="text-slate-400">Baseline finish</p>
              <p className="font-semibold text-slate-700">{variance.baselineCompletion ? formatDate(variance.baselineCompletion, 'MMM d') : '—'}</p>
            </div>
            <ArrowRight size={14} className="text-slate-300" />
            <div>
              <p className="text-slate-400">Now scheduled</p>
              <p className="font-semibold text-slate-700">{variance.currentCompletion ? formatDate(variance.currentCompletion, 'MMM d') : '—'}</p>
            </div>
            <div className={cn('rounded-lg px-2.5 py-1 font-bold',
              variance.completionVarianceDays > 0 ? 'bg-rose-50 text-rose-600'
                : variance.completionVarianceDays < 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600')}>
              {variance.completionVarianceDays > 0 ? '+' : ''}{variance.completionVarianceDays} days
            </div>
            <p className="text-slate-500">
              {variance.phaseVariances.length} changed · {variance.movedLater} later · {variance.movedEarlier} earlier ·{' '}
              {variance.durationChanges} duration · {variance.added.length} added · {variance.removed.length} removed
            </p>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 text-center">
          <p className="text-sm font-medium text-slate-600">No schedule baseline yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">
            A baseline freezes today&apos;s schedule so every future change can be measured against
            the original plan. Set one from the Gantt toolbar once the schedule is agreed.
          </p>
          <button onClick={() => onNavigate('gantt')}
            className="mt-2 text-xs font-semibold text-indigo-600 hover:underline">Open the Gantt</button>
        </section>
      )}

      {/* ── Upcoming + recent activity ── */}
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <Flag size={15} className="text-slate-400" /> Upcoming
            </h3>
            <div className="flex rounded-lg bg-slate-100 p-0.5">
              {([7, 14, 30] as const).map((h) => (
                <button key={h} onClick={() => setHorizon(h)}
                  className={cn('rounded-md px-2 py-0.5 text-[11px] font-semibold',
                    horizon === h ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>
                  {h}d
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 space-y-1">
            {visibleUpcoming.length === 0 && (
              <p className="py-4 text-center text-xs text-slate-400">Nothing scheduled in the next {horizon} days.</p>
            )}
            {visibleUpcoming.slice(0, 10).map((u, i) => (
              <button key={i} onClick={() => onNavigate(u.target)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-slate-50">
                <span className={cn('w-14 shrink-0 font-semibold',
                  u.kind === 'milestone' ? 'text-indigo-600' : 'text-slate-500')}>
                  {formatDate(u.date, 'MMM d')}
                </span>
                <span className="flex-1 truncate text-slate-700">{u.label}</span>
                {u.kind === 'milestone' && <Flag size={11} className="shrink-0 text-indigo-500" />}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <ActivityIcon size={15} className="text-slate-400" /> Recent activity
            </h3>
            <button onClick={() => onNavigate('activity')}
              className="text-xs font-medium text-indigo-600 hover:underline">View all</button>
          </div>
          <div className="mt-3 space-y-2">
            {activityLogs.length === 0 && (
              <p className="py-4 text-center text-xs text-slate-400">No recorded activity yet.</p>
            )}
            {activityLogs.slice(0, 6).map((log) => (
              <RecentActivityRow key={log.id} log={log} memberMap={memberMap} />
            ))}
          </div>
        </div>
      </section>

      {/* Quick links to the full modules */}
      <div className="flex flex-wrap gap-2 pb-2 text-xs">
        <Link href={`/app/projects/${project.id}/plans`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:border-indigo-300">Plans</Link>
        <Link href={`/app/projects/${project.id}/change-orders`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:border-indigo-300">Change orders</Link>
      </div>
    </div>
  )
}

function MetricCard({ icon, title, rows, onClick, href }: {
  icon: React.ReactNode
  title: string
  rows: [string, 'good' | 'bad' | 'plain' | 'muted'][]
  onClick?: () => void
  href?: string
}) {
  const tone = { good: 'text-emerald-600 font-semibold', bad: 'text-rose-600 font-semibold', plain: 'text-slate-700 font-semibold', muted: 'text-slate-400' }
  const body = (
    <>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {icon}{title}
      </p>
      <div className="mt-2 space-y-1 text-xs">
        {rows.filter(([label]) => label).map(([label, t], i) => (
          <p key={i} className={tone[t]}>{label}</p>
        ))}
      </div>
    </>
  )
  const cls = 'rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-indigo-200'
  if (href) return <Link href={href} className={cls}>{body}</Link>
  return <button onClick={onClick} className={cls}>{body}</button>
}

/** One compact line of the timeline preview, in plain language. */
function RecentActivityRow({ log, memberMap }: { log: ActivityLog; memberMap: Record<string, string> }) {
  const who = (log.actor_id && memberMap[log.actor_id]) || 'Someone'
  const label = (log as { entity_label?: string | null }).entity_label
  const reason = (log as { reason?: string | null }).reason

  const VERBS: Record<string, string> = {
    project_created: 'created this project',
    project_updated: 'updated the project',
    phase_created: `added ${label ?? 'a phase'}`,
    phase_updated: `updated ${label ?? 'a phase'}`,
    phase_deleted: `removed ${label ?? 'a phase'}`,
    phase_moved: `moved ${label ?? 'a phase'}`,
    phase_resized: `changed the duration of ${label ?? 'a phase'}`,
    phase_progress: `updated progress on ${label ?? 'a phase'}`,
    baseline_set: 'set the schedule baseline',
    baseline_replaced: 'set a new schedule baseline',
    dependency_added: `linked a predecessor to ${label ?? 'a phase'}`,
    dependency_removed: 'removed a dependency',
    punch_created: `logged punch item ${label ?? ''}`.trim(),
    punch_completed: `completed punch item ${label ?? ''}`.trim(),
    link_created: 'linked two items',
    file_uploaded: `uploaded ${label ?? 'a file'}`,
  }
  const verb = VERBS[log.action] ?? log.action.replace(/_/g, ' ')

  // Date moves show the from -> to window when the payload carries one.
  const payload = log.payload as Record<string, { from?: unknown; to?: unknown }> | null
  const dates = payload?.start_date && payload?.end_date
    ? `${formatDate(String(payload.start_date.from), 'MMM d')}–${formatDate(String(payload.end_date.from), 'MMM d')} → ${formatDate(String(payload.start_date.to), 'MMM d')}–${formatDate(String(payload.end_date.to), 'MMM d')}`
    : null

  return (
    <div className="flex gap-2.5 text-xs">
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
      <div className="min-w-0">
        <p className="text-slate-700">
          <span className="font-semibold">{who}</span> {verb}
          <span className="ml-1.5 text-slate-400">{relTime(log.created_at)}</span>
        </p>
        {dates && <p className="text-slate-500">{dates}</p>}
        {reason && <p className="text-slate-400">Reason: {reason}</p>}
      </div>
    </div>
  )
}
