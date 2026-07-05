'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireModule, logOpsActivity } from '@/lib/operations/server'

export async function createVendor(input: {
  name: string
  trade_categories?: string[]
  coverage_areas?: string[]
  phone?: string
  email?: string
  insurance_expires?: string
  license_expires?: string
  notes?: string
}) {
  const ctx = await requireModule('vendors')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vendors')
    .insert({
      company_id: ctx.companyId,
      name: input.name.trim(),
      trade_categories: input.trade_categories ?? [],
      coverage_areas: input.coverage_areas ?? [],
      phone: input.phone || null,
      email: input.email || null,
      insurance_expires: input.insurance_expires || null,
      license_expires: input.license_expires || null,
      notes: input.notes || null,
      created_by: ctx.userId,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  await logOpsActivity({
    companyId: ctx.companyId, actorId: ctx.userId,
    recordType: 'vendor', recordId: data.id, action: 'created',
  })
  revalidatePath('/app/vendors')
  return { ok: true, id: data.id }
}

export async function updateVendor(id: string, patch: Record<string, string | string[] | null>) {
  const ctx = await requireModule('vendors')
  const supabase = await createClient()
  const { error } = await supabase
    .from('vendors')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', ctx.companyId)
  if (error) return { error: error.message }
  revalidatePath('/app/vendors')
  return { ok: true }
}

export async function addVendorContact(vendorId: string, input: {
  name: string
  title?: string
  email?: string
  phone?: string
  is_primary?: boolean
}) {
  const ctx = await requireModule('vendors')
  const supabase = await createClient()
  const { error } = await supabase.from('vendor_contacts').insert({
    company_id: ctx.companyId,
    vendor_id: vendorId,
    name: input.name.trim(),
    title: input.title || null,
    email: input.email || null,
    phone: input.phone || null,
    is_primary: input.is_primary ?? false,
  })
  if (error) return { error: error.message }
  revalidatePath('/app/vendors')
  return { ok: true }
}
