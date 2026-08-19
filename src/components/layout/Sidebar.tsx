'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, FolderKanban, GanttChartSquare,
  Settings, LogOut, ChevronLeft, ChevronRight, ChevronDown, ShieldAlert,
  BarChart2, FileText, UsersRound, Building2, Layers, CreditCard, BookOpen, ListChecks, Radio,
  Contact, HardHat, Truck, FolderOpen, Receipt, CalendarDays, BadgeDollarSign, FileDiff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { GantticLogo } from '@/components/branding/GantticLogo'

interface NavItem {
  href: string
  label: string
  icon: typeof Contact
  // 'reports' | 'dispatch' | 'schedules' gate on plan flags; ops module keys gate on entitlements
  gate?: 'reports' | 'dispatch' | 'schedules' | 'customers' | 'staff' | 'vendors' | 'calls' | 'files' | 'invoices'
}

interface NavGroup {
  id: string
  label: string | null // null = ungrouped items at top level
  items: NavItem[]
}

// One intentional structure: Dashboard, then Work / Directory / Insights /
// Financial / Library / Admin. Gated items simply drop out of their group;
// empty groups disappear entirely.
const NAV_GROUPS: NavGroup[] = [
  {
    id: 'top',
    label: null,
    items: [
      { href: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/app/my-work',   label: 'My Work',   icon: ListChecks },
    ],
  },
  {
    id: 'work',
    label: 'Work',
    items: [
      { href: '/app/projects', label: 'Projects', icon: FolderKanban },
      { href: '/app/change-orders', label: 'Change Orders', icon: FileDiff },
      { href: '/app/dispatch', label: 'Dispatch', icon: Radio, gate: 'dispatch' },
      { href: '/app/quotes',   label: 'Quotes',   icon: BadgeDollarSign, gate: 'dispatch' },
      { href: '/app/boards',   label: 'Boards',   icon: Layers },
      { href: '/app/gantt',    label: 'Gantt',    icon: GanttChartSquare },
      { href: '/app/schedules', label: 'Schedules', icon: CalendarDays, gate: 'schedules' },
    ],
  },
  {
    id: 'directory',
    label: 'Directory',
    items: [
      { href: '/app/customers', label: 'Customers', icon: Contact, gate: 'customers' },
      { href: '/app/staff',     label: 'Staff',     icon: HardHat, gate: 'staff' },
      { href: '/app/vendors',   label: 'Vendors',   icon: Truck, gate: 'vendors' },
      { href: '/app/resources', label: 'Resources', icon: UsersRound },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: [
      { href: '/app/analytics', label: 'Analytics', icon: BarChart2 },
      { href: '/app/reports',   label: 'Reports',   icon: FileText, gate: 'reports' },
    ],
  },
  {
    id: 'financial',
    label: 'Financial',
    items: [
      { href: '/app/invoices', label: 'Invoices', icon: Receipt, gate: 'invoices' },
      { href: '/app/billing',  label: 'Billing',  icon: CreditCard },
    ],
  },
  {
    id: 'library',
    label: 'Library',
    items: [
      { href: '/app/files', label: 'Files', icon: FolderOpen, gate: 'files' },
      { href: '/app/guide', label: 'Guide', icon: BookOpen },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    items: [
      { href: '/app/organization', label: 'Organization', icon: Building2 },
      { href: '/app/settings',     label: 'Settings',     icon: Settings },
    ],
  },
]

const COLLAPSE_KEY = 'pf-nav-collapsed-groups'

interface SidebarProps {
  isSuperAdmin?: boolean
  canUseReports?: boolean
  canUseDispatch?: boolean
  canUseSchedules?: boolean
  opsModules?: string[]
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ isSuperAdmin = false, canUseReports = false, canUseDispatch = false, canUseSchedules = false, opsModules = [], mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [closedGroups, setClosedGroups] = useState<string[]>([])

  // Restore user's group collapse preferences after mount. Must run in an
  // effect (not a lazy initializer) so the server render and first client
  // render match — otherwise hydration mismatches on collapsed groups.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLLAPSE_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setClosedGroups(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  const toggleGroup = (id: string) => {
    setClosedGroups((prev) => {
      const next = prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  const visibleGroups = useMemo(() => {
    const allowed = (item: NavItem) => {
      if (!item.gate) return true
      if (item.gate === 'reports') return canUseReports
      if (item.gate === 'dispatch') return canUseDispatch
      if (item.gate === 'schedules') return canUseSchedules
      // Customers is shared with Dispatch — dispatch orgs see it even without
      // the customers ops module.
      if (item.gate === 'customers') return opsModules.includes('customers') || canUseDispatch
      return opsModules.includes(item.gate)
    }
    return NAV_GROUPS
      .map((g) => ({ ...g, items: g.items.filter(allowed) }))
      .filter((g) => g.items.length > 0)
  }, [canUseReports, canUseDispatch, canUseSchedules, opsModules])

  const isActive = (href: string) =>
    pathname === href || (href !== '/app/dashboard' && pathname.startsWith(href))

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
        'flex flex-col h-full bg-slate-900 text-slate-400 transition-all duration-300 print:hidden',
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
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-0.5">
        {visibleGroups.map((group) => {
          const groupHasActive = group.items.some((i) => isActive(i.href))
          // A group with the active page stays open regardless of stored preference.
          const isClosed = !collapsed && group.label !== null
            && closedGroups.includes(group.id) && !groupHasActive
          return (
            <div key={group.id} className={cn(group.label && !collapsed && 'pt-2 first:pt-0')}>
              {group.label && !collapsed && (
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center justify-between rounded px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600 transition-colors hover:text-slate-400"
                >
                  {group.label}
                  <ChevronDown size={12} className={cn('transition-transform', isClosed && '-rotate-90')} />
                </button>
              )}
              {group.label && collapsed && (
                <div className="mx-3 my-1.5 border-t border-slate-800" aria-hidden />
              )}
              {!isClosed && group.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={handleNavClick}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all',
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
            </div>
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

        {/* Sign Out - Scrolls with nav */}
        <div className="mt-6 pt-4 border-t border-slate-700">
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
        </div>
      </nav>

      {/* Bottom - Collapse button only */}
      <div className="px-2 py-4 border-t border-slate-800">
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
