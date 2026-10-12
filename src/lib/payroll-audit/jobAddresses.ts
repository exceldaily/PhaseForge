import 'server-only'

// Job addresses from Kalos. The worker visits a job's Kalos page (the same
// {job} link used on the scheduler) and posts its text; this turns that into a
// place PhaseForge can use and fills the blanks on cards that carry the job
// number. Rules that matter:
//
//   * Read only. Nothing is written to Kalos.
//   * Existing card data is never overwritten, only blanks are filled.
//   * An address an administrator typed in (source "manual") always wins.
//   * Only the property address is kept from the Kalos page: no customer
//     phone, email, or notes.
//   * Town-level (approximate) coordinates are used for travel estimates but
//     are not written onto cards, so a map pin never looks more exact than it is.

import { geocodeAddress, pace } from '@/lib/travel/geocode'
import { addressLine, addressQueries, parseJobPage } from './jobPage'
import type { Admin } from './server'

const blank = (s: string | null | undefined) => !s || !s.trim()

async function allJobNumbers(admin: Admin, companyId: string): Promise<Set<string>> {
  const out = new Set<string>()
  for (let from = 0; from < 50_000; from += 1000) {
    const { data } = await admin.from('payroll_audit_entries').select('job_number').eq('company_id', companyId).not('job_number', 'is', null).range(from, from + 999)
    for (const r of data ?? []) out.add(r.job_number as string)
    if (!data || data.length < 1000) break
  }
  const [{ data: pm }, { data: pr }, { data: dir }] = await Promise.all([
    admin.from('pm_job_numbers').select('job_number').eq('company_id', companyId).limit(5000),
    admin.from('projects').select('job_number').eq('company_id', companyId).not('job_number', 'is', null).limit(5000),
    admin.from('schedule_directory').select('job_number').eq('company_id', companyId).not('job_number', 'is', null).limit(5000),
  ])
  for (const r of [...(pm ?? []), ...(pr ?? []), ...(dir ?? [])]) {
    const j = (r.job_number as string | null)?.trim()
    if (j) out.add(j)
  }
  return out
}

/** Job numbers PhaseForge has no address text for anywhere. Newest numbers first, capped. */
export async function pendingJobNumbers(admin: Admin, companyId: string, limit = 150): Promise<string[]> {
  const wanted = await allJobNumbers(admin, companyId)
  if (!wanted.size) return []
  const have = new Set<string>()
  const list = [...wanted]
  for (let i = 0; i < list.length; i += 200) {
    const chunk = list.slice(i, i + 200)
    const [{ data: saved }, { data: pr }, { data: dir }] = await Promise.all([
      admin.from('payroll_audit_job_places').select('job_number').eq('company_id', companyId).in('job_number', chunk),
      admin.from('projects').select('job_number, job_location, formatted_address').eq('company_id', companyId).in('job_number', chunk),
      admin.from('schedule_directory').select('job_number, address').eq('company_id', companyId).in('job_number', chunk),
    ])
    for (const s of saved ?? []) have.add(s.job_number as string)
    for (const p of pr ?? []) if (!blank(p.job_location as string | null) || !blank(p.formatted_address as string | null)) have.add(p.job_number as string)
    for (const d of dir ?? []) if (!blank(d.address as string | null)) have.add(d.job_number as string)
  }
  return list.filter((j) => !have.has(j)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).slice(0, limit)
}

export type JobAddressResult =
  | { ok: true; status: 'saved'; address: string; approximate: boolean; projects: number; directory: number }
  | { ok: true; status: 'address_only'; address: string; projects: number; directory: number }
  | { ok: true; status: 'no_address' | 'mismatch' }

export async function saveJobAddress(admin: Admin, companyId: string, job: string, pageText: string): Promise<JobAddressResult> {
  const page = parseJobPage(pageText)
  if (page.jobNumber && page.jobNumber !== job) return { ok: true, status: 'mismatch' }
  const line = addressLine(page)
  if (!line) return { ok: true, status: 'no_address' }

  let hit: { lat: number; lng: number } | null = null
  let approximate = false
  for (const q of addressQueries(page)) {
    const g = await geocodeAddress(q.query)
    await pace()
    if (g) { hit = { lat: g.lat, lng: g.lng }; approximate = q.approximate; break }
  }

  if (hit) {
    const { data: existing } = await admin.from('payroll_audit_job_places').select('source').eq('company_id', companyId).eq('job_number', job).maybeSingle()
    if (existing?.source !== 'manual') {
      await admin.from('payroll_audit_job_places').upsert({
        company_id: companyId, job_number: job, address: line, latitude: hit.lat, longitude: hit.lng,
        source: approximate ? 'kalos:approx' : 'kalos',
      }, { onConflict: 'company_id,job_number' })
    }
  }
  const exact = hit && !approximate ? hit : null

  // Fill blanks on the cards that carry this job number. Never overwrite.
  let projects = 0
  const { data: prs } = await admin.from('projects').select('id, job_location, formatted_address, latitude, longitude').eq('company_id', companyId).eq('job_number', job)
  for (const p of prs ?? []) {
    const patch: Record<string, unknown> = {}
    if (blank(p.job_location as string | null)) patch.job_location = line
    if (blank(p.formatted_address as string | null)) patch.formatted_address = line
    if (exact && (p.latitude === null || p.longitude === null)) { patch.latitude = exact.lat; patch.longitude = exact.lng }
    if (Object.keys(patch).length) { await admin.from('projects').update(patch).eq('id', p.id as string); projects++ }
  }

  let directory = 0
  const { data: ds } = await admin.from('schedule_directory').select('id, address, latitude, longitude').eq('company_id', companyId).eq('job_number', job)
  for (const d of ds ?? []) {
    const patch: Record<string, unknown> = {}
    if (blank(d.address as string | null)) patch.address = line
    if (exact && (d.latitude === null || d.longitude === null)) { patch.latitude = exact.lat; patch.longitude = exact.lng; patch.geocoded_at = new Date().toISOString(); patch.geocode_error = null }
    if (Object.keys(patch).length) { await admin.from('schedule_directory').update(patch).eq('id', d.id as string); directory++ }
  }

  return hit
    ? { ok: true, status: 'saved', address: line, approximate, projects, directory }
    : { ok: true, status: 'address_only', address: line, projects, directory }
}
