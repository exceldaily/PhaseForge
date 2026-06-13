'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { FirstRunTour } from '@/components/onboarding/WelcomeTour'
import { Profile } from '@/types/app'

interface AppShellProps {
  profile: Profile | null
  isSuperAdmin: boolean
  canUseReports?: boolean
  children: React.ReactNode
}

export function AppShell({ profile, isSuperAdmin, canUseReports = false, children }: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors">
      <Sidebar
        isSuperAdmin={isSuperAdmin}
        canUseReports={canUseReports}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          profile={profile}
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
