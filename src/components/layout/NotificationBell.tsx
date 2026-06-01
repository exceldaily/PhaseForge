'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
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
  project_overdue: <AlertTriangle size={13} className="text-rose-500 flex-shrink-0" />,
  phase_overdue:   <AlertTriangle size={13} className="text-rose-400 flex-shrink-0" />,
  phase_due_soon:  <Clock size={13} className="text-amber-500 flex-shrink-0" />,
  system:          <Info size={13} className="text-slate-400 flex-shrink-0" />,
}

export function NotificationBell({ userId, companyId }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

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

    const [{ data: stored }, { data: projects }] = await Promise.all([
      supabase.from('notifications').select('*')
        .eq('user_id', userId).eq('read', false)
        .order('created_at', { ascending: false }).limit(20),
      supabase.from('projects').select('id, name, end_date, status, color, phases(*)')
        .eq('company_id', companyId).eq('is_archived', false).neq('status', 'closed'),
    ])

    const computed: Notification[] = []
    for (const project of projects ?? []) {
      if (project.end_date < today) {
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
        if (phase.end_date < today) {
          computed.push({
            id: `phase-overdue-${phase.id}`, type: 'phase_overdue',
            title: 'Phase overdue',
            body: `"${phase.name}" in ${project.name}`,
            link: `/app/gantt?project=${project.id}`, read: false,
            created_at: new Date().toISOString(),
          })
        } else if (phase.end_date <= soonDate) {
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

  // Fetch count on mount (lightweight — just to show badge)
  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  // Fetch full list when dropdown opens
  useEffect(() => {
    if (open) fetchItems()
  }, [open, fetchItems])

  // ── Mark one read (disappears) ────────────────────────────────────────────
  const markRead = (id: string) => {
    setItems(prev => prev.filter(n => n.id !== id))
    setUnreadCount(prev => Math.max(0, prev - 1))
    if (!id.startsWith('proj-') && !id.startsWith('phase-')) {
      const supabase = createClient()
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
        className="relative p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-semibold text-slate-900">
              Notifications {unreadCount > 0 && <span className="ml-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-xs font-bold text-rose-600">{unreadCount}</span>}
            </span>
            {items.length > 0 && (
              <button onClick={markAllRead}
                className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-72 overflow-y-auto">
            {loading && (
              <p className="px-4 py-8 text-center text-xs text-slate-400">Loading…</p>
            )}
            {!loading && items.length === 0 && (
              <div className="px-4 py-10 text-center">
                <Bell size={24} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">All caught up!</p>
                <p className="mt-0.5 text-xs text-slate-400">No unread notifications.</p>
              </div>
            )}
            {!loading && items.map(n => (
              <div key={n.id} className="group flex items-start gap-3 border-b border-slate-50 px-4 py-3 last:border-0 hover:bg-slate-50">
                <div className="mt-0.5">{TYPE_ICONS[n.type] ?? <Bell size={13} className="text-slate-400" />}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800">{n.title}</p>
                  {n.body && <p className="mt-0.5 truncate text-xs text-slate-500">{n.body}</p>}
                  {n.link && (
                    <Link href={n.link} onClick={() => { markRead(n.id); setOpen(false) }}
                      className="mt-1 inline-block text-xs font-medium text-indigo-600 hover:underline">
                      View →
                    </Link>
                  )}
                </div>
                <button onClick={() => markRead(n.id)}
                  className="flex-shrink-0 text-slate-300 opacity-0 transition-opacity hover:text-slate-500 group-hover:opacity-100"
                  aria-label="Dismiss">
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 px-4 py-3">
            <Link href="/app/notifications" onClick={() => setOpen(false)}
              className="text-xs font-medium text-indigo-600 hover:underline">
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
