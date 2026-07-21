'use client'

import type { PrioritizedCall } from '@/lib/dispatch/types'
import { groupByKanbanLane, KANBAN_LABELS, KANBAN_LANES } from '@/lib/dispatch/kanban'
import { formatDate, titleCase } from '@/lib/dispatch/utils'

const LANE_COLORS: Record<string, string> = {
  needs_dispatch: 'border-t-rose-400',
  waiting_on_vendor: 'border-t-amber-400',
  waiting_on_parts: 'border-t-violet-400',
  ready_to_schedule: 'border-t-teal-400',
  scheduled_in_progress: 'border-t-indigo-400',
  closed: 'border-t-slate-300',
}

export function KanbanView({ calls, onOpen }: {
  calls: PrioritizedCall[]
  onOpen: (id: string) => void
}) {
  const groups = groupByKanbanLane(calls)

  return (
    <div className="flex h-full gap-3 overflow-x-auto pb-2">
      {KANBAN_LANES.map((lane) => (
        <div key={lane} className={`flex w-64 flex-shrink-0 flex-col rounded-lg border border-t-4 border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 ${LANE_COLORS[lane]}`}>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              {KANBAN_LABELS[lane]}
            </span>
            <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              {groups[lane].length}
            </span>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
            {groups[lane].map((call) => (
              <button key={call.id} onClick={() => onOpen(call.id)}
                className="block w-full rounded-md border border-slate-200 bg-white p-2.5 text-left shadow-sm transition hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  {call.store ? `#${call.store.store_number} ${call.store.store_name}` : call.customer_name ?? 'No location'}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">{call.description}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="font-semibold text-indigo-600">{call.service_call_number}</span>
                  {call.urgency === 'urgent' && <span className="font-bold text-rose-500">URGENT</span>}
                  <span>{titleCase(call.status)}</span>
                  {call.vendors[0] && <span>{call.vendors[0].name}</span>}
                  {call.scheduled_date && <span>{formatDate(call.scheduled_date)}</span>}
                </div>
              </button>
            ))}
            {groups[lane].length === 0 && (
              <p className="px-1 py-4 text-center text-[11px] text-slate-300 dark:text-slate-600">Empty</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
