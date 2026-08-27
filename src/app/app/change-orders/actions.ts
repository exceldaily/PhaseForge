'use server'

// Change Order server actions. Every financially significant mutation writes a
// co_events row (insert-only audit trail) and bumps updated_at/updated_by.
// Validation runs here (never only in the client); RLS re-enforces org scoping
// and the manager-or-owner write rule at the data layer.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { coStage, CO_STAGE_MAP } from '@/lib/changeOrders'
import { canEditCompanyData } from '@/lib/permissions'

const PATH = '/app/change-orders'

type Result<T = undefined> = { success: true; data?: T } | { success: false; error: string }

async function ctx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: p } = await supabase
    .from('profiles').select('company_id, role, full_name').eq('id', user.id).single()
  if (!p?.company_id) throw new Error('No organization')
  return { supabase, userId: user.id, companyId: p.company_id, role: p.role as string, userName: p.full_name ?? 'Someone' }
}

const isManager = (role: string) => ['owner', 'admin', 'manager'].includes(role)

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message
  const m = (e as { message?: string })?.message
  return m || fallback
}

async function logEvent(
  supabase: Awaited<ReturnType<typeof ctx>>['supabase'],
  companyId: string, coId: string, actorId: string,
  event: { type: string; field?: string; oldValue?: string | null; newValue?: string | null; note?: string | null },
) {
  await supabase.from('co_events').insert({
    company_id: companyId, co_id: coId, actor_id: actorId,
    event_type: event.type, field: event.field ?? null,
    old_value: event.oldValue ?? null, new_value: event.newValue ?? null,
    note: event.note ?? null,
  })
}

async function notifyUser(
  supabase: Awaited<ReturnType<typeof ctx>>['supabase'],
  companyId: string, userId: string, title: string, body: string, link: string,
) {
  // Notifications insert uses service policies via RLS-允owed path in existing
  // schema (service-role scoped); fall back silently if blocked.
  try {
    await supabase.from('notifications').insert({
      user_id: userId, company_id: companyId, type: 'system', title, body, link,
    })
  } catch { /* best-effort */ }
}

function parseAmount(v: unknown, label: string): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''))
  if (!Number.isFinite(n) || Math.abs(n) > 999_999_999) throw new Error(`${label} is not a valid amount`)
  return Math.round(n * 100) / 100
}

// ── Project participation ───────────────────────────────────────────────────

export async function setCoTracking(projectIds: string[], enabled: boolean): Promise<Result> {
  try {
    const { supabase, companyId, role } = await ctx()
    if (!isManager(role)) return { success: false, error: 'Managers and up only' }
    if (projectIds.length === 0) return { success: true }
    const { error, count } = await supabase
      .from('projects')
      .update({ co_tracking_enabled: enabled }, { count: 'exact' })
      .in('id', projectIds)
      .eq('company_id', companyId)
    if (error) throw error
    if (!count) return { success: false, error: 'No matching projects updated' }
    revalidatePath(PATH); revalidatePath('/app/projects')
    return { success: true }
  } catch (e) { logger.error('setCoTracking', e); return { success: false, error: errMsg(e, 'Failed to update projects') } }
}

export async function setOriginalContractValue(projectId: string, value: number | null): Promise<Result> {
  try {
    const { supabase, companyId, role } = await ctx()
    if (!isManager(role)) return { success: false, error: 'Managers and up only' }
    const amount = parseAmount(value, 'Contract value')
    const { error } = await supabase.from('projects')
      .update({ original_contract_value: amount })
      .eq('id', projectId).eq('company_id', companyId)
    if (error) throw error
    revalidatePath(PATH)
    return { success: true }
  } catch (e) { return { success: false, error: errMsg(e, 'Failed to save contract value') } }
}

// ── Create ──────────────────────────────────────────────────────────────────

