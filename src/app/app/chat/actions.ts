'use server'

// Chat: trade spaces, project spaces, direct messages, and the company-wide
// Project updates feed. Messages are plain rows; live delivery is Supabase
// Realtime on chat_messages with a polling fallback in the client.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { STANDARD_TRADES } from '@/lib/constants'
import { parseMentions } from '@/lib/chat/mentions'

export type ChannelKind = 'general' | 'updates' | 'trade' | 'project' | 'direct'

export interface ChatChannel {
  id: string
  kind: ChannelKind
  name: string
  trade: string | null
  projectId: string | null
  /** For direct messages: the other person. */
  peerId: string | null
  unread: number
  lastAt: string | null
}

export interface ChatAttachment {
  path: string
  name: string
  type: string
  size: number
  width: number | null
  height: number | null
  /** Signed for an hour; null until signed. */
  url: string | null
}

export interface ChatMessage {
  id: string
  attachments: ChatAttachment[]
  /** Trades pinged in the body (from @Trade), lowercase-insensitive. */
  trades: string[]
  channelId: string
  authorId: string
  body: string
  kind: 'message' | 'update'
  projectId: string | null
  createdAt: string
  editedAt: string | null
  deleted: boolean
}

async function ctx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: p } = await supabase.from('profiles').select('company_id, full_name, trades').eq('id', user.id).single()
  if (!p?.company_id) throw new Error('No organization')
  return { supabase, userId: user.id, companyId: p.company_id as string, myName: p.full_name as string, myTrades: (p.trades as string[] | null) ?? [] }
}
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'Failed' })

/** The trades this company talks about: the standard list plus any on its projects or people. */
export async function companyTrades(): Promise<string[]> {
  const { supabase, companyId } = await ctx()
  const [{ data: projs }, { data: people }] = await Promise.all([
    supabase.from('projects').select('trade').eq('company_id', companyId).not('trade', 'is', null),
    supabase.from('profiles').select('trades').eq('company_id', companyId),
  ])
  const set = new Set<string>(STANDARD_TRADES)
  for (const r of projs ?? []) if (r.trade?.trim()) set.add(r.trade.trim())
  for (const r of people ?? []) for (const t of (r.trades as string[] | null) ?? []) if (t.trim()) set.add(t.trim())
  return [...set].sort((a, b) => a.localeCompare(b))
}

/** General, Project updates, and a space for every trade the projects use. */
export async function ensureBaseChannels(): Promise<void> {
  const { supabase, userId, companyId } = await ctx()
  const { data: existing } = await supabase.from('chat_channels').select('kind, trade, project_id').eq('company_id', companyId)
  const have = new Set((existing ?? []).map((c) => c.kind === 'trade' ? `trade:${String(c.trade).toLowerCase()}` : c.kind))
  const rows: Record<string, unknown>[] = []
  if (!have.has('general')) rows.push({ company_id: companyId, kind: 'general', name: 'General', created_by: userId })
  if (!have.has('updates')) rows.push({ company_id: companyId, kind: 'updates', name: 'Project updates', created_by: userId })
  const { data: projs } = await supabase.from('projects').select('trade').eq('company_id', companyId).not('trade', 'is', null)
  for (const t of new Set((projs ?? []).map((p) => String(p.trade).trim()).filter(Boolean))) {
    if (!have.has(`trade:${t.toLowerCase()}`)) rows.push({ company_id: companyId, kind: 'trade', name: t, trade: t, created_by: userId })
  }
  // Every live project gets its own space, so the chat room mirrors the
  // project list and a job's conversation is always one click away.
  const { data: liveProjects } = await supabase.from('projects').select('id, name, job_number').eq('company_id', companyId).eq('is_archived', false)
  const haveProject = new Set((existing ?? []).map((c) => c.kind === 'project' ? String((c as { project_id?: string | null }).project_id ?? '') : ''))
  for (const p of liveProjects ?? []) {
    if (!haveProject.has(p.id)) rows.push({ company_id: companyId, kind: 'project', name: p.job_number ? `${p.name} (${p.job_number})` : p.name, project_id: p.id, created_by: userId })
  }
  if (rows.length) await supabase.from('chat_channels').insert(rows)
}

