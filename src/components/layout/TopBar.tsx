'use client'
import Link from 'next/link'
import { Bell, Menu } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Profile } from '@/types/app'

interface TopBarProps {
  profile: Profile | null
  title?: string
  onMenuClick?: () => void
}

export function TopBar({ profile, title, onMenuClick }: TopBarProps) {
  return (
    <header className="h-14 flex items-center justify-between px-4 md:px-6 bg-white border-b border-slate-200 flex-shrink-0">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuClick}
          aria-label="Open navigation"
          className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-all"
        >
          <Menu size={20} />
        </button>
        {title && <h1 className="text-lg font-semibold text-slate-900">{title}</h1>}
      </div>
      <div className="flex items-center gap-3">
        <button className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
          <Bell size={18} />
        </button>
        {profile && (
          <Link href="/app/settings" className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all hover:bg-slate-100">
            <Avatar name={profile.full_name} avatarUrl={profile.avatar_url} size="sm" />
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-slate-900 leading-none">{profile.full_name}</p>
              <p className="text-xs text-slate-400 mt-0.5 capitalize">{profile.role}</p>
            </div>
          </Link>
        )}
      </div>
    </header>
  )
}
