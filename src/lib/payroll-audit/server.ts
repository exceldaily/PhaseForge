import 'server-only'

// Server side of the Payroll Travel Audit: who may use it, job and employee
// lookups, cached routing, and the lifecycle of an audit run. The browser
// worker only reads Kalos and posts page text; everything that decides
// anything happens here.
//
// Nothing in this file (or anywhere in the feature) writes to Kalos.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAdminOrg } from '@/lib/permissions'
import { logger } from '@/lib/logger'
import { geocodeAddress, pace } from '@/lib/travel/geocode'
import { driveRoute } from '@/lib/travel/osrm'
import { matchEmployee } from '@/lib/travel/geo'
import { auditEmployee, type AuditEmployee, type AuditEntry, type EngineFinding, type EngineStats, type Place, type RouteFn } from './engine'
import { addDays, payWeekStart, todayIn } from './time'

export const PA_MODULE_KEY = 'payroll_audit'
export const WORKER_ONLINE_SECONDS = 90
const STALE_RUNNING_MIN = 20
const STALE_QUEUED_HOURS = 24
const GEOCODE_BUDGET = 25

/** Named on the request that built this feature. Seeded once per company; editable in settings. */
export const DEFAULT_EXCLUSIONS = ['Alex Orr', 'Chad Minear', 'Yeriel', 'Evan Nicholson', 'Brandon Harrell']

export type Admin = ReturnType<typeof createAdminClient>
type Row = Record<string, unknown>

export interface PaContext { userId: string; userName: string; companyId: string; admin: Admin }

async function resolve(): Promise<PaContext | 'signed-out' | 'no-company' | 'module-off' | 'not-admin'> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'signed-out'
  const { data: profile } = await supabase.from('profiles').select('company_id, role, ops_role, full_name').eq('id', user.id).single()
  if (!profile?.company_id) return 'no-company'
  const { data: mod } = await supabase.from('organization_modules').select('enabled')
    .eq('company_id', profile.company_id).eq('module_key', PA_MODULE_KEY).maybeSingle()
  if (!mod?.enabled) return 'module-off'
  if (!canAdminOrg(profile)) return 'not-admin'
  return { userId: user.id, userName: (profile.full_name as string | null)?.trim() || 'An administrator', companyId: profile.company_id as string, admin: createAdminClient() }
}

/** Page guard: owners and admins of a company that has the module on. */
export async function requirePayrollAudit(): Promise<PaContext> {
  const ctx = await resolve()
  if (ctx === 'signed-out') redirect('/login')
  if (typeof ctx === 'string') redirect('/app/dashboard')
  return ctx
}

/** Action guard: throws instead of redirecting. */
export async function paCtx(): Promise<PaContext> {
  const ctx = await resolve()
  if (ctx === 'signed-out') throw new Error('You are signed out.')
  if (ctx === 'no-company') throw new Error('No organization.')
  if (ctx === 'module-off') throw new Error('Payroll Audit is not switched on for your organization.')
  if (ctx === 'not-admin') throw new Error('Only an owner or administrator can use Payroll Audit.')
  return ctx
}

export const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'Something went wrong.' })

/* ── Settings and exclusions ─────────────────────────────────────────────── */

export interface PaSettings {
  toleranceMinutes: number
  includePolicyDeduction: boolean
  timezone: string
  scheduleEnabled: boolean
  scheduleDaysBack: number
  notifyNewFlags: boolean
  workerKeyVersion: number
  workerLastSeen: string | null
  workerName: string | null
  workerState: string | null
}

function mapSettings(r: Row): PaSettings {
  return {
    toleranceMinutes: Number(r.tolerance_minutes), includePolicyDeduction: !!r.include_policy_deduction,
    timezone: String(r.timezone), scheduleEnabled: !!r.schedule_enabled, scheduleDaysBack: Number(r.schedule_days_back),
    notifyNewFlags: !!r.notify_new_flags, workerKeyVersion: Number(r.worker_key_version),
    workerLastSeen: (r.worker_last_seen as string | null) ?? null, workerName: (r.worker_name as string | null) ?? null,
    workerState: (r.worker_state as string | null) ?? null,
  }
}

