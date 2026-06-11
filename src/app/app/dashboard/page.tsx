import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Flag,
  FolderKanban,
  Gauge,
  Users,
} from 'lucide-react'
import { BoardFilter } from '@/components/boards/BoardFilter'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { BOARD_FILTER_NONE, BoardOption, resolveBoardFilter } from '@/lib/boardFilter'
import {
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  PROJECT_STATUS_COLORS,
  PROJECT_STATUS_LABELS,
} from '@/lib/constants'
import { addDays, differenceInDays, format, formatDate, isOverdue } from '@/lib/dates'
import { getProjectProgressFromPhases } from '@/lib/phaseProgress'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { Phase, Profile, Project, ProjectPriority, ProjectStatus } from '@/types/app'

type ProjectWithPhases = Project & { phases?: Phase[] }

type PhaseWithProject = Phase & {
  projectId: string
  projectName: string
  projectColor: string
  projectManagerName: string | null
  assignedName: string | null
  isMilestone?: boolean
}

type TeamRow = {
  id: string
  name: string
  color: string
  team_members: { profile_id: string }[]
  project_teams: { project_id: string }[]
}

type DashboardActivity = {
  id: string
  action: string
  created_at: string
  project_id: string | null
  payload?: Record<string, unknown> | null
  actor?: { full_name: string; avatar_url: string | null }[] | null
}

type TaskGroup = {
  projectId: string
  projectName: string
  projectColor: string
  phases: PhaseWithProject[]
}

