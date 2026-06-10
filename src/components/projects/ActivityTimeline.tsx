'use client'

import { ActivityLog } from '@/types/app'
import { formatDate } from '@/lib/dates'
import { Activity } from 'lucide-react'

function getRelativeTime(date: Date | string): string {
  const now = new Date()
  const parsed = typeof date === 'string' ? new Date(date) : date
  const diff = now.getTime() - parsed.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return formatDate(parsed)
}

interface ActivityTimelineProps {
  logs: ActivityLog[]
  members: Record<string, string>
}

export function ActivityTimeline({ logs, members }: ActivityTimelineProps) {
  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
        <Activity size={32} className="mb-3 text-slate-300" />
        <p className="text-sm text-slate-500">No activity yet</p>
      </div>
    )
  }

  return (
    <div className="max-h-[600px] overflow-y-auto space-y-4 pr-3">
      {logs.map((log, idx) => {
        const actorName = members[log.actor_id] || log.actor?.full_name || 'Unknown'
        const relativeTime = getRelativeTime(log.created_at)
        const absoluteTime = formatDate(log.created_at)

        // Parse payload to show what changed
        const changes = log.payload || {}
        const changeItems = Object.entries(changes)
          .filter(([key]) => key !== 'id')
          .map(([key, value]) => {
            if (typeof value === 'object' && value !== null) {
              const obj = value as Record<string, unknown>
              return `${key}: ${obj.from} → ${obj.to}`
            }
            return `${key}: ${value}`
          })

        return (
          <div key={log.id} className="border-l-2 border-slate-200 pl-4 pb-4 last:pb-0">
            {/* Timeline dot */}
            <div className="absolute -left-2.5 mt-1 h-5 w-5 rounded-full border-2 border-white bg-slate-400" />

            {/* Activity card */}
            <div className="rounded-lg border border-slate-100 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">
                    {actorName} {log.action}
                  </p>

                  {/* Changes list */}
                  {changeItems.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm text-slate-600">
                      {changeItems.map((item, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="text-slate-300">•</span>
                          <code className="text-xs bg-slate-50 px-2 py-1 rounded font-mono">
                            {item}
                          </code>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Time */}
                <div className="flex-shrink-0 text-right">
                  <p className="text-xs font-medium text-slate-900" title={absoluteTime}>
                    {relativeTime}
                  </p>
                  <p className="text-xs text-slate-400">{absoluteTime}</p>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