export async function ensureSettings(admin: Admin, companyId: string): Promise<PaSettings> {
  const { data } = await admin.from('payroll_audit_settings').select('*').eq('company_id', companyId).maybeSingle()
  if (data) return mapSettings(data)
  const { data: created } = await admin.from('payroll_audit_settings').upsert({ company_id: companyId }, { onConflict: 'company_id' }).select('*').single()
  const { count } = await admin.from('payroll_audit_exclusions').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
  if (!count) await admin.from('payroll_audit_exclusions').insert(DEFAULT_EXCLUSIONS.map((employee_name) => ({ company_id: companyId, employee_name })))
  return mapSettings(created as Row)
}

export interface Exclusion { id: string; employeeName: string; kalosEmployeeId: string | null; note: string | null }

export async function loadExclusions(admin: Admin, companyId: string): Promise<Exclusion[]> {
  const { data } = await admin.from('payroll_audit_exclusions').select('id, employee_name, kalos_employee_id, note').eq('company_id', companyId).order('employee_name')
  return (data ?? []).map((r) => ({ id: r.id as string, employeeName: r.employee_name as string, kalosEmployeeId: (r.kalos_employee_id as string | null) ?? null, note: (r.note as string | null) ?? null }))
}

const SUFFIX = new Set(['jr', 'sr', 'ii', 'iii', 'iv'])
export const nameTokens = (s: string) => s.toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter((t) => t && !SUFFIX.has(t))
export const normName = (s: string) => nameTokens(s).join(' ')

/** Kalos id first. Otherwise every word of the exclusion must appear in the name ("Yeriel" matches "Yeriel Dominguez"). */
export function findExclusion(list: Exclusion[], kalosId: string | null, name: string): Exclusion | undefined {
  if (kalosId) { const byId = list.find((e) => e.kalosEmployeeId === kalosId); if (byId) return byId }
  const have = new Set(nameTokens(name))
  return list.find((e) => !e.kalosEmployeeId && nameTokens(e.employeeName).length > 0 && nameTokens(e.employeeName).every((t) => have.has(t)))
}

/* ── Worker identity ─────────────────────────────────────────────────────── */

export function workerMaster(): string | null { return process.env.PAYROLL_AUDIT_MASTER_KEY?.length ? process.env.PAYROLL_AUDIT_MASTER_KEY : null }

export function isWorkerOnline(s: Pick<PaSettings, 'workerLastSeen'>, now = Date.now()): boolean {
  return !!s.workerLastSeen && now - Date.parse(s.workerLastSeen) < WORKER_ONLINE_SECONDS * 1000
}

/* ── Runs ────────────────────────────────────────────────────────────────── */

export function weekStartsIn(start: string, end: string): string[] {
  const out: string[] = []
  for (let w = payWeekStart(start); w <= end; w = addDays(w, 7)) out.push(w)
  return out
}

export function payPeriod(which: 'current' | 'previous', tz: string, now = new Date()): { start: string; end: string } {
  const thisWeek = payWeekStart(todayIn(tz, now))
  const start = which === 'current' ? thisWeek : addDays(thisWeek, -7)
  return { start, end: addDays(start, 6) }
}

export async function queueRun(admin: Admin, input: {
  companyId: string; start: string; end: string; trigger: 'manual' | 'scheduled'; requestedBy: string | null; retryOf?: string | null
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start) || !/^\d{4}-\d{2}-\d{2}$/.test(input.end)) return { ok: false, error: 'Pick a valid date range.' }
  if (input.end < input.start) return { ok: false, error: 'The end date is before the start date.' }
  if (weekStartsIn(input.start, input.end).length > 14) return { ok: false, error: 'Pick a range of 14 weeks or fewer.' }
  const { data, error } = await admin.from('payroll_audit_runs').insert({
    company_id: input.companyId, trigger: input.trigger, range_start: input.start, range_end: input.end,
    requested_by: input.requestedBy, retry_of: input.retryOf ?? null, message: 'Waiting for the audit worker',
  }).select('id').single()
  if (error) return { ok: false, error: error.code === '23505' ? 'An audit is already queued or running. Stop it first or wait for it to finish.' : error.message }
  return { ok: true, id: data.id as string }
}

