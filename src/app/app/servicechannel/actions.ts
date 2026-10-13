'use server'

import { revalidatePath } from 'next/cache'
import { BASELINE_ENTRIES, BASELINE_SOURCE, MEASURE_KEYS, commitImport, fail, logEvent, scCtx } from '@/lib/servicechannel/server'
import { INTERNAL_STATUSES, QUEUES, type InternalStatus } from '@/lib/servicechannel/types'

// Every action re-checks the caller (owner, module on). Imports are applied by
// the database in one transaction; everything else is PhaseForge's own
// follow-up. Nothing here talks to ServiceChannel.

const refresh = (path = '/app/servicechannel') => { revalidatePath(path); revalidatePath('/app/servicechannel') }
const str = (v: unknown, max = 2000) => { const s = typeof v === 'string' ? v.trim() : ''; return s ? s.slice(0, max) : null }
const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
const isStatus = (v: unknown): v is InternalStatus => INTERNAL_STATUSES.includes(v as InternalStatus)

/* ── Imports ─────────────────────────────────────────────────────────────── */

export async function commitImportAction(importId: string) {
  try {
    const ctx = await scCtx()
    const stats = await commitImport(ctx, importId)
    refresh('/app/servicechannel/import'); refresh('/app/servicechannel/work-orders')
    return { ok: true as const, stats }
  } catch (e) { return fail(e) }
}

