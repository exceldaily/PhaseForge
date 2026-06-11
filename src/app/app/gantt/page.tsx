import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { GanttChart } from '@/components/gantt/GanttChart'
import { BoardFilter } from '@/components/boards/BoardFilter'
import { BOARD_FILTER_NONE, BoardOption, resolveBoardFilter } from '@/lib/boardFilter'
import { Project, Phase, Profile } from '@/types/app'

export default async function GanttPage({ searchParams }: { searchParams: Promise<{ project?: string; board?: string }> }) {
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

  let projectQuery = supabase
    .from('projects')
    .select('*, phases(*)')
    .eq('company_id', profile.company_id)
    .eq('is_archived', false)
    .neq('status', 'closed')
    .order('start_date', { ascending: true })

  if (params.project) {
    projectQuery = projectQuery.eq('id', params.project)
  }
  if (boardFilter === BOARD_FILTER_NONE) {
    projectQuery = projectQuery.is('board_id', null)
  } else if (boardFilter) {
    projectQuery = projectQuery.eq('board_id', boardFilter)
  }

  const { data: projects = [] } = await projectQuery

  const { data: members = [] } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url')
    .eq('company_id', profile.company_id)

  // Sort phases within each project
  const projectsWithSortedPhases = (projects as Project[]).map(p => ({
    ...p,
    phases: ((p.phases || []) as Phase[]).sort((a, b) => a.sort_order - b.sort_order)
  }))

  return (
    <div className="h-full flex flex-col">
      {boards.length > 0 && (
        <div className="flex items-center justify-end border-b border-slate-200 bg-white px-4 py-2">
          <BoardFilter boards={boards} selectedBoardId={boardFilter} />
        </div>
      )}
      <GanttChart
        projects={projectsWithSortedPhases}
        companyId={profile.company_id}
        members={members as Profile[]}
        currentUserId={user.id}
        canEdit={profile.role !== 'viewer'}
      />
    </div>
  )
}
