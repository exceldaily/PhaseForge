import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Edit, GanttChartSquare } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PhaseList } from '@/components/phases/PhaseList'
import { DeleteProjectButton } from '@/components/projects/DeleteProjectButton'
import { PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS } from '@/lib/constants'
import { formatDate } from '@/lib/dates'
import { Phase, Profile, ProjectStatus, ProjectPriority } from '@/types/app'

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

  const { data: project } = await supabase
    .from('projects')
    .select('*, phases(*)')
    .eq('id', id)
    .single()

  if (!project) notFound()

  const { data: members = [] } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url, role')
    .eq('company_id', profile.company_id)

  const phases = (project.phases || []).sort((a: Phase, b: Phase) => a.sort_order - b.sort_order)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Back + actions */}
      <div className="flex items-center justify-between">
        <Link href="/app/projects" className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft size={16} /> All projects
        </Link>
        <div className="flex gap-2">
          <Link href={`/app/gantt?project=${project.id}`}>
            <Button variant="secondary" size="sm"><GanttChartSquare size={15} /> View Gantt</Button>
          </Link>
          <Link href={`/app/projects/${project.id}/edit`}>
            <Button variant="secondary" size="sm"><Edit size={15} /> Edit</Button>
          </Link>
          {profile.role !== 'viewer' && (
            <DeleteProjectButton projectId={project.id} projectName={project.name} />
          )}
        </div>
      </div>

      {/* Project header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start gap-4">
          <div className="h-4 w-4 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: project.color }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">{project.name}</h1>
                {project.customer_name && <p className="text-slate-500 mt-0.5">{project.customer_name}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge className={PRIORITY_COLORS[project.priority as ProjectPriority]}>
                  {PRIORITY_LABELS[project.priority as ProjectPriority]}
                </Badge>
                <Badge className={PROJECT_STATUS_COLORS[project.status as ProjectStatus]}>
                  {PROJECT_STATUS_LABELS[project.status as ProjectStatus]}
                </Badge>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-100">
              <InfoCell label="Location" value={project.job_location || '—'} />
              <InfoCell label="Start date" value={formatDate(project.start_date)} />
              <InfoCell label="End date" value={formatDate(project.end_date)} />
              <InfoCell label="Phases" value={String(phases.length)} />
            </div>
            {project.notes && (
              <p className="mt-4 text-sm text-slate-600 bg-slate-50 rounded-lg p-3">{project.notes}</p>
            )}
          </div>
        </div>
      </div>

      {/* Phases */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Phases ({phases.length})</h2>
        </div>
        <PhaseList
          projectId={project.id}
          companyId={profile.company_id}
          phases={phases}
          members={members as Profile[]}
          currentUserId={user.id}
          canEdit={profile.role !== 'viewer'}
        />
      </div>
    </div>
  )
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-slate-800 mt-0.5">{value}</p>
    </div>
  )
}
