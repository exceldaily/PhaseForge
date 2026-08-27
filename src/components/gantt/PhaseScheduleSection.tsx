'use client'

// The schedule-intelligence block inside the phase edit panel: float and
// criticality, baseline variance, predecessors (add/remove), and the phase's
// own schedule history off the universal timeline.

import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, GitBranch, History, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { differenceInDays, formatDate, parseISO } from '@/lib/dates'
import {
  addDependency, getPhaseHistory, removeDependency,
} from '@/app/app/projects/[id]/intelActions'
import type { Phase } from '@/types/app'
import type { ScheduleDependency } from '@/lib/schedule/engine'
import { RelatedItems } from '@/components/links/RelatedItems'

export interface PhaseScheduleIntel {
  allPhases: Phase[]
  deps: ScheduleDependency[]
  float: number | null
  isCritical: boolean
  baseline: { start: string; end: string } | null
  onDepsChanged: () => void
}

interface PhaseScheduleSectionProps {
  phase: Phase
  projectId: string
  allPhases: Phase[]
  deps: ScheduleDependency[]
  /** From the CPM analysis; null when a cycle blocks the math. */
  float: number | null
  isCritical: boolean
  baseline: { start: string; end: string } | null
  canEdit: boolean
  onDepsChanged: () => void
}

const DEP_LABEL = { finish_to_start: 'FS', start_to_start: 'SS', finish_to_finish: 'FF' }