export async function createChangeOrder(input: {
  projectId: string
  title: string
  description?: string
  requestedAmount?: number | string | null
  potentialCost?: number | string | null
  priority?: string
  ownerId?: string | null
  nextAction?: string | null
  dueDate?: string | null
  customerName?: string | null
  storeNumber?: string | null
  portal?: string | null
}): Promise<Result<{ id: string; label: string }>> {
  try {
    const { supabase, userId, companyId, role } = await ctx()
    if (!isManager(role)) return { success: false, error: 'Managers and up only' }
    const title = input.title.trim()
    if (!title) return { success: false, error: 'Give the change order a title' }

    // Project must exist, belong to the org, and auto-fills customer context.
    const { data: project } = await supabase
      .from('projects')
      .select('id, name, customer_name, store_site_id, co_tracking_enabled')
      .eq('id', input.projectId).eq('company_id', companyId).single()
    if (!project) return { success: false, error: 'Project not found' }

    const requested = parseAmount(input.requestedAmount, 'Requested amount')
    const cost = parseAmount(input.potentialCost, 'Potential cost')

    // Per-org sequential number → CO-<YY>-<00042>
    const { data: seq, error: seqErr } = await supabase.rpc('next_org_number', { p_key: 'change_order' })
    if (seqErr) throw seqErr
    const label = `CO-${String(new Date().getFullYear()).slice(2)}-${String(seq).padStart(5, '0')}`

    const { data: row, error } = await supabase.from('change_orders').insert({
      company_id: companyId,
      project_id: project.id,
      co_number: seq,
      co_label: label,
      title,
      description: input.description?.trim() || null,
      requested_amount: requested,
      current_amount: requested,
      potential_cost: cost,
      priority: input.priority ?? 'medium',
      owner_id: input.ownerId ?? userId,
      next_action: input.nextAction?.trim() || 'Review and price this change',
      due_date: input.dueDate || null,
      customer_name: input.customerName?.trim() || project.customer_name,
      store_number: input.storeNumber?.trim() || project.store_site_id,
      portal: input.portal?.trim() || null,
      created_by: userId, updated_by: userId,
    }).select('id').single()
    if (error) throw error

    // Ensure the project participates from now on (creating a CO opts it in).
    if (!project.co_tracking_enabled) {
      await supabase.from('projects').update({ co_tracking_enabled: true }).eq('id', project.id)
    }

    await logEvent(supabase, companyId, row.id, userId, { type: 'created', newValue: label, note: title })
    if (input.ownerId && input.ownerId !== userId) {
      await logEvent(supabase, companyId, row.id, userId, { type: 'owner_change', newValue: input.ownerId })
      await notifyUser(supabase, companyId, input.ownerId, `${label} assigned to you`, title, `/app/change-orders/${row.id}`)
    }

    revalidatePath(PATH)
    return { success: true, data: { id: row.id, label } }
  } catch (e) { logger.error('createChangeOrder', e); return { success: false, error: errMsg(e, 'Failed to create change order') } }
}

// ── Stage / workflow ────────────────────────────────────────────────────────

