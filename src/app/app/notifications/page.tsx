import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NotificationsClient } from './NotificationsClient'

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/signup')

  // Auto-generate notifications from project/phase data
  const today = new Date().toISOString().split('T')[0]
  const soonDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, end_date, status, color, phases(*)')
    .eq('company_id', profile.company_id)
    .eq('is_archived', false)
    .neq('status', 'closed')

  // Fetch stored notifications
  const { data: stored } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  // Build computed alerts (not stored — generated fresh each page load)
  const alerts: {
    id: string; type: string; title: string; body: string; link: string; read: boolean; created_at: string
  }[] = []

  for (const project of projects ?? []) {
    if (project.end_date < today) {
      alerts.push({
        id: `proj-overdue-${project.id}`,
        type: 'project_overdue',
        title: 'Project overdue',
        body: `"${project.name}" passed its end date.`,
        link: `/app/projects/${project.id}`,
        read: false,
        created_at: new Date().toISOString(),
      })
    }
    for (const phase of (project.phases ?? [])) {
      if (['completed', 'skipped'].includes(phase.status)) continue
      if (phase.end_date < today) {
        alerts.push({
          id: `phase-overdue-${phase.id}`,
          type: 'phase_overdue',
          title: 'Phase overdue',
          body: `"${phase.name}" in ${project.name} is past due.`,
          link: `/app/gantt?project=${project.id}`,
          read: false,
          created_at: new Date().toISOString(),
        })
      } else if (phase.end_date <= soonDate) {
        alerts.push({
          id: `phase-soon-${phase.id}`,
          type: 'phase_due_soon',
          title: 'Phase due soon',
          body: `"${phase.name}" in ${project.name} ends ${phase.end_date}.`,
          link: `/app/gantt?project=${project.id}`,
          read: false,
          created_at: new Date().toISOString(),
        })
      }
    }
  }

  // Merge: stored notifications first, then computed alerts not already stored
  const storedIds = new Set((stored ?? []).map(n => n.id))
  const merged = [
    ...(stored ?? []),
    ...alerts.filter(a => !storedIds.has(a.id)),
  ]

  return <NotificationsClient notifications={merged} userId={user.id} />
}
