'use server'

import { revalidatePath } from 'next/cache'
import { SC_BUCKET, SUGGESTED_DEPARTMENTS, fail, logEvent, scCtx } from '@/lib/servicechannel/server'
import { EMP, ownerCols } from '@/lib/servicechannel/records'
import { INTERNAL_STATUSES, type InternalStatus } from '@/lib/servicechannel/types'
import { WAITING_ON } from '@/lib/servicechannel/actionCenter'

// Operational follow-up: the fast editor, facts the export cannot tell us,
// the store/customer directory, links, attachments, templates, saved views.
// Every write is logged to the case timeline. Nothing here touches official
// ServiceChannel values.

const refresh = () => { for (const p of ['/app/servicechannel', '/app/servicechannel/action-center', '/app/servicechannel/work-orders', '/app/servicechannel/customers', '/app/servicechannel/departments']) revalidatePath(p) }
const str = (v: unknown, max = 2000) => { const s = typeof v === 'string' ? v.trim() : ''; return s ? s.slice(0, max) : null }
const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
const isStatus = (v: unknown): v is InternalStatus => INTERNAL_STATUSES.includes(v as InternalStatus)
const now = () => new Date().toISOString()

export interface QuickPatch {
  internalStatus?: string | null
  ownerProfileId?: string | null; ownerName?: string | null
  actionOwnerProfileId?: string | null; actionOwnerName?: string | null
  department?: string | null; waitingOn?: string | null
  nextAction?: string | null; dueDate?: string | null; blockerReason?: string | null
}
export interface CaseFacts {
  appointmentOn?: string | null; partsExpectedOn?: string | null; partsReceivedOn?: string | null
  approvalStatus?: string | null; equipmentCondition?: string | null; conditionVerified?: boolean
  customerContactName?: string | null; nextContactOn?: string | null
}