export async function listChannels(): Promise<ChatChannel[]> {
  const { supabase, userId, companyId } = await ctx()
  const [{ data: channels }, { data: mine }, { data: directMembers }] = await Promise.all([
    supabase.from('chat_channels').select('id, kind, name, trade, project_id').eq('company_id', companyId).eq('archived', false).order('name'),
    supabase.from('chat_channel_members').select('channel_id, last_read_at').eq('profile_id', userId),
    supabase.from('chat_channel_members').select('channel_id, profile_id').eq('company_id', companyId).neq('profile_id', userId),
  ])
  const lastRead = new Map((mine ?? []).map((m) => [m.channel_id, m.last_read_at as string]))
  const peers = new Map<string, string>()
  for (const m of directMembers ?? []) if (!peers.has(m.channel_id)) peers.set(m.channel_id, m.profile_id)

  const out: ChatChannel[] = await Promise.all((channels ?? []).map(async (c) => {
    const since = lastRead.get(c.id) ?? '1970-01-01'
    const [{ count }, { data: last }] = await Promise.all([
      supabase.from('chat_messages').select('id', { count: 'exact', head: true })
        .eq('channel_id', c.id).gt('created_at', since).neq('author_id', userId).is('deleted_at', null),
      supabase.from('chat_messages').select('created_at').eq('channel_id', c.id).order('created_at', { ascending: false }).limit(1),
    ])
    return {
      id: c.id, kind: c.kind as ChannelKind, name: c.name, trade: c.trade, projectId: c.project_id,
      peerId: c.kind === 'direct' ? peers.get(c.id) ?? null : null,
      unread: count ?? 0, lastAt: last?.[0]?.created_at ?? null,
    }
  }))
  return out
}

const BUCKET = 'project-attachments'
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'])
const PHOTO_MAX_BYTES = 8 * 1024 * 1024

/** Attach an hour-long signed URL to every photo on these messages. */
async function signMessages(rows: ChatMessage[]): Promise<ChatMessage[]> {
  const paths = rows.flatMap((r) => r.attachments.map((a) => a.path))
  if (!paths.length) return rows
  const admin = createAdminClient()
  const { data } = await admin.storage.from(BUCKET).createSignedUrls(paths, 60 * 60)
  const urls = new Map((data ?? []).map((d) => [d.path, d.signedUrl]))
  return rows.map((r) => ({ ...r, attachments: r.attachments.map((a) => ({ ...a, url: urls.get(a.path) ?? null })) }))
}

function mapMessage(m: Record<string, unknown>): ChatMessage {
  const raw = (m.attachments as Partial<ChatAttachment>[] | null) ?? []
  const mentions = (m.mentions as { trades?: string[] } | null) ?? {}
  return {
    trades: mentions.trades ?? [],
    attachments: m.deleted_at ? [] : raw.filter((a) => a?.path).map((a) => ({
      path: a.path!, name: a.name ?? 'photo', type: a.type ?? 'image/jpeg', size: a.size ?? 0,
      width: a.width ?? null, height: a.height ?? null, url: null,
    })),
    id: m.id as string, channelId: m.channel_id as string, authorId: m.author_id as string,
    body: m.deleted_at ? '' : (m.body as string), kind: (m.kind as 'message' | 'update') ?? 'message',
    projectId: (m.project_id as string | null) ?? null, createdAt: m.created_at as string,
    editedAt: (m.edited_at as string | null) ?? null, deleted: !!m.deleted_at,
  }
}

