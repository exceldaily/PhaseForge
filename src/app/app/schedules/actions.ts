'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canUseSchedules } from '@/lib/constants'

const PATH = '/app/schedules'

async function ctx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: p } = await supabase
    .from('profiles').select('company_id, ops_role, role, companies(plan)').eq('id', user.id).single()
  const isManager = ['owner', 'admin', 'manager', 'dispatcher'].includes(p?.ops_role ?? '') ||
    ['owner', 'admin'].includes(p?.role ?? '')
  if (!p?.company_id) throw new Error('No organization')
  const plan = (p.companies as { plan?: string } | null)?.plan
  if (!canUseSchedules(plan)) throw new Error('Schedules requires a paid plan')
  return { supabase, companyId: p.company_id, isManager }
}

export async function addScheduleJob(input: {
  superintendentId: string; weekStart: string; title: string
  jobNumber?: string; shiftLabel?: string; sortOrder: number
}) {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Managers only' }
    if (!input.title.trim()) return { error: 'Job name is required' }
    const { data, error } = await supabase.from('schedule_jobs').insert({
      company_id: companyId,
      superintendent_id: input.superintendentId,
      week_start: input.weekStart,
      title: input.title.trim(),
      job_number: input.jobNumber?.trim() || null,
      shift_label: input.shiftLabel?.trim() || null,
      sort_order: input.sortOrder,
    }).select('id').single()
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { ok: true, id: data.id }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

export async function updateScheduleJob(id: string, patch: {
  title?: string; jobNumber?: string | null; shiftLabel?: string | null
}) {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Managers only' }
    const { error } = await supabase.from('schedule_jobs').update({
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.jobNumber !== undefined ? { job_number: patch.jobNumber?.trim() || null } : {}),
      ...(patch.shiftLabel !== undefined ? { shift_label: patch.shiftLabel?.trim() || null } : {}),
    }).eq('id', id).eq('company_id', companyId)
    if (error) return { error: error.message }
    // No revalidatePath: fires on every debounced keystroke save — the client
    // holds the live state, and invalidating the route cache here was the
    // main source of sluggishness.
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

export async function deleteScheduleJob(id: string) {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Managers only' }
    const { error } = await supabase.from('schedule_jobs').delete()
      .eq('id', id).eq('company_id', companyId)
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

// Set the techs for one weekday of one job (upsert on the unique pair).
export async function setDayTechs(scheduleJobId: string, day: number, techs: string[]) {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Managers only' }
    const clean = techs.map((t) => t.trim()).filter(Boolean)
    const { error } = await supabase.from('schedule_assignments').upsert({
      company_id: companyId,
      schedule_job_id: scheduleJobId,
      day,
      techs: clean,
    }, { onConflict: 'schedule_job_id,day' })
    if (error) return { error: error.message }
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

// ── Per-department schedule style (crew grid vs Startup jobs×days grid) ──────

export type ScheduleStyle = 'crew' | 'grid'
export interface GridCellEntry { name: string; shift: string }

export async function setDepartmentStyle(input: {
  division: string; style: ScheduleStyle; shiftOptions?: string[]
}) {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Managers only' }
    const shift = (input.shiftOptions ?? ['Days', 'Nights', 'Travel Day', 'As needed'])
      .map((s) => s.trim()).filter(Boolean)
    const { error } = await supabase.from('schedule_department_settings').upsert({
      company_id: companyId,
      division: input.division ?? '',
      style: input.style === 'grid' ? 'grid' : 'crew',
      shift_options: shift.length ? shift : ['Days', 'Nights', 'Travel Day', 'As needed'],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,division' })
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

// Replace the person+shift entries of ONE grid cell (job × weekday).
export async function setGridCell(scheduleJobId: string, day: number, entries: GridCellEntry[]) {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Managers only' }
    const clean = (entries ?? [])
      .map((e) => ({ name: String(e.name ?? '').trim(), shift: String(e.shift ?? '').trim() }))
      .filter((e) => e.name)
    const { error } = await supabase.from('schedule_assignments').upsert({
      company_id: companyId,
      schedule_job_id: scheduleJobId,
      day,
      techs: [],                 // crew column unused for grid cells
      cell_entries: clean,
    }, { onConflict: 'schedule_job_id,day' })
    if (error) return { error: error.message }
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

// ── Project directory (persistent job list beside the schedules) ────────────

export async function addDirectoryProject(title: string, jobNumber?: string, division?: string) {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Managers only' }
    if (!title.trim()) return { error: 'Project name is required' }
    const { error } = await supabase.from('schedule_directory').insert({
      company_id: companyId, title: title.trim(), job_number: jobNumber?.trim() || null,
      division: division?.trim() || null,
    })
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

export async function deleteDirectoryProject(id: string) {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Managers only' }
    const { error } = await supabase.from('schedule_directory').delete()
      .eq('id', id).eq('company_id', companyId)
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

// Create a schedule team (superintendent), optionally under a division.
export async function addTeam(name: string, division?: string) {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Managers only' }
    if (!name.trim()) return { error: 'Team name is required' }
    const { data, error } = await supabase.from('superintendents').insert({
      company_id: companyId,
      name: name.trim(),
      division: division?.trim() || null,
    }).select('id').single()
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { ok: true, id: data.id }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

// Delete a team. Cascades its schedule weeks; projects keep working (their
// superintendent link just clears). Admin-only via RLS.
export async function deleteTeam(id: string) {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Managers only' }
    const { error } = await supabase.from('superintendents').delete()
      .eq('id', id).eq('company_id', companyId)
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

// Update a team's crew roster (the names available for quick-tap scheduling).
export async function updateRoster(superintendentId: string, roster: string[]) {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Managers only' }
    const clean = [...new Set(roster.map((r) => r.trim()).filter(Boolean))]
    const { error } = await supabase.from('superintendents')
      .update({ roster: clean }).eq('id', superintendentId).eq('company_id', companyId)
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

// Toggle one tech on/off for EVERY day of a job's week in one call.
export async function setWeekTech(scheduleJobId: string, tech: string, on: boolean) {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Managers only' }
    const name = tech.trim()
    if (!name) return { error: 'No name' }
    const { data: rows } = await supabase.from('schedule_assignments')
      .select('day, techs').eq('schedule_job_id', scheduleJobId)
    const byDay = new Map((rows ?? []).map((r) => [r.day, r.techs as string[]]))
    for (let day = 0; day < 7; day++) {
      const cur = byDay.get(day) ?? []
      const next = on ? [...new Set([...cur, name])] : cur.filter((t) => t !== name)
      await supabase.from('schedule_assignments').upsert({
        company_id: companyId, schedule_job_id: scheduleJobId, day, techs: next,
      }, { onConflict: 'schedule_job_id,day' })
    }
    // No revalidatePath: chip taps are optimistic client-side (perf).
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

// The "master auto-advance" workflow: copy an entire team week (jobs + techs)
// into the target week. Skips if the target week already has jobs for the team.
export async function copyWeek(superintendentId: string, fromWeekStart: string, toWeekStart: string) {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Managers only' }

    const { count } = await supabase.from('schedule_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('superintendent_id', superintendentId).eq('week_start', toWeekStart)
    if ((count ?? 0) > 0) return { error: 'That week already has jobs for this team — delete them first or edit in place.' }

    const { data: jobs } = await supabase.from('schedule_jobs')
      .select('id, title, job_number, shift_label, project_id, sort_order')
      .eq('company_id', companyId).eq('superintendent_id', superintendentId).eq('week_start', fromWeekStart)
      .order('sort_order')
    if (!jobs?.length) return { error: 'No jobs found on the source week to copy.' }

    let copied = 0
    for (const j of jobs) {
      const { data: newJob, error } = await supabase.from('schedule_jobs').insert({
        company_id: companyId, superintendent_id: superintendentId, week_start: toWeekStart,
        title: j.title, job_number: j.job_number, shift_label: j.shift_label,
        project_id: j.project_id, sort_order: j.sort_order,
      }).select('id').single()
      if (error || !newJob) continue
      const { data: assigns } = await supabase.from('schedule_assignments')
        .select('day, techs, cell_entries').eq('schedule_job_id', j.id)
      for (const a of assigns ?? []) {
        await supabase.from('schedule_assignments').insert({
          company_id: companyId, schedule_job_id: newJob.id, day: a.day,
          techs: a.techs, cell_entries: a.cell_entries ?? [],
        })
      }
      copied++
    }
    revalidatePath(PATH)
    return { ok: true, copied }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}
