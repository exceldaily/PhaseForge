'use server'

import { revalidatePath } from 'next/cache'
import { fail, scCtx, type ScContext } from '@/lib/servicechannel/server'
import { EMP, logRecordEvent, ownerCols, type RecordType } from '@/lib/servicechannel/records'
import {
  CAUSE_CLASSES, INTERNAL_STATUSES, INVESTIGATION_STATUSES, OUTCOMES_NEEDING_EVIDENCE, PROJECT_STATUSES, RECOVERY_OUTCOMES, RECOVERY_STATUSES, TASK_KINDS, WAITING_ON,
  type InternalStatus, type RecoveryOutcome,
} from '@/lib/servicechannel/types'

// Writes for the accountability records: responsibilities (tasks), the people
// directory, customer recoveries, improvement projects, root-cause
// investigations, alert thresholds. Every change is logged. Nothing here
// touches an imported ServiceChannel value or contacts ServiceChannel.

const PATHS = ['/app/servicechannel', '/app/servicechannel/action-center', '/app/servicechannel/departments', '/app/servicechannel/customer-recovery', '/app/servicechannel/projects', '/app/servicechannel/rca', '/app/servicechannel/reports', '/app/servicechannel/scores']
const refresh = (...extra: string[]) => { for (const p of [...PATHS, ...extra]) revalidatePath(p) }
const str = (v: unknown, max = 2000) => { const s = typeof v === 'string' ? v.trim() : ''; return s ? s.slice(0, max) : null }
const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | null => (list as readonly string[]).includes(v as string) ? (v as T) : null
const now = () => new Date().toISOString()
const isStatus = (v: unknown): v is InternalStatus => INTERNAL_STATUSES.includes(v as InternalStatus)

async function touch(ctx: ScContext, type: RecordType, id: string) {
  const table = type === 'recovery' ? 'sc_recoveries' : type === 'project' ? 'sc_projects' : type === 'investigation' ? 'sc_investigations' : null
  if (table) await ctx.admin.from(table).update({ last_update_at: now(), updated_at: now() }).eq('id', id).eq('company_id', ctx.companyId)
  if (type === 'work_order') await ctx.admin.from('sc_cases').update({ last_update_at: now() }).eq('work_order_id', id).eq('company_id', ctx.companyId)
}

/* ── Responsibilities (tasks) ─────────────────────────────────────────────── */

export interface TaskInput {
  title: string; description?: string | null; kind?: string; ownerKey?: string | null; ownerName?: string | null; department?: string | null; waitingOn?: string | null
  nextAction?: string | null; dueDate?: string | null; blockerReason?: string | null
  link?: { type: RecordType; id: string } | null
}

export async function createTaskAction(input: TaskInput) {
  try {
    const ctx = await scCtx()
    const title = str(input.title, 200)
    if (!title) return { ok: false as const, error: 'Give the responsibility a title.' }
    const link = input.link ?? null
    const row: Record<string, unknown> = {
      company_id: ctx.companyId, title, description: str(input.description, 4000), kind: oneOf(TASK_KINDS, input.kind) ?? 'follow_up', queue: 'general',
      status: input.ownerKey ? 'assigned' : 'new', ...ownerCols(input.ownerKey, input.ownerName), department: str(input.department, 80),
      waiting_on: oneOf(WAITING_ON, input.waitingOn), next_action: str(input.nextAction, 500), due_date: date(input.dueDate), blocker_reason: str(input.blockerReason, 500),
      created_by: ctx.userId, last_update_at: now(),
      work_order_id: link?.type === 'work_order' ? link.id : null, recovery_id: link?.type === 'recovery' ? link.id : null,
      project_id: link?.type === 'project' ? link.id : null, investigation_id: link?.type === 'investigation' ? link.id : null,
    }
    const { data, error } = await ctx.admin.from('sc_tasks').insert(row).select('id').single()
    if (error) return { ok: false as const, error: error.message }
    if (link) { await logRecordEvent(ctx, link.type, link.id, 'task_created', `Task: ${title}${input.ownerName ? ` (${input.ownerName})` : ''}${row.due_date ? `, due ${row.due_date}` : ''}`, { taskId: data.id }); await touch(ctx, link.type, link.id) }
    refresh(link?.type === 'work_order' ? `/app/servicechannel/work-orders/${link.id}` : link ? `${PATHS.find((p) => p.includes(link.type === 'recovery' ? 'customer-recovery' : link.type === 'project' ? 'projects' : 'rca'))}/${link.id}` : '')
    return { ok: true as const, id: data.id as string }
  } catch (e) { return fail(e) }
}

export interface TaskPatch { title?: string; description?: string | null; kind?: string; status?: string; ownerKey?: string | null; ownerName?: string | null; department?: string | null; waitingOn?: string | null; nextAction?: string | null; dueDate?: string | null; blockerReason?: string | null }

