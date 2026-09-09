'use server'

// Crew lodging: generate stays from a scheduled week, then book them.
// Reads the same schedule rows the Schedules page renders, so what gets
// generated is exactly what is on the board. Each guest's drive from home
// to the job decides whether they need a bed at all.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canUseSchedules } from '@/lib/constants'
import { canEditCompanyData } from '@/lib/permissions'
import { deriveStays, type WeekJob } from '@/lib/lodging/derive'
import { LODGING_THRESHOLD_MINUTES, needsLodging, type StayTravel } from '@/lib/travel/geo'
import { computeStayTravel, loadTravelContext, resolveJobPlace } from '@/lib/travel/compute'

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
 *
 * onlyFar (default true): guests whose home is under the lodging threshold
 * from the job are left off; guests whose distance cannot be worked out are
 * kept and flagged. A job with nobody left on it makes no stay.
 */
export async function generateStaysFromWeek(input: { superintendentId: string; weekStart: string; onlyFar?: boolean }) {
  try {
    const { supabase, userId, companyId } = await ctx()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.weekStart)) return { ok: false as const, error: 'Bad week.' }
    const onlyFar = input.onlyFar ?? true

    const { data: jobRows } = await supabase.from('schedule_jobs')
      .select('id, title, job_number, project_id')
      .eq('company_id', companyId)
      .eq('superintendent_id', input.superintendentId)
      .eq('week_start', input.weekStart)
    if (!jobRows?.length) return { ok: true as const, created: 0, skipped: 0, local: 0, message: 'Nothing is scheduled for that team that week.' }

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
      return { ok: true as const, created: 0, skipped: already.size, local: 0, message: already.size ? 'Every job on that week already has a stay.' : 'Nobody is scheduled on those jobs yet.' }
    }

    const travelCtx = await loadTravelContext(supabase, companyId,
      [...new Set(suggestions.map((s) => s.projectId).filter((x): x is string => !!x))])

    const rows: Record<string, unknown>[] = []
    let local = 0
    for (const s of suggestions) {
      const place = resolveJobPlace(travelCtx, { projectId: s.projectId, jobNumber: s.jobNumber, title: s.title })
      const travel = await computeStayTravel(travelCtx, s.guests, input.superintendentId, place.coords)
      let guests = s.guests
      if (onlyFar) {
        guests = travel.guests.filter((g) => needsLodging(g) !== false).map((g) => g.name)
        local += s.guests.length - guests.length
        if (!guests.length) continue
      }
      rows.push({
        company_id: companyId,
        superintendent_id: input.superintendentId,
        schedule_job_id: s.scheduleJobId,
        project_id: s.projectId,
        week_start: input.weekStart,
        title: s.title,
        job_number: s.jobNumber,
        location: place.address,
        check_in: s.checkIn,
        check_out: s.checkOut,
        guests,
        travel: { ...travel, guests: travel.guests.filter((g) => guests.includes(g.name)) },
        status: 'needed',
        created_by: userId,
      })
    }

    if (!rows.length) {
      return { ok: true as const, created: 0, skipped: already.size, local,
        message: `Everyone scheduled that week is under ${LODGING_THRESHOLD_MINUTES / 60} hours from their job. No beds needed.` }
    }
    const { error } = await supabase.from('lodging_stays').insert(rows)
    if (error) return { ok: false as const, error: error.message }

    revalidatePath(PATH)
    return { ok: true as const, created: rows.length, skipped: already.size, local, message: null }
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : 'Failed' } }
}

/** Work the drive times out again for one stay (after addresses change). */
export async function recomputeTravel(input: { id: string }) {
  try {
    const { supabase, companyId } = await ctx()
    const { data: s } = await supabase.from('lodging_stays')
      .select('id, title, job_number, project_id, superintendent_id, guests, location')
      .eq('id', input.id).eq('company_id', companyId).single()
    if (!s) return { ok: false as const, error: 'Stay not found.' }
    const travelCtx = await loadTravelContext(supabase, companyId, s.project_id ? [s.project_id] : [])
    const place = resolveJobPlace(travelCtx, { projectId: s.project_id, jobNumber: s.job_number, title: s.title })
    const travel = await computeStayTravel(travelCtx, (s.guests as string[]) ?? [], s.superintendent_id, place.coords)
    const patch: Record<string, unknown> = { travel }
    if (!s.location && place.address) patch.location = place.address
    const { error } = await supabase.from('lodging_stays').update(patch).eq('id', input.id).eq('company_id', companyId)
    if (error) return { ok: false as const, error: error.message }
    revalidatePath(PATH)
    return { ok: true as const, travel: travel as StayTravel }
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
    const guests = input.guests.map((g) => g.trim()).filter(Boolean)
    const travelCtx = await loadTravelContext(supabase, companyId, [])
    const place = resolveJobPlace(travelCtx, { projectId: null, jobNumber: input.jobNumber ?? null, title: input.title })
    const travel = await computeStayTravel(travelCtx, guests, input.superintendentId ?? null, place.coords)
    const { data, error } = await supabase.from('lodging_stays').insert({
      company_id: companyId, created_by: userId,
      superintendent_id: input.superintendentId ?? null,
      title: input.title.trim(), job_number: input.jobNumber?.trim() || null,
      location: input.location?.trim() || place.address || null,
      check_in: input.checkIn, check_out: input.checkOut,
      guests, travel,
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

/** Clear a whole week for a team so it can be generated fresh. */
export async function deleteWeekStays(input: { weekStart: string; superintendentId?: string | null }) {
  try {
    const { supabase, companyId } = await ctx()
    let q = supabase.from('lodging_stays').delete().eq('company_id', companyId).eq('week_start', input.weekStart)
    if (input.superintendentId) q = q.eq('superintendent_id', input.superintendentId)
    const { error, data } = await q.select('id')
    if (error) return { ok: false as const, error: error.message }
    revalidatePath(PATH)
    return { ok: true as const, deleted: data?.length ?? 0 }
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : 'Failed' } }
}
