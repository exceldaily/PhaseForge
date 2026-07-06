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

  const [connRes, supsRes, labelsRes] = await Promise.all([
    // STATUS COLUMNS ONLY — encrypted token columns are never selected here.
    supabase.from('gcal_connections')
      .select('id, account_email, target_calendar_id, target_calendar_name, routing_mode, is_active, last_sync_at, last_success_at, last_error')
      .eq('company_id', profile.company_id).maybeSingle(),
    supabase.from('superintendents').select('*').eq('company_id', profile.company_id).order('name'),
    supabase.from('schedule_labels').select('*').eq('company_id', profile.company_id).order('name'),
  ])

  return (
    <SchedulingClient
      configured={googleConfigured()}
      connection={connRes.data}
      superintendents={supsRes.data ?? []}
      labels={labelsRes.data ?? []}
    />
  )
}
