import { requireModule } from '@/lib/operations/server'
import { createClient } from '@/lib/supabase/server'
import { CustomersClient } from './CustomersClient'

export const dynamic = 'force-dynamic'

export default async function CustomersPage() {
  const ctx = await requireModule('customers')
  const supabase = await createClient()

  const [{ data: customers }, { data: locations }, { data: assets }, { data: divisions }, { data: calls }] =
    await Promise.all([
      supabase.from('customers').select('*').eq('company_id', ctx.companyId).order('name'),
      supabase.from('locations').select('*').eq('company_id', ctx.companyId).order('name'),
      supabase.from('assets').select('*').eq('company_id', ctx.companyId).order('name'),
      supabase.from('divisions').select('*').eq('company_id', ctx.companyId).eq('is_active', true).order('sort_order'),
      // Open-call counts per customer/location (empty if calls module disabled — RLS gates it)
      supabase.from('calls').select('id, customer_id, location_id, status').eq('company_id', ctx.companyId),
    ])

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <CustomersClient
        customers={customers ?? []}
        locations={locations ?? []}
        assets={assets ?? []}
        divisions={divisions ?? []}
        calls={calls ?? []}
        canWrite={['owner', 'admin', 'dispatcher', 'project_manager'].includes(ctx.opsRole)}
      />
    </div>
  )
}
