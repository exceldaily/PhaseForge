import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canEditCompanyData } from '@/lib/permissions'
import { EmployeesClient, type EmployeeRow, type TeamOption } from './EmployeesClient'

export const metadata = { title: 'Employees | PhaseForge' }
// Locating addresses is paced at one lookup a second.
export const maxDuration = 60

export default async function EmployeesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles').select('company_id, ops_role, role').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/app/dashboard')
  const canEdit = canEditCompanyData(profile)

  const [{ data: emps }, { data: sups }, { data: members }, { data: pendingInvites }, { count: jobsToLocate }] = await Promise.all([
    supabase.from('employees').select('*').eq('company_id', profile.company_id).order('name'),
    supabase.from('superintendents').select('id, name, division, roster').eq('company_id', profile.company_id)
      .eq('is_active', true).order('name'),
    supabase.from('profiles').select('id, email').eq('company_id', profile.company_id),
    supabase.from('invitations').select('email').eq('company_id', profile.company_id).is('accepted_at', null),
    supabase.from('schedule_directory').select('id', { count: 'exact', head: true }).eq('company_id', profile.company_id).is('geocoded_at', null),
  ])

  const memberByEmail = new Map((members ?? []).map((m) => [String(m.email ?? '').toLowerCase(), m.id]))
  const invited = new Set((pendingInvites ?? []).map((i) => String(i.email ?? '').toLowerCase()))
  const teams: TeamOption[] = (sups ?? []).map((s) => ({
    id: s.id, name: s.name, division: s.division,
    roster: ((s.roster as string[] | null) ?? []).map((r) => r.toLowerCase()),
  }))

  const rows: EmployeeRow[] = (emps ?? []).map((e) => {
    const email = (e.email as string | null)?.toLowerCase() ?? null
    const team = teams.find((t) => t.id === e.superintendent_id)
    const short = ((e.schedule_name as string | null) ?? String(e.name).split(/\s+/)[0]).toLowerCase()
    return {
      id: e.id,
      name: e.name,
      scheduleName: e.schedule_name,
      email,
      phone: e.phone,
      address: e.address,
      located: e.latitude !== null && e.longitude !== null,
      geocodeError: e.geocode_error,
      superintendentId: e.superintendent_id,
      profileId: (e.profile_id as string | null) ?? (email ? memberByEmail.get(email) ?? null : null),
      invited: !!e.invited_at || (email ? invited.has(email) : false),
      isActive: e.is_active,
      onSchedule: !!team && team.roster.includes(short),
    }
  })

  const unlocated = rows.filter((r) => r.address && !r.located && !r.geocodeError).length

  return (
    <EmployeesClient
      employees={rows}
      teams={teams}
      canEdit={canEdit}
      toLocate={unlocated + (jobsToLocate ?? 0)}
    />
  )
}
