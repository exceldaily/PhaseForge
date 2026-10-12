import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deriveWorkerKey, verify } from '@/lib/payroll-audit/auth'
import { parseTimesheetText } from '@/lib/payroll-audit/parse'
import { weekday } from '@/lib/payroll-audit/time'
import {
  expireStaleRuns, finishRun, weekStartsIn, workerMaster, type Admin,
} from '@/lib/payroll-audit/server'
import { logger } from '@/lib/logger'
import { pendingJobNumbers, saveJobAddress } from '@/lib/payroll-audit/jobAddresses'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

// The only door the local audit worker uses. Outbound from the worker, signed
// per request (see lib/payroll-audit/auth.ts), and every failure to
// authenticate looks identical so nothing is learned by probing.
//
//   poll      heartbeat, and hand over the next queued run if there is one
//   progress  real counters for the dashboard; replies whether to stop
//   submit    one employee's timesheet page text for one pay week
//   complete  the worker is done (or gave up); the server analyses and closes
//   job-queue    job numbers PhaseForge has no address for
//   job-address  the text of one Kalos job page; the server keeps the address
//
// Nothing here can write to Kalos. The worker has no Kalos credentials to send
// and this server has nowhere to send them.

const ACTIONS = new Set(['poll', 'progress', 'submit', 'complete', 'job-queue', 'job-address'])
const MAX_BODY = 600_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const deny = () => NextResponse.json({ error: 'unauthorized' }, { status: 401 })
const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params
  if (!ACTIONS.has(action)) return bad('not found', 404)
  const master = workerMaster()
  if (!master) return bad('audit worker access is not configured on this server', 503)

  const body = await req.text()
  if (body.length > MAX_BODY) return bad('body too large', 413)
  const companyId = req.headers.get('x-pa-company') ?? ''
  if (!UUID.test(companyId)) return deny()

  let admin: Admin
  try { admin = createAdminClient() } catch { return bad('service credentials missing', 500) }

  const { data: s } = await admin.from('payroll_audit_settings').select('worker_key_version').eq('company_id', companyId).maybeSingle()
  const { data: mod } = await admin.from('organization_modules').select('enabled').eq('company_id', companyId).eq('module_key', 'payroll_audit').maybeSingle()
  if (!s || !mod?.enabled) return deny()

  const nonce = req.headers.get('x-pa-nonce') ?? ''
  const v = verify(deriveWorkerKey(master, companyId, Number(s.worker_key_version)), {
    ts: req.headers.get('x-pa-ts') ?? '', nonce, sig: req.headers.get('x-pa-sig') ?? '', companyId, action, body,
  })
  if (!v.ok) return deny()

  // One-time nonce: a captured request cannot be played twice.
  const { error: replay } = await admin.from('payroll_audit_nonces').insert({ nonce })
  if (replay) return deny()
  if (action === 'poll') await admin.from('payroll_audit_nonces').delete().lt('created_at', new Date(Date.now() - 3_600_000).toISOString())

  let json: Record<string, unknown> = {}
  try { json = body ? (JSON.parse(body) as Record<string, unknown>) : {} } catch { return bad('invalid json') }

  try {
    if (action === 'poll') return await poll(admin, companyId, json)
    if (action === 'job-queue') return NextResponse.json({ jobs: await pendingJobNumbers(admin, companyId, 150, json.retryApprox === true) })
    if (action === 'job-address') {
      const job = String(json.job ?? '')
      const pageText = typeof json.pageText === 'string' ? json.pageText : ''
      if (!/^[A-Za-z0-9-]{3,20}$/.test(job) || !pageText) return bad('job and pageText required')
      return NextResponse.json(await saveJobAddress(admin, companyId, job, pageText))
    }
    const runId = String(json.runId ?? '')
    if (!UUID.test(runId)) return bad('runId required')
    const { data: run } = await admin.from('payroll_audit_runs').select('id, status, range_start, range_end, cancel_requested').eq('id', runId).eq('company_id', companyId).maybeSingle()
    if (!run) return bad('run not found', 404)

    if (action === 'progress') {
      if (run.status !== 'running') return NextResponse.json({ cancel: true })
      await admin.from('payroll_audit_runs').update({
        phase: str(json.phase, 80), message: str(json.message, 200),
        progress_current: int(json.current), progress_total: int(json.total), heartbeat_at: new Date().toISOString(),
      }).eq('id', runId)
      return NextResponse.json({ cancel: !!run.cancel_requested })
    }

    if (action === 'submit') {
      if (run.status !== 'running') return bad('run is not running', 409)
      return await submit(admin, companyId, run as { id: string; range_start: string; range_end: string }, json)
    }

    // complete
    const outcome = json.outcome === 'failed' ? 'failed' : json.outcome === 'cancelled' || run.cancel_requested ? 'cancelled' : 'completed'
    await finishRun(admin, companyId, runId, outcome, {
      errorCode: str(json.errorCode, 40), error: str(json.error, 300),
      workerStats: Object.fromEntries(Object.entries((json.stats as Record<string, unknown>) ?? {}).filter(([, x]) => typeof x === 'number')) as Record<string, number>,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    logger.error(`payroll audit worker ${action}`, e)
    return bad('server error', 500)
  }
}

const str = (x: unknown, max: number) => (typeof x === 'string' && x ? x.slice(0, max) : null)
const int = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.round(x)) : 0)

