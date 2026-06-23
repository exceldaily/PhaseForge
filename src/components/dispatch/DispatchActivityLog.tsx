'use client'

import { useState, useTransition, useEffect } from 'react'
import {
  MessageSquare, ArrowRight, Edit3, Mail, User, Zap,
  Package, Clock, XCircle, RefreshCw, Flag, CheckCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DispatchActivityLog as ActivityLogType } from '@/types/app'
import { addDispatchNote, getDispatchActivity } from '@/app/app/dispatch/actions'
import { cn } from '@/lib/utils'

interface Props {
  cardId: string
  boardId: string
  initialLogs?: ActivityLogType[]
}

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  card_created:   Zap,
  status_changed: ArrowRight,
  field_changed:  Edit3,
  note_added:     MessageSquare,
  email_received: Mail,
  vendor_forwarded: User,
  eta_updated:    Clock,
  part_ordered:   Package,
  card_closed:    XCircle,
  card_reopened:  RefreshCw,
  review_flagged: Flag,
  review_cleared: CheckCircle,
}

const ACTIVITY_COLORS: Record<string, string> = {
  card_created:    'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
  status_changed:  'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  field_changed:   'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
  note_added:      'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  email_received:  'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  vendor_forwarded:'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  eta_updated:     'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400',
  part_ordered:    'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',
  card_closed:     'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
  card_reopened:   'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
  review_flagged:  'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  review_cleared:  'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
}

export function DispatchActivityLog({ cardId, boardId, initialLogs = [] }: Props) {
  const [logs, setLogs] = useState<ActivityLogType[]>(initialLogs)
  const [note, setNote] = useState('')
  const [isPending, startTransition] = useTransition()
  const [loading, setLoading] = useState(initialLogs.length === 0)

  useEffect(() => {
    if (initialLogs.length === 0) {
      getDispatchActivity(cardId).then(result => {
        if (result.logs) setLogs(result.logs as ActivityLogType[])
        setLoading(false)
      })
    }
  }, [cardId, initialLogs.length])

  const handleAddNote = () => {
    if (!note.trim()) return
    const text = note.trim()
    setNote('')
    startTransition(async () => {
      const result = await addDispatchNote(cardId, boardId, text)
      if (!result.error) {
        const result2 = await getDispatchActivity(cardId)
        if (result2.logs) setLogs(result2.logs as ActivityLogType[])
      }
    })
  }

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Activity</h3>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto space-y-3 min-h-0 mb-4">
        {loading && (
          <div className="text-center py-8 text-sm text-slate-400">Loading activity…</div>
        )}
        {!loading && logs.length === 0 && (
          <div className="text-center py-8 text-sm text-slate-400">No activity yet</div>
        )}
        {logs.map((log) => {
          const Icon = ACTIVITY_ICONS[log.activity_type] ?? Edit3
          const colorClass = ACTIVITY_COLORS[log.activity_type] ?? ACTIVITY_COLORS.field_changed
          const actorName = log.actor?.full_name ?? log.actor_name ?? (log.actor_type === 'system' ? 'System' : 'Unknown')

          return (
            <div key={log.id} className="flex gap-2.5 group">
              <div className={cn('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5', colorClass)}>
                <Icon size={13} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{actorName}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {formatRelativeTime(log.created_at)}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{log.message}</p>
                {log.old_value && log.new_value && log.activity_type === 'status_changed' && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 rounded px-1.5 py-0.5">{log.old_value}</span>
                    <ArrowRight size={10} className="text-slate-400" />
                    <span className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded px-1.5 py-0.5">{log.new_value}</span>
                  </div>
                )}
                {log.activity_type === 'field_changed' && log.field_name && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {log.old_value ? `"${log.old_value}" → "${log.new_value}"` : log.new_value ? `Set to "${log.new_value}"` : ''}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add note */}
      <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
        <textarea
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-white resize-none mb-2"
          placeholder="Add a note..."
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote()
          }}
        />
        <Button
          size="sm"
          onClick={handleAddNote}
          disabled={!note.trim()}
          loading={isPending}
          className="w-full"
        >
          Add Note
        </Button>
      </div>
    </div>
  )
}

function formatRelativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = Math.floor((now - then) / 1000)

  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
