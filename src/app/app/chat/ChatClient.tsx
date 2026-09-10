'use client'

// Chat, Google Chat style: spaces down the left (trades, projects, direct
// messages, and the Project updates feed), the conversation on the right.
// @Trade pings everyone in that trade, @Name a person, @everyone the company.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Hash, HardHat, Megaphone, MessageSquare, Pencil, Plus, Send, Trash2, User, Users, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/dates'
import { createClient } from '@/lib/supabase/client'
import { activeHandle, mentionCandidates, parseMentions } from '@/lib/chat/mentions'
import {
  createTradeChannel, deleteMessage, editMessage, ensureDirectChannel, ensureProjectChannel,
  listMessages, markRead, sendMessage, setMyTrades, type ChatChannel, type ChatMessage,
} from './actions'

export interface ChatMember { id: string; name: string; avatarUrl: string | null; trades: string[]; title: string | null }

interface Props {
  me: { id: string; name: string; trades: string[] }
  companyId: string
  channels: ChatChannel[]
  initialChannelId: string | null
  initialMessages: ChatMessage[]
  members: ChatMember[]
  trades: string[]
  projects: { id: string; name: string; jobNumber: string | null }[]
}

const KIND_ICON: Record<ChatChannel['kind'], React.ReactNode> = {
  general: <Hash size={13} />, updates: <Megaphone size={13} />, trade: <HardHat size={13} />,
  project: <Hash size={13} />, direct: <User size={13} />,
}

function initials(name: string) { return name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() }
function timeOf(iso: string) { return formatDate(iso, 'h:mm a') }
function dayOf(iso: string) {
  const d = iso.slice(0, 10), today = new Date().toISOString().slice(0, 10)
  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  return d === today ? 'Today' : d === y ? 'Yesterday' : formatDate(iso, 'EEEE, MMM d')
}

