'use client'

// Chat, Google Chat style: spaces down the left (trades, projects, direct
// messages, and the Project updates feed), the conversation on the right.
// The conversation itself lives in ChatConversation so the project hub can
// embed the same thing.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Hash, HardHat, Megaphone, MessageSquare, Plus, Search, User, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { ChatConversation, messageFromRow, type ChatMember, type ChatProjectRef } from '@/components/chat/ChatConversation'
import {
  createTradeChannel, ensureDirectChannel, ensureProjectChannel, listMessages, markRead, setMyTrades,
  type ChatChannel, type ChatMessage,
} from './actions'

export type { ChatMember } from '@/components/chat/ChatConversation'

interface Props {
  me: { id: string; name: string; trades: string[] }
  companyId: string
  channels: ChatChannel[]
  initialChannelId: string | null
  initialMessages: ChatMessage[]
  members: ChatMember[]
  trades: string[]
  projects: ChatProjectRef[]
  canModerate?: boolean
}

const KIND_ICON: Record<ChatChannel['kind'], React.ReactNode> = {
  general: <Hash size={13} />, updates: <Megaphone size={13} />, trade: <HardHat size={13} />,
  project: <Hash size={13} />, direct: <User size={13} />,
}

export function ChatClient({ me, companyId, channels: initialChannels, initialChannelId, initialMessages, members, trades: initialTrades, projects, canModerate = false }: Props) {
  const router = useRouter()
  const [channels, setChannels] = useState(initialChannels)
  const [activeId, setActiveId] = useState(initialChannelId)
  const [messages, setMessages] = useState<ChatMessage[] | null>(initialMessages)
  const [trades, setTrades] = useState(initialTrades)
  const [myTrades, setMy] = useState(me.trades)
  const [listOpen, setListOpen] = useState(!initialChannelId)
  const [adding, setAdding] = useState<null | 'trade' | 'project' | 'direct'>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const [projectQuery, setProjectQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const memberMap = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members])
  const projectMap = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects])
  const active = channels.find((c) => c.id === activeId) ?? null
  const activeRef = useRef(activeId)
  useEffect(() => { activeRef.current = activeId }, [activeId])

  const openChannel = useCallback((id: string) => {
    setActiveId(id); setListOpen(false); setError(null); setAdding(null)
    setMessages(null)
    setChannels((cur) => cur.map((c) => (c.id === id ? { ...c, unread: 0 } : c)))
    window.history.replaceState(null, '', `/app/chat?c=${id}`)
    start(async () => {
      const rows = await listMessages({ channelId: id })
      if (activeRef.current !== id) return
      setMessages(rows)
      await markRead({ channelId: id })
    })
  }, [])

  // Unread bumps for spaces that are not open. The open space has its own
  // subscription inside ChatConversation.
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase.channel(`chat-unread-${companyId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'phaseforge', table: 'chat_messages', filter: `company_id=eq.${companyId}` }, (payload) => {
        const row = payload.new as Record<string, unknown>
        if (!row?.id) return
        const m = messageFromRow(row)
        if (m.channelId === activeRef.current || m.authorId === me.id) return
        setChannels((cur) => cur.map((c) => (c.id === m.channelId ? { ...c, unread: c.unread + 1, lastAt: m.createdAt } : c)))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [companyId, me.id])

  const onActivity = useCallback((m: ChatMessage) => {
    setChannels((cur) => cur.map((c) => (c.id === m.channelId && (!c.lastAt || c.lastAt < m.createdAt) ? { ...c, lastAt: m.createdAt } : c)))
  }, [])

  const addTrade = (trade: string) => { setOpening(trade); start(async () => {
    const res = await createTradeChannel({ trade })
    setOpening(null)
    if (!res.ok) { setError(res.error); return }
    if (!trades.includes(trade)) setTrades((t) => [...t, trade].sort())
    setChannels((cur) => cur.some((c) => c.id === res.id) ? cur : [...cur, { id: res.id, kind: 'trade', name: trade, trade, projectId: null, peerId: null, unread: 0, lastAt: null }])
    router.refresh(); openChannel(res.id)
  }) }
  const addProject = (projectId: string) => { setOpening(projectId); start(async () => {
    const res = await ensureProjectChannel({ projectId })
    setOpening(null)
    if (!res.ok) { setError(res.error); return }
    const p = projectMap[projectId]
    setChannels((cur) => cur.some((c) => c.id === res.id) ? cur : [...cur, { id: res.id, kind: 'project', name: p ? (p.jobNumber ? `${p.name} (${p.jobNumber})` : p.name) : 'Project', trade: null, projectId, peerId: null, unread: 0, lastAt: null }])
    openChannel(res.id)
  }) }
  const addDirect = (profileId: string) => { setOpening(profileId); start(async () => {
    const res = await ensureDirectChannel({ profileId })
    setOpening(null)
    if (!res.ok) { setError(res.error); return }
    setChannels((cur) => cur.some((c) => c.id === res.id) ? cur : [...cur, { id: res.id, kind: 'direct', name: memberMap[profileId]?.name ?? 'Direct message', trade: null, projectId: null, peerId: profileId, unread: 0, lastAt: null }])
    openChannel(res.id)
  }) }
  const toggleMyTrade = (t: string) => start(async () => {
    const next = myTrades.includes(t) ? myTrades.filter((x) => x !== t) : [...myTrades, t]
    const res = await setMyTrades({ trades: next })
    if (res.ok) setMy(res.trades)
  })

  const groups: { label: string; kinds: ChatChannel['kind'][] }[] = [
    { label: 'Company', kinds: ['general', 'updates'] },
    { label: 'Trades', kinds: ['trade'] },
    { label: 'Projects', kinds: ['project'] },
    { label: 'Direct messages', kinds: ['direct'] },
  ]
  const channelLabel = (c: ChatChannel) => c.kind === 'direct' && c.peerId ? memberMap[c.peerId]?.name ?? c.name : c.name
  const totalUnread = channels.reduce((s, c) => s + c.unread, 0)
  const activeProject = active?.projectId ? projectMap[active.projectId] : undefined

  return (
    <div className="flex h-[calc(100dvh-56px)] md:h-full">
      {/* ── Spaces ── */}
      <aside className={cn('w-full shrink-0 flex-col border-r border-slate-200 bg-white md:flex md:w-72', listOpen ? 'flex' : 'hidden')} data-help="chat-spaces">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h1 className="flex items-center gap-2 text-base font-bold text-slate-900"><MessageSquare size={18} className="text-indigo-600" /> Chat{totalUnread ? <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{totalUnread}</span> : null}</h1>
        </div>
        {error && <p className="px-4 pt-2 text-[11px] font-medium text-rose-600">{error}</p>}
        <div className="flex-1 overflow-y-auto p-2">
          {groups.map((g) => {
            let rows = channels.filter((c) => g.kinds.includes(c.kind)).sort((a, b) => (b.unread ? 1 : 0) - (a.unread ? 1 : 0) || (b.lastAt ?? '').localeCompare(a.lastAt ?? '') || a.name.localeCompare(b.name))
            const isProjects = g.label === 'Projects'
            const q = projectQuery.trim().toLowerCase()
            if (isProjects && q) rows = rows.filter((c) => c.name.toLowerCase().includes(q))
            const addKind = g.label === 'Trades' ? 'trade' : isProjects ? 'project' : g.label === 'Direct messages' ? 'direct' : null
            return (
              <div key={g.label} className="mb-3">
                <div className="flex items-center justify-between px-2 pb-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{g.label}{isProjects && rows.length > 0 ? <span className="ml-1 font-normal normal-case">({rows.length})</span> : null}</p>
                  {addKind && (
                    <button onClick={() => setAdding(adding === addKind ? null : addKind)} title={`New ${g.label.toLowerCase()} space`} data-help={`chat-add-${addKind}`}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"><Plus size={12} /></button>
                  )}
                </div>
                {isProjects && channels.filter((c) => c.kind === 'project').length > 6 && (
                  <div className="relative mb-1 px-1">
                    <Search size={11} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={projectQuery} onChange={(e) => setProjectQuery(e.target.value)} placeholder="Find a job"
                      className="w-full rounded-md border border-slate-200 py-1 pl-6 pr-2 text-xs outline-none focus:border-indigo-400" />
                  </div>
                )}
                {adding === addKind && addKind && (
                  <AddPicker kind={addKind} trades={trades} projects={projects} members={members.filter((m) => m.id !== me.id)} opening={opening}
                    onPick={(id) => addKind === 'trade' ? addTrade(id) : addKind === 'project' ? addProject(id) : addDirect(id)} onClose={() => setAdding(null)} />
                )}
                {rows.length === 0 && adding !== addKind && <p className="px-2 py-1 text-[11px] text-slate-300">{isProjects && q ? 'No jobs match' : 'None yet'}</p>}
                {rows.slice(0, isProjects && !q ? 40 : rows.length).map((c) => (
                  <button key={c.id} onClick={() => openChannel(c.id)}
                    className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm', c.id === activeId ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-700 hover:bg-slate-50')}>
                    <span className={cn('shrink-0', c.id === activeId ? 'text-indigo-500' : 'text-slate-400')}>{KIND_ICON[c.kind]}</span>
                    <span className="min-w-0 flex-1 truncate">{channelLabel(c)}</span>
                    {c.unread > 0 && <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{c.unread}</span>}
                  </button>
                ))}
                {isProjects && !q && rows.length > 40 && <p className="px-2 py-1 text-[11px] text-slate-400">{rows.length - 40} more, type to find one.</p>}
              </div>
            )
          })}
        </div>
        {/* My trades: which @Trade pings reach me */}
        <div className="border-t border-slate-100 p-3" data-help="chat-my-trades">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">My trades</p>
          <p className="mb-1.5 text-[11px] text-slate-400">Pick yours so @Trade pings reach you.</p>
          <div className="flex flex-wrap gap-1">
            {trades.map((t) => (
              <button key={t} onClick={() => toggleMyTrade(t)} disabled={pending}
                className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', myTrades.includes(t) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}>{t}</button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Conversation ── */}
      <section className={cn('min-w-0 flex-1 flex-col bg-slate-50 md:flex', listOpen ? 'hidden' : 'flex')}>
        {!active ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Pick a space to start.</div>
        ) : (
          <>
            <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-5">
              <button onClick={() => setListOpen(true)} className="rounded p-1 text-slate-500 hover:bg-slate-100 md:hidden" aria-label="Spaces"><ArrowLeft size={16} /></button>
              <span className="text-indigo-500">{KIND_ICON[active.kind]}</span>
              <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{channelLabel(active)}</h2>
              <span className="hidden text-[11px] text-slate-400 sm:block">
                {active.kind === 'general' && 'Everyone in the company'}
                {active.kind === 'updates' && 'Every project update, in one feed'}
                {active.kind === 'trade' && `${members.filter((m) => m.trades.some((t) => t.toLowerCase() === (active.trade ?? '').toLowerCase())).length} people list this trade`}
                {active.kind === 'project' && active.projectId && <Link href={`/app/projects/${active.projectId}`} className="text-indigo-600 hover:underline">Open project hub</Link>}
                {active.kind === 'direct' && 'Just the two of you'}
              </span>
            </header>
            {messages === null ? (
              <div className="flex flex-1 items-center justify-center text-xs text-slate-400">Opening {channelLabel(active)}</div>
            ) : (
              <ChatConversation key={active.id} channel={active} me={me} companyId={companyId} members={members} trades={trades}
                projects={projects} initialMessages={messages} projectTrade={activeProject?.trade ?? null} onActivity={onActivity} canModerate={canModerate} />
            )}
          </>
        )}
      </section>
    </div>
  )
}

function AddPicker({ kind, trades, projects, members, opening, onPick, onClose }: {
  kind: 'trade' | 'project' | 'direct'; trades: string[]; projects: ChatProjectRef[]; members: ChatMember[]
  opening: string | null; onPick: (id: string) => void; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const t = q.trim().toLowerCase()
  const items: { id: string; label: string; sub?: string | null }[] =
    kind === 'trade' ? trades.map((x) => ({ id: x, label: x }))
    : kind === 'project' ? projects.map((p) => ({ id: p.id, label: p.name, sub: p.jobNumber }))
    : members.map((m) => ({ id: m.id, label: m.name, sub: m.title }))
  const shown = items.filter((i) => !t || i.label.toLowerCase().includes(t) || (i.sub ?? '').toLowerCase().includes(t)).slice(0, 12)
  return (
    <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
      <div className="flex items-center gap-1">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter' && kind === 'trade' && q.trim() && !shown.length) onPick(q.trim()) }}
          placeholder={kind === 'trade' ? 'Trade name' : kind === 'project' ? 'Find a project' : 'Find a person'}
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-indigo-400" />
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600" aria-label="Close"><X size={12} /></button>
      </div>
      <div className="mt-1 max-h-48 overflow-y-auto">
        {shown.map((i) => (
          <button key={i.id} onClick={() => onPick(i.id)} disabled={opening !== null}
            className={cn('flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-white', opening === i.id ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-700')}>
            <span className="truncate">{opening === i.id ? `Opening ${i.label}` : i.label}</span>{i.sub && <span className="ml-2 shrink-0 text-[10px] text-slate-400">{i.sub}</span>}
          </button>
        ))}
        {kind === 'trade' && q.trim() && !shown.some((i) => i.label.toLowerCase() === t) && (
          <button onClick={() => onPick(q.trim())} className="mt-1 w-full rounded px-2 py-1 text-left text-xs font-medium text-indigo-600 hover:bg-white">Create “{q.trim()}”</button>
        )}
        {shown.length === 0 && kind !== 'trade' && <p className="px-2 py-1 text-[11px] text-slate-400">No matches.</p>}
        {items.length > 12 && !t && <p className="px-2 py-1 text-[11px] text-slate-400">Type to find the rest.</p>}
      </div>
    </div>
  )
}
