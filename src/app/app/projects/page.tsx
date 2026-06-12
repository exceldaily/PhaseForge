import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BOARD_FILTER_NONE, BoardOption, resolveBoardFilter } from '@/lib/boardFilter'
import { getStoredBoardFilter } from '@/lib/boardFilter.server'
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
  const storedBoardFilter = await getStoredBoardFilter()
  const boardFilter = resolveBoardFilter(params.board, boards, storedBoardFilter)

  let projectsQuery = supabase
    .from('projects')
    .select('*, phases(id, status, percent_complete, start_date, end_date, updated_at, reminder_notes, sort_order)')
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
    supabase.from('profiles').select('id, full_name, email, avatar_url').eq('company_id', profile.company_id),
    isSingleBoard
      ? supabase.from('board_columns').select('*').eq('board_id', boardFilter).order('sort_order')
      : Promise.resolve({ data: null }),
  ])

  const projects = ((projectsRaw ?? []) as Project[]).map((project) => ({
    ...project,
    phases: (project.phases ?? []).sort((left, right) => left.sort_order - right.sort_order),
  }))

  const projectIds = projects.map((project) => project.id)
  const { data: activityRows } = projectIds.length > 0
    ? await supabase
        .from('activity_logs')
        .select('project_id, created_at')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })
    : { data: [] as Array<{ project_id: string; created_at: string }> }

  const activitySummary = new Map<string, { count: number; latest: string | null }>()
  for (const row of activityRows ?? []) {
    const current = activitySummary.get(row.project_id)
    if (current) {
      current.count += 1
    } else {
      activitySummary.set(row.project_id, { count: 1, latest: row.created_at })
    }
  }

  const projectsWithBoardSignals = projects.map((project) => {
    const activity = activitySummary.get(project.id)
    return {
      ...project,
      activity_count: activity?.count ?? 0,
      activity_updated_at: activity?.latest ?? project.updated_at,
    }
  })

  return (
    <ProjectsClient
      projects={projectsWithBoardSignals}
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
