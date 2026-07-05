import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { canUsePrintAndReports, canUseDarkMode, canUseTickets } from '@/lib/constants'
import { OPERATIONS_MODULES, moduleAllowsRole } from '@/lib/operations/modules'
import type { ModuleKey, OpsRole } from '@/lib/operations/types'
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
  let opsModuleKeys: ModuleKey[] = []
  if (profile?.company_id) {
    const [{ data: company }, { data: orgModules }] = await Promise.all([
      supabase
        .from('companies')
        .select('plan, dispatch_enabled')
        .eq('id', profile.company_id)
        .single(),
      supabase
        .from('organization_modules')
        .select('module_key, enabled')
        .eq('company_id', profile.company_id),
    ])
    canUseReports = canUsePrintAndReports(company?.plan)
    canUseTheme = canUseDarkMode(company?.plan)
    canUseDispatch = canUseTickets(company?.plan) || (company?.dispatch_enabled ?? false)

    const opsRole = (profile.ops_role ?? 'read_only') as OpsRole
    const enabled = new Set((orgModules ?? []).filter((m) => m.enabled).map((m) => m.module_key))
    opsModuleKeys = OPERATIONS_MODULES
      .filter((m) => enabled.has(m.key) && moduleAllowsRole(m, opsRole))
      .map((m) => m.key)
  }

  return (
    <AppShell
      profile={profile as Profile}
      isSuperAdmin={profile?.is_super_admin ?? false}
      canUseReports={canUseReports}
      canUseDarkMode={canUseTheme}
      canUseDispatch={canUseDispatch}
      opsModules={opsModuleKeys}
    >
      <ErrorBoundary>
        {children}
      </ErrorBoundary>
    </AppShell>
  )
}
