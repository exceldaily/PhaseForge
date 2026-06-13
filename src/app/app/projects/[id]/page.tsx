import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import { ProjectDetailShell } from './ProjectDetailShell'
import { canUsePrintAndReports } from '@/lib/constants'
import { Phase, Profile, Project, ProjectAttachment } from '@/types/app'

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
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/signup')

  const [projectRes, membersRes, activityRes, attachmentsRes] = await Promise.all([
    supabase.from('projects').select('*, phases(*)').eq('id', id).single(),
    supabase.from('profiles')
      .select('id, full_name, email, avatar_url, role, job_title')
      .eq('company_id', profile.company_id),
    supabase.from('activity_logs')
      .select('*, actor:profiles(full_name, avatar_url)')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('project_attachments')
      .select('*')
      .eq('project_id', id)
      .order('uploaded_at', { ascending: false }),
  ])

  if (!projectRes.data) notFound()

  const project = projectRes.data as Project
  if (project.company_id !== profile.company_id) notFound()

  const phases = ((project.phases ?? []) as Phase[]).sort((a, b) => a.sort_order - b.sort_order)
  const rawAttachments = (attachmentsRes.data ?? []) as ProjectAttachment[]
  const attachments = await Promise.all(
    rawAttachments.map(async (attachment) => {
      const { data } = await admin.storage
        .from('project-attachments')
        .createSignedUrl(attachment.file_path, 60 * 60)

      return {
        ...attachment,
        signed_url: data?.signedUrl ?? null,
      }
    })
  )

  const canEdit = !['member', 'viewer'].includes(profile.role)

  const { data: company } = await supabase
    .from('companies')
    .select('plan')
    .eq('id', profile.company_id)
    .single()
  const canPrint = canUsePrintAndReports(company?.plan)

  return (
    <ProjectDetailShell
      project={{ ...project, phases }}
      members={(membersRes.data ?? []) as Profile[]}
      activityLogs={activityRes.data ?? []}
      attachments={attachments}
      currentUserId={user.id}
      companyId={profile.company_id}
      canEdit={canEdit}
      canPrint={canPrint}
      initialTab={VALID_TABS.has(tab ?? '') ? (tab as 'gantt' | 'tasks' | 'activity' | 'files') : 'gantt'}
    />
  )
}