/** Newest `limit` messages (returned oldest first), optionally before/after a timestamp. */
export async function listMessages(input: { channelId: string; before?: string; after?: string; limit?: number }): Promise<ChatMessage[]> {
  const { supabase } = await ctx()
  const limit = Math.min(200, input.limit ?? 60)
  let q = supabase.from('chat_messages').select('*').eq('channel_id', input.channelId)
  if (input.after) q = q.gt('created_at', input.after).order('created_at', { ascending: true }).limit(limit)
  else {
    if (input.before) q = q.lt('created_at', input.before)
    q = q.order('created_at', { ascending: false }).limit(limit)
  }
  const { data } = await q
  const rows = await signMessages((data ?? []).map((m) => mapMessage(m as Record<string, unknown>)))
  return input.after ? rows : rows.reverse()
}

/** Signed URLs for photos that arrived over Realtime (which carries only paths). */
export async function signChatPhotos(input: { paths: string[] }): Promise<{ path: string; url: string | null }[]> {
  try {
    const { companyId } = await ctx()
    const paths = input.paths.filter((p) => p.startsWith(`chat/${companyId}/`)).slice(0, 50)
    if (!paths.length) return []
    const admin = createAdminClient()
    const { data } = await admin.storage.from(BUCKET).createSignedUrls(paths, 60 * 60)
    return (data ?? []).map((d) => ({ path: d.path ?? '', url: d.signedUrl ?? null }))
  } catch { return [] }
}

/**
 * Store photos for a message. The browser shrinks them first; this checks
 * type and size, writes them under chat/<company>/<channel>/, and hands back
 * the attachment records to send with the message.
 */
export async function uploadChatPhotos(form: FormData) {
  try {
    const { supabase, companyId } = await ctx()
    const channelId = String(form.get('channelId') ?? '')
    const { data: channel } = await supabase.from('chat_channels').select('id').eq('id', channelId).single()
    if (!channel) return { ok: false as const, error: 'That space is gone.' }
    const files = form.getAll('photos').filter((f): f is File => f instanceof File)
    if (!files.length) return { ok: false as const, error: 'No photos attached.' }
    if (files.length > 10) return { ok: false as const, error: 'Ten photos per message at most.' }
    const admin = createAdminClient()
    const out: Omit<ChatAttachment, 'url'>[] = []
    for (const f of files) {
      if (!PHOTO_TYPES.has(f.type)) return { ok: false as const, error: `${f.name} is not a photo.` }
      if (f.size > PHOTO_MAX_BYTES) return { ok: false as const, error: `${f.name} is over 8 MB.` }
      const ext = f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : f.type === 'image/gif' ? 'gif' : 'jpg'
      const path = `chat/${companyId}/${channelId}/${crypto.randomUUID()}.${ext}`
      const { error } = await admin.storage.from(BUCKET).upload(path, f, { contentType: f.type, upsert: false })
      if (error) return { ok: false as const, error: error.message }
      const w = Number(form.get(`w:${f.name}`)), h = Number(form.get(`h:${f.name}`))
      out.push({ path, name: f.name, type: f.type, size: f.size, width: Number.isFinite(w) && w > 0 ? w : null, height: Number.isFinite(h) && h > 0 ? h : null })
    }
    return { ok: true as const, attachments: out }
  } catch (e) { return fail(e) }
}

/** Mark a channel read up to now (creates the membership row on first open). */
export async function markRead(input: { channelId: string }): Promise<void> {
  const { supabase, userId, companyId } = await ctx()
  await supabase.from('chat_channel_members').upsert(
    { channel_id: input.channelId, profile_id: userId, company_id: companyId, last_read_at: new Date().toISOString() },
    { onConflict: 'channel_id,profile_id' },
  )
}

