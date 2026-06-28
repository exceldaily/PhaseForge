'use client'

interface AdminAuditLog {
  id: string
  actor_id: string
  action: string
  target_type: string
  target_id: string
  target_email?: string
  changes?: Record<string, unknown>
  created_at: string
  actor?: { full_name: string; email: string } | null
}

interface ActivityTimelineProps {
  logs: AdminAuditLog[]
}

function getActionColor(action: string): string {
  if (action.includes('delete')) return 'text-red-700'
  if (action.includes('deactivate')) return 'text-orange-700'
  if (action.includes('promote')) return 'text-blue-700'
  if (action.includes('demote')) return 'text-yellow-700'
  return 'text-slate-700'
}

function getActionBgColor(action: string): string {
  if (action.includes('delete')) return 'bg-red-100'
  if (action.includes('deactivate')) return 'bg-orange-100'
  if (action.includes('promote')) return 'bg-blue-100'
  if (action.includes('demote')) return 'bg-yellow-100'
  return 'bg-slate-100'
}

function formatAction(action: string): string {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function ActivityTimeline({ logs }: ActivityTimelineProps) {
  if (logs.length === 0) {
    return (
      <div className="p-12 text-center text-slate-500">
        <p>No admin actions recorded yet</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="space-y-4">
        {logs.map((log) => (
          <div key={log.id} className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${getActionBgColor(log.action)} ${getActionColor(log.action)}`}>
                  {formatAction(log.action)}
                </div>
                <div>
                  <p className="text-sm text-slate-900 font-medium">
                    {log.actor?.full_name || 'Unknown User'}
                  </p>
                  <p className="text-xs text-slate-600">
                    {log.actor?.email || log.actor_id}
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-500 whitespace-nowrap">
                {new Date(log.created_at).toLocaleDateString()} {new Date(log.created_at).toLocaleTimeString()}
              </p>
            </div>

            {/* Details */}
            <div className="ml-12 text-sm text-slate-700">
              <p>
                <span className="font-medium">{log.target_type}:</span> {log.target_email || log.target_id}
              </p>

              {/* Changes */}
              {log.changes && Object.keys(log.changes).length > 0 && (
                <div className="mt-2 rounded bg-slate-50 p-3 text-xs text-slate-600">
                  <details>
                    <summary className="cursor-pointer font-medium text-slate-700 hover:text-slate-900">
                      View changes
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {Object.entries(log.changes).map(([key, val]) => (
                        <li key={key} className="flex gap-2 font-mono">
                          <span className="font-semibold text-slate-700">{key}:</span>
                          <span className="break-all">{String(val)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Load More */}
      {logs.length >= 500 && (
        <div className="mt-8 text-center">
          <button className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50">
            Load More
          </button>
        </div>
      )}
    </div>
  )
}