export async function changeStage(coId: string, toStage: string, extra?: {
  note?: string
  submittedDate?: string
  portal?: string
  trackingNumber?: string
  confirmationNumber?: string
  noConfirmation?: boolean
  approvedAmount?: number | string | null
  approvedDate?: string
  approvedByName?: string
  approvalReference?: string
  invoiceNumber?: string
  invoiceDate?: string
  billedAmount?: number | string | null
  waitingOn?: string | null
  nextAction?: string | null
  ownerId?: string | null
}): Promise<Result> {
  try {
    const { supabase, userId, companyId } = await ctx()
    const stageDef = CO_STAGE_MAP[toStage]
    if (!stageDef) return { success: false, error: 'Unknown stage' }

    const { data: co } = await supabase.from('change_orders')
      .select('*').eq('id', coId).eq('company_id', companyId).single()
    if (!co) return { success: false, error: 'Change order not found' }
    if (co.stage === toStage) return { success: true }

    const patch: Record<string, unknown> = {
      stage: toStage,
      stage_entered_at: new Date().toISOString(),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }

    // Enforce required data for gated stages (server-side, not just UI).
    const requires = stageDef.requires ?? []
    if (requires.includes('submitted_date')) {
      const submitted = extra?.submittedDate || co.submitted_date || new Date().toISOString()
      patch.submitted_date = submitted
      patch.submitted_by = userId
      if (extra?.portal?.trim()) patch.portal = extra.portal.trim()
      if (!(extra?.portal?.trim() || co.portal)) {
        return { success: false, error: 'Enter the customer portal this was submitted through' }
      }
    }
    if (requires.includes('tracking')) {
      const tracking = extra?.trackingNumber?.trim() || co.tracking_number
      const confirmation = extra?.confirmationNumber?.trim() || co.confirmation_number
      const noConf = extra?.noConfirmation ?? co.no_confirmation
      if (!tracking && !confirmation && !noConf) {
        return { success: false, error: 'Enter the customer tracking/confirmation number, or mark that the portal did not provide one' }
      }
      if (extra?.trackingNumber?.trim()) patch.tracking_number = extra.trackingNumber.trim()
      if (extra?.confirmationNumber?.trim()) patch.confirmation_number = extra.confirmationNumber.trim()
      if (extra?.noConfirmation) { patch.no_confirmation = true; patch.no_confirmation_by = userId }
    }
    if (requires.includes('approved_amount')) {
      const approved = parseAmount(extra?.approvedAmount, 'Approved amount') ?? co.approved_amount
      if (approved == null) return { success: false, error: 'Enter the approved amount' }
      patch.approved_amount = approved
      patch.approved_date = extra?.approvedDate || co.approved_date || new Date().toISOString().slice(0, 10)
      if (extra?.approvedByName?.trim()) patch.approved_by_name = extra.approvedByName.trim()
      if (extra?.approvalReference?.trim()) patch.approval_reference = extra.approvalReference.trim()
      if (co.billing_status === 'not_ready') patch.billing_status = 'ready'
    }
    if (requires.includes('invoice_number')) {
      const inv = extra?.invoiceNumber?.trim() || co.invoice_number
      if (!inv) return { success: false, error: 'Enter the invoice number' }
      patch.invoice_number = inv
      patch.invoice_date = extra?.invoiceDate || co.invoice_date || new Date().toISOString().slice(0, 10)
      const billed = parseAmount(extra?.billedAmount, 'Billed amount')
      patch.billed_amount = billed ?? co.billed_amount ?? co.approved_amount
      patch.billing_status = 'billed'
    }

    // External stages keep an internal owner AND record who we're waiting on.
    if (stageDef.external) {
      patch.waiting_on = extra?.waitingOn?.trim() || co.waiting_on || co.customer_name || 'Customer'
    } else {
      patch.waiting_on = null
    }
    if (extra?.nextAction !== undefined) patch.next_action = extra.nextAction?.trim() || null
    if (extra?.ownerId) patch.owner_id = extra.ownerId
    if (stageDef.category === 'terminal') patch.closed_at = new Date().toISOString()

    // Record customer submission history rows on submit-type transitions.
    if (toStage === 'submitted' || toStage === 'resubmitted') {
      await supabase.from('co_submissions').insert({
        company_id: companyId, co_id: coId,
        portal: (patch.portal as string) ?? co.portal,
        submitted_at: (patch.submitted_date as string) ?? new Date().toISOString(),
        submitted_by: userId,
        amount: co.current_amount ?? co.requested_amount,
        tracking_number: (patch.tracking_number as string) ?? co.tracking_number,
        confirmation_number: (patch.confirmation_number as string) ?? co.confirmation_number,
        no_confirmation: Boolean(patch.no_confirmation ?? co.no_confirmation),
        no_confirmation_by: patch.no_confirmation ? userId : null,
      })
    }

    const { error } = await supabase.from('change_orders').update(patch).eq('id', coId)
    if (error) throw error

    await logEvent(supabase, companyId, coId, userId, {
      type: 'stage_change', field: 'stage',
      oldValue: coStage(co.stage).label, newValue: stageDef.label, note: extra?.note ?? null,
    })
    if (requires.includes('approved_amount') && patch.approved_amount != null) {
      await logEvent(supabase, companyId, coId, userId, {
        type: 'approval', field: 'approved_amount',
        oldValue: co.requested_amount != null ? String(co.requested_amount) : null,
        newValue: String(patch.approved_amount),
      })
    }
    if (extra?.ownerId && extra.ownerId !== co.owner_id) {
      await notifyUser(supabase, companyId, extra.ownerId, `${co.co_label} assigned to you`,
        `${stageDef.label}${extra?.nextAction ? ` — ${extra.nextAction}` : ''}`, `/app/change-orders/${coId}`)
    }

    revalidatePath(PATH); revalidatePath(`/app/change-orders/${coId}`)
    return { success: true }
  } catch (e) { logger.error('changeStage', e); return { success: false, error: errMsg(e, 'Failed to change stage') } }
}

