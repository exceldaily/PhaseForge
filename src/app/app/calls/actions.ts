'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireModule, getCallSettings, logOpsActivity } from '@/lib/operations/server'

export async function createCall(input: {
  title: string
  description?: string
  customer_id?: string | null
  location_id?: string | null
  asset_id?: string | null
  division_id?: string | null
  project_id?: string | null
  priority?: string
  assigned_staff_id?: string | null
  vendor_id?: string | null
  due_date?: string | null
  sla_at?: string | null
  service_type?: string | null
}) {
  const ctx = await requireModule('calls')
  const supabase = await createClient()

  const settings = await getCallSettings(ctx.companyId)
  for (const field of settings.required_fields) {
    if (!(input as Record<string, unknown>)[field]) {
      return { error: `"${field.replace(/_/g, ' ')}" is required by your organization's call template.` }
    }
  }

  const { data: num, error: numError } = await supabase.rpc('next_org_number', { p_key: 'call' })
  if (numError) return { error: numError.message }

  const { data, error } = await supabase
    .from('calls')
    .insert({
      company_id: ctx.companyId,
      call_number: num,
      title: input.title.trim(),
      description: input.description || null,
      customer_id: input.customer_id || null,
      location_id: input.location_id || null,
      asset_id: input.asset_id || null,
      division_id: input.division_id || null,
      project_id: input.project_id || null,
      priority: input.priority ?? 'normal',
      status: input.assigned_staff_id || input.vendor_id ? 'assigned' : 'open',
      assigned_staff_id: input.assigned_staff_id || null,
      vendor_id: input.vendor_id || null,
      due_date: input.due_date || null,
      sla_at: input.sla_at || null,
      service_type: input.service_type || null,
      created_by: ctx.userId,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  await logOpsActivity({
    companyId: ctx.companyId, actorId: ctx.userId,
    recordType: 'call', recordId: data.id, action: 'created',
  })
  revalidatePath('/app/calls')
  return { ok: true, id: data.id }
}

export async function updateCall(id: string, patch: Record<string, string | boolean | null>) {
  const ctx = await requireModule('calls')
  const supabase = await createClient()

  // Completion gate: enforce org-required closeout fields before completing.
  if (patch.status === 'completed') {
    const settings = await getCallSettings(ctx.companyId)
    if (settings.required_closeout_fields.length) {
      const { data: call } = await supabase.from('calls').select('*').eq('id', id).single()
      const merged = { ...call, ...patch } as Record<string, unknown>
      for (const field of settings.required_closeout_fields) {
        if (!merged[field]) {
          return { error: `"${field.replace(/_/g, ' ')}" is required before completing.` }
        }
      }
    }
    patch.completed_at = new Date().toISOString()
  }
  if (patch.status === 'closed') patch.closed_at = new Date().toISOString()

  const { error } = await supabase
    .from('calls')
    .update({ ...patch, updated_at: new Date().toISOString(), last_activity_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', ctx.companyId)
  if (error) return { error: error.message }

  const action = typeof patch.status === 'string' ? 'status_changed'
    : (patch.assigned_staff_id !== undefined || patch.vendor_id !== undefined) ? 'assigned'
    : 'updated'
  await logOpsActivity({
    companyId: ctx.companyId, actorId: ctx.userId,
    recordType: 'call', recordId: id, action,
    detail: { fields: Object.keys(patch) },
  })
  revalidatePath('/app/calls')
  return { ok: true }
}

export async function addCallNote(callId: string, category: string, body: string) {
  const ctx = await requireModule('calls')
  if (!body.trim()) return { error: 'Note cannot be empty.' }
  const supabase = await createClient()

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', ctx.userId).single()

  const { error } = await supabase.from('call_notes').insert({
    company_id: ctx.companyId,
    call_id: callId,
    author_id: ctx.userId,
    author_name: profile?.full_name ?? null,
    category,
    body: body.trim(),
  })
  if (error) return { error: error.message }

  // The author has obviously "read" their own note.
  await supabase.from('call_reads').upsert(
    { call_id: callId, user_id: ctx.userId, company_id: ctx.companyId, last_read_at: new Date().toISOString() },
    { onConflict: 'call_id,user_id' }
  )
  await logOpsActivity({
    companyId: ctx.companyId, actorId: ctx.userId,
    recordType: 'call', recordId: callId, action: 'note_added', detail: { category },
  })
  revalidatePath('/app/calls')
  return { ok: true }
}

export async function markCallRead(callId: string) {
  const ctx = await requireModule('calls')
  const supabase = await createClient()
  await supabase.from('call_reads').upsert(
    { call_id: callId, user_id: ctx.userId, company_id: ctx.companyId, last_read_at: new Date().toISOString() },
    { onConflict: 'call_id,user_id' }
  )
  return { ok: true }
}
