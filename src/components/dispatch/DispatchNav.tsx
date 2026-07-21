'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { GitBranch, PhoneCall, Radio, Star, UserCircle } from 'lucide-react'

const NAV = [
  { href: '/app/dispatch', label: 'Command Center', icon: Radio },
  { href: '/app/dispatch/my-work', label: 'My Work', icon: UserCircle },
  { href: '/app/dispatch/on-call', label: 'On Call', icon: PhoneCall },
  { href: '/app/dispatch/parts', label: 'Parts & Proposals', icon: GitBranch },
  { href: '/app/dispatch/priorities', label: 'Customers & Priorities', icon: Star },
]

export function DispatchNav() {
  const pathname = usePathname()
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === '/app/dispatch' ? pathname === '/app/dispatch' : pathname.startsWith(href)
        return (
          <Link key={href} href={href}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              active
                ? 'bg-indigo-600 text-white'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200'
            }`}>
            <Icon size={13} /> {label}
          </Link>
        )
      })}
    </div>
  )
}
