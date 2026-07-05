'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireModule, logOpsActivity } from '@/lib/operations/server'

export async function createCustomer(input: {
  name: string
  status?: string
  customer_type?: string
  phone?: string
  email?: string
  division_id?: string | null
  notes?: string
}) {
  const ctx = await requireModule('customers')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('customers')
    .insert({
      company_id: ctx.companyId,
      name: input.name.trim(),
      status: input.status ?? 'active',
      customer_type: input.customer_type || null,
      phone: input.phone || null,
      email: input.email || null,
      division_id: input.division_id || null,
      notes: input.notes || null,
      created_by: ctx.userId,
      last_activity_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  await logOpsActivity({
    companyId: ctx.companyId, actorId: ctx.userId,
    recordType: 'customer', recordId: data.id, action: 'created',
  })
  revalidatePath('/app/customers')
  return { ok: true, id: data.id }
}

export async function updateCustomer(id: string, patch: Record<string, string | null>) {
  const ctx = await requireModule('customers')
  const supabase = await createClient()
  const { error } = await supabase
    .from('customers')
    .update({ ...patch, updated_at: new Date().toISOString(), last_activity_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', ctx.companyId)
  if (error) return { error: error.message }
  await logOpsActivity({
    companyId: ctx.companyId, actorId: ctx.userId,
    recordType: 'customer', recordId: id, action: 'updated', detail: { fields: Object.keys(patch) },
  })
  revalidatePath('/app/customers')
  revalidatePath(`/app/customers/${id}`)
  return { ok: true }
}

export async function createContact(input: {
  customer_id: string
  location_id?: string | null
  name: string
  title?: string
  email?: string
  phone?: string
  is_billing?: boolean
  is_primary?: boolean
}) {
  const ctx = await requireModule('customers')
  const supabase = await createClient()
  const { error } = await supabase.from('customer_contacts').insert({
    company_id: ctx.companyId,
    customer_id: input.customer_id,
    location_id: input.location_id || null,
    name: input.name.trim(),
    title: input.title || null,
    email: input.email || null,
    phone: input.phone || null,
    is_billing: input.is_billing ?? false,
    is_primary: input.is_primary ?? false,
  })
  if (error) return { error: error.message }
  revalidatePath(`/app/customers/${input.customer_id}`)
  return { ok: true }
}

export async function createLocation(input: {
  customer_id: string
  name: string
  location_number?: string
  address?: string
  city?: string
  state?: string
  postal_code?: string
  timezone?: string
  division_id?: string | null
  access_notes?: string
}) {
  const ctx = await requireModule('customers')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('locations')
    .insert({
      company_id: ctx.companyId,
      customer_id: input.customer_id,
      name: input.name.trim(),
      location_number: input.location_number || null,
      address: input.address || null,
      city: input.city || null,
      state: input.state || null,
      postal_code: input.postal_code || null,
      timezone: input.timezone || null,
      division_id: input.division_id || null,
      access_notes: input.access_notes || null,
      created_by: ctx.userId,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  await logOpsActivity({
    companyId: ctx.companyId, actorId: ctx.userId,
    recordType: 'location', recordId: data.id, action: 'created',
  })
  revalidatePath('/app/customers')
  revalidatePath(`/app/customers/${input.customer_id}`)
  return { ok: true, id: data.id }
}

export async function createAsset(input: {
  customer_id: string
  location_id: string
  name: string
  asset_type?: string
  trade_category?: string
  make?: string
  model?: string
  serial_number?: string
  install_date?: string
  warranty_start?: string
  warranty_end?: string
  warranty_provider?: string
}) {
  const ctx = await requireModule('customers')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('assets')
    .insert({
      company_id: ctx.companyId,
      customer_id: input.customer_id,
      location_id: input.location_id,
      name: input.name.trim(),
      asset_type: input.asset_type || null,
      trade_category: input.trade_category || null,
      make: input.make || null,
      model: input.model || null,
      serial_number: input.serial_number || null,
      install_date: input.install_date || null,
      warranty_start: input.warranty_start || null,
      warranty_end: input.warranty_end || null,
      warranty_provider: input.warranty_provider || null,
      created_by: ctx.userId,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  await logOpsActivity({
    companyId: ctx.companyId, actorId: ctx.userId,
    recordType: 'asset', recordId: data.id, action: 'created',
  })
  revalidatePath('/app/customers')
  return { ok: true, id: data.id }
}
