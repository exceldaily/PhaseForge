import { createClient } from '@/lib/supabase/server'
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

  return (
    <BoardKanban
      board={board}
      columns={columns}
      projects={(projectsRes.data ?? []) as Project[]}
      memberMap={memberMap}
      currentUserId={user.id}
      canEdit={canEdit}
      canAdmin={canAdmin}
    />
  )
}
