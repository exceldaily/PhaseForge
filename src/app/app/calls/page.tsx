import { requireModule, getCallSettings } from '@/lib/operations/server'
import { createClient } from '@/lib/supabase/server'
import { CallsClient } from './CallsClient'

export const dynamic = 'force-dynamic'

export default async function CallsPage() {
  const ctx = await requireModule('calls')
  const supabase = await createClient()

  const [settings,
    { data: calls },
    { data: customers },
    { data: locations },
    { data: assets },
    { data: divisions },
    { data: vendors },
    { data: staff },
    { data: reads },
    { data: noteTemplates },
  ] = await Promise.all([
    getCallSettings(ctx.companyId),
    supabase
      .from('calls')
      .select(`*,
        customer:customers(id, name),
        location:locations(id, name, location_number, city, state),
        vendor:vendors(id, name),
        assigned_staff:profiles!calls_assigned_staff_id_fkey(id, full_name),
        division:divisions(id, name, color)`)
      .eq('company_id', ctx.companyId)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('customers').select('id, name').eq('company_id', ctx.companyId).order('name'),
    supabase.from('locations').select('id, customer_id, name, location_number').eq('company_id', ctx.companyId).order('name'),
    supabase.from('assets').select('id, location_id, name').eq('company_id', ctx.companyId).order('name'),
    supabase.from('divisions').select('*').eq('company_id', ctx.companyId).eq('is_active', true).order('sort_order'),
    supabase.from('vendors').select('id, name').eq('company_id', ctx.companyId).eq('status', 'active').order('name'),
    supabase.from('profiles').select('id, full_name, ops_role').eq('company_id', ctx.companyId).order('full_name'),
    supabase.from('call_reads').select('call_id, last_read_at').eq('user_id', ctx.userId),
    supabase.from('note_templates').select('*').eq('company_id', ctx.companyId).eq('scope', 'call'),
  ])

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <CallsClient
        calls={calls ?? []}
        settings={settings}
        customers={customers ?? []}
        locations={locations ?? []}
        assets={assets ?? []}
        divisions={divisions ?? []}
        vendors={vendors ?? []}
        staff={staff ?? []}
        reads={reads ?? []}
        noteTemplates={noteTemplates ?? []}
        userId={ctx.userId}
        opsRole={ctx.opsRole}
      />
    </div>
  )
}
