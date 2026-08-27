import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { BoardSettingsClient } from './BoardSettingsClient'
import { Board, BoardColumn } from '@/types/app'
import { canEditCompanyData } from '@/lib/permissions'

export default async function BoardSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/signup')

  // Managers can edit board details & columns; viewers/members can't.
  if (!['owner', 'admin', 'manager'].includes(profile.role)) redirect(`/app/boards/${id}`)
  const canAdmin = canEditCompanyData(profile)

  const [boardRes, teamsRes, boardTeamsRes] = await Promise.all([
    supabase.from('boards').select('*, board_columns(*)').eq('id', id).eq('company_id', profile.company_id).single(),
    supabase.from('teams').select('id, name, color').eq('company_id', profile.company_id).order('name'),
    supabase.from('board_teams').select('team_id').eq('board_id', id),
  ])

  if (!boardRes.data) notFound()

  const board = boardRes.data as Board & { board_columns: BoardColumn[] }
  const columns = [...board.board_columns].sort((a, b) => a.sort_order - b.sort_order)
  const assignedTeamIds = new Set((boardTeamsRes.data ?? []).map(bt => bt.team_id))

  return (
    <BoardSettingsClient
      board={board}
      columns={columns}
      teams={teamsRes.data ?? []}
      assignedTeamIds={[...assignedTeamIds]}
      canAdmin={canAdmin}
    />
  )
}
