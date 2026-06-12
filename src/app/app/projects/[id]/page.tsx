import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ProjectDetailShell } from './ProjectDetailShell'
import { Phase, Profile, Project } from '@/types/app'

const VALID_TABS = new Set(['gantt', 'tasks', 'activity', 'files'])

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab } = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/signup')

  const [projectRes, membersRes, activityRes] = await Promise.all([
    supabase.from('projects').select('*, phases(*)').eq('id', id).single(),
    supabase.from('profiles')
      .select('id, full_name, email, avatar_url, role, job_title')
      .eq('company_id', profile.company_id),
    supabase.from('activity_logs')
      .select('*, actor:profiles(full_name, avatar_url)')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  if (!projectRes.data) notFound()

  const project = projectRes.data as Project
  const phases = ((project.phases ?? []) as Phase[]).sort((a, b) => a.sort_order - b.sort_order)

  const canEdit = !['member', 'viewer'].includes(profile.role)

  return (
    <ProjectDetailShell
      project={{ ...project, phases }}
      members={(membersRes.data ?? []) as Profile[]}
      activityLogs={activityRes.data ?? []}
      currentUserId={user.id}
      companyId={profile.company_id}
      canEdit={canEdit}
      initialTab={VALID_TABS.has(tab ?? '') ? (tab as 'gantt' | 'tasks' | 'activity' | 'files') : 'gantt'}
    />
  )
}
