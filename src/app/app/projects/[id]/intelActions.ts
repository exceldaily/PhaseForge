'use server'

// Server actions for schedule intelligence: baselines, dependencies, and
// schedule moves that carry a reason. All writes here also land one event on
// the universal timeline via logActivity — the single write path.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canEditCompanyData } from '@/lib/permissions'
import { logActivity } from '@/lib/activity/log'

async function ctx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: p } = await supabase
    .from('profiles').select('company_id, role, ops_role').eq('id', user.id).single()
  if (!p?.company_id) throw new Error('No organization')
  if (!canEditCompanyData(p)) throw new Error('Managers and up only')
  return { supabase, userId: user.id, companyId: p.company_id }
}

/* ── Baseline ─────────────────────────────────────────────────────────────── */

export async function setBaseline(projectId: string) {
  try {
    const { supabase, userId, companyId } = await ctx()
    const { data: phases } = await supabase.from('phases')
      .select('id, name, start_date, end_date, is_milestone')
      .eq('project_id', projectId)
    if (!phases?.length) return { ok: false as const, error: 'Nothing to baseline: this project has no phases yet.' }

    const start = phases.reduce<string | null>((m, p) => (p.start_date && (!m || p.start_date < m) ? p.start_date : m), null)
    const end = phases.reduce<string | null>((m, p) => (p.end_date && (!m || p.end_date > m) ? p.end_date : m), null)

    // A baseline is never silently overwritten: the active one is retired
    // (kept, flagged inactive) and a fresh one is cut.
    const { data: existing } = await supabase.from('schedule_baselines')
      .select('id').eq('project_id', projectId).eq('is_active', true).maybeSingle()
    if (existing) {
      await supabase.from('schedule_baselines')
        .update({ is_active: false }).eq('id', existing.id).eq('company_id', companyId)
    }

    const { data: baseline, error } = await supabase.from('schedule_baselines').insert({
      company_id: companyId, project_id: projectId, created_by: userId,
      name: existing ? `Baseline ${new Date().toISOString().slice(0, 10)}` : 'Baseline',
      project_start: start, project_end: end,
    }).select('id').single()
    if (error || !baseline) return { ok: false as const, error: error?.message ?? 'Could not create the baseline.' }

    const { error: phaseErr } = await supabase.from('schedule_baseline_phases').insert(
      phases.filter((p) => p.start_date && p.end_date).map((p) => ({
        baseline_id: baseline.id, company_id: companyId, phase_id: p.id,
        name: p.name, start_date: p.start_date, end_date: p.end_date,
        is_milestone: !!p.is_milestone,
      })))
    if (phaseErr) return { ok: false as const, error: phaseErr.message }

    await logActivity(supabase, {
      companyId, projectId, actorId: userId,
      action: existing ? 'baseline_replaced' : 'baseline_set',
      entityType: 'baseline', entityId: baseline.id,
      payload: { phases: phases.length, project_end: end },
    })
    revalidatePath(`/app/projects/${projectId}`)
    return { ok: true as const, baselineId: baseline.id as string, replaced: !!existing }
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : 'Failed' } }
}

export async function getBaseline(projectId: string) {
  const supabase = await createClient()
  const { data: baseline } = await supabase.from('schedule_baselines')
    .select('id, name, created_at, created_by, project_start, project_end')
    .eq('project_id', projectId).eq('is_active', true).maybeSingle()
  if (!baseline) return { baseline: null, phases: [] as { phase_id: string; name: string; start_date: string; end_date: string }[] }
  const { data: phases } = await supabase.from('schedule_baseline_phases')
    .select('phase_id, name, start_date, end_date, is_milestone')
    .eq('baseline_id', baseline.id)
  return { baseline, phases: phases ?? [] }
}

/* ── Dependencies ─────────────────────────────────────────────────────────── */

