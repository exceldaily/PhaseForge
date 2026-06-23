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
  children: React.ReactNode
}

export function AppShell({ profile, isSuperAdmin, canUseReports = false, canUseDarkMode = false, canUseDispatch = false, children }: AppShellProps) {
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
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors">
      <Sidebar
        isSuperAdmin={isSuperAdmin}
        canUseReports={canUseReports}
        canUseDispatch={canUseDispatch}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          profile={profile}
          canUseDarkMode={canUseDarkMode}
          onMenuClick={() => setMobileNavOpen((o) => !o)}
        />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
        <FirstRunTour />
      </div>
    </div>
  )
}
