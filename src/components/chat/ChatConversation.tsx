'use client'

// One space's conversation: the messages, the composer with @ pings and
// photos, and (for a project space) the trade strip that filters the thread
// down to one trade and pings that trade with a click. Used by the Chat
// page and embedded in the project hub's Chat section.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Camera, HardHat, Megaphone, Pencil, Send, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/dates'
import { createClient } from '@/lib/supabase/client'
import { shrinkImage } from '@/lib/chat/shrinkImage'
import { activeHandle, mentionCandidates, parseMentions } from '@/lib/chat/mentions'
import type { ChatEvent } from '@/lib/chat/systemEvents'
import { SystemCard } from './SystemCard'
import {
  deleteMessage, editMessage, listMessages, markRead, sendMessage, signChatPhotos, uploadChatPhotos,
  type ChatAttachment, type ChatChannel, type ChatMessage,
} from '@/app/app/chat/actions'

export interface ChatMember { id: string; name: string; avatarUrl: string | null; trades: string[]; title: string | null }
export interface ChatProjectRef { id: string; name: string; jobNumber: string | null; trade?: string | null }

interface ChatConversationProps {
  channel: ChatChannel
  me: { id: string; name: string }
  /** Kept for callers; the subscription is per channel, not per company. */
  companyId?: string
  members: ChatMember[]
  trades: string[]
  projects: ChatProjectRef[]
  initialMessages: ChatMessage[]
  /** The project's own trade, shown first on the trade strip. */
  projectTrade?: string | null
  /** Called whenever a message is sent or arrives, so a parent can bump previews. */
  onActivity?: (m: ChatMessage) => void
  /** Managers and up can delete anyone's message, system cards included. */
  canModerate?: boolean
  className?: string
}

function initials(name: string) { return name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() }
function timeOf(iso: string) { return formatDate(iso, 'h:mm a') }
function dayOf(iso: string) {
  const d = iso.slice(0, 10), today = new Date().toISOString().slice(0, 10)
  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  return d === today ? 'Today' : d === y ? 'Yesterday' : formatDate(iso, 'EEEE, MMM d')
}

/** Turn a Realtime row into a message (photos arrive as paths only). */
export function messageFromRow(row: Record<string, unknown>): ChatMessage {
  const rawAtt = (row.attachments as Partial<ChatAttachment>[] | null) ?? []
  const mentions = (row.mentions as { trades?: string[] } | null) ?? {}
  return {
    id: row.id as string, channelId: row.channel_id as string, authorId: row.author_id as string,
    body: row.deleted_at ? '' : (row.body as string), kind: (row.kind as 'message' | 'update' | 'system') ?? 'message',
    event: (row.event as ChatEvent | null) ?? null,
    projectId: (row.project_id as string | null) ?? null, createdAt: row.created_at as string,
    editedAt: (row.edited_at as string | null) ?? null, deleted: !!row.deleted_at,
    trades: mentions.trades ?? [],
    attachments: row.deleted_at ? [] : rawAtt.filter((a) => a?.path).map((a) => ({
      path: a.path!, name: a.name ?? 'photo', type: a.type ?? 'image/jpeg', size: a.size ?? 0,
      width: a.width ?? null, height: a.height ?? null, url: null,
    })),
  }
}