// ── Handoff / assignment ────────────────────────────────────────────────────

export async function assignOwner(coId: string, ownerId: string, opts?: {
  nextAction?: string; dueDate?: string | null; note?: string
}): Promise<Result> {
  try {
    const { supabase, userId, companyId } = await ctx()
    const { data: co } = await supabase.from('change_orders')
      .select('id, owner_id, co_label, title').eq('id', coId).eq('company_id', companyId).single()
    if (!co) return { success: false, error: 'Change order not found' }

    const patch: Record<string, unknown> = { owner_id: ownerId, updated_by: userId, updated_at: new Date().toISOString() }
    if (opts?.nextAction?.trim()) patch.next_action = opts.nextAction.trim()
    if (opts?.dueDate !== undefined) patch.due_date = opts.dueDate
    const { error } = await supabase.from('change_orders').update(patch).eq('id', coId)
    if (error) throw error

    await logEvent(supabase, companyId, coId, userId, {
      type: 'owner_change', field: 'owner', oldValue: co.owner_id, newValue: ownerId, note: opts?.note ?? null,
    })
    if (ownerId !== userId) {
      await notifyUser(supabase, companyId, ownerId, `${co.co_label} assigned to you`,
        opts?.nextAction?.trim() || co.title, `/app/change-orders/${coId}`)
    }
    revalidatePath(PATH); revalidatePath(`/app/change-orders/${coId}`)
    return { success: true }
  } catch (e) { return { success: false, error: errMsg(e, 'Failed to assign') } }
}

export async function bulkAssignOwner(coIds: string[], ownerId: string): Promise<Result> {
  try {
    const { supabase, userId, companyId, role } = await ctx()
    if (!isManager(role)) return { success: false, error: 'Managers and up only' }
    if (coIds.length === 0) return { success: true }
    const { error } = await supabase.from('change_orders')
      .update({ owner_id: ownerId, updated_by: userId, updated_at: new Date().toISOString() })
      .in('id', coIds).eq('company_id', companyId)
    if (error) throw error
    for (const id of coIds) {
      await logEvent(supabase, companyId, id, userId, { type: 'owner_change', field: 'owner', newValue: ownerId, note: 'Bulk assignment' })
    }
    await notifyUser(supabase, companyId, ownerId, `${coIds.length} change orders assigned to you`, '', PATH)
    revalidatePath(PATH)
    return { success: true }
  } catch (e) { return { success: false, error: errMsg(e, 'Bulk assign failed') } }
}

// ── Field updates (amounts, follow-ups, details) ────────────────────────────

