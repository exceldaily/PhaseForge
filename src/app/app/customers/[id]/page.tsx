import { notFound } from 'next/navigation'
import { requireModule } from '@/lib/operations/server'
import { createClient } from '@/lib/supabase/server'
import { CustomerDetailClient } from './CustomerDetailClient'
import { canEditCompanyData } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireModule('customers')
  const supabase = await createClient()

  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .single()

  if (!customer) notFound()

  const [
    { data: contacts },
    { data: locations },
    { data: assets },
    { data: calls },
    { data: invoices },
    { data: files },
    { data: activity },
    { data: divisions },
  ] = await Promise.all([
    supabase.from('customer_contacts').select('*').eq('customer_id', id).order('is_primary', { ascending: false }),
    supabase.from('locations').select('*').eq('customer_id', id).order('name'),
    supabase.from('assets').select('*').eq('customer_id', id).order('name'),
    supabase.from('calls').select('id, call_number, title, status, priority, location_id, created_at').eq('customer_id', id).order('created_at', { ascending: false }).limit(50),
    supabase.from('invoices').select('id, invoice_number, status, due_date, created_at').eq('customer_id', id).order('created_at', { ascending: false }).limit(25),
    supabase.from('org_files').select('*').eq('customer_id', id).order('created_at', { ascending: false }).limit(25),
    supabase.from('ops_activity').select('*').eq('record_type', 'customer').eq('record_id', id).order('created_at', { ascending: false }).limit(30),
    supabase.from('divisions').select('*').eq('company_id', ctx.companyId),
  ])

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <CustomerDetailClient
        customer={customer}
        contacts={contacts ?? []}
        locations={locations ?? []}
        assets={assets ?? []}
        calls={calls ?? []}
        invoices={invoices ?? []}
        files={files ?? []}
        activity={activity ?? []}
        divisions={divisions ?? []}
        canWrite={['owner', 'admin', 'dispatcher', 'project_manager'].includes(ctx.opsRole)}
        canDelete={canEditCompanyData({ ops_role: ctx.opsRole, role: ctx.role })}
      />
    </div>
  )
}