/** Fails runs that can no longer finish, so they never sit "running" forever. */
export async function expireStaleRuns(admin: Admin, companyId: string): Promise<void> {
  const now = Date.now()
  const lost = new Date(now - STALE_RUNNING_MIN * 60_000).toISOString()
  const old = new Date(now - STALE_QUEUED_HOURS * 3_600_000).toISOString()
  const { data: a } = await admin.from('payroll_audit_runs').update({
    status: 'failed', error_code: 'worker_lost', error: 'The audit worker stopped reporting. The run was marked failed; nothing was changed in Kalos.',
    completed_at: new Date().toISOString(),
  }).eq('company_id', companyId).eq('status', 'running').lt('heartbeat_at', lost).select('id')
  const { data: b } = await admin.from('payroll_audit_runs').update({
    status: 'failed', error_code: 'worker_offline', error: 'No audit worker picked this run up within 24 hours.',
    completed_at: new Date().toISOString(),
  }).eq('company_id', companyId).eq('status', 'queued').lt('queued_at', old).select('id')
  if ((a?.length ?? 0) + (b?.length ?? 0) > 0) {
    await notifyAdmins(admin, companyId, 'payroll_audit_failed', 'Payroll audit did not finish',
      (b?.length ?? 0) > 0 ? 'The audit worker was offline, so a queued run expired. Start the worker and run it again.' : 'The audit worker stopped reporting mid run.')
  }
}

export async function notifyAdmins(admin: Admin, companyId: string, type: string, title: string, body: string): Promise<void> {
  try {
    const { data: people } = await admin.from('profiles').select('id, role, ops_role').eq('company_id', companyId)
    const ids = (people ?? []).filter((p) => canAdminOrg(p)).map((p) => p.id as string)
    if (!ids.length) return
    await admin.from('notifications').insert(ids.map((user_id) => ({
      user_id, company_id: companyId, type, title, body: body.length > 180 ? `${body.slice(0, 177)}...` : body, link: '/app/payroll-audit',
    })))
  } catch (e) { logger.error('payroll audit notify', e) }
}

/* ── Employees, homes, and job places ────────────────────────────────────── */

interface EmpRow { id: string; name: string; schedule_name: string | null; kalos_employee_id: string | null; latitude: number | null; longitude: number | null }

async function loadEmployees(admin: Admin, companyId: string): Promise<EmpRow[]> {
  const { data } = await admin.from('employees').select('id, name, schedule_name, kalos_employee_id, latitude, longitude').eq('company_id', companyId).eq('is_active', true)
  return (data ?? []) as EmpRow[]
}

/** Kalos id, then the exact name (ignoring Jr./punctuation), then the roster matcher. Never guesses between two. */
export function findEmployee(emps: EmpRow[], kalosId: string | null, name: string): EmpRow | null {
  if (kalosId) { const byId = emps.find((e) => e.kalos_employee_id === kalosId); if (byId) return byId }
  const n = normName(name)
  const exact = emps.filter((e) => normName(e.name) === n)
  if (exact.length === 1) return exact[0]
  return matchEmployee(name, emps, null)
}

const rk = (n: number) => n.toFixed(3)
export const routeKey = (a: Place, b: Place) => `${rk(a.lat)},${rk(a.lng)}>${rk(b.lat)},${rk(b.lng)}`

/** Routing with an in-process cache in front of the shared table. Sequential on purpose: the public router is a courtesy service. */
export function cachedRoute(admin: Admin): RouteFn {
  const mem = new Map<string, { minutes: number; miles: number | null; provider: string } | null>()
  return async (a, b) => {
    const key = routeKey(a, b)
    if (mem.has(key)) return mem.get(key)!
    const { data } = await admin.from('payroll_route_cache').select('minutes, miles, provider, computed_at').eq('route_key', key).maybeSingle()
    if (data && Date.now() - Date.parse(data.computed_at as string) < 90 * 86_400_000) {
      const v = { minutes: data.minutes as number, miles: data.miles === null ? null : Number(data.miles), provider: data.provider as string }
      mem.set(key, v)
      return v
    }
    const r = await driveRoute(a, b)
    if (!r) { mem.set(key, null); return null }
    const v = { minutes: r.minutes, miles: r.miles, provider: 'osrm' }
    await admin.from('payroll_route_cache').upsert({ route_key: key, minutes: v.minutes, miles: v.miles, provider: v.provider, computed_at: new Date().toISOString() })
    mem.set(key, v)
    return v
  }
}

