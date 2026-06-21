import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MyWorkClient } from './MyWorkClient'

export const dynamic = 'force-dynamic'

export interface MyTask {
  id: string
  title: string
  is_completed: boolean
  phaseName: string | null
  projectId: string | null
  projectName: string
  projectColor: string
}

export interface MyPhase {
  id: string
  name: string
  status: string
  start_date: string
  end_date: string
  projectId: string
  projectName: string
  projectColor: string
}

export interface MyPunch {
  id: string
  number: number | null
  title: string | null
  issue_description: string
  status: string
  projectId: string
  projectName: string
  projectColor: string
}

export default async function MyWorkPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('company_id, full_name').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/signup')

  const [tasksRes, phasesRes, punchRes] = await Promise.all([
    supabase
      .from('phase_checklists')
      .select('id, title, is_completed, assigned_to, phase:phases(name, project:projects(id, name, color))')
      .eq('assigned_to', user.id)
      .order('is_completed', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('phases')
      .select('id, name, status, start_date, end_date, assigned_to, project:projects(id, name, color)')
      .eq('assigned_to', user.id)
      .order('end_date', { ascending: true }),
    // Punch items assigned to me (fail-soft if punch_items isn't migrated yet).
    supabase
      .from('punch_items')
      .select('id, number, title, issue_description, status, assigned_to, project:projects(id, name, color)')
      .eq('assigned_to', user.id)
      .order('number', { ascending: true }),
  ])

  const tasks: MyTask[] = ((tasksRes.data ?? []) as unknown[]).map((row) => {
    const r = row as { id: string; title: string; is_completed: boolean; phase?: { name?: string; project?: { id: string; name: string; color: string } } }
    return {
      id: r.id,
      title: r.title,
      is_completed: r.is_completed,
      phaseName: r.phase?.name ?? null,
      projectId: r.phase?.project?.id ?? null,
      projectName: r.phase?.project?.name ?? 'Project',
      projectColor: r.phase?.project?.color ?? '#6366f1',
    }
  })

  const phases: MyPhase[] = ((phasesRes.data ?? []) as unknown[]).map((row) => {
    const r = row as { id: string; name: string; status: string; start_date: string; end_date: string; project?: { id: string; name: string; color: string } }
    return {
      id: r.id,
      name: r.name,
      status: r.status,
      start_date: r.start_date,
      end_date: r.end_date,
      projectId: r.project?.id ?? '',
      projectName: r.project?.name ?? 'Project',
      projectColor: r.project?.color ?? '#6366f1',
    }
  })

  const punch: MyPunch[] = ((punchRes.data ?? []) as unknown[]).map((row) => {
    const r = row as { id: string; number: number | null; title: string | null; issue_description: string; status: string; project?: { id: string; name: string; color: string } }
    return {
      id: r.id,
      number: r.number,
      title: r.title,
      issue_description: r.issue_description,
      status: r.status,
      projectId: r.project?.id ?? '',
      projectName: r.project?.name ?? 'Project',
      projectColor: r.project?.color ?? '#6366f1',
    }
  })

  return <MyWorkClient firstName={(profile.full_name ?? '').split(' ')[0]} tasks={tasks} phases={phases} punch={punch} />
}
