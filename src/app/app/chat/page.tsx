import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChatClient, type ChatMember } from './ChatClient'
import { companyTrades, ensureBaseChannels, ensureProjectChannel, listChannels, listMessages, markRead } from './actions'

export const metadata = { title: 'Chat | PhaseForge' }
export const dynamic = 'force-dynamic'

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ c?: string; project?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('company_id, full_name, trades').eq('id', user.id).single()
  if (!me?.company_id) redirect('/app/dashboard')

  await ensureBaseChannels()
  let activeId = params.c ?? null
  if (params.project) {
    const res = await ensureProjectChannel({ projectId: params.project })
    if (res.ok) activeId = res.id
  }

  const [channels, trades, { data: people }, { data: projects }] = await Promise.all([
    listChannels(),
    companyTrades(),
    supabase.from('profiles').select('id, full_name, avatar_url, trades, job_title').eq('company_id', me.company_id).eq('is_active', true).order('full_name'),
    supabase.from('projects').select('id, name, job_number').eq('company_id', me.company_id).eq('is_archived', false).order('name'),
  ])
  if (!activeId || !channels.some((c) => c.id === activeId)) {
    activeId = channels.find((c) => c.kind === 'general')?.id ?? channels[0]?.id ?? null
  }
  const messages = activeId ? await listMessages({ channelId: activeId }) : []
  if (activeId) await markRead({ channelId: activeId })

  const members: ChatMember[] = (people ?? []).map((p) => ({
    id: p.id, name: p.full_name, avatarUrl: p.avatar_url, trades: (p.trades as string[] | null) ?? [], title: p.job_title,
  }))

  return (
    <ChatClient
      me={{ id: user.id, name: me.full_name, trades: (me.trades as string[] | null) ?? [] }}
      companyId={me.company_id}
      channels={channels.map((c) => (c.id === activeId ? { ...c, unread: 0 } : c))}
      initialChannelId={activeId}
      initialMessages={messages}
      members={members}
      trades={trades}
      projects={(projects ?? []).map((p) => ({ id: p.id, name: p.name, jobNumber: p.job_number }))}
    />
  )
}
