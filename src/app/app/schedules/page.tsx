import { redirect } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { canUseSchedules } from '@/lib/constants'
import { UpgradeGate } from '@/components/billing/UpgradeGate'
import { SchedulesClient } from './SchedulesClient'

export const dynamic = 'force-dynamic'

// Sunday of the week containing `d` (UTC date math on yyyy-mm-dd strings).
function sundayOf(d: Date): string {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  x.setUTCDate(x.getUTCDate() - x.getUTCDay())
  return x.toISOString().slice(0, 10)
}

export default async function SchedulesPage({ searchParams }: {
  searchParams: Promise<{ team?: string; week?: string; division?: string }>
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

  const [{ data: sups }, { data: company }, { data: directory }] = await Promise.all([
    supabase.from('superintendents').select('id, name, roster, division')
      .eq('company_id', profile.company_id).eq('is_active', true).order('name'),
    supabase.from('companies').select('schedule_job_url_template, plan').eq('id', profile.company_id).single(),
    supabase.from('schedule_directory').select('id, title, job_number, division')
      .eq('company_id', profile.company_id).order('title'),
  ])

  if (!canUseSchedules(company?.plan)) {
    return (
      <UpgradeGate icon={CalendarDays} title="Schedules is a paid feature">
        Weekly crew schedules with drag-to-fill, one-click email copies, and per-department
        project lists are available on the Individual, Pro, and Business plans.
      </UpgradeGate>
    )
  }
  const allTeams = (sups ?? []).map((s) => ({
    id: s.id, name: s.name,
    roster: (s.roster as string[] | null) ?? [],
    division: (s.division as string | null) ?? null,
  }))
  const jobUrlTemplate = (company?.schedule_job_url_template as string | null) ?? null

  // Departments come from both teams and directory projects (a department can
  // hold projects before its first team exists). '' = no department.
  const divisions = [...new Set([
    ...allTeams.map((t) => t.division ?? ''),
    ...(directory ?? []).map((d) => (d.division as string | null) ?? ''),
  ])].sort((a, b) => a.localeCompare(b))

  const teamFromParam = allTeams.find((t) => t.id === params.team)
  const division = params.division !== undefined && divisions.includes(params.division)
    ? params.division
    : teamFromParam ? (teamFromParam.division ?? '') : (divisions[0] ?? '')
  const teams = allTeams.filter((t) => (t.division ?? '') === division)

  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(params.week ?? '') ? params.week! : sundayOf(new Date())
  const teamId = teams.find((t) => t.id === params.team)?.id ?? teams[0]?.id ?? null

  // Fetch the WHOLE week (every team) in one pass: the selected team's board
  // renders from it, and "Copy all" gets every other team's schedule too.
  const { data: jobRows } = await supabase.from('schedule_jobs')
    .select('id, title, job_number, shift_label, sort_order, superintendent_id')
    .eq('company_id', profile.company_id).eq('week_start', weekStart)
    .order('sort_order')
  const ids = (jobRows ?? []).map((j) => j.id)
  const { data: assignRows } = ids.length
    ? await supabase.from('schedule_assignments').select('schedule_job_id, day, techs').in('schedule_job_id', ids)
    : { data: [] }
  const withDays = (jobRows ?? []).map((j) => ({
    ...j,
    days: Object.fromEntries(
      (assignRows ?? []).filter((a) => a.schedule_job_id === j.id).map((a) => [a.day, a.techs as string[]]),
    ),
  }))

  const jobs = teamId ? withDays.filter((j) => j.superintendent_id === teamId) : []
  // Every team with at least one job this week, for the Copy All button.
  const allWeek = allTeams
    .map((t) => ({
      id: t.id, name: t.name, division: t.division, roster: t.roster,
      jobs: withDays.filter((j) => j.superintendent_id === t.id),
    }))
    .filter((t) => t.jobs.length > 0)

  return (
    <SchedulesClient
      teams={teams}
      teamId={teamId}
      weekStart={weekStart}
      jobs={jobs}
      canEdit={canEdit}
      jobUrlTemplate={jobUrlTemplate}
      directory={directory ?? []}
      division={division}
      divisions={divisions}
      hasAnyTeams={allTeams.length > 0}
      allWeek={allWeek}
    />
  )
}
