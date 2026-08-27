import { redirect } from 'next/navigation'
import { CalendarCheck2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { canUseCalendarSync } from '@/lib/constants'
import { googleConfigured } from '@/lib/scheduling/google'
import { UpgradeGate } from '@/components/billing/UpgradeGate'
import { SchedulingClient } from './SchedulingClient'
import { canEditCompanyData } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export default async function SchedulingSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles').select('company_id, ops_role, role').eq('id', user.id).single()
  const isAdmin = canEditCompanyData(profile)
  if (!profile?.company_id || !isAdmin) redirect('/app/settings')

  const [{ data: company }, connProbe] = await Promise.all([
    supabase.from('companies').select('plan, schedule_job_url_template').eq('id', profile.company_id).single(),
    supabase.from('gcal_connections').select('id')
      .eq('company_id', profile.company_id).maybeSingle(),
  ])
  // Free orgs see the upsell — unless they already have a connection (from a
  // paid period): those still get the page so they can disconnect and clear
  // pending changes. Sync-forward actions stay plan-blocked server-side.
  if (!canUseCalendarSync(company?.plan) && !connProbe.data) {
    return (
      <UpgradeGate icon={CalendarCheck2} title="Calendar sync is a paid feature">
        Two-way Google Calendar sync — phases pushed as events, superintendent color routing,
        and daily auto-sync — is available on the Individual, Pro, and Business plans.
      </UpgradeGate>
    )
  }

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
      jobUrlTemplate={(company?.schedule_job_url_template as string | null) ?? null}
    />
  )
}
