import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProjectForm } from '@/components/projects/ProjectForm'

export default async function NewProjectPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/signup')

  const { data: membersRaw } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('company_id', profile.company_id)
    .eq('is_active', true)
  const members = membersRaw ?? []

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">New Project</h1>
        <p className="text-slate-500 mt-1">Fill in the details to create a new project</p>
      </div>
      <ProjectForm companyId={profile.company_id} members={members} currentUserId={user.id} />
    </div>
  )
}