const ACTIVE_PROJECT_STATUSES: ProjectStatus[] = [
  'mobilization',
  'construction_initiated',
  'pct_30',
  'pct_60',
  'pct_90',
  'final_punchlist',
  'closeout',
  'active',
]

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ board?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/signup')

  const { data: boardsData } = await supabase
    .from('boards')
    .select('id, name, color')
    .eq('company_id', profile.company_id)
    .order('sort_order', { ascending: true })
    .order('name')
  const boards = (boardsData ?? []) as BoardOption[]
  const boardFilter = resolveBoardFilter(params.board, boards)

  let projectsQuery = supabase
    .from('projects')
    .select('*, phases(*)')
    .eq('company_id', profile.company_id)
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })
  if (boardFilter === BOARD_FILTER_NONE) {
    projectsQuery = projectsQuery.is('board_id', null)
  } else if (boardFilter) {
    projectsQuery = projectsQuery.eq('board_id', boardFilter)
  }

  const [projectsRes, membersRes, teamsRes, activityRes] = await Promise.all([
    projectsQuery,
    supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, role, job_title')
      .eq('company_id', profile.company_id)
      .eq('is_active', true),
    supabase
      .from('teams')
      .select('id, name, color, team_members(profile_id), project_teams(project_id)')
      .eq('company_id', profile.company_id)
      .order('name'),
    supabase
      .from('activity_logs')
      .select('id, action, created_at, project_id, payload, actor:profiles(full_name, avatar_url)')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  const projects = (projectsRes.data ?? []) as ProjectWithPhases[]
  const members = (membersRes.data ?? []) as Profile[]
  const teams = (teamsRes.data ?? []) as TeamRow[]

  const memberNameMap = Object.fromEntries(
    members.map((member) => [member.id, member.full_name])
  ) as Record<string, string>
  const projectMap = Object.fromEntries(projects.map((project) => [project.id, project])) as Record<
    string,
    ProjectWithPhases
  >

  // With a board selected, only show activity tied to that board's projects.
  const recentActivity = ((activityRes.data ?? []) as DashboardActivity[])
    .filter((log) => !boardFilter || (log.project_id && projectMap[log.project_id]))
    .slice(0, 10)

  const today = format(new Date(), 'yyyy-MM-dd')
  const weekEnd = format(addDays(new Date(), 7), 'yyyy-MM-dd')

  const allPhases: PhaseWithProject[] = projects.flatMap((project) =>
    (project.phases || []).map((phase) => ({
      ...phase,
      projectId: project.id,
      projectName: project.name,
      projectColor: project.color,
      projectManagerName: resolveMemberName(project.project_manager, memberNameMap),
      assignedName: resolveMemberName(phase.assigned_to, memberNameMap),
      isMilestone: Boolean((phase as Phase & { is_milestone?: boolean }).is_milestone),
    }))
  )

  const activeProjects = projects
    .filter((project) => ACTIVE_PROJECT_STATUSES.includes(project.status))
    .sort((a, b) => a.end_date.localeCompare(b.end_date))

  const atRiskProjects = activeProjects.filter(
    (project) => project.end_date < today || project.end_date <= weekEnd
  )

  const tasksDueThisWeek = allPhases
    .filter(
      (phase) =>
        phase.start_date >= today &&
        phase.start_date <= weekEnd &&
        !['completed', 'skipped'].includes(phase.status)
    )
    .sort((a, b) => {
      if (a.start_date !== b.start_date) return a.start_date.localeCompare(b.start_date)
      return a.projectName.localeCompare(b.projectName)
    })

  const tasksByProject = Object.values(
    tasksDueThisWeek.reduce<Record<string, TaskGroup>>((groups, phase) => {
      if (!groups[phase.projectId]) {
        groups[phase.projectId] = {
          projectId: phase.projectId,
          projectName: phase.projectName,
          projectColor: phase.projectColor,
          phases: [],
        }
      }
      groups[phase.projectId].phases.push(phase)
      return groups
    }, {})
  ).sort((a, b) => a.phases[0].start_date.localeCompare(b.phases[0].start_date))

  const milestones = allPhases
    .filter(
      (phase) =>
        phase.isMilestone &&
        phase.end_date >= today &&
        !['completed', 'skipped'].includes(phase.status)
    )
    .sort((a, b) => a.end_date.localeCompare(b.end_date))
    .slice(0, 8)

  const teamCapacity = teams
    .map((team) => {
      const memberIds = new Set(team.team_members.map((member) => member.profile_id))
      const projectIds = new Set(
        team.project_teams
          .map((assignment) => assignment.project_id)
          .filter((projectId) => projectMap[projectId])
      )
      const teamOpenPhases = allPhases.filter(
        (phase) =>
          projectIds.has(phase.projectId) &&
          Boolean(phase.assigned_to) &&
          memberIds.has(phase.assigned_to as string) &&
          !['completed', 'skipped'].includes(phase.status)
      )
      const assignedMemberIds = new Set(
        teamOpenPhases
          .map((phase) => phase.assigned_to)
          .filter((value): value is string => Boolean(value))
      )

      return {
        id: team.id,
        name: team.name,
        color: team.color,
        memberCount: memberIds.size,
        assignedMemberCount: assignedMemberIds.size,
        utilization: memberIds.size === 0 ? 0 : Math.round((assignedMemberIds.size / memberIds.size) * 100),
        openPhaseCount: teamOpenPhases.length,
        projectCount: projectIds.size,
      }
    })
    .sort((a, b) => b.utilization - a.utilization || b.openPhaseCount - a.openPhaseCount)

  const completionSeries = activeProjects
    .slice()
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
    .slice(-8)
    .map(getProjectCompletion)
  const averageCompletion = completionSeries.length
    ? Math.round(completionSeries.reduce((sum, value) => sum + value, 0) / completionSeries.length)
    : 0

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Good {getGreeting()}, {profile.full_name.split(' ')[0]}
          </h1>
          <p className="text-sm text-slate-500">
            Keep the team focused on active jobs, near-term work, and anything that needs attention this week.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BoardFilter boards={boards} selectedBoardId={boardFilter} />
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 shadow-sm">
              {activeProjects.length} active project{activeProjects.length !== 1 ? 's' : ''}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 shadow-sm">
              {tasksDueThisWeek.length} task{tasksDueThisWeek.length !== 1 ? 's' : ''} due this week
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<FolderKanban size={18} />}
          title="Active Projects"
          value={activeProjects.length}
          tone="indigo"
          helper={
            activeProjects.length === 0
              ? 'No live jobs in progress'
              : `${activeProjects.filter((project) => project.end_date <= weekEnd).length} finishing soon`
          }
        />
        <SummaryCard
          icon={<AlertTriangle size={18} />}
          title="At Risk"
          value={atRiskProjects.length}
          tone={atRiskProjects.length > 0 ? 'rose' : 'slate'}
          helper={
            atRiskProjects.length === 0
              ? 'Everything is on schedule'
              : `${atRiskProjects.filter((project) => project.end_date < today).length} already overdue`
          }
        />
        <SummaryCard
          icon={<CalendarClock size={18} />}
          title="Tasks Due This Week"
          value={tasksDueThisWeek.length}
          tone="amber"
          helper={
            tasksDueThisWeek.length === 0
              ? 'No starts scheduled this week'
              : `${tasksByProject.length} project${tasksByProject.length !== 1 ? 's' : ''} involved`
          }
        />
        <SummaryCard
          icon={<Gauge size={18} />}
          title="Completion Percentage"
          value={`${averageCompletion}%`}
          tone="emerald"
          helper="Average across active projects"
        >
          <div className="mt-3">
            <Sparkline values={completionSeries} />
          </div>
        </SummaryCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DashboardCard
          title="Active Projects"
          subtitle="Due dates, PM ownership, and progress across work in motion"
          icon={<FolderKanban size={16} />}
          actionHref="/app/projects"
          actionLabel="View projects"
        >
          {activeProjects.length === 0 ? (
            <EmptyState>No active projects right now.</EmptyState>
          ) : (
            <div className="space-y-3">
              {activeProjects.slice(0, 6).map((project) => {
                const completion = getProjectCompletion(project)
                const phaseCount = project.phases?.length ?? 0

                return (
                  <Link
                    key={project.id}
                    href={`/app/projects/${project.id}`}
                    className="block rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition-colors hover:border-indigo-200 hover:bg-indigo-50/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: project.color }}
                          />
                          <p className="truncate text-sm font-semibold text-slate-900">{project.name}</p>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span>Due {formatDate(project.end_date, 'MMM d')}</span>
                          <span>PM: {resolveMemberName(project.project_manager, memberNameMap) ?? 'Unassigned'}</span>
                          <span>{phaseCount} phase{phaseCount !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Badge className={PRIORITY_COLORS[project.priority as ProjectPriority]}>
                          {PRIORITY_LABELS[project.priority as ProjectPriority]}
                        </Badge>
                        <Badge className={PROJECT_STATUS_COLORS[project.status as ProjectStatus]}>
                          {PROJECT_STATUS_LABELS[project.status as ProjectStatus]}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${completion}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-slate-600">{completion}%</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </DashboardCard>

        <DashboardCard
          title="At Risk"
          subtitle="Overdue jobs and anything scheduled to finish within the next 7 days"
          icon={<AlertTriangle size={16} />}
        >
          {atRiskProjects.length === 0 ? (
            <EmptyState tone="emerald">No projects are currently at risk.</EmptyState>
          ) : (
            <div className="space-y-3">
              {atRiskProjects.slice(0, 6).map((project) => {
                const overdue = project.end_date < today
                const openOverduePhases = (project.phases || []).filter((phase) =>
                  isOverdue(phase.end_date, phase.status)
                ).length
                const blockedPhases = (project.phases || []).filter((phase) => phase.status === 'blocked').length
                const days = Math.abs(differenceInDays(new Date(project.end_date), new Date()))

                return (
                  <Link
                    key={project.id}
                    href={`/app/projects/${project.id}`}
                    className={cn(
                      'block rounded-2xl border p-4 transition-colors',
                      overdue
                        ? 'border-rose-200 bg-rose-50 hover:bg-rose-100/70'
                        : 'border-amber-200 bg-amber-50 hover:bg-amber-100/70'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: project.color }}
                          />
                          <p className="truncate text-sm font-semibold text-slate-900">{project.name}</p>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">
                          {overdue ? `${days} day${days !== 1 ? 's' : ''} past finish date` : `Finishes in ${days} day${days !== 1 ? 's' : ''}`}
                        </p>
                      </div>
                      <Badge className={overdue ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}>
                        {overdue ? 'Overdue' : 'Due This Week'}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      {blockedPhases > 0 && (
                        <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">
                          {blockedPhases} blocked phase{blockedPhases !== 1 ? 's' : ''}
                        </span>
                      )}
                      {openOverduePhases > 0 && (
                        <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">
                          {openOverduePhases} overdue phase{openOverduePhases !== 1 ? 's' : ''}
                        </span>
                      )}
                      <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">
                        PM: {resolveMemberName(project.project_manager, memberNameMap) ?? 'Unassigned'}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </DashboardCard>

        <DashboardCard
          title="Tasks Due This Week"
          subtitle="Phases scheduled to start over the next 7 days, grouped by project"
          icon={<CalendarClock size={16} />}
          actionHref="/app/gantt"
          actionLabel="Open Gantt"
        >
          {tasksByProject.length === 0 ? (
            <EmptyState>No phase starts are scheduled this week.</EmptyState>
          ) : (
            <div className="space-y-4">
              {tasksByProject.slice(0, 5).map((group) => (
                <div key={group.projectId} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <Link
                      href={`/app/projects/${group.projectId}`}
                      className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900 hover:text-indigo-600"
                    >
                      <span
                        className="h-3 w-3 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: group.projectColor }}
                      />
                      <span className="truncate">{group.projectName}</span>
                    </Link>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm">
                      {group.phases.length} task{group.phases.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.phases.slice(0, 3).map((phase) => (
                      <div key={phase.id} className="flex items-start justify-between gap-3 rounded-xl bg-white px-3 py-2 shadow-sm">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">{phase.name}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {phase.assignedName ?? phase.assigned_trade ?? 'No owner yet'}
                          </p>
                        </div>
                        <span className="whitespace-nowrap text-xs font-medium text-slate-500">
                          {formatDate(phase.start_date, 'MMM d')}
                        </span>
                      </div>
                    ))}
                    {group.phases.length > 3 && (
                      <p className="text-xs text-slate-400">+{group.phases.length - 3} more starting this week</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DashboardCard>

        <DashboardCard
          title="Team Capacity"
          subtitle="Members carrying active assigned work across each team's project portfolio"
          icon={<Users size={16} />}
          actionHref="/app/teams"
          actionLabel="Manage teams"
        >
          {teamCapacity.length === 0 ? (
            <EmptyState>No teams configured yet.</EmptyState>
          ) : (
            <div className="space-y-3">
              {teamCapacity.map((team) => (
                <div key={team.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: team.color }}
                        />
                        <p className="truncate text-sm font-semibold text-slate-900">{team.name}</p>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {team.assignedMemberCount} of {team.memberCount} members committed
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                      {team.utilization}%
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${team.utilization}%`, backgroundColor: team.color }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">
                      {team.openPhaseCount} open phase{team.openPhaseCount !== 1 ? 's' : ''}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">
                      {team.projectCount} linked project{team.projectCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DashboardCard>

        <DashboardCard
          title="Upcoming Milestones"
          subtitle="Milestone phases with owners and target dates"
          icon={<Flag size={16} />}
        >
          {milestones.length === 0 ? (
            <EmptyState tone="amber">
              No upcoming milestones are marked yet.
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {milestones.map((phase) => (
                <Link
                  key={phase.id}
                  href={`/app/projects/${phase.projectId}`}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition-colors hover:border-indigo-200 hover:bg-indigo-50/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{phase.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {phase.projectName} - {phase.assignedName ?? phase.assigned_trade ?? 'No owner yet'}
                    </p>
                  </div>
                  <span className="whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-500 shadow-sm">
                    {formatDate(phase.end_date, 'MMM d')}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </DashboardCard>

        <DashboardCard
          title="Recent Activity"
          subtitle="Latest updates across projects, phases, and coordination work"
          icon={<Activity size={16} />}
          actionHref="/app/projects"
          actionLabel="Open projects"
        >
          {recentActivity.length === 0 ? (
            <EmptyState>No activity recorded yet.</EmptyState>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((log) => {
                const project = log.project_id ? projectMap[log.project_id] : null

                return (
                <div key={log.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <Avatar
                      name={log.actor?.[0]?.full_name ?? 'Someone'}
                      avatarUrl={log.actor?.[0]?.avatar_url ?? null}
                      size="sm"
                      className="mt-0.5 flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800">
                        <span className="font-semibold">{log.actor?.[0]?.full_name ?? 'Someone'}</span>{' '}
                        <span className="text-slate-500">{formatAction(log.action)}</span>
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        {project ? (
                          <Link
                            href={`/app/projects/${project.id}`}
                            className="inline-flex items-center gap-1 hover:text-indigo-600"
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: project.color }}
                            />
                            {project.name}
                          </Link>
                        ) : (
                          <span>Organization activity</span>
                        )}
                        <span>{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </DashboardCard>
      </div>
    </div>
  )
}

function SummaryCard({
  icon,
  title,
  value,
  tone,
  helper,
  children,
}: {
  icon: ReactNode
  title: string
  value: string | number
  tone: 'indigo' | 'rose' | 'amber' | 'emerald' | 'slate'
  helper: string
  children?: ReactNode
}) {
  const toneClasses: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    rose: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    slate: 'bg-slate-100 text-slate-500',
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={cn('mb-3 inline-flex rounded-xl p-2.5', toneClasses[tone])}>{icon}</div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{helper}</p>
      {children}
    </div>
  )
}

function DashboardCard({
  title,
  subtitle,
  icon,
  actionHref,
  actionLabel,
  children,
}: {
  title: string
  subtitle: string
  icon: ReactNode
  actionHref?: string
  actionLabel?: string
  children: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-slate-100 p-2 text-slate-600">{icon}</span>
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          </div>
          <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
        </div>
        {actionHref && actionLabel && (
          <Link href={actionHref} className="text-xs font-medium text-indigo-600 hover:underline">
            {actionLabel}
          </Link>
        )}
      </div>
      {children}
    </div>
  )
}

function EmptyState({
  children,
  tone = 'slate',
}: {
  children: ReactNode
  tone?: 'slate' | 'emerald' | 'amber'
}) {
  const toneClasses: Record<string, string> = {
    slate: 'border-slate-200 bg-slate-50 text-slate-500',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
  }

  return (
    <div className={cn('rounded-2xl border px-4 py-10 text-center text-sm', toneClasses[tone])}>
      {children}
    </div>
  )
}

function Sparkline({ values }: { values: number[] }) {
  const safeValues = values.length >= 2 ? values : values.length === 1 ? [values[0], values[0]] : [0, 0]
  const width = 160
  const height = 44
  const maxValue = Math.max(...safeValues, 100)
  const minValue = Math.min(...safeValues, 0)
  const range = Math.max(maxValue - minValue, 1)

  const points = safeValues
    .map((value, index) => {
      const x = (index / Math.max(safeValues.length - 1, 1)) * width
      const y = height - ((value - minValue) / range) * height
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-11 w-full">
      <defs>
        <linearGradient id="dashboard-progress-line" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke="url(#dashboard-progress-line)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

function getProjectCompletion(project: ProjectWithPhases) {
  return getProjectProgressFromPhases(project.phases || [])
}

function resolveMemberName(memberId: string | null | undefined, memberNameMap: Record<string, string>) {
  if (!memberId) return null
  return memberNameMap[memberId] ?? memberId
}

function formatAction(action: string) {
  const actionMap: Record<string, string> = {
    project_updated: 'updated a project',
    project_created: 'created a project',
    phase_created: 'added a phase',
    phase_updated: 'updated a phase',
    phase_deleted: 'deleted a phase',
    comment_added: 'left a comment',
  }

  return actionMap[action] ?? action.replace(/_/g, ' ')
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}
