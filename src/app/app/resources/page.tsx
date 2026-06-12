import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BoardFilter } from '@/components/boards/BoardFilter'
import { BOARD_FILTER_NONE, BoardOption, resolveBoardFilter } from '@/lib/boardFilter'
import { getStoredBoardFilter } from '@/lib/boardFilter.server'
import { Phase, Project } from '@/types/app'
import { formatDate, differenceInDays, parseISO } from '@/lib/dates'

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ board?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
  const storedBoardFilter = await getStoredBoardFilter()
  const boardFilter = resolveBoardFilter(params.board, boards, storedBoardFilter)

  let projectsQuery = supabase
    .from('projects')
    .select('*, phases(*)')
    .eq('company_id', profile.company_id)
    .eq('is_archived', false)
    .neq('status', 'closed')
  if (boardFilter === BOARD_FILTER_NONE) {
    projectsQuery = projectsQuery.is('board_id', null)
  } else if (boardFilter) {
    projectsQuery = projectsQuery.eq('board_id', boardFilter)
  }

  const [projectsRes, membersRes] = await Promise.all([
    projectsQuery,
    supabase.from('profiles').select('id, full_name, job_title, email').eq('company_id', profile.company_id).eq('is_active', true),
  ])

  const projects = (projectsRes.data ?? []) as Project[]
  const members = membersRes.data ?? []
  const today = new Date().toISOString().split('T')[0]
  const allPhases = projects.flatMap(p => (p.phases ?? []).map((ph: Phase) => ({
    ...ph,
    projectName: p.name,
    projectColor: p.color,
    projectId: p.id,
  })))

  // Build workload per member
  const memberWorkload = members.map(member => {
    const phases = allPhases.filter(ph => ph.assigned_to === member.id)
    const active = phases.filter(ph => ph.status === 'in_progress' && ph.start_date <= today && ph.end_date >= today)
    const upcoming = phases.filter(ph => ph.status === 'not_started' && ph.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date))
    const overdue = phases.filter(ph => !['completed', 'skipped'].includes(ph.status) && ph.end_date < today)
    const done = phases.filter(ph => ph.status === 'completed')

    // Total days committed (active + upcoming)
    const committedDays = [...active, ...upcoming].reduce((sum, ph) =>
      sum + Math.max(differenceInDays(parseISO(ph.end_date), parseISO(ph.start_date)) + 1, 1), 0)

    return { member, phases, active, upcoming, overdue, done, committedDays }
  }).sort((a, b) => b.phases.length - a.phases.length)

  // Unassigned phases
  const unassigned = allPhases.filter(ph =>
    !ph.assigned_to && !ph.assigned_trade && !['completed', 'skipped'].includes(ph.status)
  )

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Resource Planning</h1>
          <p className="text-slate-500 mt-1 text-sm">Team capacity, workload, and phase assignments.</p>
        </div>
        <BoardFilter boards={boards} selectedBoardId={boardFilter} />
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Team Members" value={members.length} accent="indigo" />
        <KpiCard label="Active Phases" value={allPhases.filter(ph => ph.status === 'in_progress').length} accent="emerald" />
        <KpiCard label="Unassigned Phases" value={unassigned.length} accent={unassigned.length > 0 ? 'amber' : 'slate'} />
        <KpiCard label="Overdue Phases" value={allPhases.filter(ph => !['completed', 'skipped'].includes(ph.status) && ph.end_date < today).length} accent="rose" />
      </div>

      {/* Unassigned alert */}
      {unassigned.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-800 mb-3">{unassigned.length} unassigned phase{unassigned.length !== 1 ? 's' : ''} — no person or trade assigned</p>
          <div className="flex flex-wrap gap-2">
            {unassigned.slice(0, 8).map(ph => (
              <span key={ph.id} className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-medium text-amber-700">
                {ph.projectName} › {ph.name}
              </span>
            ))}
            {unassigned.length > 8 && <span className="text-xs text-amber-600">+{unassigned.length - 8} more</span>}
          </div>
        </div>
      )}

      {/* Member workload cards */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {memberWorkload.map(({ member, phases, active, upcoming, overdue, done, committedDays }) => (
          <div key={member.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900">{member.full_name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{member.job_title ?? member.email}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-slate-900">{phases.length}</p>
                <p className="text-xs text-slate-400">phases</p>
              </div>
            </div>

            {/* Status breakdown */}
            <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
              <Stat label="Active" value={active.length} color="text-indigo-600" />
              <Stat label="Upcoming" value={upcoming.length} color="text-slate-600" />
              <Stat label="Overdue" value={overdue.length} color={overdue.length > 0 ? 'text-rose-600' : 'text-slate-400'} />
            </div>

            {/* Stacked capacity bar */}
            {phases.length > 0 && (
              <div className="px-5 py-3">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                  <span>Capacity (committed days)</span>
                  <span className="font-medium text-slate-600">{committedDays}d</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden flex">
                  <div className="h-full bg-rose-400" style={{ width: `${Math.min((overdue.length / Math.max(phases.length, 1)) * 100, 100)}%` }} />
                  <div className="h-full bg-indigo-500" style={{ width: `${Math.min((active.length / Math.max(phases.length, 1)) * 100, 100)}%` }} />
                  <div className="h-full bg-slate-300" style={{ width: `${Math.min((upcoming.length / Math.max(phases.length, 1)) * 100, 100)}%` }} />
                  <div className="h-full bg-emerald-400" style={{ width: `${Math.min((done.length / Math.max(phases.length, 1)) * 100, 100)}%` }} />
                </div>
              </div>
            )}

            {/* Upcoming phases list */}
            {upcoming.length > 0 && (
              <div className="px-5 pb-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mt-1">Next up</p>
                {upcoming.slice(0, 3).map(ph => (
                  <div key={ph.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: ph.projectColor }} />
                      <span className="text-xs text-slate-700 truncate">{ph.name}</span>
                    </div>
                    <span className="text-xs text-slate-400 flex-shrink-0">{formatDate(ph.start_date, 'MMM d')}</span>
                  </div>
                ))}
              </div>
            )}

            {phases.length === 0 && (
              <p className="px-5 py-4 text-xs text-slate-400">No phases assigned</p>
            )}
          </div>
        ))}
      </div>

      {members.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center">
          <p className="text-slate-400 text-sm">No team members yet. Invite members in Settings → Team.</p>
        </div>
      )}
    </div>
  )
}

function KpiCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  const colors: Record<string, string> = {
    indigo: 'text-indigo-600', emerald: 'text-emerald-600',
    rose: 'text-rose-600', amber: 'text-amber-600', slate: 'text-slate-500',
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">{label}</p>
      <p className={`text-3xl font-bold ${colors[accent] ?? 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="px-4 py-3 text-center">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  )
}
