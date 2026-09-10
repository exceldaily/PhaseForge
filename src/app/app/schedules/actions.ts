'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canUseSchedules } from '@/lib/constants'
import { canEditCompanyData } from '@/lib/permissions'
import { geocodeAddress } from '@/lib/travel/geocode'
import { syncStaysForJob } from '@/lib/travel/syncStays'
import { departmentChannel, postSystem, projectChannelId } from '@/lib/chat/systemPost'
import { departmentLabel, type ScheduleEvent, type ScheduleJobCard } from '@/lib/chat/systemEvents'

const PATH = '/app/schedules'

async function ctx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: p } = await supabase
    .from('profiles').select('company_id, ops_role, role, companies(plan)').eq('id', user.id).single()
  const isManager = canEditCompanyData(p)
  if (!p?.company_id) throw new Error('No organization')
  const plan = (p.companies as { plan?: string } | null)?.plan
  if (!canUseSchedules(plan)) throw new Error('Schedules requires a paid plan')
  return { supabase, companyId: p.company_id, isManager }
}

const stripProject = (c: ScheduleJobCard & { projectId: string | null }): ScheduleJobCard =>
  ({ title: c.title, jobNumber: c.jobNumber, url: c.url, days: c.days })

/**
 * Post a team's week to chat: the whole week goes to the department's space
 * (REFRIGERATION to Refrigeration), and each job tied to a project, directly
 * or by job number, also goes to that job's chat under the department's
 * trade section.
 */