/** One save from the quick editor: follow-up fields, recorded facts, and an optional note. */
export async function quickUpdateCaseAction(input: { workOrderId: string; patch: QuickPatch; facts?: CaseFacts; note?: string; noteKind?: 'note' | 'customer_contact' | 'department_followup' }) {
  try {
    const ctx = await scCtx()
    const { data: cur } = await ctx.admin.from('sc_cases').select('*').eq('work_order_id', input.workOrderId).eq('company_id', ctx.companyId).maybeSingle()
    if (!cur) return { ok: false as const, error: 'Case not found.' }
    const p = input.patch, f = input.facts ?? {}
    const row: Record<string, unknown> = { updated_at: now(), last_update_at: now() }
    const changes: string[] = []
    const set = (col: string, val: unknown, label: string) => { if ((cur[col] ?? null) !== (val ?? null)) { row[col] = val ?? null; changes.push(label) } }

    if (p.internalStatus !== undefined && p.internalStatus !== null) {
      if (!isStatus(p.internalStatus)) return { ok: false as const, error: 'Unknown status.' }
      if (p.internalStatus === 'verified_resolved') return { ok: false as const, error: 'Use Verify resolved on the case; it needs a note and no open tasks.' }
      set('internal_status', p.internalStatus, `status ${cur.internal_status} → ${p.internalStatus}`)
      if (p.internalStatus === 'accepted' && !cur.handoff_accepted_at) row.handoff_accepted_at = now()
    }
    const curOwner = cur.owner_profile_id ?? (cur.owner_employee_id ? `${EMP}${cur.owner_employee_id}` : null)
    if (p.ownerProfileId !== undefined && curOwner !== (p.ownerProfileId || null)) {
      const cols = ownerCols(p.ownerProfileId, p.ownerName)
      Object.assign(row, cols); row.handoff_accepted_at = null; row.external_ack_at = null; row.external_ack_by = null
      row.owner_assigned_at = p.ownerProfileId ? now() : null
      changes.push(`owner → ${cols.owner_name ?? 'nobody'}`)
      if (p.ownerProfileId && cur.internal_status === 'new' && row.internal_status === undefined) row.internal_status = 'assigned'
    }
    const curAction = cur.action_owner_profile_id ?? (cur.action_owner_employee_id ? `${EMP}${cur.action_owner_employee_id}` : null)
    if (p.actionOwnerProfileId !== undefined && curAction !== (p.actionOwnerProfileId || null)) {
      const cols = ownerCols(p.actionOwnerProfileId, p.actionOwnerName, 'action_owner')
      Object.assign(row, cols); changes.push(`next-action owner → ${cols.action_owner_name ?? 'nobody'}`)
    }
    if (p.department !== undefined) set('department', str(p.department, 80), `department → ${str(p.department, 80) ?? 'none'}`)
    if (p.waitingOn !== undefined) {
      const w = p.waitingOn && (WAITING_ON as readonly string[]).includes(p.waitingOn) ? p.waitingOn : null
      set('waiting_on', w, w ? `waiting on ${w.replace('_', ' ')}` : 'no longer waiting')
    }
    if (p.nextAction !== undefined) set('next_action', str(p.nextAction, 500), 'next action updated')
    if (p.dueDate !== undefined) set('due_date', date(p.dueDate), `due ${date(p.dueDate) ?? 'cleared'}`)
    if (p.blockerReason !== undefined) set('blocker_reason', str(p.blockerReason, 500), str(p.blockerReason) ? 'blocker noted' : 'blocker cleared')

    if (f.appointmentOn !== undefined) set('appointment_on', date(f.appointmentOn), `appointment ${date(f.appointmentOn) ?? 'cleared'} (recorded by hand)`)
    if (f.partsExpectedOn !== undefined) set('parts_expected_on', date(f.partsExpectedOn), `parts expected ${date(f.partsExpectedOn) ?? 'cleared'}`)
    if (f.partsReceivedOn !== undefined) set('parts_received_on', date(f.partsReceivedOn), `parts received ${date(f.partsReceivedOn) ?? 'cleared'}`)
    if (f.approvalStatus !== undefined) {
      const a = f.approvalStatus && ['pending', 'approved', 'declined'].includes(f.approvalStatus) ? f.approvalStatus : null
      set('approval_status', a, `approval ${a ?? 'cleared'} (recorded by hand)`)
    }
    if (f.equipmentCondition !== undefined) {
      set('equipment_condition', str(f.equipmentCondition, 500), 'equipment condition recorded')
      if (f.conditionVerified) row.condition_verified_at = now()
    }
    if (f.customerContactName !== undefined) set('customer_contact_name', str(f.customerContactName, 120), 'customer contact recorded')
    if (f.nextContactOn !== undefined) set('next_contact_on', date(f.nextContactOn), `next contact ${date(f.nextContactOn) ?? 'cleared'}`)

    const { error } = await ctx.admin.from('sc_cases').update(row).eq('id', cur.id)
    if (error) return { ok: false as const, error: error.message }
    const note = str(input.note, 4000)
    if (changes.length) await logEvent(ctx, input.workOrderId, 'case_update', changes.join(', '), { patch: row })
    if (note) await logEvent(ctx, input.workOrderId, input.noteKind === 'customer_contact' || input.noteKind === 'department_followup' ? input.noteKind : 'note', note)
    refresh(); revalidatePath(`/app/servicechannel/work-orders/${input.workOrderId}`)
    return { ok: true as const, changes: changes.length }
  } catch (e) { return fail(e) }
}

