'use client'

import { Activity, AlertTriangle, CheckCircle2, ClipboardList, FolderKanban, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Project } from '@/types/app'
import { getProjectExecutiveSummary } from '@/lib/projectBoard'

const SUMMARY_ITEMS = [
  {
    key: 'activeProjects',
    label: 'Active Projects',
    note: 'currently in view',
    icon: FolderKanban,
  },
  {
    key: 'onTrack',
    label: 'On Track',
    note: 'healthy delivery',
    icon: ShieldCheck,
  },
  {
    key: 'atRisk',
    label: 'At Risk',
    note: 'needs attention soon',
    icon: AlertTriangle,
  },
  {
    key: 'delayed',
    label: 'Delayed',
    note: 'past plan or blocked',
    icon: ShieldAlert,
  },
  {
    key: 'recentActivity',
    label: 'Recent Activity',
    note: 'updated in the last 48h',
    icon: Activity,
  },
  {
    key: 'completedThisMonth',
    label: 'Completed This Month',
    note: 'closed or wrapped up',
    icon: CheckCircle2,
  },
  {
    key: 'openWork',
    label: 'Open Work',
    note: 'remaining phases',
    icon: ClipboardList,
  },
] as const

export function ProjectBoardSummaryStrip({ projects }: { projects: Project[] }) {
  const summary = getProjectExecutiveSummary(projects)

  return (
    <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-4 text-white shadow-sm sm:p-5">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Project Outlook</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Executive snapshot</h2>
        </div>
        <p className="hidden text-xs text-slate-400 sm:block">
          Scan the board before you scan the jobs.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        {SUMMARY_ITEMS.map((item) => {
          const Icon = item.icon
          const value = summary[item.key]

          return (
            <div key={item.key} className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {item.label}
                </span>
                <Icon size={14} className="text-slate-300" />
              </div>
              <div className="text-2xl font-semibold tracking-tight text-white">{value}</div>
              <p className="mt-1 text-[11px] text-slate-400">{item.note}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
