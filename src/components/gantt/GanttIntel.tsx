'use client'

// Schedule intelligence for the Gantt: baseline data + CPM analysis loading,
// the move-impact dialog, the lookahead view, and the baseline comparison.
// The math itself lives in src/lib/schedule/engine.ts — this file is the
// glue and the chrome.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowRight, CalendarRange, GitBranch, Printer, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/dates'
import { Button } from '@/components/ui/Button'
import {
  analyzeSchedule, buildLookahead, compareToBaseline, computeMoveImpact,
  type MoveImpact, type ScheduleAnalysis, type ScheduleDependency,
} from '@/lib/schedule/engine'
import { SCHEDULE_CHANGE_REASONS } from '@/lib/activity/log'
import type { Phase, Project } from '@/types/app'

export interface BaselineData {
  id: string
  createdAt: string
  phases: Map<string, { start: string; end: string; name: string }>
}

export interface GanttIntelState {
  deps: ScheduleDependency[]
  depsByProject: Map<string, ScheduleDependency[]>
  baselines: Map<string, BaselineData>          // projectId -> baseline
  analyses: Map<string, ScheduleAnalysis | { ok: false; cycleIds: string[] }>
  reload: () => void
}

/** Loads dependencies + active baselines for the projects on the chart. */
export function useGanttIntel(projects: Project[]): GanttIntelState {
  const [deps, setDeps] = useState<ScheduleDependency[]>([])
  const [baselines, setBaselines] = useState<Map<string, BaselineData>>(new Map())
  const [tick, setTick] = useState(0)

  const projectIds = useMemo(() => projects.map((p) => p.id).sort().join(','), [projects])

  useEffect(() => {
    if (!projectIds) return
    const supabase = createClient()
    const ids = projectIds.split(',')
    let cancelled = false
    void (async () => {
      const phaseIds = projects.flatMap((p) => (p.phases ?? []).map((ph) => ph.id))
      const [depsRes, baseRes] = await Promise.all([
        phaseIds.length
          ? supabase.from('phase_dependencies')
              .select('id, phase_id, depends_on_id, type, lag_days').in('phase_id', phaseIds)
          : Promise.resolve({ data: [] }),
        supabase.from('schedule_baselines')
          .select('id, project_id, created_at').in('project_id', ids).eq('is_active', true),
      ])
      if (cancelled) return
      setDeps((depsRes.data ?? []) as ScheduleDependency[])

      const baseRows = baseRes.data ?? []
      if (baseRows.length) {
        const { data: basePhases } = await supabase.from('schedule_baseline_phases')
          .select('baseline_id, phase_id, name, start_date, end_date')
          .in('baseline_id', baseRows.map((b) => b.id))
        if (cancelled) return
        const map = new Map<string, BaselineData>()
        for (const b of baseRows) {
          map.set(b.project_id, {
            id: b.id, createdAt: b.created_at,
            phases: new Map((basePhases ?? [])
              .filter((bp) => bp.baseline_id === b.id)
              .map((bp) => [bp.phase_id, { start: bp.start_date, end: bp.end_date, name: bp.name }])),
          })
        }
        setBaselines(map)
      } else {
        setBaselines(new Map())
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIds, tick])

  const depsByProject = useMemo(() => {
    const phaseProject = new Map<string, string>()
    for (const p of projects) for (const ph of p.phases ?? []) phaseProject.set(ph.id, p.id)
    const map = new Map<string, ScheduleDependency[]>()
    for (const d of deps) {
      const pid = phaseProject.get(d.phase_id)
      if (pid) map.set(pid, [...(map.get(pid) ?? []), d])
    }
    return map
  }, [deps, projects])

  const analyses = useMemo(() => {
    const map = new Map<string, ScheduleAnalysis | { ok: false; cycleIds: string[] }>()
    for (const p of projects) {
      const phases = (p.phases ?? [])
        .filter((ph) => ph.start_date && ph.end_date)
        .map((ph) => ({ id: ph.id, name: ph.name, start_date: ph.start_date, end_date: ph.end_date, is_milestone: ph.is_milestone, status: ph.status }))
      map.set(p.id, analyzeSchedule(phases, depsByProject.get(p.id) ?? []))
    }
    return map
  }, [projects, depsByProject])

  return { deps, depsByProject, baselines, analyses, reload: () => setTick((t) => t + 1) }
}

export function impactForMove(
  project: Project,
  deps: ScheduleDependency[],
  phaseId: string,
  deltaDays: number,
): MoveImpact {
  const phases = (project.phases ?? [])
    .filter((ph) => ph.start_date && ph.end_date)
    .map((ph) => ({ id: ph.id, name: ph.name, start_date: ph.start_date, end_date: ph.end_date }))
  return computeMoveImpact(phases, deps, phaseId, deltaDays)
}

/* ── Move impact dialog ─────────────────────────────────────────────────────
   Shown before a drag is committed when the move is large enough to want a
   reason, or when dependencies would push other phases. Cancel reverts. */

export interface PendingMove {
  phase: Phase
  projectId: string
  kind: 'move' | 'resize'
  deltaDays: number
  from: { start: string; end: string }
  to: { start: string; end: string }
  impact: MoveImpact
  askReason: boolean
}

export function MoveImpactDialog({ pending, onApply, onCancel }: {
  pending: PendingMove
  onApply: (reason: string | null, applyDownstream: boolean) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState<string>('')
  const [note, setNote] = useState('')
  const [applyDownstream, setApplyDownstream] = useState(true)
  const { impact } = pending
  const dir = pending.deltaDays > 0 ? 'later' : 'earlier'
  const magnitude = Math.abs(pending.deltaDays)

  const finalReason = reason === 'Other' ? (note.trim() || 'Other') : reason || null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <h3 className="text-sm font-bold text-slate-900">
          {pending.kind === 'move'
            ? <>Move &ldquo;{pending.phase.name}&rdquo; {magnitude} day{magnitude === 1 ? '' : 's'} {dir}?</>
            : <>Change &ldquo;{pending.phase.name}&rdquo; duration?</>}
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          {formatDate(pending.from.start, 'MMM d')}–{formatDate(pending.from.end, 'MMM d')}
          <ArrowRight size={11} className="mx-1 inline text-slate-400" />
          {formatDate(pending.to.start, 'MMM d')}–{formatDate(pending.to.end, 'MMM d')}
        </p>

        {impact.affected.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-800">
              This pushes {impact.affected.length} downstream {impact.affected.length === 1 ? 'phase' : 'phases'}
              {impact.completionDeltaDays > 0 && <> and moves completion {impact.completionDeltaDays} day{impact.completionDeltaDays === 1 ? '' : 's'}</>}.
            </p>
            <ul className="mt-1.5 max-h-28 space-y-0.5 overflow-y-auto text-[11px] text-amber-700">
              {impact.affected.slice(0, 8).map((a) => (
                <li key={a.id}>{a.name}: +{a.deltaDays}d → {formatDate(a.newStart, 'MMM d')}–{formatDate(a.newEnd, 'MMM d')}</li>
              ))}
              {impact.affected.length > 8 && <li>…and {impact.affected.length - 8} more</li>}
            </ul>
            <label className="mt-2 flex items-center gap-2 text-[11px] font-medium text-amber-800">
              <input type="checkbox" checked={applyDownstream} onChange={(e) => setApplyDownstream(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-amber-300" />
              Move the downstream phases with it
            </label>
          </div>
        )}
        {impact.affected.length === 0 && impact.completionDeltaDays === 0 && pending.kind === 'move' && (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            No downstream phases are affected — the slack absorbs it.
          </p>
        )}

        {pending.askReason && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-semibold text-slate-700">Reason for the change</p>
            <div className="flex flex-wrap gap-1.5">
              {SCHEDULE_CHANGE_REASONS.map((r) => (
                <button key={r} onClick={() => setReason(reason === r ? '' : r)}
                  className={cn('rounded-full border px-2.5 py-1 text-[11px] font-medium transition',
                    reason === r ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 text-slate-600 hover:border-indigo-300')}>
                  {r}
                </button>
              ))}
            </div>
            {reason === 'Other' && (
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened?"
                className="mt-2 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400" />
            )}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => onApply(finalReason, applyDownstream)}>
            Apply change
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}

/* ── Lookahead ──────────────────────────────────────────────────────────── */

export function LookaheadModal({ projects, depsByProject, onClose }: {
  projects: Project[]
  depsByProject: Map<string, ScheduleDependency[]>
  onClose: () => void
}) {
  const [weeks, setWeeks] = useState<2 | 3 | 6>(2)
  const [today] = useState(() => new Date().toISOString().slice(0, 10))

  const sections = useMemo(() => projects.map((p) => ({
    project: p,
    rows: buildLookahead(
      (p.phases ?? []).filter((ph) => ph.start_date && ph.end_date)
        .map((ph) => ({ id: ph.id, name: ph.name, start_date: ph.start_date, end_date: ph.end_date, status: ph.status, is_milestone: ph.is_milestone })),
      depsByProject.get(p.id) ?? [],
      today, weeks,
    ),
  })).filter((s) => s.rows.length > 0), [projects, depsByProject, weeks, today])

  const assignees = useMemo(() => {
    const map = new Map<string, Phase>()
    for (const p of projects) for (const ph of p.phases ?? []) map.set(ph.id, ph)
    return map
  }, [projects])

  const STATE_LABEL = { in_progress: 'Runs', starting: 'Starts', finishing: 'Finishes', spanning: 'Continues' }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 print:static print:block print:p-0">
      <div className="absolute inset-0 bg-slate-900/30 print:hidden" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl print:max-h-none print:rounded-none print:border-0 print:shadow-none">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 print:border-black">
          <div className="flex items-center gap-3">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
              <CalendarRange size={16} className="text-slate-400 print:hidden" />
              {weeks}-week lookahead
            </h3>
            <span className="text-xs text-slate-400">
              {formatDate(today, 'MMM d')} – {formatDate(new Date(new Date(today).getTime() + (weeks * 7 - 1) * 86400000).toISOString().slice(0, 10), 'MMM d')}
            </span>
          </div>
          <div className="flex items-center gap-1.5 print:hidden">
            <div className="flex rounded-lg bg-slate-100 p-0.5">
              {([2, 3, 6] as const).map((w) => (
                <button key={w} onClick={() => setWeeks(w)}
                  className={cn('rounded-md px-2.5 py-1 text-xs font-semibold',
                    weeks === w ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>
                  {w} wk
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => window.print()}><Printer size={14} /> Print</Button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 print:overflow-visible">
          {sections.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-400">
              Nothing scheduled in the next {weeks} weeks.
            </p>
          )}
          {sections.map(({ project, rows }) => (
            <div key={project.id} className="mb-5 last:mb-0 print:break-inside-avoid">
              {projects.length > 1 && (
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">{project.name}</p>
              )}
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400 print:border-black">
                    <th className="py-1.5 pr-2 font-semibold">Activity</th>
                    <th className="w-20 py-1.5 pr-2 font-semibold">Dates</th>
                    <th className="w-16 py-1.5 pr-2 font-semibold">State</th>
                    <th className="w-24 py-1.5 pr-2 font-semibold">Trade / crew</th>
                    <th className="w-12 py-1.5 font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const full = assignees.get(r.phase.id)
                    return (
                      <tr key={r.phase.id} className="border-b border-slate-100 print:border-slate-300">
                        <td className="py-1.5 pr-2">
                          <span className="font-medium text-slate-800">{r.phase.name}</span>
                          {r.blockedBy.length > 0 && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-700">
                              <AlertTriangle size={9} /> after {r.blockedBy.map((b) => b.name).join(', ')}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 tabular-nums text-slate-500">
                          {formatDate(r.phase.start_date, 'M/d')}–{formatDate(r.phase.end_date, 'M/d')}
                        </td>
                        <td className="py-1.5 pr-2 text-slate-500">{STATE_LABEL[r.state]}</td>
                        <td className="truncate py-1.5 pr-2 text-slate-500">{full?.assigned_trade ?? '—'}</td>
                        <td className="py-1.5 tabular-nums text-slate-500">{full?.percent_complete ?? 0}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Baseline comparison ────────────────────────────────────────────────── */

export function BaselineCompareModal({ project, baseline, onClose }: {
  project: Project
  baseline: BaselineData
  onClose: () => void
}) {
  const comparison = useMemo(() => compareToBaseline(
    (project.phases ?? []).filter((ph) => ph.start_date && ph.end_date)
      .map((ph) => ({ id: ph.id, name: ph.name, start_date: ph.start_date, end_date: ph.end_date })),
    [...baseline.phases.entries()].map(([phase_id, b]) => ({ phase_id, name: b.name, start_date: b.start, end_date: b.end })),
  ), [project, baseline])

  const KIND_LABEL = {
    moved_later: 'moved later', moved_earlier: 'moved earlier',
    extended: 'extended', shortened: 'shortened', unchanged: '',
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <GitBranch size={16} className="text-slate-400" /> Since the baseline
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
            <span className="text-slate-500">Baseline {formatDate(baseline.createdAt, 'MMM d, yyyy')}</span>
            <span className="font-semibold text-slate-700">
              {comparison.baselineCompletion ? formatDate(comparison.baselineCompletion, 'MMM d') : '—'}
              <ArrowRight size={11} className="mx-1 inline text-slate-400" />
              {comparison.currentCompletion ? formatDate(comparison.currentCompletion, 'MMM d') : '—'}
            </span>
            <span className={cn('rounded px-1.5 py-0.5 font-bold',
              comparison.completionVarianceDays > 0 ? 'bg-rose-50 text-rose-600'
                : comparison.completionVarianceDays < 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500')}>
              {comparison.completionVarianceDays > 0 ? '+' : ''}{comparison.completionVarianceDays} days
            </span>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            {comparison.phaseVariances.length} changed · {comparison.movedLater} later · {comparison.movedEarlier} earlier ·{' '}
            {comparison.durationChanges} duration · {comparison.added.length} added · {comparison.removed.length} removed
          </p>
          {comparison.phaseVariances.length === 0 && comparison.added.length === 0 && comparison.removed.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">The schedule matches the baseline exactly.</p>
          )}
          <div className="space-y-1">
            {comparison.phaseVariances.map((v) => (
              <div key={v.phaseId} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{v.name}</span>
                <span className="text-slate-500">{KIND_LABEL[v.kind]}</span>
                <span className={cn('w-12 text-right font-semibold tabular-nums',
                  v.finishVarianceDays > 0 ? 'text-rose-600' : v.finishVarianceDays < 0 ? 'text-emerald-600' : 'text-slate-500')}>
                  {v.finishVarianceDays > 0 ? '+' : ''}{v.finishVarianceDays}d
                </span>
              </div>
            ))}
            {comparison.added.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-lg bg-indigo-50/60 px-3 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{a.name}</span>
                <span className="font-semibold text-indigo-600">added</span>
              </div>
            ))}
            {comparison.removed.map((r) => (
              <div key={r.phase_id} className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium text-slate-500 line-through">{r.name}</span>
                <span className="font-semibold text-slate-400">removed</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Small toolbar chip: projected completion vs plan ───────────────────── */

export function CompletionChip({ project, baseline }: { project: Project; baseline: BaselineData | null }) {
  const completion = useMemo(() => (project.phases ?? []).reduce<string | null>((max, p) =>
    p.end_date && (!max || p.end_date > max) ? p.end_date : max, null), [project])
  const baseEnd = useMemo(() => {
    if (!baseline) return null
    let max: string | null = null
    for (const [, b] of baseline.phases) if (!max || b.end > max) max = b.end
    return max
  }, [baseline])
  if (!completion) return null
  const ref = baseEnd ?? project.end_date
  const variance = ref ? Math.round((new Date(completion).getTime() - new Date(ref).getTime()) / 86400000) : 0
  return (
    <div className="hidden items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs lg:flex" title={baseEnd ? 'Scheduled completion vs baseline' : 'Scheduled completion vs planned end'}>
      <span className="text-slate-400">Completion</span>
      <span className="font-semibold text-slate-700">{formatDate(completion, 'MMM d')}</span>
      {variance !== 0 && (
        <span className={cn('font-bold', variance > 0 ? 'text-rose-600' : 'text-emerald-600')}>
          {variance > 0 ? '+' : ''}{variance}d
        </span>
      )}
    </div>
  )
}

export function useMoveGate() {
  const [pending, setPending] = useState<PendingMove | null>(null)
  const clear = useCallback(() => setPending(null), [])
  return { pending, setPending, clear }
}
