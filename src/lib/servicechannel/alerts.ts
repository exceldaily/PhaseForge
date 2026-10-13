// Management alerts: a short list of conditions that need a decision, each
// with a count and a link, built from the same data as the action queue.
// Thresholds are internal follow-up rules set in Settings; nothing here is a
// ServiceChannel SLA, and nothing is invented when the data is absent. One
// row per condition, never one per item, so the list stays readable.

import { daysBetween } from './rules'
import type { ActionCenter } from './actionCenter'
import type { ProjectView, InvestigationView, TaskFull } from './records'
import type { MetricEntryView, ScSettings, WorkOrderView } from './server'

export interface Alert { key: string; severity: 'high' | 'medium' | 'low'; title: string; detail: string; href: string; count: number }

export interface AlertInput {
  ac: ActionCenter
  wos: WorkOrderView[]
  tasks: TaskFull[]
  projects: ProjectView[]
  investigations: InvestigationView[]
  metrics: MetricEntryView[]
  settings: ScSettings
  today: string
}

export function buildAlerts(i: AlertInput): Alert[] {
  const { ac, today } = i
  const th = i.settings.thresholds
  const out: Alert[] = []
  const add = (key: string, severity: Alert['severity'], count: number, title: string, detail: string, href: string) => { if (count > 0) out.push({ key, severity, count, title, detail, href }) }
  const q = (s: string) => `/app/servicechannel/action-center?open=${s}`

  add('overdue', 'high', ac.counts.overdue, 'Overdue responsibilities', 'Internal due dates, recovery deadlines, or project review dates that have passed.', q('overdue'))
  add('complaints', 'high', ac.counts.complaints, 'Customer complaints with no contact recorded', 'Unsatisfactory reports in the export, or recoveries opened, with no customer contact logged yet.', q('complaints'))
  add('escalated', 'high', ac.counts.escalated, 'Escalated to management', 'Items a person escalated. They stay here until the escalation is cleared.', q('escalated'))
  add('unack', 'high', ac.counts.unack, `Assignments not acknowledged for ${th.unackDays}+ days`, 'The owner has not accepted in PhaseForge and no acknowledgment was recorded for them.', q('unack'))
  add('blocked', 'medium', ac.counts.blocked, `Blocked with no update for ${th.staleDays}+ days`, 'Blocked cases and tasks nobody has touched. Decide: unblock, reassign, or escalate.', q('blocked'))
  add('verify', 'medium', ac.counts.verify, 'Awaiting verification', 'Marked complete but not verified. Only a verification with a note closes them.', q('verify'))
  add('unassigned', 'medium', ac.counts.unassigned, 'Responsibilities with no owner', 'Tasks, recoveries, or followed-up cases that nobody owns.', q('unassigned'))

  // Silent items: assigned, open, no deadline, and nothing recorded for a while. Items with a deadline are covered by Overdue.
  const silentTasks = i.tasks.filter((t) => t.status !== 'verified_resolved' && t.ownerKey && !t.dueDate && daysBetween(t.lastUpdateAt ?? t.createdAt, today) >= th.staleDays)
  const silentCases = i.wos.filter((w) => w.case.internalStatus !== 'verified_resolved' && w.case.internalStatus !== 'new' && w.case.ownerProfileId && !w.case.dueDate && daysBetween(w.case.lastUpdateAt, today) >= th.staleDays)
  add('silent', 'low', silentTasks.length + silentCases.length, `No update for ${th.staleDays}+ days and no due date`, 'Assigned work with no deadline and no recent activity. Give it a due date or close it.', '/app/servicechannel/departments')

  const openProjects = i.projects.filter((p) => p.status === 'active' || p.status === 'planned' || p.status === 'on_hold')
  add('project_target', 'high', openProjects.filter((p) => p.targetDate && p.targetDate < today).length, 'Projects past their target date', 'Still open after the date they were meant to finish. Re-plan or close with a result.', '/app/servicechannel/projects')
  add('project_review', 'medium', openProjects.filter((p) => p.reviewDate && p.reviewDate < today).length, 'Project reviews overdue', 'The management review date has passed with the review not rescheduled.', '/app/servicechannel/projects')
  add('project_silent', 'low', openProjects.filter((p) => p.status === 'active' && daysBetween(p.lastUpdateAt, today) >= th.reviewDays).length, `Active projects with no update for ${th.reviewDays}+ days`, 'No update, KPI snapshot, milestone, or task change recorded.', '/app/servicechannel/projects')
  add('project_overdue_tasks', 'medium', openProjects.reduce((n, p) => n + p.tasksOverdue, 0), 'Overdue project tasks', 'Corrective actions on improvement projects past their due date.', '/app/servicechannel/projects')

  add('rca_silent', 'low', i.investigations.filter((x) => (x.status === 'open' || x.status === 'investigating') && daysBetween(x.lastUpdateAt, today) >= th.reviewDays).length, `Investigations with no update for ${th.reviewDays}+ days`, 'Open root-cause investigations with nothing recorded recently.', '/app/servicechannel/rca')

  // Official scores: a monthly reading is the only way the goal is measured. Nothing estimates it.
  const latestOverall = i.metrics.find((m) => m.measure === 'overall' && !m.isSample)
  if (!latestOverall) out.push({ key: 'score_missing', severity: 'medium', count: 1, title: 'No official Overall score recorded', detail: 'Read it from the ServiceChannel Marketplace Score dashboard and record it with the date.', href: '/app/servicechannel/scores' })
  else if (daysBetween(latestOverall.snapshotDate, today) >= 35) out.push({ key: 'score_stale', severity: 'medium', count: 1, title: `Official scores last recorded ${daysBetween(latestOverall.snapshotDate, today)} days ago`, detail: 'Record this month’s reading so the trend toward the goal stays real.', href: '/app/servicechannel/scores' })

  const order = { high: 0, medium: 1, low: 2 }
  return out.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count)
}