export async function discardImportAction(importId: string) {
  try {
    const ctx = await scCtx()
    await ctx.admin.from('sc_imports').update({ status: 'discarded', rows: null, plan: null }).eq('id', importId).eq('company_id', ctx.companyId).eq('status', 'draft')
    refresh('/app/servicechannel/import')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function saveMappingAction(input: { name: string; signature: string; mapping: Record<string, string> }) {
  try {
    const ctx = await scCtx()
    const name = str(input.name, 80)
    if (!name) return { ok: false as const, error: 'Give the mapping a name.' }
    const { data, error } = await ctx.admin.from('sc_import_mappings').upsert({
      company_id: ctx.companyId, name, signature: input.signature, mapping: input.mapping, created_by: ctx.userId, last_used_at: new Date().toISOString(),
    }, { onConflict: 'company_id,name' }).select('id').single()
    if (error) return { ok: false as const, error: error.message }
    refresh('/app/servicechannel/import')
    return { ok: true as const, id: data.id as string }
  } catch (e) { return fail(e) }
}

export async function deleteMappingAction(id: string) {
  try {
    const ctx = await scCtx()
    await ctx.admin.from('sc_import_mappings').delete().eq('id', id).eq('company_id', ctx.companyId)
    refresh('/app/servicechannel/import')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/* ── Cases ───────────────────────────────────────────────────────────────── */

export interface CasePatch {
  internalStatus?: string; ownerProfileId?: string | null; ownerName?: string | null; department?: string | null
  nextAction?: string | null; dueDate?: string | null; blockerReason?: string | null
}

export async function updateCaseAction(input: { workOrderId: string; patch: CasePatch; note?: string }) {
  try {
    const ctx = await scCtx()
    const { data: cur } = await ctx.admin.from('sc_cases').select('*').eq('work_order_id', input.workOrderId).eq('company_id', ctx.companyId).maybeSingle()
    if (!cur) return { ok: false as const, error: 'Case not found.' }
    const p = input.patch
    const row: Record<string, unknown> = { updated_at: new Date().toISOString(), last_update_at: new Date().toISOString() }
    const changes: string[] = []
    if (p.internalStatus !== undefined) {
      if (!isStatus(p.internalStatus)) return { ok: false as const, error: 'Unknown status.' }
      if (p.internalStatus === 'verified_resolved') return { ok: false as const, error: 'Use Verify resolved, which needs a note and no open tasks.' }
      if (p.internalStatus !== cur.internal_status) { row.internal_status = p.internalStatus; changes.push(`status ${cur.internal_status} → ${p.internalStatus}`) }
      if (p.internalStatus === 'accepted' && !cur.handoff_accepted_at) row.handoff_accepted_at = new Date().toISOString()
    }
    if (p.ownerProfileId !== undefined || p.ownerName !== undefined) {
      row.owner_profile_id = p.ownerProfileId ?? null; row.owner_name = str(p.ownerName, 120)
      if ((cur.owner_profile_id ?? null) !== (p.ownerProfileId ?? null)) { changes.push(`owner → ${row.owner_name ?? 'nobody'}`); row.handoff_accepted_at = null; if (!row.internal_status && cur.internal_status === 'new' && row.owner_profile_id) row.internal_status = 'assigned' }
    }
    if (p.department !== undefined) { row.department = str(p.department, 80); if (row.department !== cur.department) changes.push(`department → ${row.department ?? 'none'}`) }
    if (p.nextAction !== undefined) { row.next_action = str(p.nextAction, 500); if (row.next_action !== cur.next_action) changes.push('next action updated') }
    if (p.dueDate !== undefined) { row.due_date = date(p.dueDate); if (row.due_date !== cur.due_date) changes.push(`due ${row.due_date ?? 'cleared'}`) }
    if (p.blockerReason !== undefined) { row.blocker_reason = str(p.blockerReason, 500); if (row.blocker_reason !== cur.blocker_reason) changes.push(row.blocker_reason ? 'blocker noted' : 'blocker cleared') }
    const { error } = await ctx.admin.from('sc_cases').update(row).eq('id', cur.id)
    if (error) return { ok: false as const, error: error.message }
    if (changes.length || input.note) await logEvent(ctx, input.workOrderId, 'case_update', [changes.join(', '), str(input.note, 2000)].filter(Boolean).join('. ') || null, { patch: row })
    refresh(`/app/servicechannel/work-orders/${input.workOrderId}`); refresh('/app/servicechannel/work-orders')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function acceptHandoffAction(workOrderId: string) {
  try {
    const ctx = await scCtx()
    const { data: cur } = await ctx.admin.from('sc_cases').select('id, internal_status, owner_name').eq('work_order_id', workOrderId).eq('company_id', ctx.companyId).maybeSingle()
    if (!cur) return { ok: false as const, error: 'Case not found.' }
    await ctx.admin.from('sc_cases').update({ handoff_accepted_at: new Date().toISOString(), internal_status: cur.internal_status === 'new' || cur.internal_status === 'assigned' ? 'accepted' : cur.internal_status, updated_at: new Date().toISOString(), last_update_at: new Date().toISOString() }).eq('id', cur.id)
    await logEvent(ctx, workOrderId, 'handoff_accepted', `${ctx.userName} accepted responsibility${cur.owner_name ? ` (owner: ${cur.owner_name})` : ''}`)
    refresh(`/app/servicechannel/work-orders/${workOrderId}`)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/** Verified resolved needs a note and no open tasks. Marking green is not enough. */
export async function verifyCaseAction(input: { workOrderId: string; note: string }) {
  try {
    const ctx = await scCtx()
    const note = str(input.note, 2000)
    if (!note) return { ok: false as const, error: 'Say what was verified and how (site contact, portal status, photos).' }
    const { count } = await ctx.admin.from('sc_tasks').select('id', { count: 'exact', head: true }).eq('work_order_id', input.workOrderId).neq('status', 'verified_resolved')
    if (count) return { ok: false as const, error: `${count} task(s) are still open. Verify or close them first.` }
    const now = new Date().toISOString()
    await ctx.admin.from('sc_cases').update({ internal_status: 'verified_resolved', verified_resolved_at: now, verified_by: ctx.userId, updated_at: now, last_update_at: now }).eq('work_order_id', input.workOrderId).eq('company_id', ctx.companyId)
    await logEvent(ctx, input.workOrderId, 'verified', note)
    refresh(`/app/servicechannel/work-orders/${input.workOrderId}`); refresh('/app/servicechannel/work-orders')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function addNoteAction(input: { workOrderId: string; body: string; kind?: 'note' | 'customer_contact' | 'department_followup' }) {
  try {
    const ctx = await scCtx()
    const body = str(input.body, 4000)
    if (!body) return { ok: false as const, error: 'Write the note first.' }
    const kind = input.kind === 'customer_contact' || input.kind === 'department_followup' ? input.kind : 'note'
    await logEvent(ctx, input.workOrderId, kind, body)
    await ctx.admin.from('sc_cases').update({ last_update_at: new Date().toISOString() }).eq('work_order_id', input.workOrderId).eq('company_id', ctx.companyId)
    refresh(`/app/servicechannel/work-orders/${input.workOrderId}`)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function setObservationStateAction(input: { workOrderId: string; state: 'manually_verified' | 'needs_verification'; note: string }) {
  try {
    const ctx = await scCtx()
    if (input.state !== 'manually_verified' && input.state !== 'needs_verification') return { ok: false as const, error: 'Unknown state.' }
    const note = str(input.note, 1000)
    if (input.state === 'manually_verified' && !note) return { ok: false as const, error: 'Say what you checked in ServiceChannel and when.' }
    const now = new Date().toISOString()
    await ctx.admin.from('sc_work_orders').update({ observation_state: input.state, verified_at: input.state === 'manually_verified' ? now : null, verified_by: input.state === 'manually_verified' ? ctx.userId : null, verified_note: note, updated_at: now })
      .eq('id', input.workOrderId).eq('company_id', ctx.companyId)
    await logEvent(ctx, input.workOrderId, 'observation_state', `${input.state === 'manually_verified' ? 'Verified in ServiceChannel' : 'Flagged for verification'}${note ? `: ${note}` : ''}`, { state: input.state })
    refresh(`/app/servicechannel/work-orders/${input.workOrderId}`); refresh('/app/servicechannel/work-orders')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function setKalosJobAction(input: { workOrderId: string; jobNumber: string }) {
  try {
    const ctx = await scCtx()
    const job = str(input.jobNumber, 40)
    await ctx.admin.from('sc_work_orders').update({ kalos_job_number: job, updated_at: new Date().toISOString() }).eq('id', input.workOrderId).eq('company_id', ctx.companyId)
    await logEvent(ctx, input.workOrderId, 'kalos_job', job ? `Kalos job number set to ${job}` : 'Kalos job number cleared')
    refresh(`/app/servicechannel/work-orders/${input.workOrderId}`)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function bulkAssignAction(input: { workOrderIds: string[]; ownerProfileId: string | null; ownerName: string | null; nextAction?: string; dueDate?: string; department?: string | null }) {
  try {
    const ctx = await scCtx()
    const ids = [...new Set(input.workOrderIds)].slice(0, 500)
    if (!ids.length) return { ok: false as const, error: 'Select at least one work order.' }
    const now = new Date().toISOString()
    const { data: cases } = await ctx.admin.from('sc_cases').select('id, work_order_id, internal_status').eq('company_id', ctx.companyId).in('work_order_id', ids)
    for (const c of cases ?? []) {
      const row: Record<string, unknown> = { updated_at: now, last_update_at: now }
      if (input.ownerProfileId !== null || input.ownerName !== null) { row.owner_profile_id = input.ownerProfileId; row.owner_name = str(input.ownerName, 120); row.handoff_accepted_at = null; row.external_ack_at = null; row.owner_assigned_at = input.ownerProfileId ? now : null }
      if (input.department !== undefined && input.department !== null) row.department = str(input.department, 80)
      if (input.ownerProfileId && c.internal_status === 'new') row.internal_status = 'assigned'
      if (str(input.nextAction, 500)) row.next_action = str(input.nextAction, 500)
      if (date(input.dueDate)) row.due_date = date(input.dueDate)
      await ctx.admin.from('sc_cases').update(row).eq('id', c.id)
      await logEvent(ctx, c.work_order_id as string, 'case_update', `${row.owner_name !== undefined ? `owner → ${row.owner_name ?? 'nobody'}` : ''}${row.department ? ` department → ${row.department}` : ''} (bulk)${row.next_action ? `. ${row.next_action}` : ''}`.trim(), { bulk: true })
    }
    refresh('/app/servicechannel/work-orders')
    return { ok: true as const, count: (cases ?? []).length }
  } catch (e) { return fail(e) }
}

/* ── Tasks ───────────────────────────────────────────────────────────────── */

export async function addTaskAction(input: { workOrderId: string; title: string; queue: string; ownerProfileId?: string | null; ownerName?: string | null; nextAction?: string; dueDate?: string }) {
  try {
    const ctx = await scCtx()
    const title = str(input.title, 200)
    if (!title) return { ok: false as const, error: 'Give the task a title.' }
    const queue = (QUEUES as readonly string[]).includes(input.queue) ? input.queue : 'general'
    const { data, error } = await ctx.admin.from('sc_tasks').insert({
      company_id: ctx.companyId, work_order_id: input.workOrderId, title, queue, status: input.ownerProfileId ? 'assigned' : 'new',
      owner_profile_id: input.ownerProfileId ?? null, owner_name: str(input.ownerName, 120), next_action: str(input.nextAction, 500), due_date: date(input.dueDate), created_by: ctx.userId,
    }).select('id').single()
    if (error) return { ok: false as const, error: error.message }
    await logEvent(ctx, input.workOrderId, 'task_created', `Task: ${title}${input.ownerName ? ` (${input.ownerName})` : ''}`, { taskId: data.id })
    await ctx.admin.from('sc_cases').update({ last_update_at: new Date().toISOString() }).eq('work_order_id', input.workOrderId)
    refresh(`/app/servicechannel/work-orders/${input.workOrderId}`)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function updateTaskAction(input: { taskId: string; patch: { status?: string; ownerProfileId?: string | null; ownerName?: string | null; nextAction?: string | null; dueDate?: string | null; blockerReason?: string | null }; note?: string }) {
  try {
    const ctx = await scCtx()
    const { data: t } = await ctx.admin.from('sc_tasks').select('*').eq('id', input.taskId).eq('company_id', ctx.companyId).maybeSingle()
    if (!t) return { ok: false as const, error: 'Task not found.' }
    const now = new Date().toISOString()
    const row: Record<string, unknown> = { updated_at: now }
    const p = input.patch
    let what = ''
    if (p.status !== undefined) {
      if (!isStatus(p.status)) return { ok: false as const, error: 'Unknown status.' }
      if (p.status === 'verified_resolved') {
        if (!str(input.note)) return { ok: false as const, error: 'Verification needs a note saying what was confirmed.' }
        row.verified_at = now; row.verified_by = ctx.userId
      }
      if (p.status === 'pending_verification' && !t.completed_at) row.completed_at = now
      if (p.status === 'accepted' && !t.accepted_at) row.accepted_at = now
      row.status = p.status; what = `${t.status} → ${p.status}`
    }
    if (p.ownerProfileId !== undefined || p.ownerName !== undefined) { row.owner_profile_id = p.ownerProfileId ?? null; row.owner_name = str(p.ownerName, 120); row.accepted_at = null; what += `${what ? ', ' : ''}owner → ${row.owner_name ?? 'nobody'}` }
    if (p.nextAction !== undefined) row.next_action = str(p.nextAction, 500)
    if (p.dueDate !== undefined) row.due_date = date(p.dueDate)
    if (p.blockerReason !== undefined) row.blocker_reason = str(p.blockerReason, 500)
    const { error } = await ctx.admin.from('sc_tasks').update(row).eq('id', t.id)
    if (error) return { ok: false as const, error: error.message }
    await logEvent(ctx, t.work_order_id as string, 'task_update', `Task "${t.title}": ${what || 'updated'}${str(input.note) ? `. ${str(input.note)}` : ''}`, { taskId: t.id })
    await ctx.admin.from('sc_cases').update({ last_update_at: now }).eq('work_order_id', t.work_order_id)
    refresh(`/app/servicechannel/work-orders/${t.work_order_id}`)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/* ── Official measures and settings ──────────────────────────────────────── */

export async function addMetricAction(input: { measure: string; value: number | null; previousValue?: number | null; snapshotDate: string; periodLabel?: string; scorecardView?: string; filters?: string; eligibleCount?: number | null; source?: string; isSample?: boolean; note?: string }) {
  try {
    const ctx = await scCtx()
    if (!MEASURE_KEYS.has(input.measure)) return { ok: false as const, error: 'Unknown measure.' }
    if (!date(input.snapshotDate)) return { ok: false as const, error: 'Pick the date the score was read.' }
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    if (num(input.value) === null) return { ok: false as const, error: 'Enter the value exactly as ServiceChannel shows it.' }
    if (!str(input.scorecardView, 120)) return { ok: false as const, error: 'Record which scorecard view it came from, so the next reading compares like with like.' }
    const { error } = await ctx.admin.from('sc_metric_entries').insert({
      company_id: ctx.companyId, measure: input.measure, value: num(input.value), previous_value: num(input.previousValue), snapshot_date: input.snapshotDate,
      period_label: str(input.periodLabel, 160), scorecard_view: str(input.scorecardView, 120), filters: str(input.filters, 300), eligible_count: num(input.eligibleCount) === null ? null : Math.round(num(input.eligibleCount)!),
      source: str(input.source, 200) ?? 'Typed in from ServiceChannel', is_sample: !!input.isSample, note: str(input.note, 1000), created_by: ctx.userId,
    })
    if (error) return { ok: false as const, error: error.message }
    refresh('/app/servicechannel/settings')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function deleteMetricAction(id: string) {
  try {
    const ctx = await scCtx()
    await ctx.admin.from('sc_metric_entries').delete().eq('id', id).eq('company_id', ctx.companyId)
    refresh('/app/servicechannel/settings')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/** The dated baseline from the CEO packet. Real values with real periods; inserted once. */
export async function loadBaselineAction() {
  try {
    const ctx = await scCtx()
    const { count } = await ctx.admin.from('sc_metric_entries').select('id', { count: 'exact', head: true }).eq('company_id', ctx.companyId).eq('source', BASELINE_SOURCE)
    if (count) return { ok: false as const, error: 'The baseline is already loaded.' }
    const { error } = await ctx.admin.from('sc_metric_entries').insert(BASELINE_ENTRIES.map((e) => ({
      company_id: ctx.companyId, measure: e.measure, value: e.value, previous_value: e.previousValue, unit: e.unit, snapshot_date: e.snapshotDate, period_label: e.periodLabel,
      scorecard_view: e.scorecardView, filters: e.filters, eligible_count: e.eligibleCount, source: e.source, is_sample: e.isSample, note: e.note, created_by: ctx.userId,
    })))
    if (error) return { ok: false as const, error: error.message }
    refresh('/app/servicechannel/settings')
    return { ok: true as const, count: BASELINE_ENTRIES.length }
  } catch (e) { return fail(e) }
}

export async function saveScSettingsAction(input: { targetOverall: number; targetDate: string }) {
  try {
    const ctx = await scCtx()
    if (!(input.targetOverall > 0 && input.targetOverall <= 100)) return { ok: false as const, error: 'Target must be between 1 and 100.' }
    if (!date(input.targetDate)) return { ok: false as const, error: 'Pick a target date.' }
    await ctx.admin.from('sc_settings').upsert({ company_id: ctx.companyId, target_overall: input.targetOverall, target_date: input.targetDate, updated_at: new Date().toISOString() }, { onConflict: 'company_id' })
    refresh('/app/servicechannel/settings')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}
