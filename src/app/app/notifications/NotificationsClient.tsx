'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bell, CheckCheck, AlertTriangle, Clock, Info, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  created_at: string
  starred?: boolean
}

// Derived alerts (vs stored DB notifications) use these id prefixes.
const isDerived = (id: string) => id.startsWith('proj-') || id.startsWith('phase-')

interface NotificationsClientProps {
  notifications: Notification[]
  userId: string
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  project_overdue: <AlertTriangle size={16} className="text-rose-500" />,
  phase_overdue: <AlertTriangle size={16} className="text-rose-400" />,
  phase_due_soon: <Clock size={16} className="text-amber-500" />,
  mention: <Bell size={16} className="text-indigo-500" />,
  system: <Info size={16} className="text-slate-400" />,
}

const TYPE_BG: Record<string, string> = {
  project_overdue: 'bg-rose-50',
  phase_overdue: 'bg-rose-50',
  phase_due_soon: 'bg-amber-50',
  mention: 'bg-indigo-50',
  system: 'bg-slate-50',
}

export function NotificationsClient({ notifications: initial, userId }: NotificationsClientProps) {
  const [notifications, setNotifications] = useState(initial)
  const unread = notifications.filter(n => !n.read).length

  const markRead = async (id: string) => {
    // Remove immediately — read notifications disappear
    setNotifications(prev => prev.filter(n => n.id !== id))
    const supabase = createClient()
    if (isDerived(id)) {
      // Persist dismissal so it stays gone across reloads + devices.
      await supabase.from('alert_states').upsert(
        { user_id: userId, alert_key: id, dismissed: true, starred: false, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,alert_key' }
      )
    } else {
      await supabase.from('notifications').update({ read: true }).eq('id', id).eq('user_id', userId)
    }
  }

  const toggleStar = async (id: string) => {
    if (!isDerived(id)) return
    const next = !notifications.find(n => n.id === id)?.starred
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, starred: next } : n)))
    const supabase = createClient()
    await supabase.from('alert_states').upsert(
      { user_id: userId, alert_key: id, starred: next, dismissed: false, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,alert_key' }
    )
  }

  const markAllRead = async () => {
    setNotifications([])
    const supabase = createClient()
    await supabase.from('notifications').update({ read: true })
      .eq('user_id', userId).eq('read', false)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
          <p className="text-slate-500 mt-1 text-sm">
            {unread > 0 ? `${unread} unread` : 'All caught up'}
          </p>
        </div>
        {unread > 0 && (
          <button onClick={markAllRead}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            <CheckCheck size={15} /> Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white py-20 text-center">
          <Bell size={32} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-400 font-medium">No notifications yet</p>
          <p className="text-sm text-slate-400 mt-1">Overdue phases and project alerts will appear here.</p>
        </div>
      )}

      <div className="space-y-2">
        {notifications.map(n => (
          <div key={n.id} className={cn('rounded-2xl border border-slate-200 transition-all', TYPE_BG[n.type] ?? 'bg-slate-50')}>
            <div className="flex items-start gap-4 p-4">
              <div className="mt-0.5 flex-shrink-0">
                {TYPE_ICONS[n.type] ?? <Bell size={16} className="text-slate-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    {isDerived(n.id) && (
                      <button onClick={() => toggleStar(n.id)}
                        aria-label={n.starred ? 'Unstar' : 'Star'}
                        className={cn('transition-colors', n.starred ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500')}>
                        <Star size={14} fill={n.starred ? 'currentColor' : 'none'} />
                      </button>
                    )}
                    <button onClick={() => markRead(n.id)}
                      className="text-xs text-slate-400 hover:text-rose-500 transition-colors">
                      Dismiss
                    </button>
                  </div>
                </div>
                {n.body && <p className="text-sm text-slate-500 mt-0.5">{n.body}</p>}
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-xs text-slate-400">{new Date(n.created_at).toLocaleDateString()}</span>
                  {n.link && (
                    <Link href={n.link} onClick={() => markRead(n.id)}
                      className="text-xs font-medium text-indigo-600 hover:underline">
                      View →
                    </Link>
                  )}
                </div>
              </div>
              <div className="mt-2 h-2 w-2 rounded-full bg-indigo-500 flex-shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
