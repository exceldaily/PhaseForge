import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canUseSchedules } from '@/lib/constants'
import { canEditCompanyData } from '@/lib/permissions'
import { addDays, format, parseISO } from '@/lib/dates'
import { LodgingClient, type StayRow, type TeamOption } from './LodgingClient'
import type { StayTravel } from '@/lib/travel/geo'

export const metadata = { title: 'Lodging | PhaseForge' }
// Drive-time lookups for a whole week can take a few seconds each.
export const maxDuration = 60

function sundayOf(d: Date): string {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  x.setUTCDate(x.getUTCDate() - x.getUTCDay())
  return x.toISOString().slice(0, 10)
}

export default async function LodgingPage({ searchParams }: {
  searchParams: Promise<{ team?: string; week?: string; past?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles').select('company_id, ops_role, role, companies(plan)').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/app/dashboard')
  const plan = (profile.companies as { plan?: string } | null)?.plan
  if (!canUseSchedules(plan)) redirect('/app/schedules')
  const canEdit = canEditCompanyData(profile)

  const today = new Date().toISOString().slice(0, 10)
  const showPast = params.past === '1'
  // Past stays fall off the working list a week after check-out unless asked for.
  const cutoff = showPast ? '1900-01-01' : format(addDays(parseISO(today), -7), 'yyyy-MM-dd')

  const [{ data: sups }, { data: stays }, { data: directory }] = await Promise.all([
    supabase.from('superintendents').select('id, name, division').eq('company_id', profile.company_id)
      .eq('is_active', true).order('name'),
    supabase.from('lodging_stays').select('*').eq('company_id', profile.company_id)
      .gte('check_out', cutoff)
      .order('check_in', { ascending: true })
      .limit(showPast ? 1000 : 300),
    supabase.from('schedule_directory').select('id, title, job_number, address, latitude').eq('company_id', profile.company_id),
  ])
  // A stay is "on the job list" when a directory entry shares its job number
  // (or, failing that, its title). That entry's address is the job address.
  const dirByJob = new Map((directory ?? []).filter((d) => d.job_number?.trim()).map((d) => [d.job_number!.trim(), d]))
  const dirByTitle = new Map((directory ?? []).map((d) => [d.title.trim().toLowerCase(), d]))
  const jobFor = (s: { job_number: string | null; title: string }) =>
    (s.job_number?.trim() ? dirByJob.get(s.job_number.trim()) : undefined) ?? dirByTitle.get(s.title.trim().toLowerCase()) ?? null

  const teams: TeamOption[] = (sups ?? []).map((s) => ({ id: s.id, name: s.name, division: s.division }))
  const rows: StayRow[] = (stays ?? []).map((s) => ({
    id: s.id,
    superintendentId: s.superintendent_id,
    scheduleJobId: s.schedule_job_id,
    projectId: s.project_id,
    weekStart: s.week_start,
    title: s.title,
    jobNumber: s.job_number,
    location: s.location,
    checkIn: s.check_in,
    checkOut: s.check_out,
    guests: (s.guests as string[] | null) ?? [],
    hotelName: s.hotel_name,
    hotelAddress: s.hotel_address,
    confirmationNumber: s.confirmation_number,
    nightlyRate: s.nightly_rate === null ? null : Number(s.nightly_rate),
    notes: s.notes,
    status: s.status,
    travel: (s.travel as StayTravel | null) ?? null,
    job: (() => { const j = jobFor(s); return j ? { id: j.id, address: j.address, located: j.latitude !== null } : null })(),
  }))

  const weekFromParam = /^\d{4}-\d{2}-\d{2}$/.test(params.week ?? '') ? params.week! : sundayOf(new Date())
  const teamFromParam = teams.find((t) => t.id === params.team)?.id ?? teams[0]?.id ?? null

  return (
    <LodgingClient
      stays={rows}
      teams={teams}
      canEdit={canEdit}
      today={today}
      initialTeamId={teamFromParam}
      initialWeek={weekFromParam}
      showPast={showPast}
      teamById={Object.fromEntries(teams.map((t) => [t.id, t.name]))}
    />
  )
}