/** Someone without a PhaseForge login acknowledged the handoff; the recorder is named. */
export async function recordExternalAckAction(input: { workOrderId: string; who: string; how?: string }) {
  try {
    const ctx = await scCtx()
    const who = str(input.who, 120)
    if (!who) return { ok: false as const, error: 'Name the person who acknowledged.' }
    const { data: cur } = await ctx.admin.from('sc_cases').select('id, internal_status').eq('work_order_id', input.workOrderId).eq('company_id', ctx.companyId).maybeSingle()
    if (!cur) return { ok: false as const, error: 'Case not found.' }
    await ctx.admin.from('sc_cases').update({
      external_ack_by: who, external_ack_recorded_by: ctx.userId, external_ack_recorded_name: ctx.userName, external_ack_at: now(),
      internal_status: cur.internal_status === 'new' || cur.internal_status === 'assigned' ? 'accepted' : cur.internal_status, updated_at: now(), last_update_at: now(),
    }).eq('id', cur.id)
    await logEvent(ctx, input.workOrderId, 'handoff_accepted', `${who} acknowledged the assignment${str(input.how) ? ` (${str(input.how)})` : ''}; recorded by ${ctx.userName}`)
    refresh(); revalidatePath(`/app/servicechannel/work-orders/${input.workOrderId}`)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/* ── Customers and stores ───────────────────────────────────────────────── */

/** Map store numbers to a customer. Fills work orders with no customer and corrects ones that got theirs from the directory; a customer typed on a work order by hand is never changed. */
export async function mapStoresAction(input: { storeNumbers: string[]; customerName: string; note?: string }) {
  try {
    const ctx = await scCtx()
    const customer = str(input.customerName, 120)
    const stores = [...new Set(input.storeNumbers.map((s) => s.trim()).filter(Boolean))].slice(0, 500)
    if (!customer || !stores.length) return { ok: false as const, error: 'Pick at least one store and a customer.' }
    const { error } = await ctx.admin.from('sc_store_customers').upsert(stores.map((store_number) => ({
      company_id: ctx.companyId, store_number, customer_name: customer, note: str(input.note, 300), created_by: ctx.userId, created_name: ctx.userName, updated_at: now(),
    })), { onConflict: 'company_id,store_number' })
    if (error) return { ok: false as const, error: error.message }
    const { data: filled } = await ctx.admin.from('sc_work_orders').update({ customer_name: customer, customer_source: 'directory', updated_at: now() })
      .eq('company_id', ctx.companyId).in('store_number', stores).or('customer_name.is.null,customer_source.eq.directory').select('id')
    refresh()
    return { ok: true as const, stores: stores.length, filled: (filled ?? []).length }
  } catch (e) { return fail(e) }
}

/** Removes a mapping and clears the customer on work orders that got it from that mapping, so the store shows as unknown again. Hand-typed customers stay. */
export async function unmapStoreAction(storeNumber: string) {
  try {
    const ctx = await scCtx()
    await ctx.admin.from('sc_store_customers').delete().eq('company_id', ctx.companyId).eq('store_number', storeNumber)
    const { data: cleared } = await ctx.admin.from('sc_work_orders').update({ customer_name: null, customer_source: null, updated_at: now() })
      .eq('company_id', ctx.companyId).eq('store_number', storeNumber).eq('customer_source', 'directory').select('id')
    refresh()
    return { ok: true as const, cleared: (cleared ?? []).length }
  } catch (e) { return fail(e) }
}

/** A person sets the customer on one work order. Wins over everything an import brings. */
export async function setCustomerAction(input: { workOrderId: string; customerName: string }) {
  try {
    const ctx = await scCtx()
    const name = str(input.customerName, 120)
    await ctx.admin.from('sc_work_orders').update({ customer_name: name, customer_source: name ? 'manual' : null, updated_at: now() }).eq('id', input.workOrderId).eq('company_id', ctx.companyId)
    await logEvent(ctx, input.workOrderId, 'case_update', name ? `customer set to ${name} (manual)` : 'customer cleared')
    refresh(); revalidatePath(`/app/servicechannel/work-orders/${input.workOrderId}`)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/** Resolve a recorded import conflict: keep the manual value or take the imported one. */
export async function resolveConflictAction(input: { workOrderId: string; index: number; choice: 'keep' | 'take' }) {
  try {
    const ctx = await scCtx()
    const { data: w } = await ctx.admin.from('sc_work_orders').select('conflicts, customer_name').eq('id', input.workOrderId).eq('company_id', ctx.companyId).single()
    if (!w) return { ok: false as const, error: 'Work order not found.' }
    const list = ((w.conflicts as Record<string, unknown>[]) ?? [])
    const c = list[input.index]
    if (!c) return { ok: false as const, error: 'Conflict not found.' }
    const patch: Record<string, unknown> = { updated_at: now() }
    if (input.choice === 'take' && c.field === 'customer_name') { patch.customer_name = c.imported; patch.customer_source = 'import' }
    patch.conflicts = list.map((x, i) => (i === input.index ? { ...x, resolved: input.choice, resolvedAt: now(), resolvedBy: ctx.userName } : x))
    await ctx.admin.from('sc_work_orders').update(patch).eq('id', input.workOrderId)
    await logEvent(ctx, input.workOrderId, 'case_update', `${c.field}: ${input.choice === 'take' ? `took the imported value "${c.imported}"` : `kept "${c.kept}"`}`)
    refresh(); revalidatePath(`/app/servicechannel/work-orders/${input.workOrderId}`)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/* ── Related work orders ────────────────────────────────────────────────── */

export async function linkWorkOrdersAction(input: { workOrderId: string; relatedId: string; relation: 'related' | 'recall'; note?: string }) {
  try {
    const ctx = await scCtx()
    if (input.workOrderId === input.relatedId) return { ok: false as const, error: 'Pick a different work order.' }
    const { error } = await ctx.admin.from('sc_links').upsert({ company_id: ctx.companyId, work_order_id: input.workOrderId, related_id: input.relatedId, relation: input.relation === 'recall' ? 'recall' : 'related', note: str(input.note, 500), created_by: ctx.userId, created_name: ctx.userName }, { onConflict: 'work_order_id,related_id' })
    if (error) return { ok: false as const, error: error.message }
    const { data: other } = await ctx.admin.from('sc_work_orders').select('tracking_number').eq('id', input.relatedId).single()
    await logEvent(ctx, input.workOrderId, 'linked', `Linked ${other?.tracking_number ?? input.relatedId} as ${input.relation === 'recall' ? 'a verified recall' : 'related'}${str(input.note) ? `: ${str(input.note)}` : ''}`)
    revalidatePath(`/app/servicechannel/work-orders/${input.workOrderId}`)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function unlinkWorkOrdersAction(linkId: string) {
  try {
    const ctx = await scCtx()
    const { data: l } = await ctx.admin.from('sc_links').select('work_order_id').eq('id', linkId).eq('company_id', ctx.companyId).maybeSingle()
    await ctx.admin.from('sc_links').delete().eq('id', linkId).eq('company_id', ctx.companyId)
    if (l) { await logEvent(ctx, l.work_order_id as string, 'linked', 'Link removed'); revalidatePath(`/app/servicechannel/work-orders/${l.work_order_id}`) }
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/* ── Attachments ────────────────────────────────────────────────────────── */

const MAX_FILE = 15 * 1024 * 1024
export async function uploadAttachmentAction(form: FormData) {
  try {
    const ctx = await scCtx()
    const workOrderId = String(form.get('workOrderId') ?? '')
    const { data: wo } = await ctx.admin.from('sc_work_orders').select('id').eq('id', workOrderId).eq('company_id', ctx.companyId).maybeSingle()
    if (!wo) return { ok: false as const, error: 'Work order not found.' }
    const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
    if (!files.length) return { ok: false as const, error: 'Choose a file.' }
    let saved = 0
    for (const f of files.slice(0, 10)) {
      if (f.size > MAX_FILE) return { ok: false as const, error: `${f.name} is over 15 MB.` }
      const safe = f.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120)
      const path = `servicechannel/${ctx.companyId}/${workOrderId}/${Date.now()}-${safe}`
      const up = await ctx.admin.storage.from(SC_BUCKET).upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false })
      if (up.error) return { ok: false as const, error: up.error.message }
      await ctx.admin.from('sc_attachments').insert({ company_id: ctx.companyId, work_order_id: workOrderId, path, name: f.name, size: f.size, content_type: f.type || null, created_by: ctx.userId, created_name: ctx.userName })
      saved++
    }
    await logEvent(ctx, workOrderId, 'attachment', `${saved} file(s) attached`)
    revalidatePath(`/app/servicechannel/work-orders/${workOrderId}`)
    return { ok: true as const, saved }
  } catch (e) { return fail(e) }
}

export async function deleteAttachmentAction(id: string) {
  try {
    const ctx = await scCtx()
    const { data: a } = await ctx.admin.from('sc_attachments').select('path, work_order_id, name').eq('id', id).eq('company_id', ctx.companyId).maybeSingle()
    if (!a) return { ok: false as const, error: 'Attachment not found.' }
    await ctx.admin.storage.from(SC_BUCKET).remove([a.path as string])
    await ctx.admin.from('sc_attachments').delete().eq('id', id)
    await logEvent(ctx, a.work_order_id as string, 'attachment', `Removed ${a.name}`)
    revalidatePath(`/app/servicechannel/work-orders/${a.work_order_id}`)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/* ── Templates, saved views, departments ────────────────────────────────── */

export async function saveTemplateAction(input: { id?: string | null; title: string; queue: string; nextAction: string; daysDue: number; waitingOn?: string | null; internalStatus?: string | null; isActive?: boolean }) {
  try {
    const ctx = await scCtx()
    const title = str(input.title, 120), nextAction = str(input.nextAction, 1000)
    if (!title || !nextAction) return { ok: false as const, error: 'A template needs a title and a next action.' }
    const row = {
      company_id: ctx.companyId, title, queue: str(input.queue, 40) ?? 'general', next_action: nextAction, days_due: Math.max(0, Math.min(60, Math.round(input.daysDue || 0))),
      waiting_on: input.waitingOn && (WAITING_ON as readonly string[]).includes(input.waitingOn) ? input.waitingOn : null,
      internal_status: isStatus(input.internalStatus) ? input.internalStatus : null, is_active: input.isActive ?? true, updated_at: now(),
    }
    const q = input.id ? ctx.admin.from('sc_follow_up_templates').update(row).eq('id', input.id).eq('company_id', ctx.companyId) : ctx.admin.from('sc_follow_up_templates').insert(row)
    const { error } = await q
    if (error) return { ok: false as const, error: error.code === '23505' ? 'A template with that title exists.' : error.message }
    revalidatePath('/app/servicechannel/settings')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function deleteTemplateAction(id: string) {
  try {
    const ctx = await scCtx()
    await ctx.admin.from('sc_follow_up_templates').delete().eq('id', id).eq('company_id', ctx.companyId)
    revalidatePath('/app/servicechannel/settings')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function saveViewAction(input: { pageKey: string; name: string; filters: Record<string, unknown> }) {
  try {
    const ctx = await scCtx()
    const name = str(input.name, 60)
    if (!name) return { ok: false as const, error: 'Name the view.' }
    const { data: ex } = await ctx.admin.from('saved_views').select('id').eq('company_id', ctx.companyId).eq('user_id', ctx.userId).eq('page_key', input.pageKey).eq('name', name).maybeSingle()
    const { error } = ex
      ? await ctx.admin.from('saved_views').update({ filters: input.filters }).eq('id', ex.id)
      : await ctx.admin.from('saved_views').insert({ company_id: ctx.companyId, user_id: ctx.userId, page_key: input.pageKey, name, filters: input.filters })
    if (error) return { ok: false as const, error: error.message }
    revalidatePath('/app/servicechannel/work-orders')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function deleteViewAction(id: string) {
  try {
    const ctx = await scCtx()
    await ctx.admin.from('saved_views').delete().eq('id', id).eq('company_id', ctx.companyId).eq('user_id', ctx.userId)
    revalidatePath('/app/servicechannel/work-orders')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/** Adds the suggested departments as company divisions, skipping ones that exist. */
export async function addSuggestedDepartmentsAction() {
  try {
    const ctx = await scCtx()
    const { data: existing } = await ctx.admin.from('divisions').select('name').eq('company_id', ctx.companyId)
    const have = new Set((existing ?? []).map((d) => String(d.name).toLowerCase()))
    const add = SUGGESTED_DEPARTMENTS.filter((n) => !have.has(n.toLowerCase()))
    if (add.length) await ctx.admin.from('divisions').insert(add.map((name, i) => ({ company_id: ctx.companyId, name, color: '#6366f1', is_active: true, sort_order: (existing?.length ?? 0) + i })))
    revalidatePath('/app/servicechannel/departments'); revalidatePath('/app/servicechannel/settings')
    return { ok: true as const, added: add.length }
  } catch (e) { return fail(e) }
}
