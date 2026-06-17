'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, CheckCheck, AlertTriangle, Clock, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  created_at: string
}

interface NotificationBellProps {
  userId: string
  companyId: string
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  project_overdue: <AlertTriangle size={13} className="text-rose-500 dark:text-rose-400 flex-shrink-0" />,
  phase_overdue:   <AlertTriangle size={13} className="text-rose-400 dark:text-rose-300 flex-shrink-0" />,
  phase_due_soon:  <Clock size={13} className="text-amber-500 dark:text-amber-400 flex-shrink-0" />,
  mention:         <Bell size={13} className="text-indigo-500 dark:text-indigo-400 flex-shrink-0" />,
  system:          <Info size={13} className="text-slate-400 dark:text-slate-500 flex-shrink-0" />,
}

// Derived alerts (vs stored DB notifications) use these id prefixes.
const isDerived = (id: string) => id.startsWith('proj-') || id.startsWith('phase-')

export function NotificationBell({ userId, companyId }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  // ── Close on outside click ───────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Fetch alerts (computed from live data + stored DB rows) ──────────────
  const fetchItems = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const soonDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const [{ data: stored }, { data: projects }, { data: alertStates }] = await Promise.all([
      supabase.from('notifications').select('*')
        .eq('user_id', userId).eq('read', false)
        .order('created_at', { ascending: false }).limit(20),
      supabase.from('projects').select('id, name, end_date, status, color, phases(*)')
        .eq('company_id', companyId).eq('is_archived', false).neq('status', 'closed'),
      supabase.from('alert_states').select('alert_key, starred, dismissed').eq('user_id', userId),
    ])

    const stateMap = new Map((alertStates ?? []).map(s => [s.alert_key, s]))
    // Show a derived alert unless it's dismissed (and not starred).
    const visible = (key: string) => {
      const st = stateMap.get(key)
      return !(st?.dismissed && !st?.starred)
    }

    const computed: Notification[] = []
    for (const project of projects ?? []) {
      if (project.end_date < today && visible(`proj-overdue-${project.id}`)) {
        computed.push({
          id: `proj-overdue-${project.id}`, type: 'project_overdue',
          title: 'Project overdue',
          body: `"${project.name}" passed its end date.`,
          link: `/app/projects/${project.id}`, read: false,
          created_at: new Date().toISOString(),
        })
      }
      for (const phase of project.phases ?? []) {
        if (['completed', 'skipped'].includes(phase.status)) continue
        if (phase.end_date < today && visible(`phase-overdue-${phase.id}`)) {
          computed.push({
            id: `phase-overdue-${phase.id}`, type: 'phase_overdue',
            title: 'Phase overdue',
            body: `"${phase.name}" in ${project.name}`,
            link: `/app/gantt?project=${project.id}`, read: false,
            created_at: new Date().toISOString(),
          })
        } else if (phase.end_date <= soonDate && visible(`phase-soon-${phase.id}`)) {
          computed.push({
            id: `phase-soon-${phase.id}`, type: 'phase_due_soon',
            title: 'Phase due soon',
            body: `"${phase.name}" ends ${phase.end_date}`,
            link: `/app/gantt?project=${project.id}`, read: false,
            created_at: new Date().toISOString(),
          })
        }
      }
    }

    const storedIds = new Set((stored ?? []).map(n => n.id))
    const all = [...(stored ?? []), ...computed.filter(c => !storedIds.has(c.id))]
    setItems(all)
    setUnreadCount(all.length)
    setLoading(false)
  }, [userId, companyId])

  // Fetch count on mount AND whenever the route changes, so the badge can't go
  // stale (e.g. after dismissing things on the Notifications page).
  useEffect(() => {
    fetchItems()
  }, [fetchItems, pathname])

  // Fetch full list when dropdown opens
  useEffect(() => {
    if (open) fetchItems()
  }, [open, fetchItems])

  // ── Mark one read (disappears) ────────────────────────────────────────────
  const markRead = (id: string) => {
    setItems(prev => prev.filter(n => n.id !== id))
    setUnreadCount(prev => Math.max(0, prev - 1))

    const supabase = createClient()
    if (isDerived(id)) {
      // Persist dismissal in the DB so it stays gone across reloads + devices.
      supabase.from('alert_states').upsert(
        { user_id: userId, alert_key: id, dismissed: true, starred: false, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,alert_key' }
      ).then(() => {})
    } else {
      supabase.from('notifications').update({ read: true }).eq('id', id).eq('user_id', userId)
    }
  }

  // ── Mark all read ─────────────────────────────────────────────────────────
  const markAllRead = async () => {
    setItems([])
    setUnreadCount(0)
    const supabase = createClient()
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Notifications"
        className="relative p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl transition-colors">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 px-4 py-3">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              Notifications {unreadCount > 0 && <span className="ml-1 rounded-full bg-rose-100 dark:bg-rose-900/50 px-1.5 py-0.5 text-xs font-bold text-rose-600 dark:text-rose-400">{unreadCount}</span>}
            </span>
            {items.length > 0 && (
              <button onClick={markAllRead}
                className="flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-72 overflow-y-auto">
            {loading && (
              <p className="px-4 py-8 text-center text-xs text-slate-400 dark:text-slate-500">Loading…</p>
            )}
            {!loading && items.length === 0 && (
              <div className="px-4 py-10 text-center">
                <Bell size={24} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">All caught up!</p>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">No unread notifications.</p>
              </div>
            )}
            {!loading && items.map(n => (
              <div key={n.id} className="group flex items-start gap-3 border-b border-slate-50 dark:border-slate-700 px-4 py-3 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                <div className="mt-0.5">{TYPE_ICONS[n.type] ?? <Bell size={13} className="text-slate-400 dark:text-slate-500" />}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{n.title}</p>
                  {n.body && <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{n.body}</p>}
                  {n.link && (
                    <Link href={n.link} onClick={() => { markRead(n.id); setOpen(false) }}
                      className="mt-1 inline-block text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                      View →
                    </Link>
                  )}
                </div>
                <button onClick={() => markRead(n.id)}
                  className="flex-shrink-0 text-slate-300 dark:text-slate-600 opacity-0 transition-opacity hover:text-slate-500 dark:hover:text-slate-400 group-hover:opacity-100"
                  aria-label="Dismiss">
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-3">
            <Link href="/app/notifications" onClick={() => setOpen(false)}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
