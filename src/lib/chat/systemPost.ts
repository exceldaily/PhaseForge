import 'server-only'

// Posting system cards into chat from anywhere in the app. Every function
// here swallows its own errors: a chat post must never make a change order,
// a board move, or a schedule save fail.

import type { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { alertRecipients, departmentLabel, eventHeadline, eventText, type AlertPerson, type ChatAlertPref, type ChatEvent } from './systemEvents'

type Db = Awaited<ReturnType<typeof createClient>>

/** The project's chat space, created on first use. */
export async function projectChannelId(supabase: Db, companyId: string, userId: string, projectId: string): Promise<string | null> {
  try {
    const find = () => supabase.from('chat_channels').select('id').eq('company_id', companyId).eq('kind', 'project').eq('project_id', projectId).maybeSingle()
    const { data: existing } = await find()
    if (existing) return existing.id as string
    const { data: p } = await supabase.from('projects').select('name, job_number').eq('id', projectId).single()
    if (!p) return null
    const { data, error } = await supabase.from('chat_channels').insert({
      company_id: companyId, kind: 'project', name: p.job_number ? `${p.name} (${p.job_number})` : p.name, project_id: projectId, created_by: userId,
    }).select('id').single()
    if (data) return data.id as string
    if (error) { const { data: again } = await find(); return (again?.id as string) ?? null }
    return null
  } catch (e) { logger.error('chat projectChannelId', e); return null }
}

/**
 * The space for a schedule department (REFRIGERATION goes to the
 * Refrigeration trade space), created on first use. No department means
 * General.
 */
export async function departmentChannel(supabase: Db, companyId: string, userId: string, department: string | null): Promise<{ id: string; trade: string | null } | null> {
  try {
    const trade = departmentLabel(department)
    if (!trade) {
      const { data: g } = await supabase.from('chat_channels').select('id').eq('company_id', companyId).eq('kind', 'general').maybeSingle()
      return g ? { id: g.id as string, trade: null } : null
    }
    const find = () => supabase.from('chat_channels').select('id, trade').eq('company_id', companyId).eq('kind', 'trade').ilike('trade', trade).maybeSingle()
    const { data: existing } = await find()
    if (existing) return { id: existing.id as string, trade: (existing.trade as string) ?? trade }
    const { data, error } = await supabase.from('chat_channels').insert({ company_id: companyId, kind: 'trade', name: trade, trade, created_by: userId }).select('id').single()
    if (data) return { id: data.id as string, trade }
    if (error) { const { data: again } = await find(); return again ? { id: again.id as string, trade: (again.trade as string) ?? trade } : null }
    return null
  } catch (e) { logger.error('chat departmentChannel', e); return null }
}

/**
 * Put a card in a space. `trades` files it under those trade sections.
 * `sourceMessageId` marks it as the feed copy of another card, so deleting
 * the original takes the copy with it. Returns the new message id.
 */
export async function postSystem(supabase: Db, input: {
  companyId: string; authorId: string; channelId: string; event: ChatEvent; projectId?: string | null; trades?: string[]
  sourceMessageId?: string | null
}): Promise<string | null> {
  try {
    const { data } = await supabase.from('chat_messages').insert({
      company_id: input.companyId, channel_id: input.channelId, author_id: input.authorId,
      kind: 'system', body: eventText(input.event), event: input.event,
      project_id: input.projectId ?? null,
      ...(input.sourceMessageId ? { source_message_id: input.sourceMessageId } : {}),
      mentions: { everyone: false, trades: input.trades ?? [], users: [] },
    }).select('id').single()
    return (data?.id as string | undefined) ?? null
  } catch (e) { logger.error('chat postSystem', e); return null }
}

/**
 * Chat alerts for a job card: one notification row per person, typed
 * 'chat_event' so it lands under the Chat alerts icon and not the main bell.
 */
async function alertJob(supabase: Db, input: {
  companyId: string; actorId: string; projectId: string; channelId: string; event: ChatEvent
}): Promise<void> {
  try {
    const [{ data: people }, { data: followers }, { data: project }] = await Promise.all([
      supabase.from('profiles').select('id, chat_alerts, trades').eq('company_id', input.companyId).eq('is_active', true),
      supabase.from('chat_channel_members').select('profile_id').eq('channel_id', input.channelId),
      supabase.from('projects').select('name, created_by, trade').eq('id', input.projectId).single(),
    ])
    const list: AlertPerson[] = (people ?? []).map((p) => ({
      id: p.id as string, pref: (p.chat_alerts as ChatAlertPref | null) ?? null, trades: (p.trades as string[] | null) ?? null,
    }))
    const targets = alertRecipients(list, {
      actorId: input.actorId, followerIds: (followers ?? []).map((f) => f.profile_id as string),
      createdBy: (project?.created_by as string | null) ?? null, trade: (project?.trade as string | null) ?? null,
    })
    if (!targets.length) return
    const text = eventText(input.event)
    await supabase.from('notifications').insert(targets.map((uid) => ({
      user_id: uid, company_id: input.companyId, type: 'chat_event',
      title: `${project?.name ?? 'Job'}: ${eventHeadline(input.event)}`,
      body: text.length > 160 ? `${text.slice(0, 157)}...` : text,
      link: `/app/chat?c=${input.channelId}`,
    })))
  } catch (e) { logger.error('chat alertJob', e) }
}

/**
 * A job event, told three ways: a card in the job's Whole job section, a copy
 * in the company-wide Project updates feed, and a chat alert for everyone
 * who wants one.
 */
export async function postToProject(supabase: Db, companyId: string, userId: string, projectId: string, event: ChatEvent): Promise<void> {
  const channelId = await projectChannelId(supabase, companyId, userId, projectId)
  if (!channelId) return
  const messageId = await postSystem(supabase, { companyId, authorId: userId, channelId, event, projectId })
  if (!messageId) return
  try {
    const { data: feed } = await supabase.from('chat_channels').select('id').eq('company_id', companyId).eq('kind', 'updates').maybeSingle()
    if (feed) await postSystem(supabase, { companyId, authorId: userId, channelId: feed.id as string, event, projectId, sourceMessageId: messageId })
  } catch (e) { logger.error('chat postToProject feed', e) }
  await alertJob(supabase, { companyId, actorId: userId, projectId, channelId, event })
}