export function ChatClient({ me, companyId, channels: initialChannels, initialChannelId, initialMessages, members, trades: initialTrades, projects }: Props) {
  const router = useRouter()
  const [channels, setChannels] = useState(initialChannels)
  const [activeId, setActiveId] = useState(initialChannelId)
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [trades, setTrades] = useState(initialTrades)
  const [myTrades, setMy] = useState(me.trades)
  const [listOpen, setListOpen] = useState(!initialChannelId)
  const [adding, setAdding] = useState<null | 'trade' | 'project' | 'direct'>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)
  const memberMap = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members])
  const projectMap = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects])
  const active = channels.find((c) => c.id === activeId) ?? null
  const activeRef = useRef(activeId)
  useEffect(() => { activeRef.current = activeId }, [activeId])
  const lastAtRef = useRef<string | null>(initialMessages.at(-1)?.createdAt ?? null)

  const scrollToBottom = useCallback(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [])
  useEffect(() => { scrollToBottom() }, [messages.length, activeId, scrollToBottom])

  const appendMessage = useCallback((m: ChatMessage) => {
    setMessages((cur) => {
      if (cur.some((x) => x.id === m.id)) return cur.map((x) => (x.id === m.id ? m : x))
      const next = [...cur, m].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      lastAtRef.current = next.at(-1)?.createdAt ?? null
      return next
    })
  }, [])

  const openChannel = useCallback((id: string) => {
    setActiveId(id); setListOpen(false); setError(null)
    setChannels((cur) => cur.map((c) => (c.id === id ? { ...c, unread: 0 } : c)))
    window.history.replaceState(null, '', `/app/chat?c=${id}`)
    start(async () => {
      const rows = await listMessages({ channelId: id })
      if (activeRef.current !== id) return
      setMessages(rows)
      lastAtRef.current = rows.at(-1)?.createdAt ?? null
      await markRead({ channelId: id })
    })
  }, [])

  // Live: one subscription for the whole company; the active space gets the
  // message, the others get an unread bump. Polling covers Realtime being off.
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase.channel(`chat-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'phaseforge', table: 'chat_messages', filter: `company_id=eq.${companyId}` }, (payload) => {
        const row = payload.new as Record<string, unknown>
        if (!row?.id) return
        const m: ChatMessage = {
          id: row.id as string, channelId: row.channel_id as string, authorId: row.author_id as string,
          body: row.deleted_at ? '' : (row.body as string), kind: (row.kind as 'message' | 'update') ?? 'message',
          projectId: (row.project_id as string | null) ?? null, createdAt: row.created_at as string,
          editedAt: (row.edited_at as string | null) ?? null, deleted: !!row.deleted_at,
        }
        if (m.channelId === activeRef.current) {
          appendMessage(m)
          if (m.authorId !== me.id && payload.eventType === 'INSERT') void markRead({ channelId: m.channelId })
        } else if (payload.eventType === 'INSERT' && m.authorId !== me.id) {
          setChannels((cur) => cur.map((c) => (c.id === m.channelId ? { ...c, unread: c.unread + 1, lastAt: m.createdAt } : c)))
        }
      })
      .subscribe()
    const poll = setInterval(() => {
      const id = activeRef.current
      if (!id || document.hidden) return
      void listMessages({ channelId: id, after: lastAtRef.current ?? undefined, limit: 50 }).then((rows) => {
        if (activeRef.current !== id) return
        for (const r of rows) appendMessage(r)
      })
    }, 20000)
    return () => { supabase.removeChannel(ch); clearInterval(poll) }
  }, [companyId, me.id, appendMessage])

  const send = (body: string, asUpdate: boolean) => {
    if (!activeId) return
    start(async () => {
      setError(null)
      const res = await sendMessage({ channelId: activeId, body, asUpdate })
      if (!res.ok) { setError(res.error); return }
      appendMessage(res.message)
      setChannels((cur) => cur.map((c) => (c.id === activeId ? { ...c, lastAt: res.message.createdAt } : c)))
    })
  }

  const addTrade = (trade: string) => start(async () => {
    const res = await createTradeChannel({ trade })
    if (!res.ok) { setError(res.error); return }
    if (!trades.includes(trade)) setTrades((t) => [...t, trade].sort())
    setAdding(null); router.refresh(); openChannel(res.id)
    setChannels((cur) => cur.some((c) => c.id === res.id) ? cur : [...cur, { id: res.id, kind: 'trade', name: trade, trade, projectId: null, peerId: null, unread: 0, lastAt: null }])
  })
  const addProject = (projectId: string) => start(async () => {
    const res = await ensureProjectChannel({ projectId })
    if (!res.ok) { setError(res.error); return }
    const p = projectMap[projectId]
    setAdding(null)
    setChannels((cur) => cur.some((c) => c.id === res.id) ? cur : [...cur, { id: res.id, kind: 'project', name: p ? (p.jobNumber ? `${p.name} (${p.jobNumber})` : p.name) : 'Project', trade: null, projectId, peerId: null, unread: 0, lastAt: null }])
    openChannel(res.id)
  })
  const addDirect = (profileId: string) => start(async () => {
    const res = await ensureDirectChannel({ profileId })
    if (!res.ok) { setError(res.error); return }
    setAdding(null)
    setChannels((cur) => cur.some((c) => c.id === res.id) ? cur : [...cur, { id: res.id, kind: 'direct', name: memberMap[profileId]?.name ?? 'Direct message', trade: null, projectId: null, peerId: profileId, unread: 0, lastAt: null }])
    openChannel(res.id)
  })
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

  return (
    <div className="flex h-[calc(100dvh-56px)] md:h-full">
      {/* ── Spaces ── */}
      <aside className={cn('w-full shrink-0 flex-col border-r border-slate-200 bg-white md:flex md:w-72', listOpen ? 'flex' : 'hidden')} data-help="chat-spaces">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h1 className="flex items-center gap-2 text-base font-bold text-slate-900"><MessageSquare size={18} className="text-indigo-600" /> Chat{totalUnread ? <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{totalUnread}</span> : null}</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {groups.map((g) => {
            const rows = channels.filter((c) => g.kinds.includes(c.kind)).sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? '') || a.name.localeCompare(b.name))
            const addKind = g.label === 'Trades' ? 'trade' : g.label === 'Projects' ? 'project' : g.label === 'Direct messages' ? 'direct' : null
            return (
              <div key={g.label} className="mb-3">
                <div className="flex items-center justify-between px-2 pb-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{g.label}</p>
                  {addKind && (
                    <button onClick={() => setAdding(adding === addKind ? null : addKind)} title={`New ${g.label.toLowerCase()} space`} data-help={`chat-add-${addKind}`}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"><Plus size={12} /></button>
                  )}
                </div>
                {adding === addKind && addKind && (
                  <AddPicker kind={addKind} trades={trades} projects={projects} members={members.filter((m) => m.id !== me.id)}
                    onPick={(id) => addKind === 'trade' ? addTrade(id) : addKind === 'project' ? addProject(id) : addDirect(id)} onClose={() => setAdding(null)} />
                )}
                {rows.length === 0 && !adding && <p className="px-2 py-1 text-[11px] text-slate-300">None yet</p>}
                {rows.map((c) => (
                  <button key={c.id} onClick={() => openChannel(c.id)}
                    className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm', c.id === activeId ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-700 hover:bg-slate-50')}>
                    <span className={cn('shrink-0', c.id === activeId ? 'text-indigo-500' : 'text-slate-400')}>{KIND_ICON[c.kind]}</span>
                    <span className="min-w-0 flex-1 truncate">{channelLabel(c)}</span>
                    {c.unread > 0 && <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{c.unread}</span>}
                  </button>
                ))}
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
                {active.kind === 'project' && active.projectId && <Link href={`/app/projects/${active.projectId}`} className="text-indigo-600 hover:underline">Open project</Link>}
                {active.kind === 'direct' && 'Just the two of you'}
              </span>
            </header>

            <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-5">
              {messages.length === 0 && (
                <p className="py-10 text-center text-xs text-slate-400">
                  {active.kind === 'trade' ? `Nothing in ${active.name} yet. Say something, or @${active.name} from anywhere to reach this crew.`
                    : active.kind === 'updates' ? 'Project updates posted from any project space show up here.'
                    : 'No messages yet.'}
                </p>
              )}
              {messages.map((m, i) => {
                const prev = messages[i - 1]
                const newDay = !prev || prev.createdAt.slice(0, 10) !== m.createdAt.slice(0, 10)
                const grouped = !newDay && prev && prev.authorId === m.authorId && prev.kind === m.kind && (new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime()) < 5 * 60000
                return (
                  <div key={m.id}>
                    {newDay && (
                      <div className="my-3 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        <span className="h-px flex-1 bg-slate-200" />{dayOf(m.createdAt)}<span className="h-px flex-1 bg-slate-200" />
                      </div>
                    )}
                    <MessageRow m={m} mine={m.authorId === me.id} author={memberMap[m.authorId]} grouped={grouped}
                      project={m.projectId ? projectMap[m.projectId] : undefined} showProject={active.kind === 'updates'}
                      trades={trades} members={members}
                      onEdit={(body) => { setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, body, editedAt: new Date().toISOString() } : x))); void editMessage({ id: m.id, body }) }}
                      onDelete={() => { setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, body: '', deleted: true } : x))); void deleteMessage({ id: m.id }) }} />
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            <Composer key={active.id} channel={active} trades={trades} members={members} onSend={send} pending={pending} error={error} />
          </>
        )}
      </section>
    </div>
  )
}

function AddPicker({ kind, trades, projects, members, onPick, onClose }: {
  kind: 'trade' | 'project' | 'direct'; trades: string[]; projects: Props['projects']; members: ChatMember[]
  onPick: (id: string) => void; onClose: () => void
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
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X size={12} /></button>
      </div>
      <div className="mt-1 max-h-48 overflow-y-auto">
        {shown.map((i) => (
          <button key={i.id} onClick={() => onPick(i.id)} className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs text-slate-700 hover:bg-white">
            <span className="truncate">{i.label}</span>{i.sub && <span className="ml-2 shrink-0 text-[10px] text-slate-400">{i.sub}</span>}
          </button>
        ))}
        {kind === 'trade' && q.trim() && !shown.some((i) => i.label.toLowerCase() === t) && (
          <button onClick={() => onPick(q.trim())} className="mt-1 w-full rounded px-2 py-1 text-left text-xs font-medium text-indigo-600 hover:bg-white">Create “{q.trim()}”</button>
        )}
        {shown.length === 0 && kind !== 'trade' && <p className="px-2 py-1 text-[11px] text-slate-400">No matches.</p>}
      </div>
    </div>
  )
}

function MessageRow({ m, mine, author, grouped, project, showProject, trades, members, onEdit, onDelete }: {
  m: ChatMessage; mine: boolean; author: ChatMember | undefined; grouped: boolean
  project?: Props['projects'][number]; showProject: boolean; trades: string[]; members: ChatMember[]
  onEdit: (body: string) => void; onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(m.body)
  const { segments } = useMemo(() => parseMentions(m.body, trades, members.map((x) => ({ id: x.id, name: x.name }))), [m.body, trades, members])
  const name = author?.name ?? 'Someone'
  return (
    <div className={cn('group flex gap-2.5 rounded-lg px-2 hover:bg-white/70', grouped ? 'py-0.5' : 'mt-2 py-1')}>
      <div className="w-8 shrink-0">
        {!grouped && (author?.avatarUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={author.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
          : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700">{initials(name)}</span>)}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <p className="flex items-baseline gap-2 text-xs">
            <span className="font-semibold text-slate-900">{name}</span>
            <span className="text-[10px] text-slate-400">{timeOf(m.createdAt)}</span>
            {m.kind === 'update' && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">Project update</span>}
          </p>
        )}
        {m.kind === 'update' && showProject && project && (
          <Link href={`/app/projects/${project.id}`} className="text-[11px] font-medium text-indigo-600 hover:underline">{project.name}{project.jobNumber ? ` · ${project.jobNumber}` : ''}</Link>
        )}
        {m.deleted ? (
          <p className="text-xs italic text-slate-400">Message removed</p>
        ) : editing ? (
          <div className="mt-1 flex gap-1.5">
            <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setEditing(false); if (draft.trim() && draft !== m.body) onEdit(draft.trim()) } if (e.key === 'Escape') setEditing(false) }}
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-indigo-400" />
            <button onClick={() => setEditing(false)} className="text-xs text-slate-500">Cancel</button>
          </div>
        ) : (
          <p className={cn('whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800', m.kind === 'update' && 'rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2')}>
            {segments.map((s, i) => s.kind === 'text' ? <span key={i}>{s.text}</span>
              : <span key={i} className={cn('rounded px-1 font-semibold', s.kind === 'trade' ? 'bg-emerald-100 text-emerald-800' : s.kind === 'everyone' ? 'bg-rose-100 text-rose-700' : 'bg-indigo-100 text-indigo-700')}>{s.text}</span>)}
            {m.editedAt && <span className="ml-1 text-[10px] text-slate-400">(edited)</span>}
          </p>
        )}
      </div>
      {mine && !m.deleted && !editing && (
        <span className="flex shrink-0 items-start gap-0.5 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100">
          <button onClick={() => { setDraft(m.body); setEditing(true) }} className="rounded p-1 text-slate-300 hover:text-indigo-600" aria-label="Edit"><Pencil size={12} /></button>
          <button onClick={() => { if (confirm('Remove this message?')) onDelete() }} className="rounded p-1 text-slate-300 hover:text-rose-600" aria-label="Remove"><Trash2 size={12} /></button>
        </span>
      )}
    </div>
  )
}

function Composer({ channel, trades, members, onSend, pending, error }: {
  channel: ChatChannel; trades: string[]; members: ChatMember[]
  onSend: (body: string, asUpdate: boolean) => void; pending: boolean; error: string | null
}) {
  const [text, setText] = useState('')
  const [asUpdate, setAsUpdate] = useState(false)
  const [caret, setCaret] = useState(0)
  const [pick, setPick] = useState(0)
  const ref = useRef<HTMLTextAreaElement>(null)
  const cands = useMemo(() => mentionCandidates(trades, members.map((m) => ({ id: m.id, name: m.name }))), [trades, members])
  const handle = activeHandle(text, caret)
  const options = useMemo(() => {
    if (!handle) return []
    const q = handle.query.toLowerCase()
    const all = [{ handle: 'everyone', kind: 'everyone' as const, id: 'everyone' }, ...cands]
    const seen = new Set<string>()
    return all.filter((c) => c.handle.toLowerCase().startsWith(q) && !seen.has(c.handle.toLowerCase()) && seen.add(c.handle.toLowerCase())).slice(0, 8)
  }, [handle, cands])

  const insert = (h: string) => {
    if (!handle) return
    const before = text.slice(0, handle.start), after = text.slice(caret)
    const next = `${before}@${h} ${after}`
    setText(next)
    const pos = before.length + h.length + 2
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(pos, pos); setCaret(pos) })
  }
  const submit = () => {
    if (!text.trim() || pending) return
    onSend(text, asUpdate)
    setText(''); setAsUpdate(false)
  }
  const hint = channel.kind === 'trade' ? `Message ${channel.name}` : channel.kind === 'updates' ? 'Post a company-wide update' : `Message ${channel.name}`

  return (
    <div className="border-t border-slate-200 bg-white p-3 sm:px-5" data-help="chat-composer">
      {options.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-1">
          {options.map((o, i) => (
            <button key={o.handle} onMouseDown={(e) => { e.preventDefault(); insert(o.handle) }}
              className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', i === pick ? 'bg-indigo-600 text-white' : o.kind === 'trade' ? 'bg-emerald-100 text-emerald-800' : o.kind === 'everyone' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700')}>
              @{o.handle}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea ref={ref} value={text} rows={1} placeholder={`${hint}. @ a trade, a person, or everyone.`}
          onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); setPick(0) }}
          onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
          onKeyDown={(e) => {
            if (options.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setPick((p) => (p + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length); return }
            if (options.length && (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey))) { e.preventDefault(); insert(options[pick].handle); return }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
          }}
          style={{ height: 'auto', maxHeight: 160 }}
          onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = `${Math.min(160, t.scrollHeight)}px` }}
          className="min-h-[40px] flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400" />
        <button onClick={submit} disabled={pending || !text.trim()} aria-label="Send"
          className="rounded-xl bg-indigo-600 p-2.5 text-white hover:bg-indigo-700 disabled:opacity-40"><Send size={16} /></button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
        {channel.kind === 'project' && (
          <label className="inline-flex items-center gap-1.5 text-slate-600" data-help="chat-update">
            <input type="checkbox" checked={asUpdate} onChange={(e) => setAsUpdate(e.target.checked)} />
            <Megaphone size={11} /> Post as project update (also goes to the Project updates feed)
          </label>
        )}
        <span>Enter sends, Shift+Enter for a new line.</span>
        {error && <span className="font-medium text-rose-600">{error}</span>}
      </div>
      <span className="sr-only"><Users size={1} /></span>
    </div>
  )
}
