import 'server-only'

// Batched project intelligence: health inputs for one or many projects in a
// fixed number of queries (six), regardless of how many projects are asked
// for. The board page and the Command Center both come through here so the
// same project can never score differently on different screens — and so
// the board never runs per-card queries.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getPhasePercentComplete } from '@/lib/phaseProgress'
import { differenceInDays, parseISO } from '@/lib/dates'
import { CO_STAGES } from '@/lib/changeOrders'
import {
  scoreProjectHealth, smartPriority,
  type HealthInput, type ProjectHealthResult,
} from '@/lib/projectHealth'

export interface ProjectIntel {
  projectId: string
  health: ProjectHealthResult
  priority: number
  /** Raw counts the cards and metric tiles print. */
  facts: {
    totalPhases: number
    completedPhases: number
    blockedPhases: number
    overduePhases: number
    progressPercent: number
    scheduledCompletion: string | null
    openCoCount: number
    pendingCoValue: number
    approvedCoValue: number
    openPunchCount: number
    overduePunchCount: number
    lastActivityAt: string | null
    baselineEnd: string | null
    slipDays: number
  }
}

const openCoStages = new Set<string>(CO_STAGES.filter((s) => s.category === 'open').map((s) => s.key))

// Supabase client is passed in so RLS keeps enforcing the caller's scope.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, string>

export async function loadProjectIntel(
  supabase: Client,
  projects: {
    id: string
    start_date: string | null
    end_date: string | null
    status: string
    updated_at?: string | null
  }[],
  todayIso?: string,
): Promise<Map<string, ProjectIntel>> {
  const out = new Map<string, ProjectIntel>()
  if (projects.length === 0) return out
  const ids = projects.map((p) => p.id)
  const today = todayIso ?? new Date().toISOString().slice(0, 10)

  const [phasesRes, cosRes, punchRes, actRes, baseRes] = await Promise.all([
    supabase.from('phases')
      .select('id, project_id, start_date, end_date, status, percent_complete, is_milestone')
      .in('project_id', ids),
    supabase.from('change_orders')
      .select('project_id, stage, created_at, current_amount, requested_amount, approved_amount, archived_at')
      .in('project_id', ids),
    supabase.from('punch_items')
      .select('project_id, status, due_date')
      .in('project_id', ids),
    // Latest event per project: fetch a recent window ordered desc and keep
    // the first row seen per project. One query, bounded size.
    supabase.from('activity_logs')
      .select('project_id, created_at')
      .in('project_id', ids)
      .order('created_at', { ascending: false })
      .limit(Math.min(2000, ids.length * 40)),
    supabase.from('schedule_baselines')
      .select('project_id, project_end')
      .in('project_id', ids)
      .eq('is_active', true),
  ])

  type PhaseRow = { id: string; project_id: string; start_date: string | null; end_date: string | null; status: import('@/types/app').PhaseStatus; percent_complete: number | null; is_milestone: boolean | null }
  const phasesByProject = new Map<string, PhaseRow[]>()
  for (const ph of (phasesRes.data ?? []) as PhaseRow[]) {
    phasesByProject.set(ph.project_id, [...(phasesByProject.get(ph.project_id) ?? []), ph])
  }

  const cosByProject = new Map<string, { stage: string; created_at: string; proposed: number; approved: number }[]>()
  for (const co of cosRes.data ?? []) {
    if (co.archived_at) continue
    cosByProject.set(co.project_id, [...(cosByProject.get(co.project_id) ?? []), {
      stage: co.stage,
      created_at: co.created_at,
      proposed: Number(co.current_amount ?? co.requested_amount ?? 0),
      approved: Number(co.approved_amount ?? 0),
    }])
  }

  const punchByProject = new Map<string, { status: string; due_date: string | null }[]>()
  for (const pi of punchRes.data ?? []) {
    punchByProject.set(pi.project_id, [...(punchByProject.get(pi.project_id) ?? []), pi])
  }

  const lastActivity = new Map<string, string>()
  for (const row of actRes.data ?? []) {
    if (row.project_id && !lastActivity.has(row.project_id)) lastActivity.set(row.project_id, row.created_at)
  }

  const baselineEnd = new Map<string, string>()
  for (const b of baseRes.data ?? []) {
    if (b.project_end) baselineEnd.set(b.project_id, b.project_end)
  }

  const t = parseISO(today)
  for (const project of projects) {
    const phases = phasesByProject.get(project.id) ?? []
    const done = phases.filter((p) => p.status === 'completed' || p.status === 'skipped')
    const overdue = phases.filter((p) =>
      p.end_date && p.status !== 'completed' && p.status !== 'skipped' && parseISO(p.end_date) < t)
    const maxOverdue = overdue.reduce((m, p) => Math.max(m, differenceInDays(t, parseISO(p.end_date as string))), 0)
    const scheduledCompletion = phases.reduce<string | null>((max, p) =>
      p.end_date && (!max || p.end_date > max) ? p.end_date : max, null)

    const cos = cosByProject.get(project.id) ?? []
    const openCos = cos.filter((c) => openCoStages.has(c.stage))
    const oldestCoDays = openCos.reduce((m, c) =>
      Math.max(m, differenceInDays(t, parseISO(c.created_at.slice(0, 10)))), 0)

    const punch = punchByProject.get(project.id) ?? []
    const openPunch = punch.filter((p) => p.status !== 'completed')
    const overduePunch = openPunch.filter((p) => p.due_date && parseISO(p.due_date) < t)

    // A project edit also stamps updated_at, so use whichever trail is fresher.
    const act = lastActivity.get(project.id) ?? null
    const freshest = [act, project.updated_at].filter(Boolean).sort().pop() ?? null

    const input: HealthInput = {
      startDate: project.start_date,
      endDate: project.end_date,
      baselineEnd: baselineEnd.get(project.id) ?? null,
      status: project.status,
      totalPhases: phases.length,
      completedPhases: done.length,
      blockedPhases: phases.filter((p) => p.status === 'blocked').length,
      overduePhases: overdue.length,
      maxPhaseOverdueDays: maxOverdue,
      progressPercent: phases.length
        ? Math.round(phases.reduce((sum, p) => sum + getPhasePercentComplete({ percent_complete: p.percent_complete, status: p.status }), 0) / phases.length)
        : 0,
      scheduledCompletion,
      openCoCount: openCos.length,
      oldestOpenCoDays: oldestCoDays,
      openPunchCount: openPunch.length,
      overduePunchCount: overduePunch.length,
      lastActivityAt: freshest,
      today,
    }

    const health = scoreProjectHealth(input)
    out.set(project.id, {
      projectId: project.id,
      health,
      priority: smartPriority(health, project.end_date, today),
      facts: {
        totalPhases: phases.length,
        completedPhases: done.length,
        blockedPhases: input.blockedPhases,
        overduePhases: overdue.length,
        progressPercent: input.progressPercent,
        scheduledCompletion,
        openCoCount: openCos.length,
        pendingCoValue: openCos.filter((c) => !c.approved).reduce((s, c) => s + c.proposed, 0),
        approvedCoValue: cos.reduce((s, c) => s + c.approved, 0),
        openPunchCount: openPunch.length,
        overduePunchCount: overduePunch.length,
        lastActivityAt: freshest,
        baselineEnd: baselineEnd.get(project.id) ?? null,
        slipDays: health.slipDays,
      },
    })
  }

  return out
}
