import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ProjectForm } from '@/components/projects/ProjectForm'

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ board?: string; column?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/signup')

  const [membersRes, boardRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, role').eq('company_id', profile.company_id).eq('is_active', true),
    params.board
      ? supabase.from('boards').select('id, name, board_columns(id, name, sort_order, color)').eq('id', params.board).single()
      : Promise.resolve({ data: null }),
  ])

  const board = boardRes.data as any
  const backHref = params.board ? `/app/boards/${params.board}` : '/app/projects'
  const backLabel = board?.name ?? 'Projects'

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href={backHref} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 mb-6 transition-colors">
        <ArrowLeft size={15} /> {backLabel}
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">New Project</h1>
        {board && <p className="text-slate-500 mt-1">Adding to <span className="font-medium text-slate-700">{board.name}</span></p>}
      </div>
      <ProjectForm
        companyId={profile.company_id}
        members={membersRes.data ?? []}
        currentUserId={user.id}
        defaultBoardId={params.board}
        defaultColumnId={params.column}
        boardColumns={board?.board_columns ?? []}
      />
    </div>
  )
}
