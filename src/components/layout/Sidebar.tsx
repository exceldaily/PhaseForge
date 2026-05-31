'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, FolderKanban, GanttChartSquare,
  Settings, Users, LogOut, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { GantticLogo } from '@/components/branding/GantticLogo'

const NAV_ITEMS = [
  { href: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/app/projects', label: 'Projects', icon: FolderKanban },
  { href: '/app/gantt', label: 'Gantt Chart', icon: GanttChartSquare },
  { href: '/app/settings/members', label: 'Team', icon: Users },
  { href: '/app/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className={cn(
      'flex flex-col h-full bg-slate-900 text-slate-400 transition-all duration-300',
      collapsed ? 'w-16' : 'w-60'
    )}>
      {/* Logo */}
      <div className={cn('border-b border-slate-800 px-4 py-5', collapsed && 'px-0')}>
        <Link
          href="/app/dashboard"
          className={cn('flex items-center', collapsed ? 'justify-center' : 'justify-start')}
        >
          {collapsed ? (
            <GantticLogo variant="icon" width={34} priority alt="Ganttic app icon" />
          ) : (
            <GantticLogo variant="lockup" width={160} priority alt="Ganttic horizontal logo" />
          )}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/app/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                active
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white',
                collapsed && 'justify-center px-0'
              )}
              title={collapsed ? label : undefined}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!collapsed && label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="px-2 py-4 border-t border-slate-800 space-y-1">
        <button
          onClick={handleSignOut}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
            'text-slate-400 hover:bg-slate-800 hover:text-rose-400 transition-all',
            collapsed && 'justify-center px-0'
          )}
          title={collapsed ? 'Sign Out' : undefined}
        >
          <LogOut size={18} className="flex-shrink-0" />
          {!collapsed && 'Sign Out'}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center py-2 rounded-lg text-slate-600 hover:text-slate-400 hover:bg-slate-800 transition-all"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  )
}