/**
 * Where each job number is. Order: a place an admin typed in or one read from
 * the Kalos job page, then PhaseForge projects, the schedule directory, and PM stores. An address with no
 * coordinates is geocoded once and remembered.
 */
export async function resolveJobPlaces(admin: Admin, companyId: string, jobs: string[]): Promise<Map<string, Place>> {
  const out = new Map<string, Place>()
  const wanted = [...new Set(jobs.map((j) => j.trim()).filter(Boolean))]
  if (!wanted.length) return out

  const { data: saved } = await admin.from('payroll_audit_job_places').select('job_number, address, latitude, longitude, source').eq('company_id', companyId).in('job_number', wanted)
  const cache = new Map<string, { address: string; lat: number; lng: number; source: string }>()
  for (const s of saved ?? []) {
    const v = { address: s.address as string, lat: s.latitude as number, lng: s.longitude as number, source: s.source as string }
    cache.set(s.job_number as string, v)
    if (v.source === 'manual' || v.source.startsWith('kalos')) out.set(s.job_number as string, { lat: v.lat, lng: v.lng })
  }

  const cand = new Map<string, { lat: number | null; lng: number | null; address: string | null; source: string }>()
  const offer = (job: string | null, lat: number | null, lng: number | null, address: string | null, source: string) => {
    if (!job || out.has(job)) return
    const cur = cand.get(job)
    if (cur && cur.lat !== null) return
    if (lat !== null && lng !== null) cand.set(job, { lat, lng, address, source })
    else if (address && !cur) cand.set(job, { lat: null, lng: null, address, source })
  }

  const open = wanted.filter((j) => !out.has(j))
  if (open.length) {
    const [{ data: projects }, { data: dir }, { data: pm }] = await Promise.all([
      admin.from('projects').select('job_number, latitude, longitude, formatted_address, job_location').eq('company_id', companyId).in('job_number', open),
      admin.from('schedule_directory').select('job_number, latitude, longitude, address').eq('company_id', companyId).in('job_number', open),
      admin.from('pm_job_numbers').select('job_number, pm_stores(address, city, state, postal_code)').eq('company_id', companyId).in('job_number', open),
    ])
    for (const p of projects ?? []) offer(p.job_number as string, p.latitude as number | null, p.longitude as number | null, (p.formatted_address ?? p.job_location) as string | null, 'project')
    for (const d of dir ?? []) offer(d.job_number as string, d.latitude as number | null, d.longitude as number | null, d.address as string | null, 'directory')
    for (const r of pm ?? []) {
      const s = r.pm_stores as unknown as { address: string | null; city: string | null; state: string | null; postal_code: string | null } | null
      const addr = s ? [s.address, s.city, [s.state, s.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ') : ''
      offer(r.job_number as string, null, null, addr || null, 'pm_store')
    }
  }

  let budget = GEOCODE_BUDGET
  for (const [job, c] of cand) {
    if (c.lat !== null && c.lng !== null) { out.set(job, { lat: c.lat, lng: c.lng }); continue }
    const hit = cache.get(job)
    if (hit && c.address && hit.address === c.address) { out.set(job, { lat: hit.lat, lng: hit.lng }); continue }
    if (!c.address || budget <= 0) continue
    budget--
    const g = await geocodeAddress(c.address)
    await pace()
    if (!g) continue
    out.set(job, { lat: g.lat, lng: g.lng })
    await admin.from('payroll_audit_job_places').upsert({
      company_id: companyId, job_number: job, address: c.address, latitude: g.lat, longitude: g.lng, source: `geocoded:${c.source}`,
    }, { onConflict: 'company_id,job_number' })
  }
  return out
}

/* ── Analysis ────────────────────────────────────────────────────────────── */

export interface AnalysisResult {
  stats: Record<string, number>
  newFlags: number
  newUnverifiable: number
  newUnmatched: number
}

async function fetchAllEntries(admin: Admin, companyId: string, kalosId: string, fromWeek: string, toWeek: string): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from('payroll_audit_entries').select('*').eq('company_id', companyId).eq('kalos_employee_id', kalosId)
      .gte('week_start', fromWeek).lte('week_start', toWeek).order('start_at').range(from, from + 999)
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < 1000) break
  }
  return rows
}

