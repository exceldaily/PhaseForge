import 'server-only'

import type { createClient } from '@/lib/supabase/server'
import { computeStayTravel, loadTravelContext, resolveJobPlace } from './compute'

/**
 * Push a directory job's address onto its upcoming lodging stays (matched by
 * job number, else title) and refresh their drive times. Shared by the
 * Schedules pin and the Lodging card so the two stay in step.
 */
export async function syncStaysForJob(
  supabase: Awaited<ReturnType<typeof createClient>>, companyId: string,
  entry: { title: string; job_number: string | null }, address: string | null,
) {
  const today = new Date().toISOString().slice(0, 10)
  let q = supabase.from('lodging_stays').select('id, title, job_number, project_id, superintendent_id, guests')
    .eq('company_id', companyId).gte('check_out', today).neq('status', 'cancelled')
  q = entry.job_number?.trim() ? q.eq('job_number', entry.job_number.trim()) : q.ilike('title', entry.title.trim())
  const { data: stays } = await q
  if (!stays?.length) return
  const travelCtx = await loadTravelContext(supabase, companyId, [...new Set(stays.map((s) => s.project_id).filter((x): x is string => !!x))])
  for (const s of stays) {
    const place = resolveJobPlace(travelCtx, { projectId: s.project_id, jobNumber: s.job_number, title: s.title })
    const travel = await computeStayTravel(travelCtx, (s.guests as string[]) ?? [], s.superintendent_id, place.coords)
    await supabase.from('lodging_stays').update({ location: address ?? place.address, travel }).eq('id', s.id).eq('company_id', companyId)
  }
}

