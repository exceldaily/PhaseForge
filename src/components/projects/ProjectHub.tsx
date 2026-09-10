'use client'

// The project's front door: one tile per part of the job with a live
// preview, then the project details beside a schedule-at-a-glance. Every
// tile opens the section it previews, so nothing is more than one click in.

import Link from 'next/link'
import {
  Activity as ActivityIcon, ArrowUpRight, CheckSquare, ClipboardList, FileDiff, GanttChartSquare,
  LayoutDashboard, Map, MapPin, MessageSquare, Paperclip,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/dates'
import { PRIORITY_LABELS, PRIORITY_COLORS } from '@/lib/constants'
import { PROJECT_HEALTH_META } from '@/lib/projectBoard'
import type { CommandCenterData } from '@/lib/commandCenter'
import type { ActivityLog, Phase, Profile, Project, ProjectAttachment, ProjectPriority, PunchItem } from '@/types/app'
import { MiniGantt } from '@/components/gantt/MiniGantt'
import { Badge } from '@/components/ui/Badge'

export type HubTab = 'overview' | 'gantt' | 'tasks' | 'punch' | 'activity' | 'files' | 'chat'

export interface HubChangeOrder {
  id: string
  co_number: number
  title: string
  stage: string
  current_amount: number | null
  approved_amount: number | null
}

interface ProjectHubProps {
  project: Project & { phases: Phase[] }
  members: Profile[]
  punchItems: PunchItem[]
  attachments: ProjectAttachment[]
  activityLogs: ActivityLog[]
  changeOrders: HubChangeOrder[]
  planSetCount: number
  planSheetCount: number
  chat: { body: string; authorId: string; createdAt: string; kind: string }[]
  commandCenter: CommandCenterData
  onNavigate: (tab: HubTab) => void
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

function relTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(iso, 'MMM d')
}

function describe(log: ActivityLog): string {
  const p = log.payload as Record<string, unknown> | null
  if (p?.summary) return String(p.summary)
  return log.action.replace(/_/g, ' ')
}

/** One clickable box. Either a tab in the shell or a route of its own. */
function Tile({ title, icon, count, hint, onClick, href, className, children, helpKey }: {
  title: string; icon: React.ReactNode; count?: string | number; hint?: string
  onClick?: () => void; href?: string; className?: string; children?: React.ReactNode; helpKey?: string
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <span className="text-indigo-600">{icon}</span> {title}
        </span>
        <span className="flex items-center gap-1.5">
          {count !== undefined && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{count}</span>}
          <ArrowUpRight size={14} className="text-slate-300 transition-colors group-hover:text-indigo-500" />
        </span>
      </div>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
      {children && <div className="mt-3">{children}</div>}
    </>
  )
  const cls = cn('group block w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-px hover:border-indigo-300 hover:shadow-md', className)
  return href
    ? <Link href={href} className={cls} data-help={helpKey}>{body}</Link>
    : <button onClick={onClick} className={cls} data-help={helpKey}>{body}</button>
}

export function ProjectHub({
  project, members, punchItems, attachments, activityLogs, changeOrders, planSetCount, planSheetCount, chat, commandCenter, onNavigate,
}: ProjectHubProps) {
  const phases = project.phases
  const memberMap = Object.fromEntries(members.map((m) => [m.id, m.full_name]))
  const health = commandCenter.intel.health
  const facts = commandCenter.intel.facts
  const meta = PROJECT_HEALTH_META[health.level]

  const inProgress = phases.filter((p) => p.status === 'in_progress').length
  const done = phases.filter((p) => p.status === 'completed').length
  const today = new Date().toISOString().slice(0, 10)
  const nextDue = [...phases].filter((p) => p.status !== 'completed' && p.end_date >= today).sort((a, b) => a.end_date.localeCompare(b.end_date))[0]
  const overdue = phases.filter((p) => p.status !== 'completed' && p.status !== 'skipped' && p.end_date < today).length

  const openPunch = punchItems.filter((i) => i.status !== 'completed')
  const punchPhotos = punchItems.filter((i) => i.issue_photo_url).slice(0, 4)

  const openCos = changeOrders.filter((c) => !['approved', 'billed', 'closed', 'rejected', 'void', 'cancelled'].includes(c.stage))
  const approvedTotal = changeOrders.reduce((s, c) => s + (c.approved_amount ?? 0), 0)
  const pendingTotal = openCos.reduce((s, c) => s + (c.current_amount ?? 0), 0)

  const address = project.formatted_address ?? project.job_location ?? null
  const pmName = project.project_manager ? (memberMap[project.project_manager] ?? project.project_manager) : null
  const links = (project.links ?? []) as { label?: string; url?: string; title?: string }[]

  const details: { label: string; value: React.ReactNode }[] = [
    { label: 'Customer', value: project.customer_name },
    { label: 'Job #', value: project.job_number },
    { label: 'Store / site', value: project.store_site_id },
    { label: 'Address', value: address ? (
      <a href={project.maps_url ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-indigo-700 hover:underline"><MapPin size={11} /> {address}</a>
    ) : null },
    { label: 'Dates', value: `${formatDate(project.start_date, 'MMM d, yyyy')} to ${formatDate(project.end_date, 'MMM d, yyyy')}` },
    { label: 'Status', value: project.status.replace(/_/g, ' ') },
    { label: 'Priority', value: <Badge className={cn('text-[10px]', PRIORITY_COLORS[project.priority as ProjectPriority])}>{PRIORITY_LABELS[project.priority as ProjectPriority]}</Badge> },
    { label: 'Project manager', value: pmName },
    { label: 'Superintendent', value: project.superintendent },
    { label: 'Trade', value: project.trade },
    { label: 'Permit', value: project.permit_status },
    { label: 'Subcontractors', value: project.subcontractors?.length ? project.subcontractors.join(', ') : null },
    { label: 'Tags', value: project.tags?.length ? project.tags.join(', ') : null },
    { label: 'Links', value: links.length ? (
      <span className="flex flex-wrap gap-x-3 gap-y-1">
        {links.map((l, i) => l.url ? <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="text-indigo-700 hover:underline">{l.label ?? l.title ?? l.url}</a> : null)}
      </span>
    ) : null },
    { label: 'Notes', value: project.notes ? <span className="whitespace-pre-wrap">{project.notes}</span> : null },
  ].filter((d) => d.value !== null && d.value !== undefined && d.value !== '')

  return (
    <div className="space-y-4 p-3 sm:p-5">
      {/* ── Tiles ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-help="project-hub">
        <Tile title="Schedule" icon={<GanttChartSquare size={16} />} count={`${facts.progressPercent}%`} onClick={() => onNavigate('gantt')}
          hint={`${phases.length} phase${phases.length === 1 ? '' : 's'}${facts.slipDays ? `, ${facts.slipDays > 0 ? `${facts.slipDays}d behind` : `${-facts.slipDays}d ahead`}` : ''}, ends ${formatDate(project.end_date, 'MMM d')}`}
          className="sm:col-span-2" helpKey="hub-schedule">
          <MiniGantt phases={phases} maxRows={5} labels={false} />
        </Tile>

        <Tile title="Command Center" icon={<LayoutDashboard size={16} />} onClick={() => onNavigate('overview')}
          hint={health.attention.length ? `${health.attention.length} thing${health.attention.length === 1 ? '' : 's'} need eyes` : 'Nothing needs eyes right now'} helpKey="hub-health">
          <div className="flex items-start gap-3">
            <div className={cn('rounded-lg border px-2.5 py-1.5 text-center', meta.pillClassName)}>
              <p className="text-lg font-bold leading-none">{health.score}</p>
              <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide">{meta.label}</p>
            </div>
            <ul className="min-w-0 flex-1 space-y-1">
              {health.attention.slice(0, 2).map((a, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-600">
                  <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', a.severity === 'critical' ? 'bg-rose-500' : a.severity === 'warning' ? 'bg-amber-500' : 'bg-slate-400')} />
                  <span className="line-clamp-2">{a.text}</span>
                </li>
              ))}
              {!health.attention.length && <li className="text-[11px] text-slate-400">On track.</li>}
            </ul>
          </div>
        </Tile>

        <Tile title="Tasks" icon={<CheckSquare size={16} />} count={phases.length} onClick={() => onNavigate('tasks')}
          hint={`${done} done, ${inProgress} in progress${overdue ? `, ${overdue} overdue` : ''}`} helpKey="hub-tasks">
          {nextDue
            ? <p className="text-xs text-slate-600">Next due: <span className="font-medium text-slate-800">{nextDue.name}</span> <span className="text-slate-400">{formatDate(nextDue.end_date, 'MMM d')}</span></p>
            : <p className="text-xs text-slate-400">Nothing coming due.</p>}
        </Tile>

        <Tile title="Punch List" icon={<ClipboardList size={16} />} count={openPunch.length ? `${openPunch.length} open` : punchItems.length} onClick={() => onNavigate('punch')}
          hint={punchItems.length ? `${punchItems.length - openPunch.length} of ${punchItems.length} completed` : 'No punch items yet'} helpKey="hub-punch">
          {punchPhotos.length > 0 && (
            <div className="flex gap-1.5">
              {punchPhotos.map((i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i.id} src={i.issue_photo_url!} alt="" className="h-12 w-12 rounded-md object-cover ring-1 ring-slate-200" />
              ))}
            </div>
          )}
        </Tile>

        <Tile title="Change Orders" icon={<FileDiff size={16} />} count={changeOrders.length} href={`/app/projects/${project.id}/change-orders`}
          hint={changeOrders.length ? `${openCos.length} open${pendingTotal ? `, ${money(pendingTotal)} pending` : ''}${approvedTotal ? `, ${money(approvedTotal)} approved` : ''}` : 'None yet'} helpKey="hub-cos">
          {openCos.slice(0, 2).map((c) => (
            <p key={c.id} className="truncate text-xs text-slate-600">
              <span className="font-semibold text-slate-800">CO {c.co_number}</span> {c.title}
              <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-400">{c.stage.replace(/_/g, ' ')}</span>
            </p>
          ))}
        </Tile>

        <Tile title="Plans" icon={<Map size={16} />} count={planSheetCount} href={`/app/projects/${project.id}/plans`}
          hint={planSheetCount ? `${planSheetCount} sheet${planSheetCount === 1 ? '' : 's'} in ${planSetCount} set${planSetCount === 1 ? '' : 's'}` : 'No drawings uploaded'} helpKey="hub-plans" />

        <Tile title="Files" icon={<Paperclip size={16} />} count={attachments.length} onClick={() => onNavigate('files')}
          hint={attachments.length ? `Latest ${relTime(attachments[0].created_at)}` : 'Nothing attached'} helpKey="hub-files">
          {attachments.slice(0, 3).map((a) => <p key={a.id} className="truncate text-xs text-slate-600">{a.file_name}</p>)}
        </Tile>

        <Tile title="Job chat" icon={<MessageSquare size={16} />} onClick={() => onNavigate('chat')}
          hint={chat.length ? `Last message ${relTime(chat[0].createdAt)}` : 'Talk about this job, ping its trades'} helpKey="hub-chat">
          {chat.slice(0, 3).map((c, i) => (
            <p key={i} className="truncate text-xs text-slate-600">
              {c.kind === 'update' && <span className="mr-1 rounded bg-amber-100 px-1 text-[9px] font-bold uppercase text-amber-700">update</span>}
              <span className="font-medium text-slate-700">{memberMap[c.authorId] ?? 'Someone'}</span> {c.body}
            </p>
          ))}
        </Tile>

        <Tile title="Activity" icon={<ActivityIcon size={16} />} onClick={() => onNavigate('activity')}
          hint={activityLogs.length ? `Last change ${relTime(activityLogs[0].created_at)}` : 'Quiet so far'} helpKey="hub-activity">
          {activityLogs.slice(0, 3).map((l) => (
            <p key={l.id} className="truncate text-xs text-slate-600">
              <span className="text-slate-400">{relTime(l.created_at)}</span> {memberMap[l.actor_id] ? <span className="font-medium text-slate-700">{memberMap[l.actor_id]}</span> : null} {describe(l)}
            </p>
          ))}
        </Tile>
      </div>

      {/* ── Details beside the schedule ── */}
      <div className="grid gap-3 lg:grid-cols-5">
        <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2" data-help="hub-details">
          <h3 className="text-sm font-semibold text-slate-900">Project details</h3>
          <dl className="mt-3 divide-y divide-slate-100 text-xs">
            {details.map((d) => (
              <div key={d.label} className="grid grid-cols-3 gap-2 py-1.5">
                <dt className="text-slate-400">{d.label}</dt>
                <dd className="col-span-2 min-w-0 break-words text-slate-800">{d.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Schedule at a glance</h3>
            <button onClick={() => onNavigate('gantt')} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
              Open Gantt <ArrowUpRight size={12} />
            </button>
          </div>
          <div className="mt-3 max-h-[420px] overflow-y-auto pr-1">
            <MiniGantt phases={phases} maxRows={40} onOpen={() => onNavigate('gantt')} />
          </div>
          {commandCenter.upcoming.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Coming up</p>
              <ul className="mt-1 space-y-0.5">
                {commandCenter.upcoming.slice(0, 5).map((u, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-slate-600">
                    <span className="w-14 shrink-0 text-slate-400">{formatDate(u.date, 'MMM d')}</span>
                    <span className="truncate">{u.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