export async function analyzeRun(admin: Admin, companyId: string, runId: string, range: { start: string; end: string }, settings: PaSettings): Promise<AnalysisResult> {
  const { data: seen } = await admin.from('payroll_audit_entries').select('kalos_employee_id, employee_name').eq('company_id', companyId).eq('run_id', runId).limit(20000)
  const people = new Map<string, string>()
  for (const s of seen ?? []) people.set(s.kalos_employee_id as string, s.employee_name as string)

  const [emps, exclusions] = await Promise.all([loadEmployees(admin, companyId), loadExclusions(admin, companyId)])
  const route = cachedRoute(admin)
  const fromWeek = addDays(payWeekStart(range.start), -7)
  const toWeek = addDays(payWeekStart(range.end), 7)

  const perEmployee: { kalosId: string; name: string; entries: Row[] }[] = []
  const allJobs = new Set<string>()
  for (const [kalosId, name] of people) {
    const rows = await fetchAllEntries(admin, companyId, kalosId, fromWeek, toWeek)
    for (const r of rows) if (r.job_number) allJobs.add(r.job_number as string)
    perEmployee.push({ kalosId, name, entries: rows })
  }
  const places = await resolveJobPlaces(admin, companyId, [...allJobs])

  const totals: EngineStats = { entries: 0, travelEntries: 0, trips: 0, withinAllowance: 0, flagged: 0, unverifiable: 0, suppressedForExclusion: 0 }
  const produced: EngineFinding[] = []
  const owners = new Map<string, { kalosId: string | null; name: string }>()
  const unmatched = new Map<string, Set<string>>()
  let excludedPeople = 0

  for (const p of perEmployee) {
    const emp = findEmployee(emps, p.kalosId, p.name)
    if (emp && emp.kalos_employee_id !== p.kalosId) await admin.from('employees').update({ kalos_employee_id: p.kalosId }).eq('id', emp.id)
    const ex = findExclusion(exclusions, p.kalosId, p.name)
    if (ex && !ex.kalosEmployeeId) await admin.from('payroll_audit_exclusions').update({ kalos_employee_id: p.kalosId }).eq('id', ex.id)
    if (ex) excludedPeople++
    const employee: AuditEmployee = {
      kalosId: p.kalosId, name: p.name, excluded: !!ex,
      home: emp && emp.latitude !== null && emp.longitude !== null ? { lat: emp.latitude, lng: emp.longitude } : null,
    }
    const entries: AuditEntry[] = p.entries.map((r) => ({
      key: r.entry_key as string, workDate: r.work_date as string, jobNumber: (r.job_number as string | null) ?? null, isTravel: !!r.is_travel,
      startMs: Date.parse(r.start_at as string), endMs: Date.parse(r.end_at as string),
      hours: r.hours === null ? null : Number(r.hours), policyDeductionMinutes: Number(r.policy_deduction_minutes ?? 0), classCode: (r.class_code as string | null) ?? null,
    }))
    const r = await auditEmployee({ employee, entries, jobPlaces: places, route, settings: { toleranceMinutes: settings.toleranceMinutes, includePolicyDeduction: settings.includePolicyDeduction }, timezone: settings.timezone })
    for (const k of Object.keys(totals) as (keyof EngineStats)[]) totals[k] += r.stats[k]
    for (const f of r.findings) {
      if (f.workDate && (f.workDate < range.start || f.workDate > range.end)) continue
      produced.push(f)
      owners.set(f.key, { kalosId: p.kalosId, name: p.name })
    }
    for (const j of r.unmatchedJobs) { if (!unmatched.has(j)) unmatched.set(j, new Set()); unmatched.get(j)!.add(p.name) }
  }

  // Existing rows for the keys we are about to write.
  const keys = produced.map((f) => f.key)
  const existing = new Map<string, { id: string }>()
  for (let i = 0; i < keys.length; i += 100) {
    const { data } = await admin.from('payroll_audit_findings').select('id, finding_key').eq('company_id', companyId).in('finding_key', keys.slice(i, i + 100))
    for (const r of data ?? []) existing.set(r.finding_key as string, { id: r.id as string })
  }

  const dataCols = (f: EngineFinding) => {
    const o = owners.get(f.key)
    return {
      category: f.category, kalos_employee_id: o?.kalosId ?? null, employee_name: o?.name ?? null, work_date: f.workDate, travel_type: f.travelType,
      origin_label: f.originLabel, dest_label: f.destLabel, job_numbers: f.jobNumbers, entry_keys: f.entryKeys,
      recorded_minutes: f.recordedMinutes, estimated_minutes: f.estimatedMinutes, allowed_minutes: f.allowedMinutes, excess_minutes: f.excessMinutes,
      route_provider: f.routeProvider, summary: f.summary, evidence: f.evidence, assumptions: f.assumptions,
      last_run_id: runId, superseded_at: null, updated_at: new Date().toISOString(),
    }
  }

  const inserts = produced.filter((f) => !existing.has(f.key)).map((f) => ({
    company_id: companyId, finding_key: f.key, first_run_id: runId, ...dataCols(f),
    review_status: f.category === 'unable_to_verify' ? 'unable_to_verify' : 'pending',
  }))
  for (let i = 0; i < inserts.length; i += 200) await admin.from('payroll_audit_findings').insert(inserts.slice(i, i + 200))
  const updates = produced.filter((f) => existing.has(f.key))
  for (let i = 0; i < updates.length; i += 20) {
    await Promise.all(updates.slice(i, i + 20).map((f) => admin.from('payroll_audit_findings').update(dataCols(f)).eq('id', existing.get(f.key)!.id)))
  }

  // Findings this rerun no longer produces (the timesheet was fixed) are kept, not deleted.
  const ids = [...people.keys()]
  if (ids.length) {
    const { data: old } = await admin.from('payroll_audit_findings').select('id, finding_key').eq('company_id', companyId).in('kalos_employee_id', ids)
      .gte('work_date', range.start).lte('work_date', range.end).is('superseded_at', null).neq('last_run_id', runId).limit(5000)
    const gone = (old ?? []).map((o) => o.id as string)
    if (gone.length) await admin.from('payroll_audit_findings').update({ superseded_at: new Date().toISOString() }).in('id', gone)
  }

  // Unmatched jobs: one finding per job number, cleared when the job gets an address.
  let newUnmatched = 0
  for (const [job, who] of unmatched) {
    const key = `unmatched|${job}`
    const row = {
      category: 'unmatched_job', work_date: null, job_numbers: [job], entry_keys: [] as string[],
      summary: `Job ${job} has no address in PhaseForge, so travel to or from it cannot be verified. Entered by ${[...who].slice(0, 4).join(', ')}${who.size > 4 ? ` and ${who.size - 4} more` : ''}.`,
      assumptions: [] as string[], evidence: { employees: [...who] }, last_run_id: runId, superseded_at: null, updated_at: new Date().toISOString(),
    }
    const { data: ex } = await admin.from('payroll_audit_findings').select('id').eq('company_id', companyId).eq('finding_key', key).maybeSingle()
    if (ex) await admin.from('payroll_audit_findings').update(row).eq('id', ex.id)
    else { await admin.from('payroll_audit_findings').insert({ company_id: companyId, finding_key: key, first_run_id: runId, review_status: 'pending', ...row }); newUnmatched++ }
  }
  const resolved = [...allJobs].filter((j) => places.has(j) && !unmatched.has(j))
  if (resolved.length) await admin.from('payroll_audit_findings').update({ superseded_at: new Date().toISOString() })
    .eq('company_id', companyId).eq('category', 'unmatched_job').in('finding_key', resolved.map((j) => `unmatched|${j}`)).is('superseded_at', null)

  const newOnes = inserts.filter((i) => i.category !== 'unable_to_verify')
  return {
    stats: {
      employeesReviewed: people.size, entriesChecked: totals.entries, travelEntries: totals.travelEntries, trips: totals.trips,
      withinAllowance: totals.withinAllowance, flagged: totals.flagged, unverifiable: totals.unverifiable,
      suppressedForExclusion: totals.suppressedForExclusion, excludedPeople, unmatchedJobs: unmatched.size, findings: produced.length,
    },
    newFlags: newOnes.length,
    newUnverifiable: inserts.length - newOnes.length,
    newUnmatched,
  }
}

