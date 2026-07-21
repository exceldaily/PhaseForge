'use server'

// Dispatch server actions — ported from DispatchForge, re-scoped to
// PhaseForge companies/profiles. Unlike the source, status/assignment/date
// changes are activity-logged server-side so the timeline is complete.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canUseTickets } from '@/lib/constants'
import type {
  CallStatus, NextAction, NoteCategory, PartStatus, ProposalStatus, Urgency,
} from '@/lib/dispatch/types'

const PATH = '/app/dispatch'

async function ctx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: p } = await supabase
    .from('profiles')
    .select('company_id, ops_role, role, companies(plan, dispatch_enabled)')
    .eq('id', user.id).single()
  if (!p?.company_id) throw new Error('No organization')
  const co = p.companies as { plan?: string; dispatch_enabled?: boolean } | null
  if (!canUseTickets(co?.plan) && !co?.dispatch_enabled) throw new Error('Dispatch requires a paid plan')
  // Management: full control incl. deletes, manager notes, store identity.
  const isManagement = ['owner', 'admin', 'manager', 'dispatcher'].includes(p.ops_role ?? '') ||
    ['owner', 'admin'].includes(p.role ?? '')
  const isAdmin = ['owner', 'admin'].includes(p.ops_role ?? '') || ['owner', 'admin'].includes(p.role ?? '')
  return { supabase, userId: user.id, companyId: p.company_id, isManagement, isAdmin }
}

async function logActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  callId: string, userId: string, activityType: string,
  previous: string | null, next: string | null,
) {
  await supabase.from('dispatch_call_activity').insert({
    call_id: callId, user_id: userId, activity_type: activityType,
    previous_value: previous, new_value: next,
  })
}

export interface CreateCallInput {
  // At least one of store/customer is required — enforced in createServiceCall.
  store_id?: string | null
  customer_id?: string | null
  service_call_number: string
  tracking_url?: string | null
  internal_job_number?: string | null
  urgency: Urgency
  priority_level_id?: string | null
  status: CallStatus
  date_started: string
  eta_scheduled?: string | null
  scheduled_date?: string | null
  rack_circuit_case?: string | null
  asset_id?: string | null
  description: string
  manager_note?: string | null
  assigned_vendor_id?: string | null
  part_status: PartStatus
  proposal_status: ProposalStatus
  nte?: number | null
  custom_fields?: Record<string, string>
}

