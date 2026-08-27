import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TeamsClient } from './TeamsClient'
import { canEditCompanyData } from '@/lib/permissions'

export default async function TeamsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/signup')

  const [teamsRes, membersRes, projectsRes] = await Promise.all([
    supabase.from('teams')
      .select('*, team_members(profile_id), project_teams(project_id)')
      .eq('company_id', profile.company_id)
      .order('name'),
    supabase.from('profiles')
      .select('id, full_name, job_title, email, role')
      .eq('company_id', profile.company_id)
      .eq('is_active', true),
    supabase.from('projects')
      .select('id, name, color, status')
      .eq('company_id', profile.company_id)
      .eq('is_archived', false)
      .order('name'),
  ])

  const canEdit = canEditCompanyData(profile)

  return (
    <TeamsClient
      teams={(teamsRes.data ?? []) as any[]}
      members={membersRes.data ?? []}
      projects={projectsRes.data ?? []}
      companyId={profile.company_id}
      canEdit={canEdit}
    />
  )
}