export async function updateCoFields(coId: string, patch: {
  title?: string; description?: string | null; nextAction?: string | null
  dueDate?: string | null; followUpDate?: string | null; priority?: string
  currentAmount?: number | string | null; potentialCost?: number | string | null
  customerName?: string | null; storeNumber?: string | null; portal?: string | null
  trackingNumber?: string | null; confirmationNumber?: string | null
  waitingOn?: string | null; tags?: string[]
  billingStatus?: string; invoiceNumber?: string | null; invoiceDate?: string | null
  billedAmount?: number | string | null
  approvalNotes?: string | null
}): Promise<Result> {
  try {
    const { supabase, userId, companyId } = await ctx()
    const { data: co } = await supabase.from('change_orders')
      .select('*').eq('id', coId).eq('company_id', companyId).single()
    if (!co) return { success: false, error: 'Change order not found' }

    const upd: Record<string, unknown> = { updated_by: userId, updated_at: new Date().toISOString() }
    if (patch.title !== undefined) { const t = patch.title.trim(); if (!t) return { success: false, error: 'Title required' }; upd.title = t }
    if (patch.description !== undefined) upd.description = patch.description?.trim() || null
    if (patch.nextAction !== undefined) upd.next_action = patch.nextAction?.trim() || null
    if (patch.dueDate !== undefined) upd.due_date = patch.dueDate || null
    if (patch.followUpDate !== undefined) upd.follow_up_date = patch.followUpDate || null
    if (patch.priority !== undefined) upd.priority = patch.priority
    if (patch.customerName !== undefined) upd.customer_name = patch.customerName?.trim() || null
    if (patch.storeNumber !== undefined) upd.store_number = patch.storeNumber?.trim() || null
    if (patch.portal !== undefined) upd.portal = patch.portal?.trim() || null
    if (patch.trackingNumber !== undefined) upd.tracking_number = patch.trackingNumber?.trim() || null
    if (patch.confirmationNumber !== undefined) upd.confirmation_number = patch.confirmationNumber?.trim() || null
    if (patch.waitingOn !== undefined) upd.waiting_on = patch.waitingOn?.trim() || null
    if (patch.tags !== undefined) upd.tags = patch.tags
    if (patch.billingStatus !== undefined) upd.billing_status = patch.billingStatus
    if (patch.invoiceNumber !== undefined) upd.invoice_number = patch.invoiceNumber?.trim() || null
    if (patch.invoiceDate !== undefined) upd.invoice_date = patch.invoiceDate || null
    if (patch.approvalNotes !== undefined) upd.approval_notes = patch.approvalNotes?.trim() || null
    if (patch.billedAmount !== undefined) upd.billed_amount = parseAmount(patch.billedAmount, 'Billed amount')
    if (patch.currentAmount !== undefined) upd.current_amount = parseAmount(patch.currentAmount, 'Amount')
    if (patch.potentialCost !== undefined) upd.potential_cost = parseAmount(patch.potentialCost, 'Potential cost')

    const { error } = await supabase.from('change_orders').update(upd).eq('id', coId)
    if (error) throw error

    // Audit money + tracking + billing movements specifically.
    if (upd.current_amount !== undefined && upd.current_amount !== co.current_amount) {
      await logEvent(supabase, companyId, coId, userId, {
        type: 'amount_change', field: 'current_amount',
        oldValue: co.current_amount != null ? String(co.current_amount) : null,
        newValue: upd.current_amount != null ? String(upd.current_amount) : null,
      })
    }
    if (upd.tracking_number !== undefined && upd.tracking_number !== co.tracking_number) {
      await logEvent(supabase, companyId, coId, userId, {
        type: 'tracking', field: 'tracking_number', oldValue: co.tracking_number, newValue: upd.tracking_number as string | null,
      })
    }
    if (upd.billing_status !== undefined && upd.billing_status !== co.billing_status) {
      await logEvent(supabase, companyId, coId, userId, {
        type: 'billing', field: 'billing_status', oldValue: co.billing_status, newValue: upd.billing_status as string,
      })
    }
    if (upd.follow_up_date !== undefined && upd.follow_up_date !== co.follow_up_date) {
      await logEvent(supabase, companyId, coId, userId, {
        type: 'follow_up', field: 'follow_up_date', oldValue: co.follow_up_date, newValue: upd.follow_up_date as string | null,
      })
    }

    revalidatePath(PATH); revalidatePath(`/app/change-orders/${coId}`)
    return { success: true }
  } catch (e) { logger.error('updateCoFields', e); return { success: false, error: errMsg(e, 'Failed to save') } }
}

// ── Revisions ───────────────────────────────────────────────────────────────

