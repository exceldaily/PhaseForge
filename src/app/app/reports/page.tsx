import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BOARD_FILTER_NONE, BoardOption, resolveBoardFilter } from '@/lib/boardFilter'
import { Project } from '@/types/app'
import { ReportsClient } from './ReportsClient'

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ board?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/signup')

  const { data: boardsData } = await supabase
    .from('boards')
    .select('id, name, color')
    .eq('company_id', profile.company_id)
    .order('sort_order', { ascending: true })
    .order('name')
  const boards = (boardsData ?? []) as BoardOption[]
  const boardFilter = resolveBoardFilter(params.board, boards)

  let projectsQuery = supabase
    .from('projects')
    .select('*, phases(*)')
    .eq('company_id', profile.company_id)
    .order('start_date', { ascending: true })
  if (boardFilter === BOARD_FILTER_NONE) {
    projectsQuery = projectsQuery.is('board_id', null)
  } else if (boardFilter) {
    projectsQuery = projectsQuery.eq('board_id', boardFilter)
  }

  const [projectsRes, membersRes] = await Promise.all([
    projectsQuery,
    supabase.from('profiles').select('id, full_name').eq('company_id', profile.company_id).eq('is_active', true),
  ])

  return (
    <ReportsClient
      projects={(projectsRes.data ?? []) as Project[]}
      members={membersRes.data ?? []}
      boards={boards}
      selectedBoardId={boardFilter}
    />
  )
}