export async function finishRun(admin: Admin, companyId: string, runId: string, outcome: 'completed' | 'failed' | 'cancelled', info: { errorCode?: string | null; error?: string | null; workerStats?: Record<string, number> }): Promise<void> {
  const settings = await ensureSettings(admin, companyId)
  const { data: run } = await admin.from('payroll_audit_runs').select('range_start, range_end, status').eq('id', runId).eq('company_id', companyId).single()
  if (!run || ['completed', 'failed', 'cancelled'].includes(run.status as string)) return

  if (outcome !== 'completed') {
    await admin.from('payroll_audit_runs').update({
      status: outcome, error_code: info.errorCode ?? null, error: info.error ?? null, completed_at: new Date().toISOString(),
      message: outcome === 'cancelled' ? 'Stopped' : (info.error ?? 'Failed'), stats: info.workerStats ?? {},
    }).eq('id', runId)
    if (outcome === 'failed') {
      const expired = info.errorCode === 'auth_expired'
      await notifyAdmins(admin, companyId, expired ? 'payroll_audit_auth' : 'payroll_audit_failed',
        expired ? 'Payroll audit stopped: Kalos sign-in expired' : 'Payroll audit failed',
        expired ? 'Sign in to Kalos in the audit worker browser, then run the audit again. Nothing was changed in Kalos.' : (info.error ?? 'The audit run failed.'))
    }
    return
  }

  await admin.from('payroll_audit_runs').update({ phase: 'Saving audit findings', message: 'Analyzing travel' }).eq('id', runId)
  try {
    const a = await analyzeRun(admin, companyId, runId, { start: run.range_start as string, end: run.range_end as string }, settings)
    await admin.from('payroll_audit_runs').update({
      status: 'completed', completed_at: new Date().toISOString(), phase: 'Done', message: 'Audit complete',
      stats: { ...(info.workerStats ?? {}), ...a.stats, newFlags: a.newFlags, newUnverifiable: a.newUnverifiable, newUnmatched: a.newUnmatched },
    }).eq('id', runId)

    if (settings.notifyNewFlags) {
      const parts = [`${a.stats.employeesReviewed} technicians`, `${a.stats.entriesChecked} entries`]
      if (a.newFlags) parts.push(`${a.newFlags} new for review`)
      if (a.newUnverifiable) parts.push(`${a.newUnverifiable} unverifiable`)
      if (a.newUnmatched) parts.push(`${a.newUnmatched} unmatched jobs`)
      await notifyAdmins(admin, companyId, a.newFlags ? 'payroll_audit_flags' : 'payroll_audit_done',
        a.newFlags ? `Payroll audit: ${a.newFlags} new finding${a.newFlags === 1 ? '' : 's'}` : 'Payroll audit complete', parts.join(', '))
    }
    await admin.from('payroll_audit_findings').update({ notified_at: new Date().toISOString() }).eq('company_id', companyId).eq('first_run_id', runId).is('notified_at', null)
  } catch (e) {
    logger.error('payroll audit analyze', e)
    await admin.from('payroll_audit_runs').update({
      status: 'failed', error_code: 'analysis_error', error: 'The timesheets were read but analysis failed. Re-run the audit.', completed_at: new Date().toISOString(),
    }).eq('id', runId)
    await notifyAdmins(admin, companyId, 'payroll_audit_failed', 'Payroll audit failed', 'The timesheets were read but analysis failed.')
  }
}
