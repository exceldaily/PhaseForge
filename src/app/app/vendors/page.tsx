import { requireModule } from '@/lib/operations/server'
import { createClient } from '@/lib/supabase/server'
import { VendorsClient } from './VendorsClient'

export const dynamic = 'force-dynamic'

export default async function VendorsPage() {
  const ctx = await requireModule('vendors')
  const supabase = await createClient()

  const [{ data: vendors }, { data: contacts }, { data: calls }] = await Promise.all([
    supabase.from('vendors').select('*').eq('company_id', ctx.companyId).order('name'),
    supabase.from('vendor_contacts').select('*').eq('company_id', ctx.companyId),
    supabase.from('calls').select('id, vendor_id, status').eq('company_id', ctx.companyId),
  ])

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <VendorsClient
        vendors={vendors ?? []}
        contacts={contacts ?? []}
        calls={calls ?? []}
        canWrite={['owner', 'admin', 'dispatcher', 'project_manager'].includes(ctx.opsRole)}
      />
    </div>
  )
}
