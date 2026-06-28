import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DispatchKanban } from '@/components/dispatch/DispatchKanban'
import { DispatchBoard, DispatchColumn, DispatchCard, DispatchVendor, Profile } from '@/types/app'
import { canUseTickets } from '@/lib/constants'

export default async function DispatchBoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) redirect('/login')

  const { data: company } = await supabase
    .from('companies')
    .select('plan, dispatch_enabled')
    .eq('id', profile.company_id)
    .single()

  if (!canUseTickets(company?.plan) && !company?.dispatch_enabled) redirect('/app/dashboard')

  const { data: board } = await supabase
    .from('dispatch_boards')
    .select('*')
    .eq('id', boardId)
    .eq('company_id', profile.company_id)
    .single()

  if (!board) notFound()

  const [{ data: columns }, { data: cards }, { data: vendors }, { data: members }] = await Promise.all([
    supabase
      .from('dispatch_columns')
      .select('*')
      .eq('board_id', boardId)
      .order('sort_order'),

    supabase
      .from('dispatch_cards')
      .select('*, assigned_profile:profiles!dispatch_cards_assigned_to_fkey(id, full_name, avatar_url, email), vendor:dispatch_vendors(*)')
      .eq('board_id', boardId)
      .order('created_at', { ascending: false }),

    supabase
      .from('dispatch_vendors')
      .select('*')
      .eq('company_id', profile.company_id)
      .eq('is_active', true)
      .order('name'),

    supabase
      .from('profiles')
      .select('id, full_name, email, role, avatar_url')
      .eq('company_id', profile.company_id)
      .eq('is_active', true)
      .order('full_name'),
  ])

  return (
    <DispatchKanban
      board={board as DispatchBoard}
      columns={(columns ?? []) as DispatchColumn[]}
      initialCards={(cards ?? []) as DispatchCard[]}
      vendors={(vendors ?? []) as DispatchVendor[]}
      members={(members ?? []) as Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'>[]}
      userRole={profile.role}
      userId={user.id}
    />
  )
}
