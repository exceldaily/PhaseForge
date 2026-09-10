import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import { ProjectDetailShell } from './ProjectDetailShell'
import { canUsePrintAndReports } from '@/lib/constants'
import { ActivityLog, Phase, Profile, Project, ProjectAttachment, PunchItem } from '@/types/app'
import { loadCommandCenter } from '@/lib/commandCenter'
import { companyTrades, ensureProjectChannel, listChannels, listMessages } from '@/app/app/chat/actions'

const VALID_TABS = new Set(['hub', 'overview', 'gantt', 'tasks', 'punch', 'activity', 'files', 'chat'])

/** One sentence for a co_events row, in the timeline's plain voice. */
function describeCoEvent(
  eventType: string, coNumber: number | undefined,
  field: string | null, oldValue: string | null, newValue: string | null, note: string | null,
): string {
  const co = coNumber != null ? `CO ${coNumber}` : 'a change order'
  switch (eventType) {
    case 'created': return `created ${co}`
    case 'stage_change': return `moved ${co}${oldValue ? ` from ${oldValue}` : ''}${newValue ? ` to ${newValue}` : ''}`
    case 'amount_change': return `changed the amount on ${co}${oldValue || newValue ? ` (${oldValue ?? '—'} → ${newValue ?? '—'})` : ''}`
    case 'approval': return `recorded approval on ${co}${newValue ? ` (${newValue})` : ''}`
    case 'billing': return `updated billing on ${co}`
    case 'revision': return `added a revision to ${co}`
    case 'follow_up': return `set a follow-up on ${co}`
    case 'owner_change': return `reassigned ${co}${newValue ? ` to ${newValue}` : ''}`
    case 'note': return `noted on ${co}: ${note ?? ''}`.trim()
    case 'system': return `updated ${co}${note ? `: ${note}` : ''}`
    default: return `${eventType.replace(/_/g, ' ')} on ${co}`
  }
}

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

  // Change-order history lives in co_events (its own single write path);
  // UNION it into the timeline feed at read time rather than double-writing.
  // The job's chat space: created on first visit, then its messages, the
  // company's trades, and who is who, so the hub can hold the conversation.
  const chatRes = await ensureProjectChannel({ projectId: id })
  const chatChannel = chatRes.ok ? (await listChannels()).find((c) => c.id === chatRes.id) ?? null : null
  const [chatMessages, chatTrades, { data: chatPeople }] = await Promise.all([
    chatChannel ? listMessages({ channelId: chatChannel.id }) : Promise.resolve([]),
    companyTrades(),
    supabase.from('profiles').select('id, full_name, avatar_url, trades, job_title').eq('company_id', profile.company_id).eq('is_active', true),
  ])
  const chatLatest = [...chatMessages].reverse().filter((m) => !m.deleted && !(m.kind === 'system' && m.event?.type === 'schedule')).slice(0, 3).map((m) => ({ body: (m.body || (m.attachments.length ? `${m.attachments.length} photo${m.attachments.length === 1 ? '' : 's'}` : '')).split('\n')[0], author_id: m.authorId, created_at: m.createdAt, kind: m.kind }))
  const [{ data: projectCos }, { count: planSheetCount }, { count: planSetCount }] = await Promise.all([
    supabase.from('change_orders')
      .select('id, co_number, title, stage, current_amount, approved_amount').eq('project_id', id)
      .order('co_number', { ascending: false }).limit(200),
    supabase.from('plan_sheets').select('id', { count: 'exact', head: true }).eq('project_id', id),
    supabase.from('plan_sets').select('id', { count: 'exact', head: true }).eq('project_id', id),
  ])
  let coEvents: ActivityLog[] = []
  if (projectCos?.length) {
    const { data: events } = await supabase.from('co_events')
      .select('id, company_id, co_id, actor_id, event_type, field, old_value, new_value, note, created_at')
      .in('co_id', projectCos.map((c) => c.id))
      .order('created_at', { ascending: false })
      .limit(50)
    const coNumber = new Map(projectCos.map((c) => [c.id, c.co_number]))
    coEvents = (events ?? []).map((e) => ({
      id: `co-${e.id}`,
      company_id: e.company_id,
      project_id: id,
      phase_id: null,
      actor_id: e.actor_id,
      action: 'co_event',
      payload: {
        summary: describeCoEvent(e.event_type, coNumber.get(e.co_id), e.field, e.old_value, e.new_value, e.note),
      },
      entity_type: 'change_order',
      entity_id: e.co_id,
      entity_label: `CO ${coNumber.get(e.co_id) ?? ''}`.trim(),
      reason: null,
      created_at: e.created_at,
    }))
  }
  const mergedLogs = [...(activityRes.data ?? []), ...coEvents]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 80)

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
      activityLogs={mergedLogs}
      attachments={attachments}
      punchItems={punchItems}
      currentUserId={user.id}
      companyId={profile.company_id}
      canEdit={canEdit}
      canPrint={canPrint}
      commandCenter={commandCenter}
      hub={{
        changeOrders: (projectCos ?? []).map((c) => ({
          id: c.id, co_number: Number(c.co_number), title: c.title, stage: c.stage,
          current_amount: c.current_amount === null ? null : Number(c.current_amount),
          approved_amount: c.approved_amount === null ? null : Number(c.approved_amount),
        })),
        planSheetCount: planSheetCount ?? 0,
        planSetCount: planSetCount ?? 0,
        chat: chatLatest.map((m) => ({ body: m.body, authorId: m.author_id, createdAt: m.created_at, kind: m.kind })),
      }}
      chatRoom={chatChannel ? {
        channel: chatChannel,
        messages: chatMessages,
        trades: chatTrades,
        me: { id: user.id, name: profile.full_name as string },
        members: (chatPeople ?? []).map((p) => ({ id: p.id, name: p.full_name, avatarUrl: p.avatar_url, trades: (p.trades as string[] | null) ?? [], title: p.job_title })),
      } : null}
      initialTab={VALID_TABS.has(tab ?? '') ? (tab as 'hub' | 'overview' | 'gantt' | 'tasks' | 'punch' | 'activity' | 'files' | 'chat') : 'hub'}
    />
  )
}