export async function createServiceCall(input: CreateCallInput) {
  try {
    const { supabase, userId, companyId } = await ctx()

    if (!input.store_id && !input.customer_id) {
      return { error: 'Pick a customer or a store for the call.' }
    }
    const payload: Record<string, unknown> = { ...input, company_id: companyId }
    // A store-based call inherits the store's customer unless one was chosen.
    if (input.store_id && !input.customer_id) {
      const { data: store } = await supabase
        .from('dispatch_stores').select('customer_id')
        .eq('id', input.store_id).single()
      payload.customer_id = store?.customer_id ?? null
    }
    // A chosen priority level always drives the internal urgency bucket.
    if (input.priority_level_id) {
      const { data: level } = await supabase
        .from('dispatch_priority_levels').select('severity')
        .eq('id', input.priority_level_id).single()
      if (level) payload.urgency = level.severity
    }

    const { data, error } = await supabase
      .from('dispatch_service_calls').insert(payload).select('id, status').single()
    if (error) return { error: error.message }
    await logActivity(supabase, data.id, userId, 'call_created', null, data.status)
    if (input.assigned_vendor_id) {
      await supabase.from('dispatch_call_vendors')
        .insert({ call_id: data.id, vendor_id: input.assigned_vendor_id })
    }
    revalidatePath(PATH, 'layout')
    return { ok: true, id: data.id as string }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed to create call' } }
}

export interface UpdateCallInput {
  service_call_number?: string
  status?: CallStatus
  urgency?: Urgency
  priority_level_id?: string | null
  next_action?: NextAction
  eta_scheduled?: string | null
  scheduled_date?: string | null
  assigned_vendor_id?: string | null
  part_status?: PartStatus
  proposal_status?: ProposalStatus
  tracking_url?: string | null
  internal_job_number?: string | null
  rack_circuit_case?: string | null
  asset_id?: string | null
  description?: string
  manager_note?: string | null
  completed_date?: string | null
  nte?: number | null
  custom_fields?: Record<string, string>
}

export async function updateServiceCall(callId: string, patch: UpdateCallInput) {
  try {
    const { supabase, userId, companyId, isManagement, isAdmin } = await ctx()

    if ('manager_note' in patch && !isManagement) {
      return { error: 'Only managers or dispatchers can change the manager note.' }
    }
    // Changing the call number re-keys the call's external identity — admin only.
    if ('service_call_number' in patch) {
      const trimmed = patch.service_call_number?.trim()
      if (!trimmed) return { error: "Service call number can't be empty." }
      patch.service_call_number = trimmed
      if (!isAdmin) return { error: 'Only admins can change the service call number.' }
    }

    if (patch.priority_level_id) {
      const { data: level } = await supabase
        .from('dispatch_priority_levels').select('severity')
        .eq('id', patch.priority_level_id).single()
      if (level) patch.urgency = level.severity as Urgency
    }

    const { data: before } = await supabase
      .from('dispatch_service_calls')
      .select('status, assigned_vendor_id, eta_scheduled, scheduled_date, next_action')
      .eq('id', callId).eq('company_id', companyId).single()
    if (!before) return { error: 'Call not found' }

    if (patch.status === 'completed' && !patch.completed_date && before.status !== 'completed') {
      patch.completed_date = new Date().toISOString()
    }

    const { error } = await supabase
      .from('dispatch_service_calls').update(patch)
      .eq('id', callId).eq('company_id', companyId)
    if (error) return { error: error.message }

    // Activity trail for the changes that matter operationally.
    if (patch.status !== undefined && patch.status !== before.status) {
      await logActivity(supabase, callId, userId, 'status_change', before.status, patch.status)
    }
    if (patch.assigned_vendor_id !== undefined && patch.assigned_vendor_id !== before.assigned_vendor_id) {
      await logActivity(supabase, callId, userId, 'assignment_change', before.assigned_vendor_id, patch.assigned_vendor_id)
    }
    if (patch.eta_scheduled !== undefined && patch.eta_scheduled !== before.eta_scheduled) {
      await logActivity(supabase, callId, userId, 'eta_change', before.eta_scheduled, patch.eta_scheduled)
    }
    if (patch.scheduled_date !== undefined && patch.scheduled_date !== before.scheduled_date) {
      await logActivity(supabase, callId, userId, 'schedule_change', before.scheduled_date, patch.scheduled_date)
    }
    if (patch.next_action !== undefined && patch.next_action !== before.next_action) {
      await logActivity(supabase, callId, userId, 'next_action_change', before.next_action, patch.next_action)
    }

    revalidatePath(PATH, 'layout')
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed to update call' } }
}

// Clears the "needs review" flag on an auto-imported call.
export async function acknowledgeCall(callId: string) {
  try {
    const { supabase, userId, companyId } = await ctx()
    const { error } = await supabase.from('dispatch_service_calls')
      .update({ needs_acknowledgment: false }).eq('id', callId).eq('company_id', companyId)
    if (error) return { error: error.message }
    await logActivity(supabase, callId, userId, 'acknowledged', null, null)
    revalidatePath(PATH, 'layout')
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

// Replaces the full set of techs on a call; the first becomes primary.
export async function assignVendorsToCall(callId: string, vendorIds: string[]) {
  try {
    const { supabase, userId, companyId } = await ctx()
    const { data: before } = await supabase
      .from('dispatch_service_calls').select('assigned_vendor_id')
      .eq('id', callId).eq('company_id', companyId).single()
    if (!before) return { error: 'Call not found' }

    const { error: delErr } = await supabase.from('dispatch_call_vendors').delete().eq('call_id', callId)
    if (delErr) return { error: delErr.message }
    if (vendorIds.length > 0) {
      const { error: insErr } = await supabase.from('dispatch_call_vendors')
        .insert(vendorIds.map((vendor_id) => ({ call_id: callId, vendor_id })))
      if (insErr) return { error: insErr.message }
    }
    const newPrimary = vendorIds[0] ?? null
    const { error } = await supabase.from('dispatch_service_calls')
      .update({ assigned_vendor_id: newPrimary }).eq('id', callId)
    if (error) return { error: error.message }
    if (newPrimary !== before.assigned_vendor_id) {
      await logActivity(supabase, callId, userId, 'assignment_change', before.assigned_vendor_id, newPrimary)
    }
    revalidatePath(PATH, 'layout')
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

export async function addCallNote(callId: string, category: NoteCategory, text: string) {
  try {
    const { supabase, userId } = await ctx()
    if (!text.trim()) return { error: 'Note text is required' }
    const { error } = await supabase.from('dispatch_call_notes').insert({
      call_id: callId, user_id: userId, note_category: category, note_text: text.trim(),
    })
    if (error) return { error: error.message }
    await logActivity(supabase, callId, userId, 'note_added', null, category)
    // Bump updated_at so "days since update" reflects the note.
    await supabase.from('dispatch_service_calls')
      .update({ updated_at: new Date().toISOString() }).eq('id', callId)
    revalidatePath(PATH, 'layout')
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

export async function deleteServiceCall(callId: string) {
  try {
    const { supabase, companyId, isManagement } = await ctx()
    if (!isManagement) return { error: 'Only managers or dispatchers can delete calls.' }
    const { error } = await supabase.from('dispatch_service_calls')
      .delete().eq('id', callId).eq('company_id', companyId)
    if (error) return { error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

// ── Stores ──────────────────────────────────────────────────────────────────

export interface StoreInput {
  store_number?: string
  store_name?: string
  customer_id?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  google_maps_url?: string | null
  store_manager?: string | null
  district_manager?: string | null
  main_tech_id?: string | null
  notes?: string | null
}

export async function createStore(input: StoreInput) {
  try {
    const { supabase, companyId, isManagement } = await ctx()
    if (!isManagement) return { error: 'Managers only' }
    if (!input.store_number?.trim() || !input.store_name?.trim()) {
      return { error: 'Store number and name are required' }
    }
    const { data, error } = await supabase.from('dispatch_stores').insert({
      ...input, store_number: input.store_number.trim(), store_name: input.store_name.trim(),
      company_id: companyId,
    }).select('id').single()
    if (error) return { error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true, id: data.id as string }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

export async function updateStore(storeId: string, patch: StoreInput) {
  try {
    const { supabase, companyId, isManagement } = await ctx()
    // Store identity is management-only; other fields are open to all members.
    const touchesIdentity = ['store_name', 'store_number', 'google_maps_url'].some((f) => f in patch)
    if (touchesIdentity && !isManagement) {
      return { error: 'Only managers or dispatchers can change store details.' }
    }
    const { error } = await supabase.from('dispatch_stores')
      .update(patch).eq('id', storeId).eq('company_id', companyId)
    if (error) return { error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

export async function deleteStore(storeId: string) {
  try {
    const { supabase, companyId, isManagement } = await ctx()
    if (!isManagement) return { error: 'Managers only' }
    const { error } = await supabase.from('dispatch_stores')
      .delete().eq('id', storeId).eq('company_id', companyId)
    if (error) return { error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

// ── Customers + priority scales ─────────────────────────────────────────────

// Customers are SHARED with the Customers page (public.customers) — creating
// one here makes it available everywhere, and vice versa.
export async function createCustomer(name: string) {
  try {
    const { supabase, companyId, isManagement } = await ctx()
    if (!isManagement) return { error: 'Managers only' }
    if (!name.trim()) return { error: 'Name is required' }
    const { data, error } = await supabase.from('customers')
      .insert({ name: name.trim(), company_id: companyId }).select('id').single()
    if (error) return { error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true, id: data.id as string }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

export async function deleteCustomer(id: string) {
  try {
    const { supabase, companyId, isAdmin } = await ctx()
    // Deleting removes the org-wide customer record (Customers page included) — admin only.
    if (!isAdmin) return { error: 'Admins only' }
    const { error } = await supabase.from('customers')
      .delete().eq('id', id).eq('company_id', companyId)
    if (error) return { error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

export interface PriorityLevelInput {
  customer_id: string
  code: string
  label: string
  severity: Urgency
  sort_order: number
}

export async function createPriorityLevel(input: PriorityLevelInput) {
  try {
    const { supabase, companyId, isManagement } = await ctx()
    if (!isManagement) return { error: 'Managers only' }
    const { data, error } = await supabase.from('dispatch_priority_levels')
      .insert({ ...input, company_id: companyId }).select('id').single()
    if (error) return { error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true, id: data.id as string }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

export async function deletePriorityLevel(id: string) {
  try {
    const { supabase, companyId, isManagement } = await ctx()
    if (!isManagement) return { error: 'Managers only' }
    const { error } = await supabase.from('dispatch_priority_levels')
      .delete().eq('id', id).eq('company_id', companyId)
    if (error) return { error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

// ── Techs / vendors ─────────────────────────────────────────────────────────

export interface TechInput {
  name?: string
  company?: string | null
  email?: string | null
  phone?: string | null
  trade_type?: string | null
  active?: boolean
}

export async function createTech(input: TechInput) {
  try {
    const { supabase, companyId, isManagement } = await ctx()
    if (!isManagement) return { error: 'Managers only' }
    if (!input.name?.trim()) return { error: 'Name is required' }
    const { data, error } = await supabase.from('dispatch_techs').insert({
      ...input, name: input.name.trim(), company_id: companyId,
    }).select('id').single()
    if (error) return { error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true, id: data.id as string }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

export async function updateTech(id: string, patch: TechInput) {
  try {
    const { supabase, companyId, isManagement } = await ctx()
    if (!isManagement) return { error: 'Managers only' }
    const { error } = await supabase.from('dispatch_techs')
      .update(patch).eq('id', id).eq('company_id', companyId)
    if (error) return { error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

export async function deleteTech(id: string) {
  try {
    const { supabase, companyId, isManagement } = await ctx()
    if (!isManagement) return { error: 'Managers only' }
    const { error } = await supabase.from('dispatch_techs')
      .delete().eq('id', id).eq('company_id', companyId)
    if (error) return { error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

// ── Custom form fields (the org's own "fillable blanks" on the call card) ───

export async function addFormField(label: string) {
  try {
    const { supabase, companyId, isManagement } = await ctx()
    if (!isManagement) return { error: 'Managers only' }
    if (!label.trim()) return { error: 'Field label is required' }
    const { data: existing } = await supabase.from('dispatch_form_fields')
      .select('sort_order').eq('company_id', companyId)
      .order('sort_order', { ascending: false }).limit(1)
    const next = existing?.length ? existing[0].sort_order + 1 : 0
    const { data, error } = await supabase.from('dispatch_form_fields')
      .insert({ company_id: companyId, label: label.trim(), sort_order: next })
      .select('id').single()
    if (error) return { error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true, id: data.id as string }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

export async function removeFormField(id: string) {
  try {
    const { supabase, companyId, isManagement } = await ctx()
    if (!isManagement) return { error: 'Managers only' }
    // Deletes the DEFINITION only — values already saved on calls stay in
    // their custom_fields jsonb (harmless, just no longer rendered).
    const { error } = await supabase.from('dispatch_form_fields')
      .delete().eq('id', id).eq('company_id', companyId)
    if (error) return { error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}

// Built-in call-card fields an org can remove from its forms (values already
// saved on calls keep showing). Only these names are accepted.
const OPTIONAL_BUILTIN_FIELDS = ['rack_circuit_case']

export async function setBuiltinFieldHidden(field: string, hidden: boolean) {
  try {
    const { supabase, companyId, isManagement } = await ctx()
    if (!isManagement) return { error: 'Managers only' }
    if (!OPTIONAL_BUILTIN_FIELDS.includes(field)) return { error: 'Unknown field' }
    const { data: row } = await supabase.from('dispatch_company_settings')
      .select('hidden_builtin_fields').eq('company_id', companyId).maybeSingle()
    const next = new Set<string>(row?.hidden_builtin_fields ?? [])
    if (hidden) next.add(field)
    else next.delete(field)
    const { error } = await supabase.from('dispatch_company_settings').upsert({
      company_id: companyId, hidden_builtin_fields: [...next],
      updated_at: new Date().toISOString(),
    })
    if (error) return { error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}