export async function addRevision(coId: string, input: {
  amount: number | string | null; reason?: string; description?: string; customerFeedback?: string
}): Promise<Result> {
  try {
    const { supabase, userId, companyId } = await ctx()
    const { data: co } = await supabase.from('change_orders')
      .select('id, revision_number, current_amount').eq('id', coId).eq('company_id', companyId).single()
    if (!co) return { success: false, error: 'Change order not found' }
    const amount = parseAmount(input.amount, 'Revision amount')
    const nextRev = (co.revision_number ?? 1) + 1

    const { error: revErr } = await supabase.from('co_revisions').insert({
      company_id: companyId, co_id: coId, revision_number: nextRev,
      amount, reason: input.reason?.trim() || null,
      description: input.description?.trim() || null,
      customer_feedback: input.customerFeedback?.trim() || null,
      created_by: userId,
    })
    if (revErr) throw revErr

    const { error } = await supabase.from('change_orders').update({
      revision_number: nextRev,
      current_amount: amount ?? co.current_amount,
      updated_by: userId, updated_at: new Date().toISOString(),
    }).eq('id', coId)
    if (error) throw error

    await logEvent(supabase, companyId, coId, userId, {
      type: 'revision', field: 'revision',
      oldValue: `Rev ${co.revision_number}${co.current_amount != null ? ` — $${co.current_amount}` : ''}`,
      newValue: `Rev ${nextRev}${amount != null ? ` — $${amount}` : ''}`,
      note: input.reason?.trim() || null,
    })
    revalidatePath(PATH); revalidatePath(`/app/change-orders/${coId}`)
    return { success: true }
  } catch (e) { return { success: false, error: errMsg(e, 'Failed to add revision') } }
}

// ── Submission follow-up (Last checked / next follow-up) ────────────────────

export async function recordCheck(coId: string, nextFollowUp: string | null, note?: string): Promise<Result> {
  try {
    const { supabase, userId, companyId } = await ctx()
    const now = new Date().toISOString()
    const { data: sub } = await supabase.from('co_submissions')
      .select('id').eq('co_id', coId).order('submitted_at', { ascending: false }).limit(1).maybeSingle()
    if (sub) {
      await supabase.from('co_submissions').update({
        last_checked_at: now, last_checked_by: userId, next_follow_up: nextFollowUp,
      }).eq('id', sub.id)
    }
    await supabase.from('change_orders').update({
      follow_up_date: nextFollowUp, updated_by: userId, updated_at: now,
    }).eq('id', coId).eq('company_id', companyId)
    await logEvent(supabase, companyId, coId, userId, {
      type: 'follow_up', field: 'checked', newValue: nextFollowUp, note: note ?? null,
    })
    revalidatePath(PATH); revalidatePath(`/app/change-orders/${coId}`)
    return { success: true }
  } catch (e) { return { success: false, error: errMsg(e, 'Failed to record check') } }
}

// ── Archive (soft delete; admins only) ──────────────────────────────────────

export async function archiveCo(coId: string, restore = false): Promise<Result> {
  try {
    const { supabase, userId, companyId, role } = await ctx()
    if (!canEditCompanyData({ role })) return { success: false, error: 'Managers and up only' }
    const { error } = await supabase.from('change_orders').update({
      archived_at: restore ? null : new Date().toISOString(),
      updated_by: userId, updated_at: new Date().toISOString(),
    }).eq('id', coId).eq('company_id', companyId)
    if (error) throw error
    await logEvent(supabase, companyId, coId, userId, { type: restore ? 'restore' : 'archive' })
    revalidatePath(PATH); revalidatePath(`/app/change-orders/${coId}`)
    return { success: true }
  } catch (e) { return { success: false, error: errMsg(e, 'Failed') } }
}

// ── Notes on the timeline ───────────────────────────────────────────────────

export async function addCoNote(coId: string, note: string): Promise<Result> {
  try {
    const { supabase, userId, companyId } = await ctx()
    const text = note.trim()
    if (!text) return { success: false, error: 'Write a note first' }
    await logEvent(supabase, companyId, coId, userId, { type: 'note', note: text })
    revalidatePath(`/app/change-orders/${coId}`)
    return { success: true }
  } catch (e) { return { success: false, error: errMsg(e, 'Failed to add note') } }
}
