import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BoardsClient } from './BoardsClient'
import { getUsageSummary } from '@/lib/planLimits'
import { Board, BoardColumn } from '@/types/app'
import { canEditCompanyData } from '@/lib/permissions'

export default async function BoardsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/signup')

  const [boardsRes, teamsRes, usage] = await Promise.all([
    supabase
      .from('boards')
      .select('*, board_columns(*), board_teams(team_id)')
      .eq('company_id', profile.company_id)
      .order('sort_order'),
    supabase
      .from('teams')
      .select('id, name, color')
      .eq('company_id', profile.company_id),
    getUsageSummary(profile.company_id),
  ])

  // Get project counts per board
  const boards = (boardsRes.data ?? []) as (Board & { board_columns: BoardColumn[]; board_teams: { team_id: string }[] })[]
  const boardIds = boards.map(b => b.id)
  const { data: projectCounts } = await supabase
    .from('projects')
    .select('board_id')
    .in('board_id', boardIds)
    .eq('is_archived', false)

  const countMap: Record<string, number> = {}
  for (const p of projectCounts ?? []) {
    if (p.board_id) countMap[p.board_id] = (countMap[p.board_id] ?? 0) + 1
  }

  const canEdit = ['owner', 'admin', 'manager'].includes(profile.role)
  const canAdmin = canEditCompanyData(profile)

  return (
    <BoardsClient
      boards={boards}
      teams={teamsRes.data ?? []}
      projectCountMap={countMap}
      usage={usage}
      canEdit={canEdit}
      canAdmin={canAdmin}
      companyId={profile.company_id}
    />
  )
}
