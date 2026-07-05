'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireModule, logOpsActivity } from '@/lib/operations/server'

const BILLING_ROLES = ['owner', 'admin', 'billing']

export async function createInvoice(input: {
  customer_id?: string | null
  due_date?: string | null
  notes?: string | null
  call_ids?: string[]
}) {
  const ctx = await requireModule('invoices')
  if (!BILLING_ROLES.includes(ctx.opsRole)) return { error: 'Only billing users can create invoices.' }
  const supabase = await createClient()

  const { data: num, error: numError } = await supabase.rpc('next_org_number', { p_key: 'invoice' })
  if (numError) return { error: numError.message }

  const { data, error } = await supabase
    .from('invoices')
    .insert({
      company_id: ctx.companyId,
      invoice_number: num,
      customer_id: input.customer_id || null,
      status: 'draft',
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: input.due_date || null,
      notes: input.notes || null,
      created_by: ctx.userId,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  // Pull invoice-ready calls in as line items and link them.
  if (input.call_ids?.length) {
    const { data: calls } = await supabase
      .from('calls')
      .select('id, call_number, title')
      .in('id', input.call_ids)
      .eq('company_id', ctx.companyId)
    for (const [i, call] of (calls ?? []).entries()) {
      await supabase.from('invoice_items').insert({
        company_id: ctx.companyId,
        invoice_id: data.id,
        description: `Call #${call.call_number} — ${call.title}`,
        quantity: 1,
        unit_price: 0,
        call_id: call.id,
        sort_order: i,
      })
      await supabase.from('calls').update({ invoice_id: data.id }).eq('id', call.id)
    }
  }

  await logOpsActivity({
    companyId: ctx.companyId, actorId: ctx.userId,
    recordType: 'invoice', recordId: data.id, action: 'created',
  })
  revalidatePath('/app/invoices')
  return { ok: true, id: data.id }
}

export async function updateInvoice(id: string, patch: Record<string, string | null>) {
  const ctx = await requireModule('invoices')
  if (!BILLING_ROLES.includes(ctx.opsRole)) return { error: 'Only billing users can edit invoices.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('invoices')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', ctx.companyId)
  if (error) return { error: error.message }
  revalidatePath('/app/invoices')
  revalidatePath(`/app/invoices/${id}`)
  return { ok: true }
}

export async function addInvoiceItem(invoiceId: string, input: {
  description: string
  quantity: number
  unit_price: number
}) {
  const ctx = await requireModule('invoices')
  if (!BILLING_ROLES.includes(ctx.opsRole)) return { error: 'Only billing users can edit invoices.' }
  const supabase = await createClient()
  const { error } = await supabase.from('invoice_items').insert({
    company_id: ctx.companyId,
    invoice_id: invoiceId,
    description: input.description.trim(),
    quantity: input.quantity,
    unit_price: input.unit_price,
  })
  if (error) return { error: error.message }
  revalidatePath(`/app/invoices/${invoiceId}`)
  return { ok: true }
}

export async function deleteInvoiceItem(itemId: string, invoiceId: string) {
  const ctx = await requireModule('invoices')
  if (!BILLING_ROLES.includes(ctx.opsRole)) return { error: 'Only billing users can edit invoices.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('invoice_items')
    .delete()
    .eq('id', itemId)
    .eq('company_id', ctx.companyId)
  if (error) return { error: error.message }
  revalidatePath(`/app/invoices/${invoiceId}`)
  return { ok: true }
}
