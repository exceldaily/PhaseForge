import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canEditCompanyData } from '@/lib/permissions'
import { addDaysIso, isIsoDate } from '@/lib/calendar/dates'
import { loadCalendar, loadCalendarRefs } from './actions'
import { CalendarClient, type CalView } from './CalendarClient'

export const metadata = { title: 'Calendar | PhaseForge' }
export const dynamic = 'force-dynamic'

const VIEWS: CalView[] = ['month', 'week', 'day', 'agenda']

export default async function CalendarPage({ searchParams }: {
  searchParams: Promise<{ d?: string; v?: string; project?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('company_id, role, ops_role').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/app/dashboard')

  const serverToday = new Date().toISOString().slice(0, 10)
  const anchor = isIsoDate(params.d) ? params.d : serverToday
  const [refs, data] = await Promise.all([
    loadCalendarRefs(),
    loadCalendar({ from: addDaysIso(anchor, -75), to: addDaysIso(anchor, 75) }),
  ])

  return (
    <CalendarClient
      refs={refs}
      initial={data}
      canEdit={canEditCompanyData(profile)}
      serverToday={serverToday}
      initialAnchor={isIsoDate(params.d) ? params.d : null}
      initialView={VIEWS.includes(params.v as CalView) ? (params.v as CalView) : null}
      initialProjectId={refs.projects.some((p) => p.id === params.project) ? params.project! : null}
    />
  )
}
