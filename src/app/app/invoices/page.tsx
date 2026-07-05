import { requireModule } from '@/lib/operations/server'
import { createClient } from '@/lib/supabase/server'
import { InvoicesClient } from './InvoicesClient'

export const dynamic = 'force-dynamic'

export default async function InvoicesPage() {
  const ctx = await requireModule('invoices')
  const supabase = await createClient()

  const [{ data: invoices }, { data: items }, { data: customers }, { data: readyCalls }] = await Promise.all([
    supabase.from('invoices').select('*, customer:customers(id, name)').eq('company_id', ctx.companyId).order('created_at', { ascending: false }),
    supabase.from('invoice_items').select('invoice_id, quantity, unit_price').eq('company_id', ctx.companyId),
    supabase.from('customers').select('id, name').eq('company_id', ctx.companyId).order('name'),
    supabase.from('calls').select('id, call_number, title, customer_id').eq('company_id', ctx.companyId).eq('invoice_ready', true).is('invoice_id', null),
  ])

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <InvoicesClient
        invoices={invoices ?? []}
        items={items ?? []}
        customers={customers ?? []}
        readyCalls={readyCalls ?? []}
        canWrite={['owner', 'admin', 'billing'].includes(ctx.opsRole)}
      />
    </div>
  )
}
