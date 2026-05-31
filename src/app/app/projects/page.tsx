import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Project } from '@/types/app'
import { ProjectsClient } from './ProjectsClient'

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/signup')

  const [{ data: projectsRaw }, { data: membersRaw }] = await Promise.all([
    supabase.from('projects').select('*').eq('company_id', profile.company_id).eq('is_archived', false).order('updated_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name').eq('company_id', profile.company_id),
  ])

  return (
    <ProjectsClient
      projects={(projectsRaw ?? []) as Project[]}
      companyId={profile.company_id}
      currentUserId={user.id}
      canEdit={profile.role !== 'viewer'}
      members={membersRaw ?? []}
    />
  )
}
