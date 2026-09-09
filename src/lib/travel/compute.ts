import 'server-only'

// Per-guest drive time from home to a job, for one stay. Shared by lodging
// generation and the "Check drive times" button so both answer the same way.
//
// Job coordinates come from the linked project first, then from the schedule
// directory entry with the same job number (or title). Guest coordinates come
// from the employee list. OSRM gives road minutes; when it is unavailable the
// straight-line estimate fills in and is labelled as such.

import type { createClient } from '@/lib/supabase/server'
import {
  estimateDriveMinutes, haversineMiles, matchEmployee, type GuestTravel, type StayTravel,
} from './geo'
import { driveTimesTo } from './osrm'

type Db = Awaited<ReturnType<typeof createClient>>

export interface TravelEmployee {
  id: string
  name: string
  schedule_name: string | null
  superintendent_id: string | null
  latitude: number | null
  longitude: number | null
}

export interface JobPlace { lat: number; lng: number; label: string | null }

/** Everything the computation needs, loaded once per request. */
export interface TravelContext {
  employees: TravelEmployee[]
  /** Directory entries keyed by job number, and by lowercased title. */
  directoryByJob: Map<string, { lat: number | null; lng: number | null; address: string | null }>
  directoryByTitle: Map<string, { lat: number | null; lng: number | null; address: string | null }>
  projects: Map<string, { lat: number | null; lng: number | null; address: string | null }>
}

export async function loadTravelContext(
  supabase: Db, companyId: string, projectIds: string[],
): Promise<TravelContext> {
  const [{ data: emps }, { data: dir }, { data: projs }] = await Promise.all([
    supabase.from('employees').select('id, name, schedule_name, superintendent_id, latitude, longitude')
      .eq('company_id', companyId).eq('is_active', true),
    supabase.from('schedule_directory').select('title, job_number, address, latitude, longitude').eq('company_id', companyId),
    projectIds.length
      ? supabase.from('projects').select('id, formatted_address, job_location, latitude, longitude').in('id', projectIds)
      : Promise.resolve({ data: [] as { id: string; formatted_address: string | null; job_location: string | null; latitude: number | null; longitude: number | null }[] }),
  ])
  const directoryByJob = new Map<string, { lat: number | null; lng: number | null; address: string | null }>()
  const directoryByTitle = new Map<string, { lat: number | null; lng: number | null; address: string | null }>()
  for (const d of dir ?? []) {
    const v = { lat: d.latitude, lng: d.longitude, address: d.address }
    if (d.job_number?.trim()) directoryByJob.set(d.job_number.trim(), v)
    directoryByTitle.set(d.title.trim().toLowerCase(), v)
  }
  const projects = new Map<string, { lat: number | null; lng: number | null; address: string | null }>()
  for (const p of projs ?? []) projects.set(p.id, { lat: p.latitude, lng: p.longitude, address: p.formatted_address ?? p.job_location ?? null })
  return { employees: (emps ?? []) as TravelEmployee[], directoryByJob, directoryByTitle, projects }
}

/** Where the job is, and the address to search hotels near. */
export function resolveJobPlace(ctx: TravelContext, job: { projectId: string | null; jobNumber: string | null; title: string }): {
  coords: JobPlace | null; address: string | null
} {
  const candidates = [
    job.projectId ? ctx.projects.get(job.projectId) : undefined,
    job.jobNumber?.trim() ? ctx.directoryByJob.get(job.jobNumber.trim()) : undefined,
    ctx.directoryByTitle.get(job.title.trim().toLowerCase()),
  ]
  let coords: JobPlace | null = null
  let address: string | null = null
  for (const c of candidates) {
    if (!c) continue
    if (!coords && c.lat !== null && c.lng !== null) coords = { lat: c.lat, lng: c.lng, label: c.address }
    if (!address && c.address) address = c.address
  }
  return { coords, address }
}

export async function computeStayTravel(
  ctx: TravelContext, guests: string[], teamId: string | null, job: JobPlace | null,
): Promise<StayTravel> {
  const rows: GuestTravel[] = guests.map((name) => {
    const emp = matchEmployee(name, ctx.employees, teamId)
    if (!emp) return { name, employeeId: null, minutes: null, miles: null, source: 'unknown', reason: 'no_employee' }
    if (emp.latitude === null || emp.longitude === null) return { name, employeeId: emp.id, minutes: null, miles: null, source: 'unknown', reason: 'no_home' }
    if (!job) return { name, employeeId: emp.id, minutes: null, miles: null, source: 'unknown', reason: 'no_job' }
    return { name, employeeId: emp.id, minutes: null, miles: null, source: 'estimate' }
  })

  if (job) {
    const routable = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.source === 'estimate')
    const empById = new Map(ctx.employees.map((e) => [e.id, e]))
    const sources = routable.map(({ r }) => {
      const e = empById.get(r.employeeId!)!
      return { lat: e.latitude!, lng: e.longitude! }
    })
    const road = sources.length ? await driveTimesTo(sources, job) : []
    routable.forEach(({ r }, k) => {
      const e = empById.get(r.employeeId!)!
      const straight = haversineMiles(e.latitude!, e.longitude!, job.lat, job.lng)
      const hit = road?.[k]
      if (hit && Number.isFinite(hit.minutes)) {
        r.minutes = hit.minutes
        r.miles = Number.isFinite(hit.miles) ? hit.miles : Math.round(straight * 1.25)
        r.source = 'osrm'
      } else {
        r.minutes = estimateDriveMinutes(straight)
        r.miles = Math.round(straight * 1.25)
        r.source = 'estimate'
      }
    })
  }

  return { computedAt: new Date().toISOString(), jobLat: job?.lat ?? null, jobLng: job?.lng ?? null, guests: rows }
}
