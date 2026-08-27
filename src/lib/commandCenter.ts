import 'server-only'

// Assembles everything the Project Command Center shows, in one place, from
// the same engines the board uses. Returns plain serializable data so the
// page can hand it straight to the client component.

import type { SupabaseClient } from '@supabase/supabase-js'
import { addDays, differenceInDays, parseISO } from '@/lib/dates'
import { loadProjectIntel, type ProjectIntel } from '@/lib/projectIntel'
import {
  analyzeSchedule, compareToBaseline,
  type ScheduleDependency, type BaselineComparison,
} from '@/lib/schedule/engine'
import type { Phase, Project, PunchItem } from '@/types/app'

export interface UpcomingItem {
  date: string
  label: string
  kind: 'phase_start' | 'phase_finish' | 'milestone' | 'punch_due'
  detail?: string
  /** Which tab of the project shell it belongs to. */
  target: 'gantt' | 'tasks' | 'punch'
}

export interface CommandCenterData {
  intel: ProjectIntel
  baseline: {
    id: string
    name: string
    createdAt: string
    projectStart: string | null
    projectEnd: string | null
  } | null
  variance: BaselineComparison | null
  schedule: {
    criticalCount: number
    cycleIds: string[] | null
    completionDate: string | null
  }
  upcoming: UpcomingItem[]
  dependencies: ScheduleDependency[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, string>

export async function loadCommandCenter(
  supabase: Client,
  project: Project,
  phases: Phase[],
  punchItems: PunchItem[],
): Promise<CommandCenterData> {
  const today = new Date().toISOString().slice(0, 10)

  const phaseIds = phases.map((p) => p.id)
  const [intelMap, baselineRes, depsRes] = await Promise.all([
    loadProjectIntel(supabase, [{
      id: project.id, start_date: project.start_date, end_date: project.end_date,
      status: project.status, updated_at: project.updated_at,
    }], today),
    supabase.from('schedule_baselines')
      .select('id, name, created_at, project_start, project_end')
      .eq('project_id', project.id).eq('is_active', true).maybeSingle(),
    phaseIds.length
      ? supabase.from('phase_dependencies')
          .select('id, phase_id, depends_on_id, type, lag_days')
          .in('phase_id', phaseIds)
      : Promise.resolve({ data: [] as ScheduleDependency[] }),
  ])

  const intel = intelMap.get(project.id) as ProjectIntel
  const dependencies = (depsRes.data ?? []) as ScheduleDependency[]

  const schedPhases = phases
    .filter((p) => p.start_date && p.end_date)
    .map((p) => ({
      id: p.id, name: p.name, start_date: p.start_date, end_date: p.end_date,
      is_milestone: p.is_milestone, status: p.status,
    }))
  const analysis = analyzeSchedule(schedPhases, dependencies)

  // Baseline comparison only when a baseline exists.
  let variance: BaselineComparison | null = null
  let baseline: CommandCenterData['baseline'] = null
  if (baselineRes.data) {
    const { data: basePhases } = await supabase.from('schedule_baseline_phases')
      .select('phase_id, name, start_date, end_date')
      .eq('baseline_id', baselineRes.data.id)
    variance = compareToBaseline(schedPhases, basePhases ?? [])
    baseline = {
      id: baselineRes.data.id,
      name: baselineRes.data.name,
      createdAt: baselineRes.data.created_at,
      projectStart: baselineRes.data.project_start,
      projectEnd: baselineRes.data.project_end,
    }
  }

  // ── Upcoming: operational events inside the next 30 days ──────────────────
  const t = parseISO(today)
  const horizon = addDays(t, 30)
  const upcoming: UpcomingItem[] = []
  for (const p of phases) {
    if (p.status === 'completed' || p.status === 'skipped') continue
    if (p.start_date) {
      const s = parseISO(p.start_date)
      if (s >= t && s <= horizon) {
        upcoming.push({
          date: p.start_date,
          label: p.is_milestone ? p.name : `${p.name} starts`,
          kind: p.is_milestone ? 'milestone' : 'phase_start',
          target: 'gantt',
        })
      }
    }
    if (p.end_date && !p.is_milestone) {
      const e = parseISO(p.end_date)
      if (e >= t && e <= horizon) {
        upcoming.push({ date: p.end_date, label: `${p.name} finishes`, kind: 'phase_finish', target: 'gantt' })
      }
    }
  }
  for (const item of punchItems) {
    if (item.status === 'completed' || !item.due_date) continue
    const d = parseISO(item.due_date)
    if (d >= t && d <= horizon) {
      upcoming.push({ date: item.due_date, label: `Punch: ${item.title}`, kind: 'punch_due', target: 'punch' })
    }
  }
  // Milestones and finishes outrank starts on the same day: they are the
  // commitments, starts are the plans.
  const kindRank = { milestone: 0, phase_finish: 1, punch_due: 2, phase_start: 3 }
  upcoming.sort((a, b) => a.date.localeCompare(b.date) || kindRank[a.kind] - kindRank[b.kind])

  return {
    intel,
    baseline,
    variance,
    schedule: {
      criticalCount: analysis.ok ? analysis.criticalIds.size : 0,
      cycleIds: analysis.ok ? null : analysis.cycleIds,
      completionDate: analysis.ok ? analysis.completionDate : null,
    },
    upcoming: upcoming.slice(0, 60),
    dependencies,
  }
}

export function daysAheadBehind(planEnd: string | null, scheduledEnd: string | null): number | null {
  if (!planEnd || !scheduledEnd) return null
  return differenceInDays(parseISO(scheduledEnd), parseISO(planEnd))
}
