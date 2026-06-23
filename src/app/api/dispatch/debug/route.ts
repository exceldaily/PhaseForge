import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'not authenticated', authErr })

  const { data: profile, error: profileErr } = await supabase
    .from('profiles').select('company_id, role').eq('id', user.id).single()

  const { data: company, error: companyErr } = await supabase
    .from('companies').select('id, name, dispatch_enabled').eq('id', profile?.company_id ?? '').single()

  const { data: boards, error: boardsErr } = await supabase
    .from('dispatch_boards')
    .select('id, name, company_id')
    .eq('company_id', profile?.company_id ?? '')

  const { data: boardsWithJoin, error: joinErr } = await supabase
    .from('dispatch_boards')
    .select('*, columns:dispatch_columns(*)')
    .eq('company_id', profile?.company_id ?? '')

  return NextResponse.json({
    userId: user.id,
    companyId: profile?.company_id,
    company,
    companyErr,
    boardsCount: boards?.length,
    boards,
    boardsErr,
    boardsWithJoinCount: boardsWithJoin?.length,
    joinErr,
  })
}
