import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { googleConfigured } from '@/lib/scheduling/google'
import { SchedulingClient } from './SchedulingClient'

export const dynamic = 'force-dynamic'

export default async function SchedulingSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles').select('company_id, ops_role, role').eq('id', user.id).single()
  const isAdmin = ['owner', 'admin'].includes(profile?.ops_role ?? '') ||
    ['owner', 'admin'].includes(profile?.role ?? '')
  if (!profile?.company_id || !isAdmin) redirect('/app/settings')

  const [connRes, supsRes, labelsRes, pendingRes] = await Promise.all([
    // STATUS COLUMNS ONLY — encrypted token columns are never selected here.
    supabase.from('gcal_connections')
      .select('id, account_email, target_calendar_id, target_calendar_name, routing_mode, is_active, last_sync_at, last_success_at, last_error')
      .eq('company_id', profile.company_id).maybeSingle(),
    supabase.from('superintendents').select('*').eq('company_id', profile.company_id).order('name'),
    supabase.from('schedule_labels').select('*').eq('company_id', profile.company_id).order('name'),
    supabase.from('gcal_pending_changes')
      .select('id, change_type, gcal_value, created_at, link:gcal_event_links(phase:phases(name), project:projects(name))')
      .eq('company_id', profile.company_id).eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(50),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pending = (pendingRes.data ?? []).map((c: any) => ({
    id: c.id as string,
    changeType: c.change_type as string,
    gcalValue: (c.gcal_value ?? {}) as Record<string, string>,
    createdAt: c.created_at as string,
    phaseName: c.link?.phase?.name ?? null,
    projectName: c.link?.project?.name ?? null,
  }))

  return (
    <SchedulingClient
      configured={googleConfigured()}
      connection={connRes.data}
      superintendents={supsRes.data ?? []}
      labels={labelsRes.data ?? []}
      pendingChanges={pending}
    />
  )
}