export function ChatConversation({
  channel, me, members, trades, projects, initialMessages, projectTrade = null, onActivity, className, canModerate = false,
}: ChatConversationProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [error, setError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<ChatAttachment | null>(null)
  const [tradeFilter, setTradeFilter] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<ComposerHandle>(null)
  const lastAtRef = useRef<string | null>(initialMessages.at(-1)?.createdAt ?? null)
  const memberMap = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members])
  const projectMap = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects])

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [messages.length, tradeFilter])

  const appendMessage = useCallback((m: ChatMessage) => {
    setMessages((cur) => {
      if (cur.some((x) => x.id === m.id)) {
        return cur.map((x) => (x.id === m.id ? { ...m, attachments: m.attachments.map((a) => a.url ? a : x.attachments.find((y) => y.path === a.path) ?? a) } : x))
      }
      const next = [...cur, m].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      lastAtRef.current = next.at(-1)?.createdAt ?? null
      return next
    })
    const unsigned = m.attachments.filter((a) => !a.url).map((a) => a.path)
    if (unsigned.length) {
      void signChatPhotos({ paths: unsigned }).then((signed) => {
        const urls = new Map(signed.map((s) => [s.path, s.url]))
        setMessages((cur) => cur.map((x) => x.id === m.id ? { ...x, attachments: x.attachments.map((a) => ({ ...a, url: a.url ?? urls.get(a.path) ?? null })) } : x))
      })
    }
    onActivity?.(m)
  }, [onActivity])

  // Live for this space, plus a 20 second poll as a backstop.
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase.channel(`chat-conv-${channel.id}`)
      .on('postgres_changes', { event: '*', schema: 'phaseforge', table: 'chat_messages', filter: `channel_id=eq.${channel.id}` }, (payload) => {
        const row = payload.new as Record<string, unknown>
        if (!row?.id) return
        const m = messageFromRow(row)
        appendMessage(m)
        if (m.authorId !== me.id && payload.eventType === 'INSERT') void markRead({ channelId: channel.id })
      })
      .subscribe()
    const poll = setInterval(() => {
      if (document.hidden) return
      void listMessages({ channelId: channel.id, after: lastAtRef.current ?? undefined, limit: 50 }).then((rows) => { for (const r of rows) appendMessage(r) })
    }, 20000)
    return () => { supabase.removeChannel(ch); clearInterval(poll) }
  }, [channel.id, me.id, appendMessage])

  const send = (body: string, asUpdate: boolean, photos: File[]) => {
    start(async () => {
      setError(null)
      let attachments: Omit<ChatAttachment, 'url'>[] = []
      if (photos.length) {
        const form = new FormData()
        form.set('channelId', channel.id)
        for (const f of photos) form.append('photos', f, f.name)
        const up = await uploadChatPhotos(form)
        if (!up.ok) { setError(up.error); return }
        attachments = up.attachments
      }
      // Inside a trade section, the message is addressed to that trade
      // unless it already names one.
      const text = tradeFilter && !new RegExp(`@${tradeFilter}\\b`, 'i').test(body) ? `@${tradeFilter} ${body}`.trim() : body
      const res = await sendMessage({ channelId: channel.id, body: text, asUpdate, attachments })
      if (!res.ok) { setError(res.error); return }
      appendMessage(res.message)
    })
  }

  // Trade strip for project spaces: the job's own trade first, then any trade
  // already talked about here, then the rest of the company's trades.
  const isProject = channel.kind === 'project'
  const tradeOrder = useMemo(() => {
    const talked = new Set(messages.flatMap((m) => m.trades))
    const known = (t: string) => trades.some((x) => x.toLowerCase() === t.toLowerCase())
    const extra = [...talked].filter((t) => !known(t) && t.toLowerCase() !== (projectTrade ?? '').toLowerCase())
    const rest = [...trades, ...extra].filter((t) => t !== projectTrade)
    return [...(projectTrade ? [projectTrade] : []), ...rest.filter((t) => talked.has(t)), ...rest.filter((t) => !talked.has(t))]
  }, [trades, projectTrade, messages])
  const countFor = (t: string) => messages.filter((m) => !m.deleted && m.trades.some((x) => x.toLowerCase() === t.toLowerCase())).length
  const isScheduleCard = (m: ChatMessage) => m.kind === 'system' && m.event?.type === 'schedule'
  const live = messages.filter((m) => !m.deleted)
  const visible = tradeFilter
    ? live.filter((m) => m.trades.some((x) => x.toLowerCase() === tradeFilter.toLowerCase()))
    : isProject ? live.filter((m) => !isScheduleCard(m)) : live

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col bg-slate-50', className)}>
      {isProject && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-3 py-2 sm:px-5" data-help="chat-trade-strip">
          <span className="mr-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400"><HardHat size={11} /> Trades</span>
          <button onClick={() => setTradeFilter(null)}
            className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-medium', !tradeFilter ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
            Whole job
          </button>
          {tradeOrder.map((t) => {
            const n = countFor(t)
            return (
              <button key={t} onClick={() => setTradeFilter(tradeFilter === t ? null : t)}
                title={`Show only ${t} messages. Anything you send here pings @${t}.`}
                className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium', tradeFilter === t ? 'bg-emerald-600 text-white' : n ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}>
                {t}{n ? <span className={cn('rounded-full px-1 text-[9px] font-bold', tradeFilter === t ? 'bg-white/25' : 'bg-white')}>{n}</span> : null}
              </button>
            )
          })}
          <button onClick={() => composerRef.current?.insertMention(tradeFilter ?? projectTrade ?? tradeOrder[0] ?? '')}
            className="ml-auto rounded-full border border-dashed border-emerald-300 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50" data-help="chat-ping-trade">
            Ping {tradeFilter ?? projectTrade ?? 'a trade'}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-5">
        {visible.length === 0 && (
          <p className="py-10 text-center text-xs text-slate-400">
            {tradeFilter ? `Nothing for ${tradeFilter} on this job yet. Send a message here and it goes to @${tradeFilter}.`
              : channel.kind === 'trade' ? `Nothing in ${channel.name} yet. Say something, or @${channel.name} from anywhere to reach this crew.`
              : channel.kind === 'updates' ? 'Project updates posted from any project space show up here.'
              : channel.kind === 'project' ? 'No messages on this job yet. Anything posted here stays with the project.'
              : 'No messages yet.'}
          </p>
        )}
        {visible.map((m, i) => {
          const prev = visible[i - 1]
          const newDay = !prev || prev.createdAt.slice(0, 10) !== m.createdAt.slice(0, 10)
          const grouped = !newDay && prev && m.kind !== 'system' && prev.kind !== 'system' && prev.authorId === m.authorId && prev.kind === m.kind && (new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime()) < 5 * 60000
          return (
            <div key={m.id}>
              {newDay && (
                <div className="my-3 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" />{dayOf(m.createdAt)}<span className="h-px flex-1 bg-slate-200" />
                </div>
              )}
              <MessageRow m={m} mine={m.authorId === me.id} canDelete={m.authorId === me.id || canModerate} author={memberMap[m.authorId]} grouped={grouped}
                project={m.projectId ? projectMap[m.projectId] : undefined} showProject={channel.kind === 'updates'}
                trades={trades} members={members} onPhoto={setLightbox}
                onEdit={(body) => { setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, body, editedAt: new Date().toISOString() } : x))); void editMessage({ id: m.id, body }) }}
                onDelete={() => {
                  const before = messages
                  setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, body: '', deleted: true, attachments: [] } : x)))
                  void deleteMessage({ id: m.id }).then((r) => { if (!r.ok) { setMessages(before); setError(r.error) } })
                }} />
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <Composer ref={composerRef} key={channel.id} channel={channel} trades={trades} members={members} onSend={send} pending={pending} error={error}
        section={tradeFilter} />

      {lightbox && lightbox.url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.url} alt={lightbox.name} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
          <a href={lightbox.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-800 hover:bg-white">Open full size</a>
          <button onClick={() => setLightbox(null)} aria-label="Close" className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-slate-800 hover:bg-white"><X size={16} /></button>
        </div>
      )}
    </div>
  )
}

