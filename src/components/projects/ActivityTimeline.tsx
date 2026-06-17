'use client'

import { ActivityLog, PhaseStatus, ProjectPriority, ProjectStatus } from '@/types/app'
import { formatDate } from '@/lib/dates'
import { PHASE_STATUS_LABELS, PRIORITY_LABELS, PROJECT_STATUS_LABELS } from '@/lib/constants'
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

// What the actor did, in plain language.
const ACTION_LABELS: Record<string, string> = {
  project_created: 'created this project',
  project_updated: 'updated the project',
  phase_created: 'added a phase',
  phase_updated: 'updated a phase',
  phase_deleted: 'removed a phase',
  comment_added: 'left a comment',
}

// Friendly names for the fields that changed.
const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  customer_name: 'Client',
  job_location: 'Location',
  start_date: 'Start date',
  end_date: 'Finish date',
  status: 'Stage',
  priority: 'Priority',
  project_manager: 'Project manager',
  superintendent: 'Superintendent',
  permit_status: 'Permit status',
  notes: 'Notes',
  color: 'Color',
  tags: 'Tags',
  subcontractors: 'Subcontractors',
  links: 'Links',
  board_id: 'Board',
  board_column_id: 'Board column',
  assigned_to: 'Assignee',
}

// Internal/noisy fields no one needs to read.
const HIDDEN_FIELDS = new Set(['updated_at', 'updated_by', 'created_at', 'created_by', 'id', 'company_id'])
const DATE_FIELDS = new Set(['start_date', 'end_date'])
const PERSON_FIELDS = new Set(['project_manager', 'superintendent', 'assigned_to', 'updated_by', 'created_by'])

function humanLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ')
}

function formatValue(key: string, value: unknown, members: Record<string, string>): string {
  if (value === null || value === undefined || value === '') return 'empty'
  if (key === 'status') return PROJECT_STATUS_LABELS[value as ProjectStatus] ?? PHASE_STATUS_LABELS[value as PhaseStatus] ?? String(value)
  if (key === 'priority') return PRIORITY_LABELS[value as ProjectPriority] ?? String(value)
  if (DATE_FIELDS.has(key)) return formatDate(String(value), 'MMM d, yyyy')
  if (PERSON_FIELDS.has(key) && typeof value === 'string') return members[value] ?? value
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`
  if (typeof value === 'object') return 'updated'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
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
    <div className="max-h-[600px] space-y-3 overflow-y-auto pr-1">
      {logs.map((log) => {
        const actorName = members[log.actor_id] || log.actor?.full_name || 'Someone'
        const relativeTime = getRelativeTime(log.created_at)
        const absoluteTime = formatDate(log.created_at)

        // Build readable "Field: old → new" lines, skipping internal fields.
        const changes = (log.payload || {}) as Record<string, unknown>
        const changeLines = Object.entries(changes)
          .filter(([key]) => !HIDDEN_FIELDS.has(key))
          .map(([key, value]) => {
            const label = FIELD_LABELS[key] ?? key.replace(/_/g, ' ')
            if (value && typeof value === 'object' && 'from' in (value as object) && 'to' in (value as object)) {
              const v = value as { from: unknown; to: unknown }
              return { label, from: formatValue(key, v.from, members), to: formatValue(key, v.to, members) }
            }
            return { label, from: null, to: formatValue(key, value, members) }
          })

        return (
          <div key={log.id} className="rounded-xl border border-slate-100 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-slate-900">
                <span className="font-semibold">{actorName}</span> {humanLabel(log.action)}
              </p>
              <p className="flex-shrink-0 text-xs text-slate-400" title={absoluteTime}>
                {relativeTime}
              </p>
            </div>

            {changeLines.length > 0 && (
              <ul className="mt-2 space-y-1">
                {changeLines.map((c, i) => (
                  <li key={i} className="text-sm text-slate-600">
                    <span className="font-medium text-slate-500">{c.label}:</span>{' '}
                    {c.from !== null ? (
                      <>
                        <span className="text-slate-400 line-through">{c.from}</span>
                        <span className="mx-1 text-slate-300">→</span>
                        <span className="font-medium text-slate-700">{c.to}</span>
                      </>
                    ) : (
                      <span className="font-medium text-slate-700">{c.to}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
