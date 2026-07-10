import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SchedulesClient } from './SchedulesClient'

export const dynamic = 'force-dynamic'

// Sunday of the week containing `d` (UTC date math on yyyy-mm-dd strings).
function sundayOf(d: Date): string {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  x.setUTCDate(x.getUTCDate() - x.getUTCDay())
  return x.toISOString().slice(0, 10)
}

export default async function SchedulesPage({ searchParams }: {
  searchParams: Promise<{ team?: string; week?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles').select('company_id, ops_role, role').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/app/dashboard')
  const canEdit = ['owner', 'admin', 'manager', 'dispatcher'].includes(profile.ops_role ?? '') ||
    ['owner', 'admin'].includes(profile.role ?? '')

  const { data: sups } = await supabase
    .from('superintendents').select('id, name')
    .eq('company_id', profile.company_id).eq('is_active', true).order('name')
  const teams = sups ?? []

  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(params.week ?? '') ? params.week! : sundayOf(new Date())
  const teamId = teams.find((t) => t.id === params.team)?.id ?? teams[0]?.id ?? null

  let jobs: {
    id: string; title: string; job_number: string | null; shift_label: string | null
    sort_order: number; days: Record<number, string[]>
  }[] = []

  if (teamId) {
    const { data: jobRows } = await supabase.from('schedule_jobs')
      .select('id, title, job_number, shift_label, sort_order')
      .eq('company_id', profile.company_id)
      .eq('superintendent_id', teamId).eq('week_start', weekStart)
      .order('sort_order')
    const ids = (jobRows ?? []).map((j) => j.id)
    const { data: assignRows } = ids.length
      ? await supabase.from('schedule_assignments').select('schedule_job_id, day, techs').in('schedule_job_id', ids)
      : { data: [] }
    jobs = (jobRows ?? []).map((j) => ({
      ...j,
      days: Object.fromEntries(
        (assignRows ?? []).filter((a) => a.schedule_job_id === j.id).map((a) => [a.day, a.techs as string[]]),
      ),
    }))
  }

  return (
    <SchedulesClient
      teams={teams}
      teamId={teamId}
      weekStart={weekStart}
      jobs={jobs}
      canEdit={canEdit}
    />
  )
}