async function poll(admin: Admin, companyId: string, json: Record<string, unknown>) {
  const now = new Date().toISOString()
  await expireStaleRuns(admin, companyId)
  const { data: queued } = await admin.from('payroll_audit_runs').select('id, range_start, range_end').eq('company_id', companyId)
    .eq('status', 'queued').order('queued_at').limit(1).maybeSingle()
  type Claimed = { id: string; range_start: string; range_end: string }
  let claimed = null as Claimed | null
  if (queued) {
    const { data } = await admin.from('payroll_audit_runs').update({
      status: 'running', started_at: now, heartbeat_at: now, phase: 'Starting', message: 'Worker picked up the run',
    }).eq('id', queued.id).eq('status', 'queued').select('id, range_start, range_end').maybeSingle()
    claimed = (data as Claimed | null) ?? null
  }
  await admin.from('payroll_audit_settings').update({
    worker_last_seen: now, worker_name: str(json.workerName, 60), worker_state: claimed ? 'running' : str(json.state, 30) ?? 'idle',
  }).eq('company_id', companyId)
  const { data: st } = await admin.from('payroll_audit_settings').select('timezone').eq('company_id', companyId).single()
  return NextResponse.json({
    run: claimed ? { id: claimed.id, rangeStart: claimed.range_start, rangeEnd: claimed.range_end, weekStarts: weekStartsIn(claimed.range_start, claimed.range_end) } : null,
    timezone: st?.timezone ?? 'America/New_York',
  })
}

async function submit(admin: Admin, companyId: string, run: { id: string; range_start: string; range_end: string }, json: Record<string, unknown>) {
  const kalosId = String(json.kalosEmployeeId ?? '')
  const weekStart = String(json.weekStart ?? '')
  const pageText = typeof json.pageText === 'string' ? json.pageText : ''
  if (!/^\d{1,12}$/.test(kalosId)) return bad('kalosEmployeeId must be the numeric id from the timesheet address')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || weekday(weekStart) !== 6) return bad('weekStart must be a Saturday')
  if (!weekStartsIn(run.range_start, run.range_end).includes(weekStart)) return bad('weekStart is outside this run')
  if (!pageText) return bad('pageText required')

  const { data: st } = await admin.from('payroll_audit_settings').select('timezone').eq('company_id', companyId).single()
  const parsed = parseTimesheetText(pageText, { weekStart, timezone: (st?.timezone as string) ?? 'America/New_York', kalosEmployeeId: kalosId })
  const name = parsed.employeeName ?? str(json.employeeName, 120) ?? `Employee ${kalosId}`
  const looksLikeTimesheet = parsed.totalHours !== null

  if (looksLikeTimesheet) {
    const now = new Date().toISOString()
    const rows = parsed.entries.map((e) => ({
      company_id: companyId, entry_key: e.entryKey, kalos_employee_id: kalosId, employee_name: name, week_start: weekStart, work_date: e.workDate,
      job_number: e.jobNumber, kalos_entry_status: e.status, class_code: e.classCode, class_name: e.className, is_travel: e.isTravel,
      start_at: e.startAt, end_at: e.endAt, start_text: e.startText, end_text: e.endText, hours: e.hours,
      policy_deduction_minutes: e.policyDeductionMinutes, brief_desc: e.briefDesc, system_notes: e.systemNotes, date_submitted: e.dateSubmitted,
      run_id: run.id, last_seen_at: now,
    }))
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await admin.from('payroll_audit_entries').upsert(rows.slice(i, i + 200), { onConflict: 'company_id,entry_key' })
      if (error) throw error
    }
    // Entries Kalos no longer shows for this person and week were corrected away.
    const keep = new Set(parsed.entries.map((e) => e.entryKey))
    const { data: old } = await admin.from('payroll_audit_entries').select('id, entry_key').eq('company_id', companyId).eq('kalos_employee_id', kalosId).eq('week_start', weekStart)
    const drop = (old ?? []).filter((o) => !keep.has(o.entry_key as string)).map((o) => o.id as string)
    if (drop.length) await admin.from('payroll_audit_entries').delete().in('id', drop)
  }
  return NextResponse.json({ ok: true, employeeName: name, entries: parsed.entries.length, travelEntries: parsed.entries.filter((e) => e.isTravel).length, looksLikeTimesheet, warnings: parsed.warnings.slice(0, 20) })
}
