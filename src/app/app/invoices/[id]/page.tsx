import { notFound } from 'next/navigation'
import { requireModule } from '@/lib/operations/server'
import { createClient } from '@/lib/supabase/server'
import { InvoiceDetailClient } from './InvoiceDetailClient'

export const dynamic = 'force-dynamic'

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireModule('invoices')
  const supabase = await createClient()

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, customer:customers(id, name, billing_address, email, phone)')
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .single()

  if (!invoice) notFound()

  const [{ data: items }, { data: company }] = await Promise.all([
    supabase.from('invoice_items').select('*').eq('invoice_id', id).order('sort_order'),
    supabase.from('companies').select('name, logo_url').eq('id', ctx.companyId).single(),
  ])

  return (
    <InvoiceDetailClient
      invoice={invoice}
      items={items ?? []}
      companyName={company?.name ?? ''}
      canWrite={['owner', 'admin', 'billing'].includes(ctx.opsRole)}
    />
  )
}