/** One save on a responsibility. Verification needs a note; completion goes to Pending verification first. */
export async function updateTaskFullAction(input: { taskId: string; patch: TaskPatch; note?: string }) {
  try {
    const ctx = await scCtx()
    const { data: t } = await ctx.admin.from('sc_tasks').select('*').eq('id', input.taskId).eq('company_id', ctx.companyId).maybeSingle()
    if (!t) return { ok: false as const, error: 'Responsibility not found.' }
    const p = input.patch, ts = now()
    const row: Record<string, unknown> = { updated_at: ts, last_update_at: ts }
    const changes: string[] = []
    const set = (col: string, val: unknown, label: string) => { if ((t[col] ?? null) !== (val ?? null)) { row[col] = val ?? null; changes.push(label) } }
    if (p.title !== undefined) { const v = str(p.title, 200); if (!v) return { ok: false as const, error: 'A title is required.' }; set('title', v, 'title changed') }
    if (p.description !== undefined) set('description', str(p.description, 4000), 'description updated')
    if (p.kind !== undefined) set('kind', oneOf(TASK_KINDS, p.kind) ?? t.kind, `kind → ${p.kind}`)
    if (p.status !== undefined) {
      if (!isStatus(p.status)) return { ok: false as const, error: 'Unknown status.' }
      if (p.status === 'verified_resolved') {
        if (!str(input.note)) return { ok: false as const, error: 'Verification needs a note saying what was confirmed and how.' }
        row.verified_at = ts; row.verified_by = ctx.userId
      }
      if (p.status === 'pending_verification' && !t.completed_at) row.completed_at = ts
      if (p.status === 'accepted' && !t.accepted_at) row.accepted_at = ts
      set('status', p.status, `${t.status} → ${p.status}`)
    }
    if (p.ownerKey !== undefined) {
      const cols = ownerCols(p.ownerKey, p.ownerName)
      const curKey = t.owner_profile_id ?? (t.owner_employee_id ? `${EMP}${t.owner_employee_id}` : null)
      if (curKey !== (p.ownerKey?.trim() || null)) { Object.assign(row, cols); row.accepted_at = null; row.external_ack_at = null; row.external_ack_by = null; changes.push(`owner → ${cols.owner_name ?? 'nobody'}`); if (p.ownerKey && t.status === 'new' && row.status === undefined) row.status = 'assigned' }
    }
    if (p.department !== undefined) set('department', str(p.department, 80), `department → ${str(p.department, 80) ?? 'none'}`)
    if (p.waitingOn !== undefined) { const w = oneOf(WAITING_ON, p.waitingOn); set('waiting_on', w, w ? `waiting on ${w.replace(/_/g, ' ')}` : 'no longer waiting') }
    if (p.nextAction !== undefined) set('next_action', str(p.nextAction, 500), 'next action updated')
    if (p.dueDate !== undefined) set('due_date', date(p.dueDate), `due ${date(p.dueDate) ?? 'cleared'}`)
    if (p.blockerReason !== undefined) set('blocker_reason', str(p.blockerReason, 500), str(p.blockerReason) ? 'blocker noted' : 'blocker cleared')
    const { error } = await ctx.admin.from('sc_tasks').update(row).eq('id', t.id)
    if (error) return { ok: false as const, error: error.message }
    const ref = taskRef(t)
    if (ref && (changes.length || str(input.note))) { await logRecordEvent(ctx, ref.type, ref.id, 'task_update', `Task "${t.title}": ${changes.join(', ') || 'updated'}${str(input.note) ? `. ${str(input.note)}` : ''}`, { taskId: t.id }); await touch(ctx, ref.type, ref.id) }
    refresh(ref?.type === 'work_order' ? `/app/servicechannel/work-orders/${ref.id}` : '')
    return { ok: true as const, changes: changes.length }
  } catch (e) { return fail(e) }
}

const taskRef = (t: Record<string, unknown>): { type: RecordType; id: string } | null =>
  t.work_order_id ? { type: 'work_order', id: t.work_order_id as string } : t.recovery_id ? { type: 'recovery', id: t.recovery_id as string } : t.project_id ? { type: 'project', id: t.project_id as string } : t.investigation_id ? { type: 'investigation', id: t.investigation_id as string } : null

