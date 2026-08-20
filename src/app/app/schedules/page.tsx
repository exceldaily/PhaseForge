import { redirect } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { canUseSchedules } from '@/lib/constants'
import { UpgradeGate } from '@/components/billing/UpgradeGate'
import { SchedulesClient } from './SchedulesClient'

export const dynamic = 'force-dynamic'

// Directory projects tagged with this scope marker belong to EVERY department.
const ALL_DEPTS = '*'
// Pseudo-department shown in the picker: every crew, regardless of department.
export const EVERY_DEPT = '__all__'

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

  const [{ data: sups }, { data: company }, { data: directory }, { data: deptSettings }] = await Promise.all([
    supabase.from('superintendents').select('id, name, roster, division')
      .eq('company_id', profile.company_id).eq('is_active', true).order('name'),
    supabase.from('companies').select('schedule_job_url_template, plan').eq('id', profile.company_id).single(),
    supabase.from('schedule_directory').select('id, title, job_number, division')
      .eq('company_id', profile.company_id).order('title'),
    supabase.from('schedule_department_settings').select('division, style, shift_options')
      .eq('company_id', profile.company_id),
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
  // Per-department style + shift options ('' = the default department).
  const DEFAULT_SHIFTS = ['Days', 'Nights', 'Travel Day', 'As needed']
  const styleByDivision = new Map<string, { style: 'crew' | 'grid'; shiftOptions: string[] }>()
  for (const d of deptSettings ?? []) {
    styleByDivision.set((d.division as string | null) ?? '', {
      style: (d.style as string) === 'grid' ? 'grid' : 'crew',
      shiftOptions: ((d.shift_options as string[] | null) ?? DEFAULT_SHIFTS),
    })
  }

  // Departments come from both teams and directory projects (a department can
  // hold projects before its first team exists). '' = no department.
  const divisions = [...new Set([
    ...allTeams.map((t) => t.division ?? ''),
    ...(directory ?? []).map((d) => (d.division as string | null) ?? ''),
  ])]
    .filter((d) => d !== ALL_DEPTS)          // scope marker, not a department
    .sort((a, b) => a.localeCompare(b))

  const teamFromParam = allTeams.find((t) => t.id === params.team)
  // Offer "All departments" once there's more than one real department.
  const pickable = divisions.length > 1 ? [EVERY_DEPT, ...divisions] : divisions
  const firstPopulated = divisions.find((d) => allTeams.some((t) => (t.division ?? '') === d))
  const division = params.division !== undefined && pickable.includes(params.division)
    ? params.division
    : teamFromParam ? (teamFromParam.division ?? '') : (firstPopulated ?? divisions[0] ?? '')
  const teams = division === EVERY_DEPT ? allTeams : allTeams.filter((t) => (t.division ?? '') === division)

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
    ? await supabase.from('schedule_assignments').select('schedule_job_id, day, techs, cell_entries').in('schedule_job_id', ids)
    : { data: [] }
  const withDays = (jobRows ?? []).map((j) => ({
    ...j,
    days: Object.fromEntries(
      (assignRows ?? []).filter((a) => a.schedule_job_id === j.id).map((a) => [a.day, a.techs as string[]]),
    ),
    cells: Object.fromEntries(
      (assignRows ?? []).filter((a) => a.schedule_job_id === j.id)
        .map((a) => [a.day, (a.cell_entries as { name: string; shift: string }[] | null) ?? []]),
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
      divisions={pickable}
      hasAnyTeams={allTeams.length > 0}
      allWeek={allWeek}
      scheduleStyle={styleByDivision.get(division)?.style ?? 'crew'}
      shiftOptions={styleByDivision.get(division)?.shiftOptions ?? DEFAULT_SHIFTS}
    />
  )
}