export function PhaseScheduleSection({
  phase, projectId, allPhases, deps, float, isCritical, baseline, canEdit, onDepsChanged,
}: PhaseScheduleSectionProps) {
  const [adding, setAdding] = useState(false)
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<Awaited<ReturnType<typeof getPhaseHistory>> | null>(null)

  const phaseNames = useMemo(() => new Map(allPhases.map((p) => [p.id, p.name])), [allPhases])
  const myPreds = deps.filter((d) => d.phase_id === phase.id)
  const mySuccs = deps.filter((d) => d.depends_on_id === phase.id)

  // Candidates: phases in this project that are not already predecessors and
  // not the phase itself. The server re-checks for cycles.
  const candidates = allPhases.filter((p) =>
    p.id !== phase.id && !myPreds.some((d) => d.depends_on_id === p.id))

  useEffect(() => {
    if (!showHistory || history) return
    void getPhaseHistory(phase.id).then(setHistory)
  }, [showHistory, history, phase.id])

  const startVar = baseline ? differenceInDays(parseISO(phase.start_date), parseISO(baseline.start)) : null
  const finishVar = baseline ? differenceInDays(parseISO(phase.end_date), parseISO(baseline.end)) : null

  const add = async () => {
    if (!pick) return
    setBusy(true); setError(null)
    const res = await addDependency({ projectId, phaseId: phase.id, dependsOnId: pick })
    setBusy(false)
    if (!res.ok) { setError(res.error ?? 'Could not add that.'); return }
    setPick(''); setAdding(false)
    onDepsChanged()
  }

  return (
    <div className="border-t border-slate-100 pt-4">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <GitBranch size={13} className="text-slate-400" /> Schedule
      </p>

      {/* Float / critical */}
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {isCritical ? (
          <span className="rounded-full bg-rose-50 px-2.5 py-1 font-semibold text-rose-600">
            Critical — 0 days float
          </span>
        ) : float !== null ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
            Total float: {float} day{float === 1 ? '' : 's'}
          </span>
        ) : null}
        {baseline && (startVar !== 0 || finishVar !== 0) && (
          <span className={cn('rounded-full px-2.5 py-1 font-medium',
            (finishVar ?? 0) > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600')}>
            vs baseline: start {startVar! > 0 ? '+' : ''}{startVar}d · finish {finishVar! > 0 ? '+' : ''}{finishVar}d
          </span>
        )}
      </div>

      {/* Predecessors */}
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[11px] font-medium text-slate-500">Predecessors</p>
        {canEdit && !adding && (
          <button onClick={() => setAdding(true)}
            className="inline-flex items-center gap-0.5 text-[11px] font-medium text-indigo-600 hover:underline">
            <Plus size={11} /> Add
          </button>
        )}
      </div>
      {myPreds.length === 0 && !adding && (
        <p className="text-[11px] text-slate-400">None — this phase can start any time.</p>
      )}
      <div className="space-y-1">
        {myPreds.map((d) => (
          <div key={d.id ?? d.depends_on_id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate text-slate-700">{phaseNames.get(d.depends_on_id) ?? 'Deleted phase'}</span>
            <span className="text-[10px] font-semibold text-slate-400">{DEP_LABEL[d.type] ?? d.type}{d.lag_days ? ` +${d.lag_days}d` : ''}</span>
            {canEdit && (
              <button
                onClick={async () => {
                  if (!d.id) return
                  await removeDependency({ projectId, dependencyId: d.id, phaseName: phase.name })
                  onDepsChanged()
                }}
                aria-label="Remove dependency"
                className="p-0.5 text-slate-300 hover:text-rose-500"><Trash2 size={12} /></button>
            )}
          </div>
        ))}
      </div>
      {adding && (
        <div className="mt-1.5 flex gap-1.5">
          <select value={pick} onChange={(e) => setPick(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-indigo-400">
            <option value="">Must finish before this starts…</option>
            {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={add} disabled={!pick || busy}
            className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50">Add</button>
          <button onClick={() => { setAdding(false); setError(null) }}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-500">Cancel</button>
        </div>
      )}
      {error && <p className="mt-1 text-[11px] font-medium text-rose-600">{error}</p>}
      {mySuccs.length > 0 && (
        <p className="mt-1.5 text-[11px] text-slate-400">
          Blocks: {mySuccs.map((d) => phaseNames.get(d.phase_id) ?? '?').join(', ')}
        </p>
      )}

      {/* Schedule history */}
      <button onClick={() => setShowHistory((v) => !v)}
        className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline">
        <History size={11} /> {showHistory ? 'Hide schedule history' : 'Schedule history'}
      </button>
      {showHistory && (
        <div className="mt-2 space-y-2">
          {history === null && <p className="text-[11px] text-slate-400">Loading…</p>}
          {history?.length === 0 && <p className="text-[11px] text-slate-400">No recorded changes for this phase yet.</p>}
          {(history ?? []).map((h) => {
            const p = h.payload as Record<string, { from?: string; to?: string }> | null
            const moved = p?.start_date?.from && p?.end_date?.from
            return (
              <div key={h.id} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px]">
                <p className="font-medium text-slate-700">
                  {h.action === 'phase_moved' ? 'Moved' : h.action === 'phase_resized' ? 'Duration changed' : h.action.replace(/_/g, ' ')}
                  <span className="ml-1.5 font-normal text-slate-400">{formatDate(h.created_at, 'MMM d, h:mm a')}</span>
                </p>
                {moved && (
                  <p className="mt-0.5 flex items-center gap-1 text-slate-500">
                    {formatDate(p!.start_date!.from!, 'MMM d')}–{formatDate(p!.end_date!.from!, 'MMM d')}
                    <ArrowRight size={10} className="text-slate-400" />
                    {formatDate(p!.start_date!.to!, 'MMM d')}–{formatDate(p!.end_date!.to!, 'MMM d')}
                  </p>
                )}
                {h.reason && <p className="mt-0.5 text-slate-400">Reason: {h.reason}</p>}
              </div>
            )
          })}
        </div>
      )}
      <RelatedItems
        entityType="phase"
        entityId={phase.id}
        entityLabel={phase.name}
        projectId={projectId}
        canEdit={canEdit}
        className="mt-3 border-slate-100 p-3"
      />
    </div>
  )
}
