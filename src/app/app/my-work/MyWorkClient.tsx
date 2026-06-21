'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, ListChecks, CalendarClock, ArrowRight, ClipboardList } from 'lucide-react'
import { updatePhaseChecklist } from '@/app/app/projects/[id]/actions'
import { PHASE_STATUS_LABELS, PHASE_STATUS_COLORS } from '@/lib/constants'
import { PUNCH_STATUS_LABELS, PUNCH_STATUS_CHIP } from '@/lib/punch'
import { formatDate } from '@/lib/dates'
import { PhaseStatus, PunchStatus } from '@/types/app'
import { cn } from '@/lib/utils'
import type { MyPhase, MyPunch, MyTask } from './page'

type TaskFilter = 'todo' | 'completed' | 'all'

export function MyWorkClient({ firstName, tasks: initialTasks, phases, punch }: { firstName: string; tasks: MyTask[]; phases: MyPhase[]; punch: MyPunch[] }) {
  const [tasks, setTasks] = useState(initialTasks)
  const [filter, setFilter] = useState<TaskFilter>('todo')

  const toggle = async (id: string, isCompleted: boolean) => {
    setTasks(ts => ts.map(t => (t.id === id ? { ...t, is_completed: !isCompleted } : t)))
    await updatePhaseChecklist(id, { is_completed: !isCompleted })
  }

  const todo = tasks.filter(t => !t.is_completed)
  const done = tasks.filter(t => t.is_completed)
  const visibleTasks = filter === 'todo' ? todo : filter === 'completed' ? done : [...todo, ...done]

  const punchTodo = punch.filter(p => p.status !== 'completed')
  const punchDone = punch.filter(p => p.status === 'completed')
  const visiblePunch = filter === 'todo' ? punchTodo : filter === 'completed' ? punchDone : [...punchTodo, ...punchDone]

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Work</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {firstName ? `${firstName}, here's ` : "Here's "}everything assigned to you.
        </p>
      </div>

      {/* Assigned tasks */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <ListChecks size={18} className="text-indigo-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">My Tasks</h2>
          <div className="ml-auto inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5">
            {([['todo', `To do (${todo.length})`], ['completed', `Done (${done.length})`], ['all', 'All']] as [TaskFilter, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition',
                  filter === key ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {tasks.length === 0 ? (
          <EmptyCard text="No checklist tasks are assigned to you right now." />
        ) : visibleTasks.length === 0 ? (
          <EmptyCard text={filter === 'completed' ? 'No completed tasks yet.' : 'Nothing to do — all caught up!'} />
        ) : (
          <div className="space-y-2">
            {visibleTasks.map(task => (
              <div key={task.id} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
                <button
                  onClick={() => toggle(task.id, task.is_completed)}
                  className={cn(
                    'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition',
                    task.is_completed ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 hover:border-emerald-400'
                  )}
                >
                  {task.is_completed && <Check size={14} className="text-white" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-medium', task.is_completed ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-slate-100')}>
                    {task.title}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: task.projectColor }} />
                    <span className="truncate">{task.projectName}{task.phaseName ? ` · ${task.phaseName}` : ''}</span>
                  </div>
                </div>
                {task.projectId && (
                  <Link href={`/app/projects/${task.projectId}?tab=tasks`} className="flex-shrink-0 text-slate-300 hover:text-indigo-600">
                    <ArrowRight size={16} />
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Assigned phases */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock size={18} className="text-indigo-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">My Phases</h2>
          <span className="text-xs text-slate-400">{phases.length}</span>
        </div>

        {phases.length === 0 ? (
          <EmptyCard text="No phases are assigned to you right now." />
        ) : (
          <div className="space-y-2">
            {phases.map(phase => (
              <Link
                key={phase.id}
                href={`/app/projects/${phase.projectId}`}
                className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 transition hover:border-slate-300"
              >
                <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: phase.projectColor }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{phase.name}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{phase.projectName}</p>
                </div>
                <span className="flex-shrink-0 text-xs font-medium" style={{ color: PHASE_STATUS_COLORS[phase.status as PhaseStatus] }}>
                  {PHASE_STATUS_LABELS[phase.status as PhaseStatus] ?? phase.status}
                </span>
                <span className="hidden flex-shrink-0 text-xs text-slate-400 sm:inline">{formatDate(phase.end_date, 'MMM d')}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Assigned punch items */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <ClipboardList size={18} className="text-indigo-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">My Punch Items</h2>
          <span className="text-xs text-slate-400">{visiblePunch.length}</span>
        </div>

        {punch.length === 0 ? (
          <EmptyCard text="No punch items are assigned to you right now." />
        ) : visiblePunch.length === 0 ? (
          <EmptyCard text={filter === 'completed' ? 'No completed punch items yet.' : 'No open punch items — all caught up!'} />
        ) : (
          <div className="space-y-2">
            {visiblePunch.map(item => (
              <Link
                key={item.id}
                href={`/app/projects/${item.projectId}?tab=punch`}
                className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 transition hover:border-slate-300"
              >
                <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: item.projectColor }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {item.number ? <span className="text-slate-400">#{item.number} </span> : null}
                    {item.title?.trim() || item.issue_description}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{item.projectName}</p>
                </div>
                <span className={cn('flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', PUNCH_STATUS_CHIP[item.status as PunchStatus])}>
                  {PUNCH_STATUS_LABELS[item.status as PunchStatus] ?? item.status}
                </span>
                <ArrowRight size={16} className="hidden flex-shrink-0 text-slate-300 sm:block" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-6 py-10 text-center">
      <p className="text-sm text-slate-400">{text}</p>
    </div>
  )
}