/** Someone without a login acknowledged a responsibility; the recorder is named. */
export async function recordTaskAckAction(input: { taskId: string; who: string }) {
  try {
    const ctx = await scCtx()
    const who = str(input.who, 120)
    if (!who) return { ok: false as const, error: 'Name the person who acknowledged.' }
    const { data: t } = await ctx.admin.from('sc_tasks').select('*').eq('id', input.taskId).eq('company_id', ctx.companyId).maybeSingle()
    if (!t) return { ok: false as const, error: 'Responsibility not found.' }
    await ctx.admin.from('sc_tasks').update({ external_ack_by: who, external_ack_recorded_name: ctx.userName, external_ack_at: now(), status: t.status === 'new' || t.status === 'assigned' ? 'accepted' : t.status, updated_at: now(), last_update_at: now() }).eq('id', t.id)
    const ref = taskRef(t)
    if (ref) await logRecordEvent(ctx, ref.type, ref.id, 'handoff_accepted', `${who} acknowledged "${t.title}"; recorded by ${ctx.userName}`, { taskId: t.id })
    refresh()
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/** Escalate a case or a responsibility to a named person. Clears with an empty "to". */
export async function escalateAction(input: { target: 'task' | 'case'; id: string; to: string; note?: string }) {
  try {
    const ctx = await scCtx()
    const to = str(input.to, 120), note = str(input.note, 1000), ts = now()
    const patch = to ? { escalated_at: ts, escalated_to: to, escalation_note: note, updated_at: ts, last_update_at: ts } : { escalated_at: null, escalated_to: null, escalation_note: null, updated_at: ts, last_update_at: ts }
    if (input.target === 'task') {
      const { data: t } = await ctx.admin.from('sc_tasks').select('*').eq('id', input.id).eq('company_id', ctx.companyId).maybeSingle()
      if (!t) return { ok: false as const, error: 'Responsibility not found.' }
      await ctx.admin.from('sc_tasks').update(patch).eq('id', t.id)
      const ref = taskRef(t)
      if (ref) await logRecordEvent(ctx, ref.type, ref.id, 'escalation', to ? `"${t.title}" escalated to ${to}${note ? `: ${note}` : ''}` : `Escalation on "${t.title}" cleared`, { taskId: t.id })
    } else {
      const { data: c } = await ctx.admin.from('sc_cases').select('id').eq('work_order_id', input.id).eq('company_id', ctx.companyId).maybeSingle()
      if (!c) return { ok: false as const, error: 'Case not found.' }
      await ctx.admin.from('sc_cases').update(patch).eq('id', c.id)
      await logRecordEvent(ctx, 'work_order', input.id, 'escalation', to ? `Escalated to ${to}${note ? `: ${note}` : ''}` : 'Escalation cleared')
      revalidatePath(`/app/servicechannel/work-orders/${input.id}`)
    }
    refresh()
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/* ── People directory ─────────────────────────────────────────────────────── */

export async function saveEmployeeAction(input: { id?: string | null; name: string; email?: string | null; phone?: string | null; department?: string | null; jobRole?: string | null; isActive?: boolean; profileId?: string | null }) {
  try {
    const ctx = await scCtx()
    const name = str(input.name, 120)
    if (!name) return { ok: false as const, error: 'A name is required.' }
    const row: Record<string, unknown> = { name, email: str(input.email, 200), phone: str(input.phone, 40), department: str(input.department, 80), job_role: str(input.jobRole, 80), is_active: input.isActive ?? true, profile_id: input.profileId || null, updated_at: now() }
    if (input.profileId) {
      const { data: p } = await ctx.admin.from('profiles').select('id').eq('id', input.profileId).eq('company_id', ctx.companyId).maybeSingle()
      if (!p) return { ok: false as const, error: 'That PhaseForge user is not in this organization.' }
    }
    const q = input.id ? ctx.admin.from('employees').update(row).eq('id', input.id).eq('company_id', ctx.companyId) : ctx.admin.from('employees').insert({ ...row, company_id: ctx.companyId, created_by: ctx.userId })
    const { error } = await q
    if (error) return { ok: false as const, error: error.message }
    refresh('/app/employees')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/* ── Customer recovery ────────────────────────────────────────────────────── */

export interface RecoveryInput {
  workOrderId?: string | null; trackingNumber?: string | null; customerName?: string | null; storeLabel?: string | null; reportingContact?: string | null
  complaint?: string; approvedScope?: string | null; findings?: string | null; ownerKey?: string | null; ownerName?: string | null; department?: string | null
  contactDate?: string | null; conversationNotes?: string | null; agreedResolution?: string | null; requiredAction?: string | null; followUpDeadline?: string | null
  verificationEvidence?: string | null; outcome?: string | null; status?: string
}

function recoveryRow(i: RecoveryInput): Record<string, unknown> {
  const r: Record<string, unknown> = {}
  const put = (k: string, v: unknown) => { if (v !== undefined) r[k] = v }
  put('work_order_id', i.workOrderId); put('tracking_number', i.trackingNumber === undefined ? undefined : str(i.trackingNumber, 60)); put('customer_name', i.customerName === undefined ? undefined : str(i.customerName, 120))
  put('store_label', i.storeLabel === undefined ? undefined : str(i.storeLabel, 160)); put('reporting_contact', i.reportingContact === undefined ? undefined : str(i.reportingContact, 160))
  if (i.complaint !== undefined) put('complaint', str(i.complaint, 4000))
  put('approved_scope', i.approvedScope === undefined ? undefined : str(i.approvedScope, 4000)); put('findings', i.findings === undefined ? undefined : str(i.findings, 4000))
  if (i.ownerKey !== undefined) Object.assign(r, ownerCols(i.ownerKey, i.ownerName))
  put('department', i.department === undefined ? undefined : str(i.department, 80)); put('contact_date', i.contactDate === undefined ? undefined : date(i.contactDate))
  put('conversation_notes', i.conversationNotes === undefined ? undefined : str(i.conversationNotes, 6000)); put('agreed_resolution', i.agreedResolution === undefined ? undefined : str(i.agreedResolution, 4000))
  put('required_action', i.requiredAction === undefined ? undefined : str(i.requiredAction, 2000)); put('follow_up_deadline', i.followUpDeadline === undefined ? undefined : date(i.followUpDeadline))
  put('verification_evidence', i.verificationEvidence === undefined ? undefined : str(i.verificationEvidence, 4000))
  if (i.outcome !== undefined) put('outcome', oneOf(RECOVERY_OUTCOMES, i.outcome))
  if (i.status !== undefined) put('status', oneOf(RECOVERY_STATUSES, i.status) ?? 'open')
  return r
}

/** An outcome that says the customer or the record was wrong needs findings and evidence first. Nothing picks an outcome automatically. */
function checkOutcome(row: Record<string, unknown>, cur: Record<string, unknown> | null): string | null {
  const outcome = (row.outcome ?? cur?.outcome ?? null) as RecoveryOutcome | null
  if (!outcome) return null
  const findings = (row.findings ?? cur?.findings ?? null) as string | null
  const evidence = (row.verification_evidence ?? cur?.verification_evidence ?? null) as string | null
  if (OUTCOMES_NEEDING_EVIDENCE.includes(outcome) && (!findings || !evidence)) return 'That outcome needs written findings and verification evidence before it can be saved. The customer is never classified as wrong without them.'
  if (outcome === 'resolved_after_corrective_action' && !evidence) return 'Resolved after corrective action needs verification evidence (who confirmed it and how).'
  return null
}

export async function createRecoveryAction(input: RecoveryInput) {
  try {
    const ctx = await scCtx()
    const row = recoveryRow(input)
    if (!row.complaint) return { ok: false as const, error: 'Record what the customer reported, in their words.' }
    if (input.workOrderId) {
      const { data: w } = await ctx.admin.from('sc_work_orders').select('id, tracking_number, customer_name, store_label').eq('id', input.workOrderId).eq('company_id', ctx.companyId).maybeSingle()
      if (!w) return { ok: false as const, error: 'Work order not found.' }
      row.tracking_number = row.tracking_number ?? w.tracking_number; row.customer_name = row.customer_name ?? w.customer_name; row.store_label = row.store_label ?? w.store_label
    }
    const bad = checkOutcome(row, null)
    if (bad) return { ok: false as const, error: bad }
    const { data, error } = await ctx.admin.from('sc_recoveries').insert({ ...row, status: row.status ?? 'open', company_id: ctx.companyId, created_by: ctx.userId, created_name: ctx.userName }).select('id').single()
    if (error) return { ok: false as const, error: error.message }
    await logRecordEvent(ctx, 'recovery', data.id as string, 'created', 'Customer recovery opened')
    if (input.workOrderId) { await logRecordEvent(ctx, 'work_order', input.workOrderId, 'recovery', 'Customer recovery opened for this work order', { recoveryId: data.id }); revalidatePath(`/app/servicechannel/work-orders/${input.workOrderId}`) }
    refresh()
    return { ok: true as const, id: data.id as string }
  } catch (e) { return fail(e) }
}

export async function updateRecoveryAction(input: { id: string; patch: RecoveryInput; note?: string }) {
  try {
    const ctx = await scCtx()
    const { data: cur } = await ctx.admin.from('sc_recoveries').select('*').eq('id', input.id).eq('company_id', ctx.companyId).maybeSingle()
    if (!cur) return { ok: false as const, error: 'Recovery not found.' }
    const row = recoveryRow(input.patch)
    if (row.complaint === null) return { ok: false as const, error: 'The complaint cannot be blank.' }
    const bad = checkOutcome(row, cur)
    if (bad) return { ok: false as const, error: bad }
    if (row.status === 'closed' && !(row.outcome ?? cur.outcome)) return { ok: false as const, error: 'Pick the outcome before closing.' }
    const changes = Object.keys(row).filter((k) => (cur[k] ?? null) !== (row[k] ?? null)).map((k) => k.replace(/_/g, ' '))
    const ts = now()
    const { error } = await ctx.admin.from('sc_recoveries').update({ ...row, updated_at: ts, last_update_at: ts }).eq('id', cur.id)
    if (error) return { ok: false as const, error: error.message }
    if (changes.length || str(input.note)) await logRecordEvent(ctx, 'recovery', cur.id as string, 'update', [changes.length ? `Updated ${changes.join(', ')}` : null, str(input.note, 4000)].filter(Boolean).join('. '), { patch: row })
    if (row.contact_date && !cur.contact_date && cur.work_order_id) await logRecordEvent(ctx, 'work_order', cur.work_order_id as string, 'customer_contact', `Customer contacted on ${row.contact_date} (recovery)${str(input.patch.conversationNotes) ? `: ${str(input.patch.conversationNotes, 500)}` : ''}`)
    refresh(`/app/servicechannel/customer-recovery/${cur.id}`, cur.work_order_id ? `/app/servicechannel/work-orders/${cur.work_order_id}` : '')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/* ── Improvement projects ─────────────────────────────────────────────────── */

export interface ProjectInput {
  name?: string; scopeCustomer?: string | null; department?: string | null; scoreCategory?: string | null; kpi?: string | null
  baselineValue?: number | string | null; baselinePeriod?: string | null; targetValue?: number | string | null; ownerKey?: string | null; ownerName?: string | null
  startDate?: string | null; targetDate?: string | null; reviewDate?: string | null; rootProblem?: string | null; actionPlan?: string | null; verificationMethod?: string | null
  managementNotes?: string | null; blockers?: string | null; status?: string
}
function projectRow(i: ProjectInput): Record<string, unknown> {
  const r: Record<string, unknown> = {}
  const text = (k: string, v: unknown, max: number) => { if (v !== undefined) r[k] = str(v, max) }
  const dt = (k: string, v: unknown) => { if (v !== undefined) r[k] = date(v) }
  if (i.name !== undefined) r.name = str(i.name, 160)
  text('scope_customer', i.scopeCustomer, 120); text('department', i.department, 80); text('score_category', i.scoreCategory, 40); text('kpi', i.kpi, 200)
  if (i.baselineValue !== undefined) r.baseline_value = num(i.baselineValue); text('baseline_period', i.baselinePeriod, 160); if (i.targetValue !== undefined) r.target_value = num(i.targetValue)
  if (i.ownerKey !== undefined) Object.assign(r, ownerCols(i.ownerKey, i.ownerName))
  dt('start_date', i.startDate); dt('target_date', i.targetDate); dt('review_date', i.reviewDate)
  text('root_problem', i.rootProblem, 4000); text('action_plan', i.actionPlan, 6000); text('verification_method', i.verificationMethod, 2000); text('management_notes', i.managementNotes, 4000); text('blockers', i.blockers, 2000)
  if (i.status !== undefined) r.status = oneOf(PROJECT_STATUSES, i.status) ?? 'planned'
  return r
}

export async function createProjectAction(input: ProjectInput) {
  try {
    const ctx = await scCtx()
    const row = projectRow(input)
    if (!row.name) return { ok: false as const, error: 'Name the project.' }
    const { data, error } = await ctx.admin.from('sc_projects').insert({ ...row, status: row.status ?? 'planned', company_id: ctx.companyId, created_by: ctx.userId, created_name: ctx.userName }).select('id').single()
    if (error) return { ok: false as const, error: error.message }
    if (row.baseline_value !== null && row.baseline_value !== undefined) await ctx.admin.from('sc_project_kpis').insert({ company_id: ctx.companyId, project_id: data.id, kind: 'baseline', label: (row.kpi as string | null) ?? 'Baseline', value: row.baseline_value, snapshot_date: (row.start_date as string | null) ?? new Date().toISOString().slice(0, 10), period_label: row.baseline_period ?? null, source: 'Entered with the project', created_by: ctx.userId })
    await logRecordEvent(ctx, 'project', data.id as string, 'created', 'Project created')
    refresh()
    return { ok: true as const, id: data.id as string }
  } catch (e) { return fail(e) }
}

export async function updateProjectAction(input: { id: string; patch: ProjectInput; note?: string }) {
  try {
    const ctx = await scCtx()
    const { data: cur } = await ctx.admin.from('sc_projects').select('*').eq('id', input.id).eq('company_id', ctx.companyId).maybeSingle()
    if (!cur) return { ok: false as const, error: 'Project not found.' }
    const row = projectRow(input.patch)
    if (row.name === null) return { ok: false as const, error: 'The name cannot be blank.' }
    const changes = Object.keys(row).filter((k) => String(cur[k] ?? '') !== String(row[k] ?? '')).map((k) => k.replace(/_/g, ' '))
    const ts = now()
    const { error } = await ctx.admin.from('sc_projects').update({ ...row, updated_at: ts, last_update_at: ts }).eq('id', cur.id)
    if (error) return { ok: false as const, error: error.message }
    if (changes.length || str(input.note)) await logRecordEvent(ctx, 'project', cur.id as string, 'update', [changes.length ? `Updated ${changes.join(', ')}` : null, str(input.note, 4000)].filter(Boolean).join('. '), { patch: row })
    refresh(`/app/servicechannel/projects/${cur.id}`)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function addProjectUpdateAction(input: { projectId: string; body: string }) {
  try {
    const ctx = await scCtx()
    const body = str(input.body, 6000)
    if (!body) return { ok: false as const, error: 'Write the update first.' }
    const { error } = await ctx.admin.from('sc_project_updates').insert({ company_id: ctx.companyId, project_id: input.projectId, body, author_id: ctx.userId, author_name: ctx.userName })
    if (error) return { ok: false as const, error: error.message }
    await touch(ctx, 'project', input.projectId)
    refresh(`/app/servicechannel/projects/${input.projectId}`)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function saveMilestoneAction(input: { id?: string | null; projectId: string; title: string; dueDate?: string | null; note?: string | null; done?: boolean }) {
  try {
    const ctx = await scCtx()
    const title = str(input.title, 200)
    if (!title) return { ok: false as const, error: 'Name the milestone.' }
    const row: Record<string, unknown> = { title, due_date: date(input.dueDate), note: str(input.note, 1000) }
    if (input.done !== undefined) row.completed_at = input.done ? now() : null
    const q = input.id ? ctx.admin.from('sc_project_milestones').update(row).eq('id', input.id).eq('company_id', ctx.companyId) : ctx.admin.from('sc_project_milestones').insert({ ...row, company_id: ctx.companyId, project_id: input.projectId })
    const { error } = await q
    if (error) return { ok: false as const, error: error.message }
    await logRecordEvent(ctx, 'project', input.projectId, 'milestone', `${input.id ? (input.done ? 'Milestone completed' : 'Milestone updated') : 'Milestone added'}: ${title}`)
    await touch(ctx, 'project', input.projectId)
    refresh(`/app/servicechannel/projects/${input.projectId}`)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function deleteMilestoneAction(input: { id: string; projectId: string }) {
  try {
    const ctx = await scCtx()
    const { data: m } = await ctx.admin.from('sc_project_milestones').select('title').eq('id', input.id).eq('company_id', ctx.companyId).maybeSingle()
    await ctx.admin.from('sc_project_milestones').delete().eq('id', input.id).eq('company_id', ctx.companyId)
    if (m) await logRecordEvent(ctx, 'project', input.projectId, 'milestone', `Milestone removed: ${m.title}`)
    refresh(`/app/servicechannel/projects/${input.projectId}`)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/** A KPI reading on a project: typed in from where it was read, with its date and period. Never computed. */
export async function addProjectKpiAction(input: { projectId: string; kind: string; label: string; value: number | string | null; snapshotDate: string; periodLabel?: string | null; source?: string | null; note?: string | null }) {
  try {
    const ctx = await scCtx()
    const label = str(input.label, 120)
    if (!label) return { ok: false as const, error: 'Name the KPI.' }
    if (num(input.value) === null) return { ok: false as const, error: 'Enter the value exactly as it was shown.' }
    if (!date(input.snapshotDate)) return { ok: false as const, error: 'Pick the date it was read.' }
    if (!str(input.source)) return { ok: false as const, error: 'Record where the value was read (which ServiceChannel view or report).' }
    const { error } = await ctx.admin.from('sc_project_kpis').insert({ company_id: ctx.companyId, project_id: input.projectId, kind: oneOf(['baseline', 'progress', 'result'] as const, input.kind) ?? 'progress', label, value: num(input.value), snapshot_date: input.snapshotDate, period_label: str(input.periodLabel, 160), source: str(input.source, 200), note: str(input.note, 1000), created_by: ctx.userId })
    if (error) return { ok: false as const, error: error.message }
    await logRecordEvent(ctx, 'project', input.projectId, 'kpi', `${label}: ${num(input.value)} (${input.kind}, ${input.snapshotDate}${str(input.periodLabel) ? `, ${str(input.periodLabel)}` : ''})`)
    await touch(ctx, 'project', input.projectId)
    refresh(`/app/servicechannel/projects/${input.projectId}`)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function deleteProjectKpiAction(input: { id: string; projectId: string }) {
  try {
    const ctx = await scCtx()
    await ctx.admin.from('sc_project_kpis').delete().eq('id', input.id).eq('company_id', ctx.companyId)
    await logRecordEvent(ctx, 'project', input.projectId, 'kpi', 'KPI reading removed')
    refresh(`/app/servicechannel/projects/${input.projectId}`)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/** Link work orders to a project or an investigation by tracking number. */
export async function linkWorkOrdersToRecordAction(input: { type: 'project' | 'investigation'; id: string; trackingNumbers: string[]; note?: string }) {
  try {
    const ctx = await scCtx()
    const nums = [...new Set(input.trackingNumbers.map((s) => s.trim()).filter(Boolean))].slice(0, 200)
    if (!nums.length) return { ok: false as const, error: 'Enter at least one tracking number.' }
    const { data: wos } = await ctx.admin.from('sc_work_orders').select('id, tracking_number').eq('company_id', ctx.companyId).in('tracking_number', nums)
    const found = wos ?? []
    const missing = nums.filter((n) => !found.some((w) => w.tracking_number === n))
    if (found.length) {
      const table = input.type === 'project' ? 'sc_project_links' : 'sc_investigation_links'
      const key = input.type === 'project' ? 'project_id' : 'investigation_id'
      const { error } = await ctx.admin.from(table).upsert(found.map((w) => ({ company_id: ctx.companyId, [key]: input.id, work_order_id: w.id, note: str(input.note, 300) })), { onConflict: `${key},work_order_id` })
      if (error) return { ok: false as const, error: error.message }
      await logRecordEvent(ctx, input.type, input.id, 'linked', `Linked ${found.map((w) => w.tracking_number).join(', ')}`)
      for (const w of found) await logRecordEvent(ctx, 'work_order', w.id as string, 'linked', `Added to ${input.type === 'project' ? 'improvement project' : 'root cause investigation'}`, { [key]: input.id })
      await touch(ctx, input.type, input.id)
    }
    refresh(`/app/servicechannel/${input.type === 'project' ? 'projects' : 'rca'}/${input.id}`)
    return { ok: true as const, linked: found.length, missing }
  } catch (e) { return fail(e) }
}

export async function unlinkWorkOrderFromRecordAction(input: { type: 'project' | 'investigation'; id: string; linkId: string }) {
  try {
    const ctx = await scCtx()
    const table = input.type === 'project' ? 'sc_project_links' : 'sc_investigation_links'
    await ctx.admin.from(table).delete().eq('id', input.linkId).eq('company_id', ctx.companyId)
    await logRecordEvent(ctx, input.type, input.id, 'linked', 'Work order unlinked')
    refresh(`/app/servicechannel/${input.type === 'project' ? 'projects' : 'rca'}/${input.id}`)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/**
 * The four starter projects from the October 13, 2026 review, with the
 * baselines exactly as given. Created once, only when the company has none.
 */
const STARTER_SOURCE = 'ServiceChannel Marketplace Score dashboard, read by Brad Harvey on Oct 13 2026'
export async function createStarterProjectsAction() {
  try {
    const ctx = await scCtx()
    const { count } = await ctx.admin.from('sc_projects').select('id', { count: 'exact', head: true }).eq('company_id', ctx.companyId)
    if (count) return { ok: false as const, error: 'Projects already exist. Add more from the form.' }
    const today = new Date().toISOString().slice(0, 10)
    const common = { company_id: ctx.companyId, status: 'planned', start_date: today, review_date: addDays(today, 14), target_date: '2027-10-13', created_by: ctx.userId, created_name: ctx.userName }
    const starters = [
      { name: 'Project A: Cumberland Farms Quality Recovery', scope_customer: 'Cumberland Farms', score_category: 'quality', kpi: 'Cumberland Farms Quality score', baseline_value: 56, baseline_period: 'As displayed Oct 13 2026', target_value: 80, department: 'Management',
        root_problem: 'Cumberland Farms Quality score is 56. Which Quality KPI drives it (recalls, reopened work, unsatisfactory ratings) has not been verified yet; that is the first task.',
        action_plan: '1. Open the customer-specific Quality view in ServiceChannel and record which KPI is low.\n2. Pull every Cumberland Farms work order with an unsatisfactory or reopened history and open a root cause investigation on each repeat.\n3. Agree a return-visit and verification standard with the refrigeration and HVAC supervisors.\n4. Record the Quality reading monthly with the same view and filters.',
        verification_method: 'Monthly reading of the Cumberland Farms Quality score from the Marketplace Score dashboard, same view and filters each time.' },
      { name: 'Project B: CubeSmart Maintenance Compliance', scope_customer: 'CubeSmart', score_category: 'maintenance', kpi: 'CubeSmart Maintenance score', baseline_value: 43, baseline_period: 'As displayed Oct 13 2026; check-in 36% and schedule confirmation 49% over 36 complete months through September 2026', target_value: 80, department: 'Scheduling',
        root_problem: 'CubeSmart Maintenance score is 43. Check-in compliance is 36% and schedule confirmation is 49%, both measured over 36 complete months through September 2026, so recent months must improve by a lot to move the long average.',
        action_plan: '1. List every open CubeSmart PM work order and confirm a scheduled date with the site; record it on the case.\n2. Make check-in on arrival a required step for every CubeSmart PM visit and name who confirms it each day.\n3. Review schedule confirmation and check-in weekly in the Scheduling department view.\n4. Record check-in and schedule confirmation monthly from the Maintenance view.',
        verification_method: 'Monthly CubeSmart check-in and schedule confirmation percentages from the ServiceChannel Maintenance view, with the period they cover written down.' },
      { name: 'Project C: Speed Improvement', scope_customer: null, score_category: 'speed', kpi: 'Speed score', baseline_value: 70, baseline_period: 'As displayed Oct 13 2026', target_value: 80, department: 'Scheduling',
        root_problem: 'Speed score is 70. The export carries no SLA deadline, so the drivers (response, arrival, completion against the customer windows) must be read from ServiceChannel itself.',
        action_plan: '1. Read the Speed breakdown in ServiceChannel and record which window is missed most.\n2. Set a daily dispatch review of every open work order with a scheduled date in the next two days.\n3. Record reassignments and ETA changes on the case so late arrivals have a reason.\n4. Record the Speed score monthly.',
        verification_method: 'Monthly Speed score from the Marketplace Score dashboard.' },
      { name: 'Project D: Repeat Repair Reduction', scope_customer: null, score_category: 'quality', kpi: 'Recall rate', baseline_value: 9, baseline_period: 'September 2026 displayed movement (12 recall orders, 10 ALDI), from the October 10 review', target_value: 5, department: 'Refrigeration',
        root_problem: 'Recall rate rose to 9% in September 2026 with 12 recall orders, 10 of them ALDI. Each recall is a repeat visit the customer scores against Quality.',
        action_plan: '1. Open a root cause investigation for every recall and classify the cause.\n2. Where the cause is diagnosis or incomplete repair, agree a testing-before-leaving standard with the supervisor.\n3. Link recall work orders to this project so the count is visible.\n4. Record the recall rate monthly.',
        verification_method: 'Monthly recall rate from the ServiceChannel scorecard, and the count of verified recall links in PhaseForge.' },
    ]
    const { data, error } = await ctx.admin.from('sc_projects').insert(starters.map((s) => ({ ...common, ...s }))).select('id, name, kpi, baseline_value, baseline_period')
    if (error) return { ok: false as const, error: error.message }
    for (const p of data ?? []) {
      await ctx.admin.from('sc_project_kpis').insert({ company_id: ctx.companyId, project_id: p.id, kind: 'baseline', label: p.kpi, value: p.baseline_value, snapshot_date: '2026-10-13', period_label: p.baseline_period, source: STARTER_SOURCE, created_by: ctx.userId })
      await logRecordEvent(ctx, 'project', p.id as string, 'created', 'Starter project created from the October 13, 2026 review')
    }
    refresh()
    return { ok: true as const, count: (data ?? []).length }
  } catch (e) { return fail(e) }
}
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/* ── Root cause investigations ────────────────────────────────────────────── */

export interface InvestigationInput {
  title?: string; description?: string | null; customerName?: string | null; equipment?: string | null; impact?: string | null; evidence?: string | null
  suspectedCause?: string | null; verifiedCause?: string | null; causeClass?: string | null; department?: string | null; correctiveAction?: string | null; preventionPlan?: string | null
  ownerKey?: string | null; ownerName?: string | null; status?: string; verificationDate?: string | null; outcome?: string | null; projectId?: string | null
}
function investigationRow(i: InvestigationInput): Record<string, unknown> {
  const r: Record<string, unknown> = {}
  const text = (k: string, v: unknown, max: number) => { if (v !== undefined) r[k] = str(v, max) }
  if (i.title !== undefined) r.title = str(i.title, 200)
  text('description', i.description, 4000); text('customer_name', i.customerName, 120); text('equipment', i.equipment, 200); text('impact', i.impact, 2000); text('evidence', i.evidence, 4000)
  text('suspected_cause', i.suspectedCause, 2000); text('verified_cause', i.verifiedCause, 2000); if (i.causeClass !== undefined) r.cause_class = oneOf(CAUSE_CLASSES, i.causeClass)
  text('department', i.department, 80); text('corrective_action', i.correctiveAction, 4000); text('prevention_plan', i.preventionPlan, 4000)
  if (i.ownerKey !== undefined) Object.assign(r, ownerCols(i.ownerKey, i.ownerName))
  if (i.status !== undefined) r.status = oneOf(INVESTIGATION_STATUSES, i.status) ?? 'open'
  if (i.verificationDate !== undefined) r.verification_date = date(i.verificationDate); text('outcome', i.outcome, 2000); if (i.projectId !== undefined) r.project_id = i.projectId || null
  return r
}

export async function createInvestigationAction(input: InvestigationInput & { trackingNumbers?: string[] }) {
  try {
    const ctx = await scCtx()
    const row = investigationRow(input)
    if (!row.title) return { ok: false as const, error: 'Give the investigation a title.' }
    const { data, error } = await ctx.admin.from('sc_investigations').insert({ ...row, status: row.status ?? 'open', company_id: ctx.companyId, created_by: ctx.userId, created_name: ctx.userName }).select('id').single()
    if (error) return { ok: false as const, error: error.message }
    await logRecordEvent(ctx, 'investigation', data.id as string, 'created', 'Investigation opened')
    if (input.trackingNumbers?.length) await linkWorkOrdersToRecordAction({ type: 'investigation', id: data.id as string, trackingNumbers: input.trackingNumbers })
    refresh()
    return { ok: true as const, id: data.id as string }
  } catch (e) { return fail(e) }
}

export async function updateInvestigationAction(input: { id: string; patch: InvestigationInput; note?: string }) {
  try {
    const ctx = await scCtx()
    const { data: cur } = await ctx.admin.from('sc_investigations').select('*').eq('id', input.id).eq('company_id', ctx.companyId).maybeSingle()
    if (!cur) return { ok: false as const, error: 'Investigation not found.' }
    const row = investigationRow(input.patch)
    if (row.title === null) return { ok: false as const, error: 'The title cannot be blank.' }
    const status = (row.status ?? cur.status) as string
    if ((status === 'verified' || status === 'closed') && !(row.verified_cause ?? cur.verified_cause)) return { ok: false as const, error: 'Record the verified cause before marking the cause verified or closing.' }
    if (status === 'closed' && !(row.corrective_action ?? cur.corrective_action)) return { ok: false as const, error: 'Record the corrective action before closing.' }
    if (status === 'verified' && !row.verification_date && !cur.verification_date) row.verification_date = new Date().toISOString().slice(0, 10)
    const changes = Object.keys(row).filter((k) => String(cur[k] ?? '') !== String(row[k] ?? '')).map((k) => k.replace(/_/g, ' '))
    const ts = now()
    const { error } = await ctx.admin.from('sc_investigations').update({ ...row, updated_at: ts, last_update_at: ts }).eq('id', cur.id)
    if (error) return { ok: false as const, error: error.message }
    if (changes.length || str(input.note)) await logRecordEvent(ctx, 'investigation', cur.id as string, 'update', [changes.length ? `Updated ${changes.join(', ')}` : null, str(input.note, 4000)].filter(Boolean).join('. '), { patch: row })
    refresh(`/app/servicechannel/rca/${cur.id}`)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/* ── Alert thresholds and score review ────────────────────────────────────── */

export async function saveThresholdsAction(input: { unackDays: number; staleDays: number; reviewDays: number }) {
  try {
    const ctx = await scCtx()
    const clamp = (n: unknown) => Math.max(1, Math.min(60, Math.round(Number(n) || 0)))
    const row = { unack_days: clamp(input.unackDays), stale_days: clamp(input.staleDays), review_days: clamp(input.reviewDays) }
    if (![input.unackDays, input.staleDays, input.reviewDays].every((n) => Number(n) >= 1)) return { ok: false as const, error: 'Each threshold is a whole number of days, at least 1.' }
    const { error } = await ctx.admin.from('sc_settings').upsert({ company_id: ctx.companyId, ...row, updated_at: now() }, { onConflict: 'company_id' })
    if (error) return { ok: false as const, error: error.message }
    refresh('/app/servicechannel/settings')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function markScoreReviewAction() {
  try {
    const ctx = await scCtx()
    await ctx.admin.from('sc_settings').upsert({ company_id: ctx.companyId, last_score_review_at: now(), updated_at: now() }, { onConflict: 'company_id' })
    refresh()
    return { ok: true as const }
  } catch (e) { return fail(e) }
}
