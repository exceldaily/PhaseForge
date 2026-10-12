'use server'

import { revalidatePath } from 'next/cache'
import { geocodeAddress } from '@/lib/travel/geocode'
import { deriveWorkerKey } from '@/lib/payroll-audit/auth'
import {
  ensureSettings, fail, paCtx, payPeriod, queueRun, workerMaster,
} from '@/lib/payroll-audit/server'

// Dashboard actions. Every one re-checks that the caller is the owner of a
// company with the module on. None of them can reach Kalos:
// they only queue work for the local worker and manage PhaseForge's own data.

const STATUSES = ['pending', 'justified', 'correction_needed', 'resolved', 'unable_to_verify'] as const
type Status = (typeof STATUSES)[number]
const refresh = () => revalidatePath('/app/payroll-audit')

export async function startAudit(input: { start?: string; end?: string; period?: 'current' | 'previous' }) {
  try {
    const c = await paCtx()
    const s = await ensureSettings(c.admin, c.companyId)
    const range = input.period ? payPeriod(input.period, s.timezone) : { start: input.start ?? '', end: input.end ?? '' }
    const r = await queueRun(c.admin, { companyId: c.companyId, start: range.start, end: range.end, trigger: 'manual', requestedBy: c.userId })
    if (r.ok) refresh()
    return r.ok ? { ok: true as const, id: r.id } : { ok: false as const, error: r.error }
  } catch (e) { return fail(e) }
}