export async function postScheduleToChat(input: { superintendentId: string; weekStart: string }): Promise<{ error: string } | { ok: true; space: string; projects: number }> {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Managers only' }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not signed in' }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.weekStart)) return { error: 'Bad week' }

    const [{ data: team }, { data: jobs }, { data: company }] = await Promise.all([
      supabase.from('superintendents').select('name, division').eq('id', input.superintendentId).eq('company_id', companyId).single(),
      supabase.from('schedule_jobs').select('id, title, job_number, project_id, sort_order')
        .eq('company_id', companyId).eq('superintendent_id', input.superintendentId).eq('week_start', input.weekStart).order('sort_order'),
      supabase.from('companies').select('schedule_job_url_template').eq('id', companyId).single(),
    ])
    if (!team) return { error: 'Team not found' }
    if (!jobs?.length) return { error: 'Nothing is scheduled for this team that week.' }
    const { data: assigns } = await supabase.from('schedule_assignments')
      .select('schedule_job_id, day, techs, cell_entries').in('schedule_job_id', jobs.map((j) => j.id))

    const template = (company?.schedule_job_url_template as string | null) ?? null
    const dateOf = (d: number) => { const x = new Date(`${input.weekStart}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10) }
    const cards: (ScheduleJobCard & { projectId: string | null })[] = jobs.map((j) => {
      const rows = (assigns ?? []).filter((a) => a.schedule_job_id === j.id)
      const days = Array.from({ length: 7 }, (_, d) => {
        const r = rows.find((a) => a.day === d)
        const names = [
          ...((r?.techs as string[] | null) ?? []),
          ...(((r?.cell_entries as { name: string; shift: string }[] | null) ?? []).map((e) => e.shift ? `${e.name} (${e.shift})` : e.name)),
        ].map((n) => n.trim()).filter(Boolean)
        return { date: dateOf(d), names: [...new Set(names)] }
      }).filter((d) => d.names.length)
      const num = j.job_number?.trim() || null
      return { title: j.title, jobNumber: num, url: template && num ? template.replace('{job}', encodeURIComponent(num)) : null, days, projectId: j.project_id }
    }).filter((c) => c.days.length)
    if (!cards.length) return { error: 'Nobody is on this week yet.' }

    const dept = await departmentChannel(supabase, companyId, user.id, team.division)
    if (!dept) return { error: 'Could not find a chat space for this department.' }
    const { data: prior } = await supabase.from('chat_messages').select('id').eq('channel_id', dept.id).eq('kind', 'system')
      .contains('event', { type: 'schedule', team: team.name, weekStart: input.weekStart }).limit(1)
    const event: ScheduleEvent = {
      type: 'schedule', team: team.name, department: team.division, weekStart: input.weekStart,
      jobs: cards.map(stripProject), updated: !!prior?.length,
    }
    await postSystem(supabase, { companyId, authorId: user.id, channelId: dept.id, event, trades: dept.trade ? [dept.trade] : [] })

    // Jobs tied to a project also land in that job's chat.
    const numbers = [...new Set(cards.filter((c) => !c.projectId && c.jobNumber).map((c) => c.jobNumber!))]
    const { data: byNumber } = numbers.length
      ? await supabase.from('projects').select('id, job_number').eq('company_id', companyId).in('job_number', numbers)
      : { data: [] as { id: string; job_number: string | null }[] }
    let projects = 0
    for (const c of cards) {
      const pid = c.projectId ?? byNumber?.find((p) => p.job_number === c.jobNumber)?.id ?? null
      if (!pid) continue
      const chan = await projectChannelId(supabase, companyId, user.id, pid)
      if (!chan) continue
      const card = stripProject(c)
      await postSystem(supabase, {
        companyId, authorId: user.id, channelId: chan, projectId: pid,
        event: { ...event, jobs: [card] }, trades: dept.trade ? [dept.trade] : [],
      })
      projects++
    }
    return { ok: true, space: departmentLabel(team.division) ?? 'General', projects }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
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

// Tint one row of the Startup grid so it stands out on screen, on paper, and
// in the pasted email. null clears it.
export async function setJobHighlight(id: string, color: string | null) {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Managers only' }
    const hex = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null
    const { error } = await supabase.from('schedule_jobs')
      .update({ highlight_color: hex }).eq('id', id).eq('company_id', companyId)
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

// Persist a new top-to-bottom job order for a week. The client sends the full
// id list, so a single drag and a bulk rearrange cost the same.
export async function reorderScheduleJobs(ids: string[]) {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Managers only' }
    const clean = [...new Set(ids.filter(Boolean))]
    if (!clean.length) return { ok: true }
    // Chunked so a long week does not open one round trip per row in series.
    for (let i = 0; i < clean.length; i += 25) {
      const slice = clean.slice(i, i + 25)
      const results = await Promise.all(slice.map((id, n) =>
        supabase.from('schedule_jobs')
          .update({ sort_order: i + n })
          .eq('id', id).eq('company_id', companyId)))
      const failed = results.find((r) => r.error)
      if (failed?.error) return { error: failed.error.message }
    }
    revalidatePath(PATH)
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

// Edit just the shift-note list for a department (Days / Nights / Travel Day
// / whatever this crew actually calls them). Kept separate from the style
// setter so editing the list can never flip a department's layout, and an
// empty list is honored — some departments do not want shift notes at all.
export async function setShiftOptions(division: string, options: string[], colors?: Record<string, string>) {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Managers only' }
    const clean = [...new Set((options ?? []).map((s) => s.trim()).filter(Boolean))].slice(0, 20)
    // Only keep colors for notes that still exist, and only real hex values —
    // the map is rendered straight into a style attribute.
    const cleanColors: Record<string, string> = {}
    for (const name of clean) {
      const hex = colors?.[name]
      if (hex && /^#[0-9a-fA-F]{6}$/.test(hex)) cleanColors[name] = hex
    }
    const { data: existing } = await supabase.from('schedule_department_settings')
      .select('style').eq('company_id', companyId).eq('division', division ?? '').maybeSingle()
    const { error } = await supabase.from('schedule_department_settings').upsert({
      company_id: companyId,
      division: division ?? '',
      style: (existing?.style as string) === 'grid' ? 'grid' : 'crew',
      shift_options: clean,
      shift_colors: cleanColors,
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

// Job address for the drive-time check. Located straight away (one lookup)
// so the next lodging run can use it.
export async function setDirectoryAddress(id: string, address: string) {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Managers only' }
    const clean = address.trim() || null
    const hit = clean ? await geocodeAddress(clean) : null
    const { data: entry, error } = await supabase.from('schedule_directory').update({
      address: clean,
      latitude: hit?.lat ?? null, longitude: hit?.lng ?? null,
      geocoded_at: clean ? new Date().toISOString() : null,
      geocode_error: clean && !hit ? 'Address not found' : null,
    }).eq('id', id).eq('company_id', companyId).select('title, job_number').single()
    if (error) return { error: error.message }
    // Lodging shares this address: open stays for the same job pick it up
    // and get their drive times worked out again.
    if (entry) await syncStaysForJob(supabase, companyId, entry, clean)
    revalidatePath(PATH)
    revalidatePath('/app/lodging')
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

// Rename someone on a crew. A typo'd or replaced name shouldn't cost you the
// week's work, so this rewrites the roster AND every schedule row that person
// already appears on (both crew-sheet techs and Startup grid entries), across
// every week belonging to this team.
export async function renameRosterMember(superintendentId: string, from: string, to: string) {
  try {
    const { supabase, companyId, isManager } = await ctx()
    if (!isManager) return { error: 'Managers only' }
    const oldName = from.trim(), newName = to.trim()
    if (!newName) return { error: 'New name is required' }
    if (oldName === newName) return { ok: true }

    const { data: sup } = await supabase.from('superintendents')
      .select('roster').eq('id', superintendentId).eq('company_id', companyId).single()
    const roster = ((sup?.roster as string[] | null) ?? []).map((r) => (r === oldName ? newName : r))
    const { error: rErr } = await supabase.from('superintendents')
      .update({ roster: [...new Set(roster.filter(Boolean))] })
      .eq('id', superintendentId).eq('company_id', companyId)
    if (rErr) return { error: rErr.message }

    // Carry the name change into the schedules themselves.
    const { data: jobs } = await supabase.from('schedule_jobs')
      .select('id').eq('company_id', companyId).eq('superintendent_id', superintendentId)
    const ids = (jobs ?? []).map((j) => j.id)
    let moved = 0
    for (let i = 0; i < ids.length; i += 200) {
      const slice = ids.slice(i, i + 200)
      const { data: rows } = await supabase.from('schedule_assignments')
        .select('id, techs, cell_entries').in('schedule_job_id', slice)
      for (const row of rows ?? []) {
        const techs = ((row.techs as string[] | null) ?? [])
        const cells = ((row.cell_entries as { name: string; shift: string }[] | null) ?? [])
        const hit = techs.includes(oldName) || cells.some((c) => c.name === oldName)
        if (!hit) continue
        await supabase.from('schedule_assignments').update({
          techs: [...new Set(techs.map((t) => (t === oldName ? newName : t)))],
          cell_entries: cells.map((c) => (c.name === oldName ? { ...c, name: newName } : c)),
        }).eq('id', row.id)
        moved++
      }
    }
    revalidatePath(PATH)
    return { ok: true, moved }
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
    if ((count ?? 0) > 0) return { error: 'That week already has jobs for this team, delete them first or edit in place.' }

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
