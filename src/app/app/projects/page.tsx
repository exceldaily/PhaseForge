import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BOARD_FILTER_NONE, BoardOption, resolveBoardFilter } from '@/lib/boardFilter'
import { BoardColumn, Project } from '@/types/app'
import { ProjectsClient } from './ProjectsClient'

export default async function ProjectsPage({
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
    .select('*')
    .eq('company_id', profile.company_id)
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })
  if (boardFilter === BOARD_FILTER_NONE) {
    projectsQuery = projectsQuery.is('board_id', null)
  } else if (boardFilter) {
    projectsQuery = projectsQuery.eq('board_id', boardFilter)
  }

  // With a single board selected, the kanban shows that board's own columns —
  // fetch them so the client can swap views.
  const isSingleBoard = Boolean(boardFilter) && boardFilter !== BOARD_FILTER_NONE
  const [{ data: projectsRaw }, { data: membersRaw }, columnsRes] = await Promise.all([
    projectsQuery,
    supabase.from('profiles').select('id, full_name').eq('company_id', profile.company_id),
    isSingleBoard
      ? supabase.from('board_columns').select('*').eq('board_id', boardFilter).order('sort_order')
      : Promise.resolve({ data: null }),
  ])

  return (
    <ProjectsClient
      projects={(projectsRaw ?? []) as Project[]}
      companyId={profile.company_id}
      currentUserId={user.id}
      canEdit={profile.role !== 'viewer'}
      members={membersRaw ?? []}
      boards={boards}
      selectedBoardId={boardFilter}
      selectedBoardColumns={(columnsRes.data ?? null) as BoardColumn[] | null}
    />
  )
}
