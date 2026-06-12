import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ProjectForm } from '@/components/projects/ProjectForm'
import { appendBoardFilter, BoardOption, resolveBoardFilter } from '@/lib/boardFilter'
import { getStoredBoardFilter } from '@/lib/boardFilter.server'

type BoardDetail = {
  id: string
  name: string
  visible_fields: string[] | null
  custom_stages: string[] | null
  board_columns: Array<{ id: string; name: string; sort_order: number; color: string }> | null
}

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

  const [{ data: boardsData }, membersRes] = await Promise.all([
    supabase
      .from('boards')
      .select('id, name, color')
      .eq('company_id', profile.company_id)
      .order('sort_order', { ascending: true })
      .order('name'),
    supabase.from('profiles').select('id, full_name, email, role').eq('company_id', profile.company_id).eq('is_active', true),
  ])
  const boards = (boardsData ?? []) as BoardOption[]
  const storedBoardFilter = await getStoredBoardFilter()
  const activeBoardFilter = resolveBoardFilter(params.board, boards, storedBoardFilter)
  const boardRes = activeBoardFilter && activeBoardFilter !== 'none'
    ? await supabase
        .from('boards')
        .select('id, name, visible_fields, custom_stages, board_columns(id, name, sort_order, color)')
        .eq('id', activeBoardFilter)
        .single()
    : { data: null }

  const board = boardRes.data as BoardDetail | null
  const backHref = activeBoardFilter && activeBoardFilter !== 'none'
    ? `/app/boards/${activeBoardFilter}`
    : appendBoardFilter('/app/projects', activeBoardFilter)
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
        defaultBoardId={activeBoardFilter && activeBoardFilter !== 'none' ? activeBoardFilter : undefined}
        defaultColumnId={params.column}
        boardColumns={board?.board_columns ?? []}
        boardVisibleFields={board?.visible_fields ?? []}
        boardCustomStages={board?.custom_stages ?? []}
      />
    </div>
  )
}
