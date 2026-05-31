import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ProjectForm } from '@/components/projects/ProjectForm'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const { data: project } = await supabase.from('projects').select('*').eq('id', id).single()
  if (!project) notFound()

  const { data: membersRaw } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('company_id', profile.company_id)
    .eq('is_active', true)
  const members = membersRaw ?? []

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <Link href={`/app/projects/${id}`} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft size={16} /> Back to project
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Edit Project</h1>
        <p className="text-slate-500 mt-1">{project.name}</p>
      </div>
      <ProjectForm companyId={profile.company_id} members={members} currentUserId={user.id} project={project} />
    </div>
  )
}
