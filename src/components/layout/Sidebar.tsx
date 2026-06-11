'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, FolderKanban, GanttChartSquare,
  Settings, LogOut, ChevronLeft, ChevronRight, ShieldAlert,
  BarChart2, FileText, UsersRound, Building2, Layers, CreditCard, BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { GantticLogo } from '@/components/branding/GantticLogo'

const NAV_ITEMS = [
  { href: '/app/dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/app/boards',       label: 'Boards',       icon: Layers },
  { href: '/app/projects',     label: 'Projects',     icon: FolderKanban },
  { href: '/app/gantt',        label: 'Gantt',        icon: GanttChartSquare },
  { href: '/app/resources',    label: 'Resources',    icon: UsersRound },
  { href: '/app/analytics',    label: 'Analytics',    icon: BarChart2 },
  { href: '/app/reports',      label: 'Reports',      icon: FileText },
  { href: '/app/billing',      label: 'Billing',      icon: CreditCard },
  { href: '/app/organization', label: 'Organization', icon: Building2 },
  { href: '/app/teams',        label: 'Teams',        icon: UsersRound },
  { href: '/app/settings',     label: 'Settings',     icon: Settings },
  { href: '/app/guide',        label: 'Guide',        icon: BookOpen },
]

interface SidebarProps {
  isSuperAdmin?: boolean
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ isSuperAdmin = false, mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleNavClick = () => {
    onMobileClose?.()
  }

  return (
    <>
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside className={cn(
        'flex flex-col h-full bg-slate-900 text-slate-400 transition-all duration-300',
        /* Desktop: collapsible sidebar */
        'hidden md:flex',
        collapsed ? 'md:w-16' : 'md:w-60',
        /* Mobile: fixed drawer that slides in from the left */
        mobileOpen && 'flex fixed inset-y-0 left-0 z-50 w-72 md:relative md:w-auto'
      )}>
      {/* Logo */}
      <div className={cn('border-b border-slate-800 px-4 py-5', collapsed && 'px-0')}>
        <Link
          href="/app/dashboard"
          className={cn('flex items-center', collapsed ? 'justify-center' : 'justify-start')}
        >
          {collapsed ? (
            <GantticLogo variant="icon" width={34} priority alt="PhaseForge app icon" />
          ) : (
            <GantticLogo variant="lockup" width={180} priority alt="PhaseForge horizontal logo" />
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
              onClick={handleNavClick}
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

        {/* Admin Link - Only for Super Admins */}
        {isSuperAdmin && (
          <div className="mt-6 pt-4 border-t border-slate-700">
            <Link
              href="/app/admin"
              onClick={handleNavClick}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                pathname.startsWith('/app/admin')
                  ? 'bg-red-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white',
                collapsed && 'justify-center px-0'
              )}
              title={collapsed ? 'Admin' : undefined}
            >
              <ShieldAlert size={18} className="flex-shrink-0" />
              {!collapsed && 'Admin'}
            </Link>
          </div>
        )}
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
    </>
  )
}
