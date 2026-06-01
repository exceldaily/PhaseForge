import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { differenceInDays, parseISO } from '@/lib/dates'
import { KANBAN_COLUMNS, PHASE_STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants'
import { Phase, PhaseStatus, Project } from '@/types/app'

function pct(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 100)
}

const STATUS_COLORS: Record<string, string> = {
  queue: '#94a3b8', mobilization: '#f43f5e', construction_initiated: '#f97316',
  pct_30: '#f59e0b', pct_60: '#eab308', pct_90: '#84cc16',
  final_punchlist: '#14b8a6', closeout: '#10b981', closed: '#64748b',
  planning: '#94a3b8', active: '#6366f1', on_hold: '#f59e0b',
  completed: '#10b981', cancelled: '#f43f5e',
}

const PHASE_COLORS: Record<string, string> = {
  not_started: '#94a3b8', in_progress: '#6366f1',
  completed: '#10b981', blocked: '#f43f5e', skipped: '#d1d5db',
}

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/signup')

  const [projectsRes, membersRes] = await Promise.all([
    supabase.from('projects').select('*, phases(*)').eq('company_id', profile.company_id).eq('is_archived', false),
    supabase.from('profiles').select('id, full_name').eq('company_id', profile.company_id).eq('is_active', true),
  ])

  const projects = (projectsRes.data ?? []) as Project[]
  const members = membersRes.data ?? []
  const allPhases = projects.flatMap(p => (p.phases ?? []) as Phase[])
  const today = new Date().toISOString().split('T')[0]

  const totalProjects = projects.length
  const closedProjects = projects.filter(p => ['closed', 'closeout', 'completed'].includes(p.status)).length
  const overdueProjects = projects.filter(p =>
    !['closed', 'closeout', 'completed', 'cancelled'].includes(p.status) && p.end_date < today
  )
  const completionRate = pct(closedProjects, totalProjects)

  const projectsByStatus = KANBAN_COLUMNS.map(col => ({
    label: col.label, status: col.status,
    count: projects.filter(p => p.status === col.status).length,
    color: STATUS_COLORS[col.status] ?? '#94a3b8',
  })).filter(s => s.count > 0)

  const priorities = ['critical', 'high', 'medium', 'low'] as const
  const projectsByPriority = priorities.map(p => ({
    label: PRIORITY_LABELS[p],
    count: projects.filter(pr => pr.priority === p).length,
    color: p === 'critical' ? '#f43f5e' : p === 'high' ? '#f97316' : p === 'medium' ? '#6366f1' : '#94a3b8',
  }))

  const totalPhases = allPhases.length
  const phasesByStatus = (Object.keys(PHASE_STATUS_LABELS) as PhaseStatus[]).map(s => ({
    label: PHASE_STATUS_LABELS[s], status: s,
    count: allPhases.filter(ph => ph.status === s).length,
    color: PHASE_COLORS[s],
  })).filter(s => s.count > 0)

  const overduePhases = allPhases.filter(ph =>
    !['completed', 'skipped'].includes(ph.status) && ph.end_date < today
  ).length

  const phaseDurations = allPhases.map(ph =>
    differenceInDays(parseISO(ph.end_date), parseISO(ph.start_date)) + 1
  ).filter(d => d > 0)
  const avgPhaseDuration = phaseDurations.length
    ? Math.round(phaseDurations.reduce((a, b) => a + b, 0) / phaseDurations.length) : 0

  const projectDurations = projects.map(p =>
    differenceInDays(parseISO(p.end_date), parseISO(p.start_date)) + 1
  ).filter(d => d > 0)
  const avgProjectDuration = projectDurations.length
    ? Math.round(projectDurations.reduce((a, b) => a + b, 0) / projectDurations.length) : 0

  const workload = members.map(member => {
    const assigned = allPhases.filter(ph => ph.assigned_to === member.id)
    return {
      name: member.full_name,
      total: assigned.length,
      active: assigned.filter(ph => ph.status === 'in_progress').length,
      upcoming: assigned.filter(ph => ph.status === 'not_started').length,
      done: assigned.filter(ph => ph.status === 'completed').length,
    }
  }).filter(w => w.total > 0).sort((a, b) => b.total - a.total)

  const maxProjectStatus = Math.max(...projectsByStatus.map(s => s.count), 1)
  const maxWorkload = Math.max(...workload.map(w => w.total), 1)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <p className="text-slate-500 mt-1 text-sm">Performance overview across all your active projects.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Projects" value={totalProjects} sub="active & in progress" accent="indigo" />
        <KpiCard label="Completion Rate" value={`${completionRate}%`} sub={`${closedProjects} of ${totalProjects} closed`} accent="emerald" />
        <KpiCard label="Overdue Projects" value={overdueProjects.length} sub="past end date" accent={overdueProjects.length > 0 ? 'rose' : 'slate'} />
        <KpiCard label="Avg Project Length" value={`${avgProjectDuration}d`} sub="calendar days" accent="violet" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <ChartCard title="Projects by Status" sub={`${totalProjects} total`}>
          <div className="space-y-3 mt-2">
            {projectsByStatus.map(s => (
              <div key={s.status}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-700">{s.label}</span>
                  <span className="text-xs font-bold text-slate-900">{s.count}</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-100">
                  <div className="h-2.5 rounded-full transition-all"
                    style={{ width: `${pct(s.count, maxProjectStatus)}%`, backgroundColor: s.color }} />
                </div>
              </div>
            ))}
            {projectsByStatus.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">No projects yet</p>}
          </div>
        </ChartCard>

        <ChartCard title="Phase Status Breakdown" sub={`${totalPhases} total phases`}>
          {totalPhases === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">No phases yet</p>
          ) : (
            <div className="flex items-center gap-6 mt-2">
              <DonutChart segments={phasesByStatus.map(s => ({ value: s.count, color: s.color }))} total={totalPhases} />
              <div className="flex-1 space-y-2">
                {phasesByStatus.map(s => (
                  <div key={s.status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-xs text-slate-600">{s.label}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-800">
                      {s.count} <span className="font-normal text-slate-400">({pct(s.count, totalPhases)}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <ChartCard title="Projects by Priority" sub="">
          <div className="space-y-3 mt-2">
            {projectsByPriority.map(p => (
              <div key={p.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-700">{p.label}</span>
                  <span className="text-xs font-bold text-slate-900">{p.count}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100">
                  <div className="h-2 rounded-full"
                    style={{ width: `${pct(p.count, totalProjects || 1)}%`, backgroundColor: p.color }} />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Phase Health" sub="">
          <div className="grid grid-cols-2 gap-3 mt-3">
            <MiniStat label="Total Phases" value={totalPhases} color="text-slate-900" />
            <MiniStat label="Overdue" value={overduePhases} color={overduePhases > 0 ? 'text-rose-600' : 'text-slate-900'} />
            <MiniStat label="Completed" value={allPhases.filter(ph => ph.status === 'completed').length} color="text-emerald-600" />
            <MiniStat label="Avg Duration" value={`${avgPhaseDuration}d`} color="text-indigo-600" />
          </div>
        </ChartCard>

        <ChartCard title="Overdue Projects" sub={overdueProjects.length > 0 ? `${overdueProjects.length} past end date` : 'All on schedule'}>
          {overdueProjects.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">No overdue projects</p>
          ) : (
            <div className="space-y-2 mt-2">
              {overdueProjects.slice(0, 6).map(p => (
                <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                    <span className="text-xs font-medium text-slate-700 truncate">{p.name}</span>
                  </div>
                  <span className="text-xs text-rose-500 flex-shrink-0 ml-2">
                    {Math.abs(differenceInDays(parseISO(p.end_date), new Date()))}d late
                  </span>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      {workload.length > 0 && (
        <ChartCard title="Team Workload" sub="Phases assigned per member">
          <div className="mt-4 space-y-4">
            {workload.slice(0, 10).map(w => (
              <div key={w.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-800">{w.name}</span>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="text-indigo-600 font-medium">{w.active} active</span>
                    <span>{w.upcoming} upcoming</span>
                    <span className="text-emerald-600">{w.done} done</span>
                    <span className="font-bold text-slate-900">{w.total} total</span>
                  </div>
                </div>
                <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden flex">
                  <div className="h-full bg-emerald-400" style={{ width: `${pct(w.done, maxWorkload)}%` }} />
                  <div className="h-full bg-indigo-500" style={{ width: `${pct(w.active, maxWorkload)}%` }} />
                  <div className="h-full bg-slate-300" style={{ width: `${pct(w.upcoming, maxWorkload)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-4 rounded bg-emerald-400" /> Completed</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-4 rounded bg-indigo-500" /> In Progress</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-4 rounded bg-slate-300" /> Upcoming</span>
          </div>
        </ChartCard>
      )}
    </div>
  )
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub: string; accent: string }) {
  const colors: Record<string, string> = {
    indigo: 'text-indigo-600', emerald: 'text-emerald-600',
    rose: 'text-rose-600', violet: 'text-violet-600', slate: 'text-slate-500',
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">{label}</p>
      <p className={`text-3xl font-bold ${colors[accent] ?? 'text-slate-900'}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-1">{sub}</p>
    </div>
  )
}

function ChartCard({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="mb-1">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

function DonutChart({ segments, total }: { segments: { value: number; color: string }[]; total: number }) {
  const r = 52
  const circumference = 2 * Math.PI * r
  let offset = 0
  const slices = segments.map(s => {
    const length = (s.value / total) * circumference
    const slice = { ...s, length, offset }
    offset += length
    return slice
  })
  return (
    <svg width={128} height={128} viewBox="0 0 128 128" className="flex-shrink-0 -rotate-90">
      <circle cx={64} cy={64} r={r} fill="none" stroke="#f1f5f9" strokeWidth={18} />
      {slices.map((s, i) => (
        <circle key={i} cx={64} cy={64} r={r} fill="none" stroke={s.color} strokeWidth={18}
          strokeDasharray={`${Math.max(s.length - 2, 0)} ${circumference - Math.max(s.length - 2, 0)}`}
          strokeDashoffset={-s.offset} />
      ))}
    </svg>
  )
}