export async function sendMessage(input: { channelId: string; body: string; asUpdate?: boolean; attachments?: Omit<ChatAttachment, 'url'>[] }) {
  try {
    const { supabase, userId, companyId, myName } = await ctx()
    const body = input.body.trim()
    const attachments = (input.attachments ?? []).filter((a) => a.path.startsWith(`chat/${companyId}/`)).slice(0, 10)
    if (!body && !attachments.length) return { ok: false as const, error: 'Type something or add a photo first.' }
    if (body.length > 4000) return { ok: false as const, error: 'That is too long for one message.' }
    const { data: channel } = await supabase.from('chat_channels').select('id, kind, name, project_id').eq('id', input.channelId).single()
    if (!channel) return { ok: false as const, error: 'That space is gone.' }

    const [trades, { data: people }] = await Promise.all([
      companyTrades(),
      supabase.from('profiles').select('id, full_name, trades').eq('company_id', companyId).eq('is_active', true),
    ])
    const members = (people ?? []).map((p) => ({ id: p.id, name: p.full_name }))
    const { mentions } = parseMentions(body, trades, members)

    const { data: msg, error } = await supabase.from('chat_messages').insert({
      company_id: companyId, channel_id: channel.id, author_id: userId, body,
      kind: 'message', project_id: channel.project_id, mentions, attachments,
    }).select('*').single()
    if (error || !msg) return { ok: false as const, error: error?.message ?? 'Could not send.' }

    // A project update also lands in the company-wide feed.
    let mirrored: ChatMessage | null = null
    if (input.asUpdate && channel.kind === 'project' && channel.project_id) {
      const { data: feed } = await supabase.from('chat_channels').select('id').eq('company_id', companyId).eq('kind', 'updates').maybeSingle()
      if (feed) {
        const { data: m2 } = await supabase.from('chat_messages').insert({
          company_id: companyId, channel_id: feed.id, author_id: userId, body,
          kind: 'update', project_id: channel.project_id, source_message_id: msg.id, mentions, attachments,
        }).select('*').single()
        if (m2) mirrored = (await signMessages([mapMessage(m2 as Record<string, unknown>)]))[0]
      }
      await supabase.from('chat_messages').update({ kind: 'update' }).eq('id', msg.id)
    }

    // Pings: mentioned people, everyone who lists a mentioned trade, or the
    // whole company for @everyone. Never the author.
    const targets = new Set<string>()
    for (const u of mentions.users) targets.add(u)
    for (const p of people ?? []) {
      const theirs = ((p.trades as string[] | null) ?? []).map((t) => t.toLowerCase())
      if (mentions.everyone || mentions.trades.some((t) => theirs.includes(t.toLowerCase()))) targets.add(p.id)
    }
    targets.delete(userId)
    if (targets.size) {
      const what = mentions.everyone ? 'everyone' : mentions.trades.length ? mentions.trades.join(', ') : 'you'
      await supabase.from('notifications').insert([...targets].map((uid) => ({
        user_id: uid, company_id: companyId, type: 'mention',
        title: `${myName} pinged ${what} in ${channel.name}`,
        body: body ? (body.length > 160 ? `${body.slice(0, 157)}...` : body) : `${attachments.length} photo${attachments.length === 1 ? '' : 's'}`,
        link: `/app/chat?c=${channel.id}`,
      })))
    }
    await markRead({ channelId: channel.id })
    const [signed] = await signMessages([mapMessage(msg as Record<string, unknown>)])
    return { ok: true as const, message: { ...signed, kind: input.asUpdate && channel.kind === 'project' ? 'update' as const : 'message' as const }, mirrored, pinged: targets.size }
  } catch (e) { return fail(e) }
}

