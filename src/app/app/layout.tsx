import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { canUsePrintAndReports, canUseDarkMode, canUseTickets, canUseSchedules, canUseTradeFilter, STANDARD_TRADES } from '@/lib/constants'
import { cookies } from 'next/headers'
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
  let canUseCrewSchedules = false
  let opsModuleKeys: ModuleKey[] = []
  let tradeFilter: { current: string; trades: string[] } | null = null
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
    canUseCrewSchedules = canUseSchedules(company?.plan)

    if (canUseTradeFilter(company?.plan)) {
      const [{ data: tradeRows }, jar] = await Promise.all([
        supabase.from('projects').select('trade').eq('company_id', profile.company_id).not('trade', 'is', null),
        cookies(),
      ])
      const inUse = [...new Set((tradeRows ?? []).map((r) => (r.trade as string).trim()).filter(Boolean))]
      const trades = [...new Set([...STANDARD_TRADES, ...inUse])]
      const cookieVal = jar.get('pf-trade')?.value?.trim()
      tradeFilter = { current: cookieVal && cookieVal !== 'all' ? cookieVal : 'all', trades }
    }

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
      canUseSchedules={canUseCrewSchedules}
      opsModules={opsModuleKeys}
      tradeFilter={tradeFilter}
    >
      <ErrorBoundary>
        {children}
      </ErrorBoundary>
    </AppShell>
  )
}
