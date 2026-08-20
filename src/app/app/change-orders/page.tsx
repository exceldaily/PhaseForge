import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { activeTrade } from '@/lib/tradeFilter'
import { ChangeOrdersClient } from './ChangeOrdersClient'
import type { ChangeOrderRow } from '@/lib/changeOrders'

export const metadata = { title: 'Change Orders — PhaseForge' }

export default async function ChangeOrdersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('id, company_id, role, full_name').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/app/dashboard')

  const trade = await activeTrade(supabase, profile.company_id)
  const [{ data: cos }, { data: members }, { data: coProjects }, { data: otherProjects }] = await Promise.all([
    supabase.from('change_orders')
      .select('*')
      .eq('company_id', profile.company_id)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase.from('profiles')
      .select('id, full_name, role')
      .eq('company_id', profile.company_id)
      .eq('is_active', true)
      .order('full_name'),
    supabase.from('projects')
      .select('id, name, customer_name, store_site_id, job_number, project_manager, original_contract_value, co_tracking_enabled, trade')
      .eq('company_id', profile.company_id)
      .eq('co_tracking_enabled', true)
      .order('name'),
    supabase.from('projects')
      .select('id, name, customer_name, store_site_id, job_number, status')
      .eq('company_id', profile.company_id)
      .eq('co_tracking_enabled', false)
      .eq('is_archived', false)
      .order('name'),
  ])

  const visProjects = trade ? (coProjects ?? []).filter((p) => (p.trade ?? '') === trade) : (coProjects ?? [])
  const visIds = new Set(visProjects.map((p) => p.id))
  const visCos = trade ? ((cos ?? []) as ChangeOrderRow[]).filter((x) => visIds.has(x.project_id)) : ((cos ?? []) as ChangeOrderRow[])
  return (
    <ChangeOrdersClient
      cos={visCos}
      members={members ?? []}
      coProjects={visProjects}
      eligibleProjects={otherProjects ?? []}
      currentUserId={profile.id}
      isManager={['owner', 'admin', 'manager'].includes(profile.role)}
    />
  )
}
