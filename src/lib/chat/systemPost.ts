import 'server-only'

// Posting system cards into chat from anywhere in the app. Every function
// here swallows its own errors: a chat post must never make a change order,
// a board move, or a schedule save fail.

import type { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { departmentLabel, eventText, type ChatEvent } from './systemEvents'

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

/** Put a card in a space. `trades` files it under those trade sections. */
export async function postSystem(supabase: Db, input: {
  companyId: string; authorId: string; channelId: string; event: ChatEvent; projectId?: string | null; trades?: string[]
}): Promise<void> {
  try {
    await supabase.from('chat_messages').insert({
      company_id: input.companyId, channel_id: input.channelId, author_id: input.authorId,
      kind: 'system', body: eventText(input.event), event: input.event,
      project_id: input.projectId ?? null,
      mentions: { everyone: false, trades: input.trades ?? [], users: [] },
    })
  } catch (e) { logger.error('chat postSystem', e) }
}

/** Shorthand: a card in a project's Whole job section. */
export async function postToProject(supabase: Db, companyId: string, userId: string, projectId: string, event: ChatEvent): Promise<void> {
  const channelId = await projectChannelId(supabase, companyId, userId, projectId)
  if (channelId) await postSystem(supabase, { companyId, authorId: userId, channelId, event, projectId })
}
