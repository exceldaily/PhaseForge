import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import { ProjectDetailShell } from './ProjectDetailShell'
import { canUsePrintAndReports } from '@/lib/constants'
import { Phase, Profile, Project, ProjectAttachment, PunchItem } from '@/types/app'
import { loadCommandCenter } from '@/lib/commandCenter'

const VALID_TABS = new Set(['overview', 'gantt', 'tasks', 'punch', 'activity', 'files'])

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

  const [projectRes, membersRes, activityRes, attachmentsRes, punchRes] = await Promise.all([
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
    supabase.from('punch_items')
      .select('*')
      .eq('project_id', id)
      .order('number', { ascending: true }),
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

  // Punch items: hydrate signed URLs for the private issue/completion photos.
  // punch_items may not exist yet (pre-migration) — fail soft to an empty list.
  const rawPunchItems = (punchRes.data ?? []) as PunchItem[]
  const punchItems = await Promise.all(
    rawPunchItems.map(async (item) => {
      const [issue, completion] = await Promise.all([
        item.issue_photo_path
          ? admin.storage.from('project-attachments').createSignedUrl(item.issue_photo_path, 60 * 60)
          : Promise.resolve({ data: null }),
        item.completion_photo_path
          ? admin.storage.from('project-attachments').createSignedUrl(item.completion_photo_path, 60 * 60)
          : Promise.resolve({ data: null }),
      ])
      return {
        ...item,
        issue_photo_url: issue.data?.signedUrl ?? null,
        completion_photo_url: completion.data?.signedUrl ?? null,
      }
    })
  )

  const canEdit = !['member', 'viewer'].includes(profile.role)

  // Everything the Overview tab shows, computed once server-side.
  const commandCenter = await loadCommandCenter(
    supabase, { ...project, phases: undefined } as Project, phases, rawPunchItems,
  )

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
      punchItems={punchItems}
      currentUserId={user.id}
      companyId={profile.company_id}
      canEdit={canEdit}
      canPrint={canPrint}
      commandCenter={commandCenter}
      initialTab={VALID_TABS.has(tab ?? '') ? (tab as 'overview' | 'gantt' | 'tasks' | 'punch' | 'activity' | 'files') : 'overview'}
    />
  )
}
