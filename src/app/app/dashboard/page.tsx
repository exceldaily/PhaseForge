import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Clock, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS } from '@/lib/constants'
import { formatDate, isOverdue } from '@/lib/dates'
import { Project, ProjectStatus } from '@/types/app'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/signup')

  const { data: projects = [] } = await supabase
    .from('projects')
    .select('*, phases(*)')
    .eq('company_id', profile.company_id)
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })

  const allPhases = (projects as Project[]).flatMap((project) =>
    (project.phases || []).map((phase) => ({
      ...phase,
      projectId: project.id,
      projectName: project.name,
    }))
  )
  const today = new Date().toISOString().split('T')[0]

  const stats = {
    active: (projects as Project[]).filter(p => p.status === 'active').length,
    planning: (projects as Project[]).filter(p => p.status === 'planning').length,
    completed: (projects as Project[]).filter(p => p.status === 'completed').length,
    overdue: allPhases.filter(ph => isOverdue(ph.end_date, ph.status)).length,
  }

  const overdueProjects = (projects as Project[]).filter(p =>
    p.status !== 'completed' && p.status !== 'cancelled' && p.end_date < today
  )

  const upcomingPhases = allPhases
    .filter(ph => ph.start_date >= today && ph.status === 'not_started')
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, 5)

  const recentProjects = (projects as Project[]).slice(0, 5)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Good {getGreeting()}, {profile.full_name.split(' ')[0]}
        </h1>
        <p className="text-slate-500 mt-1">Here&apos;s what&apos;s happening across your projects today.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<TrendingUp size={20} />} label="Active Projects" value={stats.active} color="indigo" />
        <StatCard icon={<Clock size={20} />} label="In Planning" value={stats.planning} color="violet" />
        <StatCard icon={<CheckCircle2 size={20} />} label="Completed" value={stats.completed} color="emerald" />
        <StatCard icon={<AlertTriangle size={20} />} label="Overdue Phases" value={stats.overdue} color={stats.overdue > 0 ? 'rose' : 'slate'} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Projects */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Recent Projects</h2>
            <Link href="/app/projects" className="text-sm text-indigo-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recentProjects.length === 0 && (
              <div className="px-6 py-12 text-center text-slate-400 text-sm">
                No projects yet. <Link href="/app/projects/new" className="text-indigo-600 hover:underline">Create your first project</Link>
              </div>
            )}
            {recentProjects.map(project => (
              <Link key={project.id} href={`/app/projects/${project.id}`} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{project.name}</p>
                    {project.customer_name && <p className="text-xs text-slate-400">{project.customer_name}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">{formatDate(project.end_date)}</span>
                  <Badge className={PROJECT_STATUS_COLORS[project.status as ProjectStatus]}>
                    {PROJECT_STATUS_LABELS[project.status as ProjectStatus]}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Overdue alert */}
          {overdueProjects.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={16} className="text-rose-600" />
                <span className="text-sm font-semibold text-rose-800">{overdueProjects.length} Overdue Project{overdueProjects.length > 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-2">
                {overdueProjects.slice(0, 3).map(p => (
                  <Link key={p.id} href={`/app/projects/${p.id}`} className="block text-sm text-rose-700 hover:underline truncate">{p.name}</Link>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming phases */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900 text-sm">Upcoming Phases</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {upcomingPhases.length === 0 && (
                <p className="px-5 py-8 text-center text-xs text-slate-400">No upcoming phases</p>
              )}
              {upcomingPhases.map(phase => (
                <div key={phase.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-slate-800">{phase.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{phase.projectName}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{formatDate(phase.start_date)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number; color: string
}) {
  const colors: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    violet: 'bg-violet-50 text-violet-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    slate: 'bg-slate-50 text-slate-500',
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className={`inline-flex p-2 rounded-xl mb-3 ${colors[color]}`}>{icon}</div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500 mt-0.5">{label}</p>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
