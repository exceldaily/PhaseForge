import { createClient } from '@/lib/supabase/server'
import { activeTrade } from '@/lib/tradeFilter'
import { redirect, notFound } from 'next/navigation'
import { BoardKanban } from './BoardKanban'
import { Board, BoardColumn, Project } from '@/types/app'

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/signup')

  const trade = await activeTrade(supabase, profile.company_id)
  const [boardRes, projectsRes, membersRes] = await Promise.all([
    supabase
      .from('boards')
      .select('*, board_columns(*)')
      .eq('id', id)
      .eq('company_id', profile.company_id)
      .single(),
    supabase
      .from('projects')
      .select('*')
      .eq('board_id', id)
      .eq('is_archived', false)
      .order('updated_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('company_id', profile.company_id),
  ])

  if (!boardRes.data) notFound()

  const board = boardRes.data as Board & { board_columns: BoardColumn[] }
  const columns = [...board.board_columns].sort((a, b) => a.sort_order - b.sort_order)

  const canEdit = ['owner', 'admin', 'manager'].includes(profile.role)
  const canAdmin = ['owner', 'admin'].includes(profile.role)
  const memberMap = Object.fromEntries((membersRes.data ?? []).map(m => [m.id, m.full_name]))

  // Punch counts per project for the optional card button (fail-soft if not migrated).
  const allProjects = (projectsRes.data ?? []) as Project[]
  const baseProjects = trade ? allProjects.filter((p) => (p.trade ?? '') === trade) : allProjects
  const projectIds = baseProjects.map((p) => p.id)
  const { data: punchRows } = projectIds.length > 0
    ? await supabase.from('punch_items').select('project_id, status').in('project_id', projectIds)
    : { data: [] as Array<{ project_id: string; status: string }> }

  const punchSummary = new Map<string, { open: number; completed: number }>()
  for (const row of punchRows ?? []) {
    const current = punchSummary.get(row.project_id) ?? { open: 0, completed: 0 }
    if (row.status === 'completed') current.completed += 1
    else current.open += 1
    punchSummary.set(row.project_id, current)
  }
  const projects = baseProjects.map((p) => {
    const punch = punchSummary.get(p.id)
    return { ...p, punch_open_count: punch?.open ?? 0, punch_completed_count: punch?.completed ?? 0 }
  })

  return (
    <BoardKanban
      board={board}
      columns={columns}
      projects={projects}
      memberMap={memberMap}
      currentUserId={user.id}
      canEdit={canEdit}
      canAdmin={canAdmin}
    />
  )
}