export async function addDependency(input: {
  projectId: string
  phaseId: string
  dependsOnId: string
  type?: 'finish_to_start' | 'start_to_start' | 'finish_to_finish'
  lagDays?: number
}) {
  try {
    const { supabase, userId, companyId } = await ctx()
    if (input.phaseId === input.dependsOnId) return { ok: false as const, error: 'A phase cannot depend on itself.' }

    // Both phases must be in this project (also blocks cross-org via RLS).
    const { data: pair } = await supabase.from('phases')
      .select('id, name, project_id').in('id', [input.phaseId, input.dependsOnId])
    if ((pair ?? []).length !== 2 || pair?.some((p) => p.project_id !== input.projectId)) {
      return { ok: false as const, error: 'Both phases must belong to this project.' }
    }

    // Reject a link that would close a loop: walk the existing graph from the
    // predecessor; reaching the successor means the new edge creates a cycle.
    const { data: existing } = await supabase.from('phase_dependencies')
      .select('phase_id, depends_on_id')
      .in('phase_id', (await supabase.from('phases').select('id').eq('project_id', input.projectId)).data?.map((p) => p.id) ?? [])
    const preds = new Map<string, string[]>()
    for (const d of existing ?? []) preds.set(d.phase_id, [...(preds.get(d.phase_id) ?? []), d.depends_on_id])
    const seen = new Set<string>()
    const stack = [input.dependsOnId]
    while (stack.length) {
      const cur = stack.pop() as string
      if (cur === input.phaseId) {
        return { ok: false as const, error: 'That would create a circular dependency: the predecessor already depends on this phase.' }
      }
      if (seen.has(cur)) continue
      seen.add(cur)
      stack.push(...(preds.get(cur) ?? []))
    }
    if ((existing ?? []).some((d) => d.phase_id === input.phaseId && d.depends_on_id === input.dependsOnId)) {
      return { ok: false as const, error: 'That dependency already exists.' }
    }

    const { data: row, error } = await supabase.from('phase_dependencies').insert({
      phase_id: input.phaseId,
      depends_on_id: input.dependsOnId,
      type: input.type ?? 'finish_to_start',
      lag_days: input.lagDays ?? 0,
    }).select('id').single()
    if (error || !row) return { ok: false as const, error: error?.message ?? 'Could not add the dependency.' }

    const names = new Map((pair ?? []).map((p) => [p.id, p.name]))
    await logActivity(supabase, {
      companyId, projectId: input.projectId, phaseId: input.phaseId, actorId: userId,
      action: 'dependency_added', entityType: 'dependency', entityId: row.id,
      entityLabel: names.get(input.phaseId),
      payload: { depends_on: names.get(input.dependsOnId), type: input.type ?? 'finish_to_start' },
    })
    revalidatePath(`/app/projects/${input.projectId}`)
    return { ok: true as const, id: row.id as string }
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : 'Failed' } }
}

export async function removeDependency(input: { projectId: string; dependencyId: string; phaseName?: string }) {
  try {
    const { supabase, userId, companyId } = await ctx()
    const { error } = await supabase.from('phase_dependencies').delete().eq('id', input.dependencyId)
    if (error) return { ok: false as const, error: error.message }
    await logActivity(supabase, {
      companyId, projectId: input.projectId, actorId: userId,
      action: 'dependency_removed', entityType: 'dependency', entityId: input.dependencyId,
      entityLabel: input.phaseName ?? null,
    })
    revalidatePath(`/app/projects/${input.projectId}`)
    return { ok: true as const }
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : 'Failed' } }
}

export async function listDependencies(projectId: string) {
  const supabase = await createClient()
  const { data: phaseRows } = await supabase.from('phases').select('id').eq('project_id', projectId)
  const ids = (phaseRows ?? []).map((p) => p.id)
  if (!ids.length) return []
  const { data } = await supabase.from('phase_dependencies')
    .select('id, phase_id, depends_on_id, type, lag_days')
    .in('phase_id', ids)
  return data ?? []
}

/* ── Schedule change events (called after the Gantt writes dates) ─────────── */

export async function logScheduleChange(input: {
  projectId: string
  phaseId: string
  phaseName: string
  kind: 'move' | 'resize'
  from: { start: string; end: string }
  to: { start: string; end: string }
  reason?: string | null
  cascaded?: { name: string; from: { start: string; end: string }; to: { start: string; end: string } }[]
}) {
  try {
    const { supabase, userId, companyId } = await ctx()
    await logActivity(supabase, {
      companyId, projectId: input.projectId, phaseId: input.phaseId, actorId: userId,
      action: input.kind === 'move' ? 'phase_moved' : 'phase_resized',
      entityType: 'phase', entityId: input.phaseId, entityLabel: input.phaseName,
      reason: input.reason ?? null,
      payload: {
        start_date: { from: input.from.start, to: input.to.start },
        end_date: { from: input.from.end, to: input.to.end },
        ...(input.cascaded?.length ? { cascaded: input.cascaded } : {}),
      },
    })
    return { ok: true as const }
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : 'Failed' } }
}

/** History slice for one phase's drawer, newest first. */
export async function getPhaseHistory(phaseId: string, limit = 20) {
  const supabase = await createClient()
  const { data } = await supabase.from('activity_logs')
    .select('id, action, payload, reason, created_at, actor_id, entity_label')
    .or(`phase_id.eq.${phaseId},and(entity_type.eq.phase,entity_id.eq.${phaseId})`)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}
