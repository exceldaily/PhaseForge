'use client'

import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { FirstRunTour } from '@/components/onboarding/WelcomeTour'
import { Profile } from '@/types/app'

interface AppShellProps {
  profile: Profile | null
  isSuperAdmin: boolean
  canUseReports?: boolean
  canUseDarkMode?: boolean
  canUseDispatch?: boolean
  canUseSchedules?: boolean
  opsModules?: string[]
  tradeFilter?: { current: string; trades: string[] } | null
  children: React.ReactNode
}

export function AppShell({ profile, isSuperAdmin, canUseReports = false, canUseDarkMode = false, canUseDispatch = false, canUseSchedules = false, opsModules = [], tradeFilter = null, children }: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Sync the theme whenever the app shell mounts (covers client-side nav into
  // the app, where the pre-paint <head> script doesn't re-run). Pro-and-up:
  // apply the saved preference; otherwise force light and clear any leftover.
  useEffect(() => {
    const root = document.documentElement
    if (!canUseDarkMode) {
      root.classList.remove('dark')
      try { localStorage.removeItem('pf-theme') } catch { /* ignore */ }
      return
    }
    let stored: string | null = null
    try { stored = localStorage.getItem('pf-theme') } catch { /* ignore */ }
    root.classList.toggle('dark', stored === 'dark')
  }, [canUseDarkMode])

  return (
    <div className="pf-shell flex h-dvh overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors print:block print:h-auto print:overflow-visible">
      <Sidebar
        isSuperAdmin={isSuperAdmin}
        canUseReports={canUseReports}
        canUseDispatch={canUseDispatch}
        canUseSchedules={canUseSchedules}
        opsModules={opsModules}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      <div className="flex flex-1 flex-col overflow-hidden print:overflow-visible">
        <TopBar
          profile={profile}
          canUseDarkMode={canUseDarkMode}
          onMenuClick={() => setMobileNavOpen((o) => !o)}
          tradeFilter={tradeFilter}
        />
        <main className="pf-main-scroll flex-1 overflow-y-auto print:overflow-visible">
          {children}
        </main>
        <FirstRunTour />
      </div>
    </div>
  )
}
