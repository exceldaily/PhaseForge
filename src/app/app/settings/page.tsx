import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Building2, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ProfileSettingsCard } from '@/components/settings/ProfileSettingsCard'
import { JobLinkSettingCard } from '@/components/settings/JobLinkSettingCard'
import { canEditCompanyData } from '@/lib/permissions'
import { Profile } from '@/types/app'

type SettingsProfile = Profile & {
  companies?: {
    name?: string | null
    plan?: string | null
  } | null
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, companies(*)')
    .eq('id', user.id)
    .single()
  const settingsProfile = profile as SettingsProfile | null

  const canManageRoles = settingsProfile?.role === 'owner' || settingsProfile?.role === 'admin'
  const jobTemplate = ((settingsProfile?.companies as { schedule_job_url_template?: string | null } | null)?.schedule_job_url_template) ?? null
  const { data: sample } = settingsProfile?.company_id
    ? await supabase.from('projects').select('job_number').eq('company_id', settingsProfile.company_id).not('job_number', 'is', null).neq('job_number', '').limit(1).maybeSingle()
    : { data: null }

  return (
    <div className="mx-auto max-w-none space-y-6 p-6">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>

      <div className="grid gap-4">
        <JobLinkSettingCard template={jobTemplate} canEdit={canEditCompanyData(settingsProfile)} sampleJob={(sample?.job_number as string | null) ?? null} />

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
              <Building2 size={20} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Organization</h2>
              <p className="text-sm text-slate-500">{settingsProfile?.companies?.name || 'Your workspace'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Plan</p>
              <p className="font-medium capitalize text-slate-800">{settingsProfile?.companies?.plan || 'Free'}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
              <Users size={20} className="text-violet-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Team members</h2>
              <p className="text-sm text-slate-500">Manage who has access to your workspace</p>
            </div>
          </div>
          <Link href="/app/settings/members" className="text-sm font-medium text-indigo-600 hover:underline">
            Manage team &rarr;
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50">
              <Users size={20} className="text-sky-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Scheduling &amp; Calendar</h2>
              <p className="text-sm text-slate-500">Google Calendar connection, superintendents, schedule labels</p>
            </div>
          </div>
          <Link href="/app/settings/scheduling" className="text-sm font-medium text-indigo-600 hover:underline">
            Open scheduling settings &rarr;
          </Link>
        </div>

        {settingsProfile && (
          <ProfileSettingsCard
            profile={settingsProfile}
            canManageRoles={canManageRoles}
          />
        )}
      </div>
    </div>
  )
}