function MessageRow({ m, mine, canDelete, author, grouped, project, showProject, trades, members, onEdit, onDelete, onPhoto }: {
  m: ChatMessage; mine: boolean; canDelete: boolean; author: ChatMember | undefined; grouped: boolean
  project?: ChatProjectRef; showProject: boolean; trades: string[]; members: ChatMember[]
  onEdit: (body: string) => void; onDelete: () => void; onPhoto: (a: ChatAttachment) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(m.body)
  const { segments } = useMemo(() => parseMentions(m.body, trades, members.map((x) => ({ id: x.id, name: x.name }))), [m.body, trades, members])
  const name = author?.name ?? 'Someone'
  const askDelete = () => { if (confirm(m.kind === 'system' ? 'Delete this card from the chat?' : 'Delete this message? It is removed for everyone.')) onDelete() }
  if (m.kind === 'system' && m.event && !m.deleted) {
    return (
      <div className="group my-2 flex gap-2.5 px-2">
        <div className="w-8 shrink-0" />
        <div className="min-w-0 max-w-2xl flex-1">
          <SystemCard event={m.event} actor={name} time={timeOf(m.createdAt)} projectId={m.projectId} />
        </div>
        {canDelete && (
          <button onClick={askDelete} aria-label="Delete card" title="Delete"
            className="self-start rounded p-1 text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 pointer-coarse:opacity-100"><Trash2 size={13} /></button>
        )}
      </div>
    )
  }
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
          <Link href={`/app/projects/${project.id}?tab=chat`} className="text-[11px] font-medium text-indigo-600 hover:underline">{project.name}{project.jobNumber ? ` · ${project.jobNumber}` : ''}</Link>
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
          <>
            {m.body && (
              <p className={cn('whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800', m.kind === 'update' && 'rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2')}>
                {segments.map((s, i) => s.kind === 'text' ? <span key={i}>{s.text}</span>
                  : <span key={i} className={cn('rounded px-1 font-semibold', s.kind === 'trade' ? 'bg-emerald-100 text-emerald-800' : s.kind === 'everyone' ? 'bg-rose-100 text-rose-700' : 'bg-indigo-100 text-indigo-700')}>{s.text}</span>)}
                {m.editedAt && <span className="ml-1 text-[10px] text-slate-400">(edited)</span>}
              </p>
            )}
            {m.attachments.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {m.attachments.map((a) => a.url ? (
                  <button key={a.path} onClick={() => onPhoto(a)} className="overflow-hidden rounded-lg ring-1 ring-slate-200 hover:ring-indigo-400" title={a.name}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={a.name} loading="lazy" className={cn('object-cover', m.attachments.length === 1 ? 'max-h-72 max-w-full' : 'h-32 w-32')} />
                  </button>
                ) : (
                  <span key={a.path} className="flex h-32 w-32 items-center justify-center rounded-lg bg-slate-100 text-[11px] text-slate-400"><Camera size={14} /></span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {(mine || canDelete) && !m.deleted && !editing && (
        <span className="flex shrink-0 items-start gap-0.5 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100">
          {mine && m.body && <button onClick={() => { setDraft(m.body); setEditing(true) }} className="rounded p-1 text-slate-300 hover:text-indigo-600" aria-label="Edit" title="Edit"><Pencil size={12} /></button>}
          {canDelete && <button onClick={askDelete} className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete" title="Delete"><Trash2 size={12} /></button>}
        </span>
      )}
    </div>
  )
}

export interface ComposerHandle { insertMention: (handle: string) => void }

const Composer = forwardRef<ComposerHandle, {
  channel: ChatChannel; trades: string[]; members: ChatMember[]
  onSend: (body: string, asUpdate: boolean, photos: File[]) => void; pending: boolean; error: string | null
  /** Trade section in a project space: sends are addressed to it. */
  section: string | null
}>(function Composer({ channel, trades, members, onSend, pending, error, section }, handleRef) {
  const [text, setText] = useState('')
  const [asUpdate, setAsUpdate] = useState(false)
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([])
  const [shrinking, setShrinking] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
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

  const addFiles = async (list: FileList | File[]) => {
    const files = [...list].filter((f) => f.type.startsWith('image/')).slice(0, 10 - photos.length)
    if (!files.length) return
    setShrinking(true)
    const shrunk = await Promise.all(files.map(async (f) => { const s = await shrinkImage(f); return { file: s, preview: URL.createObjectURL(s) } }))
    setPhotos((cur) => [...cur, ...shrunk].slice(0, 10))
    setShrinking(false)
  }
  const removePhoto = (i: number) => setPhotos((cur) => { URL.revokeObjectURL(cur[i].preview); return cur.filter((_, k) => k !== i) })

  const insert = (h: string) => {
    if (!handle) return
    const before = text.slice(0, handle.start), after = text.slice(caret)
    const next = `${before}@${h} ${after}`
    setText(next)
    const pos = before.length + h.length + 2
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(pos, pos); setCaret(pos) })
  }
  useImperativeHandle(handleRef, () => ({
    insertMention: (h: string) => {
      if (!h) return
      setText((cur) => {
        if (new RegExp(`@${h}\\b`, 'i').test(cur)) return cur
        return cur.trim() ? `${cur.replace(/\s+$/, '')} @${h} ` : `@${h} `
      })
      requestAnimationFrame(() => { ref.current?.focus(); const n = ref.current?.value.length ?? 0; ref.current?.setSelectionRange(n, n); setCaret(n) })
    },
  }), [])

  const submit = () => {
    if ((!text.trim() && !photos.length) || pending || shrinking) return
    onSend(text, asUpdate, photos.map((p) => p.file))
    for (const p of photos) URL.revokeObjectURL(p.preview)
    setPhotos([]); setText(''); setAsUpdate(false)
  }
  const hint = section ? `Message the ${section} crew on this job` : channel.kind === 'updates' ? 'Post a company-wide update' : `Message ${channel.name}`

  return (
    <div className="border-t border-slate-200 bg-white p-3 sm:px-5" data-help="chat-composer"
      onDragOver={(e) => { e.preventDefault() }} onDrop={(e) => { e.preventDefault(); void addFiles(e.dataTransfer.files) }}>
      {photos.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <span key={p.preview} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" className="h-16 w-16 rounded-lg object-cover ring-1 ring-slate-200" />
              <button onClick={() => removePhoto(i)} aria-label="Remove photo"
                className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 text-slate-500 shadow ring-1 ring-slate-200 hover:text-rose-600"><X size={10} /></button>
            </span>
          ))}
          {shrinking && <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-400">Sizing</span>}
        </div>
      )}
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
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = '' }} />
        <button onClick={() => fileRef.current?.click()} disabled={pending || photos.length >= 10} data-help="chat-photos" aria-label="Add photos" title="Add photos (or paste or drop them in)"
          className="rounded-xl border border-slate-300 p-2.5 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-40"><Camera size={16} /></button>
        <textarea ref={ref} value={text} rows={1} placeholder={`${hint}. @ a trade, a person, or everyone.`}
          onPaste={(e) => { const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/')); if (files.length) { e.preventDefault(); void addFiles(files) } }}
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
        <button onClick={submit} disabled={pending || shrinking || (!text.trim() && !photos.length)} aria-label="Send"
          className="rounded-xl bg-indigo-600 p-2.5 text-white hover:bg-indigo-700 disabled:opacity-40"><Send size={16} /></button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
        {channel.kind === 'project' && (
          <label className="inline-flex items-center gap-1.5 text-slate-600" data-help="chat-update">
            <input type="checkbox" checked={asUpdate} onChange={(e) => setAsUpdate(e.target.checked)} />
            <Megaphone size={11} /> Post as project update (also goes to the Project updates feed)
          </label>
        )}
        {section && <span className="font-medium text-emerald-700">Sending to @{section}</span>}
        <span>Enter sends, Shift+Enter for a new line.</span>
        {error && <span className="font-medium text-rose-600">{error}</span>}
      </div>
    </div>
  )
})
