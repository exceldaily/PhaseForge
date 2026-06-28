import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { canUsePrintAndReports, canUseDarkMode, canUseTickets } from '@/lib/constants'
import { Profile } from '@/types/app'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  let canUseReports = false
  let canUseTheme = false
  let canUseDispatch = false
  if (profile?.company_id) {
    const { data: company } = await supabase
      .from('companies')
      .select('plan, dispatch_enabled')
      .eq('id', profile.company_id)
      .single()
    canUseReports = canUsePrintAndReports(company?.plan)
    canUseTheme = canUseDarkMode(company?.plan)
    canUseDispatch = canUseTickets(company?.plan) || (company?.dispatch_enabled ?? false)
  }

  return (
    <AppShell
      profile={profile as Profile}
      isSuperAdmin={profile?.is_super_admin ?? false}
      canUseReports={canUseReports}
      canUseDarkMode={canUseTheme}
      canUseDispatch={canUseDispatch}
    >
      <ErrorBoundary>
        {children}
      </ErrorBoundary>
    </AppShell>
  )
}
