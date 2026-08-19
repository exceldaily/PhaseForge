import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CoDetailClient } from './CoDetailClient'
import type { ChangeOrderRow } from '@/lib/changeOrders'

export const metadata = { title: 'Change Order — PhaseForge' }

export default async function CoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('id, company_id, role').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/app/dashboard')

  const { data: co } = await supabase
    .from('change_orders').select('*').eq('id', id).eq('company_id', profile.company_id).single()
  if (!co) notFound()

  const [{ data: project }, { data: events }, { data: revisions }, { data: submissions }, { data: members }] = await Promise.all([
    supabase.from('projects').select('id, name, customer_name, store_site_id, job_number, original_contract_value').eq('id', co.project_id).single(),
    supabase.from('co_events').select('*').eq('co_id', id).order('created_at', { ascending: false }).limit(300),
    supabase.from('co_revisions').select('*').eq('co_id', id).order('revision_number', { ascending: false }),
    supabase.from('co_submissions').select('*').eq('co_id', id).order('submitted_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name, role').eq('company_id', profile.company_id).eq('is_active', true).order('full_name'),
  ])

  return (
    <CoDetailClient
      co={co as ChangeOrderRow}
      project={project}
      events={events ?? []}
      revisions={revisions ?? []}
      submissions={submissions ?? []}
      members={members ?? []}
      currentUserId={profile.id}
      isManager={['owner', 'admin', 'manager'].includes(profile.role)}
      isAdmin={['owner', 'admin'].includes(profile.role)}
    />
  )
}
