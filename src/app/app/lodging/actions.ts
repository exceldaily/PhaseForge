'use server'

// Crew lodging: generate stays from a scheduled week, then book them.
// Reads the same schedule rows the Schedules page renders, so what gets
// generated is exactly what is on the board.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canUseSchedules } from '@/lib/constants'
import { canEditCompanyData } from '@/lib/permissions'
import { deriveStays, type WeekJob } from '@/lib/lodging/derive'

const PATH = '/app/lodging'

async function ctx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: p } = await supabase
    .from('profiles').select('company_id, ops_role, role, companies(plan)').eq('id', user.id).single()
  if (!p?.company_id) throw new Error('No organization')
  const plan = (p.companies as { plan?: string } | null)?.plan
  if (!canUseSchedules(plan)) throw new Error('Lodging requires a paid plan')
  if (!canEditCompanyData(p)) throw new Error('Managers and up only')
  return { supabase, userId: user.id, companyId: p.company_id }
}

export type StayStatus = 'needed' | 'booked' | 'cancelled'

/**
 * Turn a team's week into stays. Jobs that already have a stay for this
 * week are skipped, so pressing the button twice never doubles the list;
 * re-generating after the schedule changes only adds the new jobs.
 */
export async function generateStaysFromWeek(input: { superintendentId: string; weekStart: string }) {
  try {
    const { supabase, userId, companyId } = await ctx()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.weekStart)) return { ok: false as const, error: 'Bad week.' }

    const { data: jobRows } = await supabase.from('schedule_jobs')
      .select('id, title, job_number, project_id')
      .eq('company_id', companyId)
      .eq('superintendent_id', input.superintendentId)
      .eq('week_start', input.weekStart)
    if (!jobRows?.length) return { ok: true as const, created: 0, skipped: 0, message: 'Nothing is scheduled for that team that week.' }

    const ids = jobRows.map((j) => j.id)
    const [{ data: assignRows }, { data: existing }] = await Promise.all([
      supabase.from('schedule_assignments').select('schedule_job_id, day, techs, cell_entries').in('schedule_job_id', ids),
      supabase.from('lodging_stays').select('schedule_job_id').in('schedule_job_id', ids),
    ])
    const already = new Set((existing ?? []).map((s) => s.schedule_job_id))

    const jobs: WeekJob[] = jobRows.map((j) => ({
      id: j.id, title: j.title, job_number: j.job_number, project_id: j.project_id,
      days: Object.fromEntries((assignRows ?? []).filter((a) => a.schedule_job_id === j.id).map((a) => [a.day, (a.techs as string[]) ?? []])),
      cells: Object.fromEntries((assignRows ?? []).filter((a) => a.schedule_job_id === j.id)
        .map((a) => [a.day, (a.cell_entries as { name: string; shift: string }[] | null) ?? []])),
    }))

    const suggestions = deriveStays(jobs, input.weekStart).filter((s) => !already.has(s.scheduleJobId))
    if (!suggestions.length) {
      return { ok: true as const, created: 0, skipped: already.size, message: already.size ? 'Every job on that week already has a stay.' : 'Nobody is scheduled on those jobs yet.' }
    }

    // Project addresses give the hotel search somewhere to look.
    const projectIds = [...new Set(suggestions.map((s) => s.projectId).filter((x): x is string => !!x))]
    const { data: projects } = projectIds.length
      ? await supabase.from('projects').select('id, formatted_address, job_location').in('id', projectIds)
      : { data: [] as { id: string; formatted_address: string | null; job_location: string | null }[] }
    const address = new Map((projects ?? []).map((p) => [p.id, p.formatted_address ?? p.job_location ?? null]))

    const { error } = await supabase.from('lodging_stays').insert(suggestions.map((s) => ({
      company_id: companyId,
      superintendent_id: input.superintendentId,
      schedule_job_id: s.scheduleJobId,
      project_id: s.projectId,
      week_start: input.weekStart,
      title: s.title,
      job_number: s.jobNumber,
      location: s.projectId ? address.get(s.projectId) ?? null : null,
      check_in: s.checkIn,
      check_out: s.checkOut,
      guests: s.guests,
      status: 'needed',
      created_by: userId,
    })))
    if (error) return { ok: false as const, error: error.message }

    revalidatePath(PATH)
    return { ok: true as const, created: suggestions.length, skipped: already.size, message: null }
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : 'Failed' } }
}

export async function createStay(input: {
  title: string; jobNumber?: string | null; location?: string | null
  checkIn: string; checkOut: string; guests: string[]; superintendentId?: string | null
}) {
  try {
    const { supabase, userId, companyId } = await ctx()
    if (!input.title.trim()) return { ok: false as const, error: 'Give the stay a job or title.' }
    if (!(input.checkOut > input.checkIn)) return { ok: false as const, error: 'Check-out has to be after check-in.' }
    const { data, error } = await supabase.from('lodging_stays').insert({
      company_id: companyId, created_by: userId,
      superintendent_id: input.superintendentId ?? null,
      title: input.title.trim(), job_number: input.jobNumber?.trim() || null,
      location: input.location?.trim() || null,
      check_in: input.checkIn, check_out: input.checkOut,
      guests: input.guests.map((g) => g.trim()).filter(Boolean),
      status: 'needed',
    }).select('id').single()
    if (error || !data) return { ok: false as const, error: error?.message ?? 'Could not add the stay.' }
    revalidatePath(PATH)
    return { ok: true as const, id: data.id as string }
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : 'Failed' } }
}

export async function updateStay(input: {
  id: string
  patch: Partial<{
    title: string; job_number: string | null; location: string | null
    check_in: string; check_out: string; guests: string[]
    hotel_name: string | null; hotel_address: string | null; confirmation_number: string | null
    nightly_rate: number | null; notes: string | null; status: StayStatus
  }>
}) {
  try {
    const { supabase, companyId } = await ctx()
    const allowed = ['title', 'job_number', 'location', 'check_in', 'check_out', 'guests', 'hotel_name',
      'hotel_address', 'confirmation_number', 'nightly_rate', 'notes', 'status'] as const
    const patch: Record<string, unknown> = {}
    for (const k of allowed) if (k in input.patch) patch[k] = input.patch[k as keyof typeof input.patch]
    if ('status' in patch && !['needed', 'booked', 'cancelled'].includes(String(patch.status))) delete patch.status
    if ('nightly_rate' in patch) {
      const n = Number(patch.nightly_rate)
      patch.nightly_rate = patch.nightly_rate === null || !Number.isFinite(n) ? null : Math.max(0, n)
    }
    if ('guests' in patch && Array.isArray(patch.guests)) {
      patch.guests = (patch.guests as string[]).map((g) => String(g).trim()).filter(Boolean)
    }
    // Booking a hotel flips the status without a second click.
    if (patch.hotel_name && !('status' in patch)) patch.status = 'booked'
    if (!Object.keys(patch).length) return { ok: true as const }
    const { error } = await supabase.from('lodging_stays').update(patch).eq('id', input.id).eq('company_id', companyId)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : 'Failed' } }
}

export async function deleteStay(input: { id: string }) {
  try {
    const { supabase, companyId } = await ctx()
    const { error } = await supabase.from('lodging_stays').delete().eq('id', input.id).eq('company_id', companyId)
    if (error) return { ok: false as const, error: error.message }
    revalidatePath(PATH)
    return { ok: true as const }
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : 'Failed' } }
}
