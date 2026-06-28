import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DispatchBoardList } from '@/components/dispatch/DispatchBoardList'
import { DispatchBoard } from '@/types/app'

export const metadata = { title: 'Dispatch — PhaseForge' }

export default async function DispatchPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) redirect('/app/dashboard')

  const { data: company } = await supabase
    .from('companies')
    .select('dispatch_enabled')
    .eq('id', profile.company_id)
    .single()

  if (!company?.dispatch_enabled) redirect('/app/dashboard')

  const { data: boards } = await supabase
    .from('dispatch_boards')
    .select('*, columns:dispatch_columns!dispatch_columns_board_id_fkey(*)')
    .eq('company_id', profile.company_id)
    .order('sort_order')
    .order('created_at')

  const { data: cardCounts } = await supabase
    .from('dispatch_cards')
    .select('board_id, column_id, closed_at')
    .eq('company_id', profile.company_id)

  const boardsWithCounts = (boards ?? []).map((b) => {
    const boardCards = cardCounts?.filter((c) => c.board_id === b.id) ?? []
    const openCards  = boardCards.filter((c) => !c.closed_at)
    const byColumn: Record<string, number> = {}
    for (const card of openCards) {
      if (card.column_id) byColumn[card.column_id] = (byColumn[card.column_id] ?? 0) + 1
    }
    return { ...b, card_counts: byColumn, total_cards: boardCards.length, open_cards: openCards.length }
  })

  return (
    <DispatchBoardList
      boards={boardsWithCounts as DispatchBoard[]}
      userRole={profile.role}
    />
  )
}
