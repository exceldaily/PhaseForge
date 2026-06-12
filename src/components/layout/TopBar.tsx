'use client'
import Link from 'next/link'
import { Menu, Moon, Sun } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { NotificationBell } from './NotificationBell'
import { Profile } from '@/types/app'
import { useTheme } from '@/contexts/ThemeContext'
import { useState } from 'react'

interface TopBarProps {
  profile: Profile | null
  title?: string
  onMenuClick?: () => void
}

export function TopBar({ profile, title, onMenuClick }: TopBarProps) {
  const { effectiveTheme, toggleTheme, isMounted } = useTheme()
  const [isTogglingTheme, setIsTogglingTheme] = useState(false)

  const handleThemeToggle = async () => {
    setIsTogglingTheme(true)
    await toggleTheme()
    setIsTogglingTheme(false)
  }

  return (
    <header className="h-14 flex items-center justify-between px-4 md:px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex-shrink-0 transition-colors">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          aria-label="Open navigation"
          className="md:hidden p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
        >
          <Menu size={20} />
        </button>
        {title && <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h1>}
      </div>
      <div className="flex items-center gap-3">
        {isMounted && (
          <button
            onClick={handleThemeToggle}
            disabled={isTogglingTheme}
            aria-label="Toggle theme"
            title={`Switch to ${effectiveTheme === 'dark' ? 'light' : 'dark'} mode`}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all disabled:opacity-50"
          >
            {effectiveTheme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        )}
        {profile?.id && profile?.company_id && (
          <NotificationBell userId={profile.id} companyId={profile.company_id} />
        )}
        {profile && (
          <Link href="/app/settings" className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all hover:bg-slate-100 dark:hover:bg-slate-800">
            <Avatar name={profile.full_name} avatarUrl={profile.avatar_url} size="sm" />
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-slate-900 dark:text-white leading-none">{profile.full_name}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 capitalize">{profile.role}</p>
            </div>
          </Link>
        )}
      </div>
    </header>
  )
}
