import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Project, Phase } from '@/types/app'
import { ReportsClient } from './ReportsClient'

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/signup')

  const [projectsRes, membersRes] = await Promise.all([
    supabase.from('projects').select('*, phases(*)').eq('company_id', profile.company_id).order('start_date', { ascending: true }),
    supabase.from('profiles').select('id, full_name').eq('company_id', profile.company_id).eq('is_active', true),
  ])

  return (
    <ReportsClient
      projects={(projectsRes.data ?? []) as Project[]}
      members={membersRes.data ?? []}
    />
  )
}
