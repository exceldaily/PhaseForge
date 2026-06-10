import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BillingClient } from './BillingClient'

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/signup')

  // Fetch company billing info
  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', profile.company_id)
    .single()

  // Fetch company usage
  const [{ data: projects }, { data: boards }, { data: members }] = await Promise.all([
    supabase.from('projects').select('id', { count: 'exact' }).eq('company_id', profile.company_id).eq('is_archived', false),
    supabase.from('boards').select('id', { count: 'exact' }).eq('company_id', profile.company_id),
    supabase.from('profiles').select('id', { count: 'exact' }).eq('company_id', profile.company_id).eq('is_active', true),
  ])

  // Fetch billing history (invoices)
  const { data: invoices } = await supabase
    .from('billing_history')
    .select('*')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: false })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Billing</h1>
        <p className="text-slate-600 mt-2">Manage your subscription and billing information</p>
      </div>

      <BillingClient
        companyId={profile.company_id}
        currentPlan={company?.plan || 'free'}
        billingStatus={company?.billing_status || 'active'}
        billingCycleStart={company?.billing_cycle_start}
        billingCycleEnd={company?.billing_cycle_end}
        usage={{
          projects: projects?.length || 0,
          boards: boards?.length || 0,
          members: members?.length || 0,
        }}
        invoices={invoices || []}
      />
    </div>
  )
}