export async function stopAudit(runId: string) {
  try {
    const c = await paCtx()
    const { data: run } = await c.admin.from('payroll_audit_runs').select('status').eq('id', runId).eq('company_id', c.companyId).single()
    if (!run) return { ok: false as const, error: 'Run not found.' }
    if (run.status === 'queued') {
      await c.admin.from('payroll_audit_runs').update({ status: 'cancelled', completed_at: new Date().toISOString(), message: 'Stopped before it started' }).eq('id', runId)
    } else if (run.status === 'running') {
      await c.admin.from('payroll_audit_runs').update({ cancel_requested: true, message: 'Stopping after the current timesheet' }).eq('id', runId)
    }
    refresh()
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function retryAudit(runId: string) {
  try {
    const c = await paCtx()
    const { data: run } = await c.admin.from('payroll_audit_runs').select('range_start, range_end, status').eq('id', runId).eq('company_id', c.companyId).single()
    if (!run) return { ok: false as const, error: 'Run not found.' }
    if (run.status === 'queued' || run.status === 'running') return { ok: false as const, error: 'That audit is still in progress.' }
    const r = await queueRun(c.admin, {
      companyId: c.companyId, start: run.range_start as string, end: run.range_end as string, trigger: 'manual', requestedBy: c.userId, retryOf: runId,
    })
    if (r.ok) refresh()
    return r.ok ? { ok: true as const } : { ok: false as const, error: r.error }
  } catch (e) { return fail(e) }
}

export async function reviewFinding(input: { id: string; status: Status; note: string }) {
  try {
    const c = await paCtx()
    if (!STATUSES.includes(input.status)) return { ok: false as const, error: 'Unknown status.' }
    const note = input.note.trim().slice(0, 2000)
    const { data: f } = await c.admin.from('payroll_audit_findings').select('review_status').eq('id', input.id).eq('company_id', c.companyId).single()
    if (!f) return { ok: false as const, error: 'Finding not found.' }
    await c.admin.from('payroll_audit_findings').update({
      review_status: input.status, review_note: note || null, reviewed_by: c.userId, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', input.id)
    await c.admin.from('payroll_audit_review_log').insert({
      company_id: c.companyId, finding_id: input.id, actor_id: c.userId, actor_name: c.userName,
      from_status: f.review_status as string, to_status: input.status, note: note || null,
    })
    refresh()
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function saveSettings(input: {
  toleranceMinutes: number; includePolicyDeduction: boolean; scheduleEnabled: boolean; scheduleDaysBack: number; notifyNewFlags: boolean
}) {
  try {
    const c = await paCtx()
    const tol = Math.round(input.toleranceMinutes)
    const days = Math.round(input.scheduleDaysBack)
    if (!(tol >= 0 && tol <= 600)) return { ok: false as const, error: 'Tolerance must be between 0 and 600 minutes.' }
    if (!(days >= 1 && days <= 31)) return { ok: false as const, error: 'Look back between 1 and 31 days.' }
    await ensureSettings(c.admin, c.companyId)
    await c.admin.from('payroll_audit_settings').update({
      tolerance_minutes: tol, include_policy_deduction: input.includePolicyDeduction, schedule_enabled: input.scheduleEnabled,
      schedule_days_back: days, notify_new_flags: input.notifyNewFlags, updated_by: c.userId, updated_at: new Date().toISOString(),
    }).eq('company_id', c.companyId)
    refresh()
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function addExclusion(input: { name: string; kalosEmployeeId?: string; note?: string }) {
  try {
    const c = await paCtx()
    const name = input.name.trim()
    if (!name) return { ok: false as const, error: 'Enter a name.' }
    const { error } = await c.admin.from('payroll_audit_exclusions').insert({
      company_id: c.companyId, employee_name: name, kalos_employee_id: input.kalosEmployeeId?.trim() || null, note: input.note?.trim() || null, created_by: c.userId,
    })
    if (error) return { ok: false as const, error: error.code === '23505' ? 'That person is already excluded.' : error.message }
    refresh()
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function removeExclusion(id: string) {
  try {
    const c = await paCtx()
    await c.admin.from('payroll_audit_exclusions').delete().eq('id', id).eq('company_id', c.companyId)
    refresh()
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/** Fix an unmatched job by typing its address. Geocoded once, kept, and always wins over guesses. */
export async function setJobPlace(input: { jobNumber: string; address: string }) {
  try {
    const c = await paCtx()
    const job = input.jobNumber.trim()
    const address = input.address.trim()
    if (!job || !address) return { ok: false as const, error: 'Enter the job number and its address.' }
    const g = await geocodeAddress(address)
    if (!g) return { ok: false as const, error: 'That address could not be located. Add the city and state.' }
    await c.admin.from('payroll_audit_job_places').upsert({
      company_id: c.companyId, job_number: job, address, latitude: g.lat, longitude: g.lng, source: 'manual', created_by: c.userId,
    }, { onConflict: 'company_id,job_number' })
    refresh()
    return { ok: true as const, label: g.label }
  } catch (e) { return fail(e) }
}

/** The key the worker signs with. Shown only to the owner, never logged, and replaced by rotating. */
export async function revealWorkerKey(rotate = false) {
  try {
    const c = await paCtx()
    const master = workerMaster()
    if (!master) return { ok: false as const, error: 'PAYROLL_AUDIT_MASTER_KEY is not set on the server yet.' }
    const s = await ensureSettings(c.admin, c.companyId)
    let version = s.workerKeyVersion
    if (rotate) {
      version += 1
      await c.admin.from('payroll_audit_settings').update({ worker_key_version: version }).eq('company_id', c.companyId)
    }
    return { ok: true as const, companyId: c.companyId, key: deriveWorkerKey(master, c.companyId, version) }
  } catch (e) { return fail(e) }
}

/** Light status for the live progress bar and the worker-online badge. */
export async function pollStatus() {
  try {
    const c = await paCtx()
    const { expireStaleRuns, isWorkerOnline } = await import('@/lib/payroll-audit/server')
    await expireStaleRuns(c.admin, c.companyId)
    const s = await ensureSettings(c.admin, c.companyId)
    const { data } = await c.admin.from('payroll_audit_runs').select('id, status, phase, message, progress_current, progress_total, error, error_code, cancel_requested, completed_at')
      .eq('company_id', c.companyId).order('queued_at', { ascending: false }).limit(1)
    return { ok: true as const, workerOnline: isWorkerOnline(s), workerName: s.workerName, run: data?.[0] ?? null }
  } catch (e) { return fail(e) }
}