export async function editMessage(input: { id: string; body: string }) {
  try {
    const { supabase, userId } = await ctx()
    const body = input.body.trim()
    if (!body) return { ok: false as const, error: 'Type something first.' }
    const { error } = await supabase.from('chat_messages').update({ body, edited_at: new Date().toISOString() }).eq('id', input.id).eq('author_id', userId)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function deleteMessage(input: { id: string }) {
  try {
    const { supabase } = await ctx()
    const { error } = await supabase.from('chat_messages').update({ deleted_at: new Date().toISOString(), body: '', attachments: [] }).eq('id', input.id)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function createTradeChannel(input: { trade: string }) {
  try {
    const { supabase, userId, companyId } = await ctx()
    const trade = input.trade.trim()
    if (!trade) return { ok: false as const, error: 'Name the trade.' }
    const { data: existing } = await supabase.from('chat_channels').select('id').eq('company_id', companyId).eq('kind', 'trade').ilike('trade', trade).maybeSingle()
    if (existing) {
      await supabase.from('chat_channels').update({ archived: false }).eq('id', existing.id)
      return { ok: true as const, id: existing.id as string }
    }
    const { data, error } = await supabase.from('chat_channels').insert({ company_id: companyId, kind: 'trade', name: trade, trade, created_by: userId }).select('id').single()
    if (error || !data) return { ok: false as const, error: error?.message ?? 'Could not create it.' }
    revalidatePath('/app/chat')
    return { ok: true as const, id: data.id as string }
  } catch (e) { return fail(e) }
}

export async function ensureProjectChannel(input: { projectId: string }) {
  try {
    const { supabase, userId, companyId } = await ctx()
    const { data: existing } = await supabase.from('chat_channels').select('id').eq('company_id', companyId).eq('kind', 'project').eq('project_id', input.projectId).maybeSingle()
    if (existing) return { ok: true as const, id: existing.id as string }
    const { data: project } = await supabase.from('projects').select('name, job_number').eq('id', input.projectId).single()
    if (!project) return { ok: false as const, error: 'Project not found.' }
    const { data, error } = await supabase.from('chat_channels').insert({
      company_id: companyId, kind: 'project', name: project.job_number ? `${project.name} (${project.job_number})` : project.name,
      project_id: input.projectId, created_by: userId,
    }).select('id').single()
    if (error || !data) return { ok: false as const, error: error?.message ?? 'Could not create it.' }
    return { ok: true as const, id: data.id as string }
  } catch (e) { return fail(e) }
}

export async function ensureDirectChannel(input: { profileId: string }) {
  try {
    const { supabase, userId, companyId } = await ctx()
    if (input.profileId === userId) return { ok: false as const, error: 'That is you.' }
    // An existing DM has both of us as members.
    const { data: mine } = await supabase.from('chat_channel_members').select('channel_id').eq('profile_id', userId)
    const { data: theirs } = await supabase.from('chat_channel_members').select('channel_id').eq('profile_id', input.profileId)
    const shared = new Set((theirs ?? []).map((t) => t.channel_id))
    const both = (mine ?? []).map((m) => m.channel_id).filter((id) => shared.has(id))
    if (both.length) {
      const { data: dm } = await supabase.from('chat_channels').select('id').in('id', both).eq('kind', 'direct').limit(1)
      if (dm?.[0]) return { ok: true as const, id: dm[0].id as string }
    }
    const { data: peer } = await supabase.from('profiles').select('full_name').eq('id', input.profileId).single()
    const { data, error } = await supabase.from('chat_channels').insert({
      company_id: companyId, kind: 'direct', name: peer?.full_name ?? 'Direct message', created_by: userId,
    }).select('id').single()
    if (error || !data) return { ok: false as const, error: error?.message ?? 'Could not start it.' }
    await supabase.from('chat_channel_members').insert([
      { channel_id: data.id, profile_id: userId, company_id: companyId },
      { channel_id: data.id, profile_id: input.profileId, company_id: companyId },
    ])
    return { ok: true as const, id: data.id as string }
  } catch (e) { return fail(e) }
}

export async function setMyTrades(input: { trades: string[] }) {
  try {
    const { supabase, userId } = await ctx()
    const trades = [...new Set(input.trades.map((t) => t.trim()).filter(Boolean))]
    const { error } = await supabase.from('profiles').update({ trades }).eq('id', userId)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const, trades }
  } catch (e) { return fail(e) }
}

/** Unread across every space, for the sidebar badge. */
export async function getUnreadTotal(): Promise<number> {
  try {
    const channels = await listChannels()
    return channels.reduce((s, c) => s + c.unread, 0)
  } catch { return 0 }
}
