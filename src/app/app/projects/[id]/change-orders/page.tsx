import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ProjectCoClient } from './ProjectCoClient'
import type { ChangeOrderRow } from '@/lib/changeOrders'

export const metadata = { title: 'Change Orders — PhaseForge' }

export default async function ProjectChangeOrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('id, company_id, role').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/app/dashboard')

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, customer_name, store_site_id, job_number, co_tracking_enabled, original_contract_value')
    .eq('id', id).eq('company_id', profile.company_id).single()
  if (!project) notFound()

  const [{ data: cos }, { data: members }] = await Promise.all([
    supabase.from('change_orders').select('*').eq('project_id', id).is('archived_at', null).order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name, role').eq('company_id', profile.company_id).eq('is_active', true).order('full_name'),
  ])

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link href={`/app/projects/${id}`} className="flex items-center gap-1 hover:text-indigo-600">
          <ArrowLeft size={13} /> {project.name}
        </Link>
        <span>/</span><span className="text-slate-600 dark:text-slate-300 font-medium">Change Orders</span>
      </div>
      <ProjectCoClient
        project={project}
        cos={(cos ?? []) as ChangeOrderRow[]}
        members={members ?? []}
        currentUserId={profile.id}
        isManager={['owner', 'admin', 'manager'].includes(profile.role)}
      />
    </div>
  )
}
