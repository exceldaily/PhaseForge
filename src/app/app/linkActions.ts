'use server'

// Universal relationship actions over item_links. Entity registry, search,
// create, delete, and the list a Related section renders. RLS scopes every
// query to the caller's organization; these actions add validation and
// human labels on top.

import { createClient } from '@/lib/supabase/server'
import { canEditCompanyData } from '@/lib/permissions'
import { logActivity } from '@/lib/activity/log'

export type LinkEntityType =
  | 'project' | 'phase' | 'change_order' | 'punch_item' | 'plan_sheet' | 'quote_pricing'

export type LinkType =
  | 'related_to' | 'caused_by' | 'impacts' | 'generated_from' | 'blocked_by'
  | 'resolves' | 'schedule_impact' | 'cost_impact' | 'follow_up_to'

export const LINK_TYPE_LABELS: Record<LinkType, string> = {
  related_to: 'Related to',
  caused_by: 'Caused by',
  impacts: 'Impacts',
  generated_from: 'Generated from',
  blocked_by: 'Blocked by',
  resolves: 'Resolves',
  schedule_impact: 'Schedule impact',
  cost_impact: 'Cost impact',
  follow_up_to: 'Follow-up to',
}

export interface LinkedItem {
  linkId: string
  linkType: LinkType
  /** Whether this entity is the target (outbound) or source (inbound). */
  direction: 'out' | 'in'
  entityType: LinkEntityType
  entityId: string
  label: string
  sublabel: string | null
  href: string
}

const VALID_TYPES = new Set<string>(['project', 'phase', 'change_order', 'punch_item', 'plan_sheet', 'quote_pricing'])
const VALID_LINKS = new Set<string>(Object.keys(LINK_TYPE_LABELS))

async function ctx(requireEdit = false) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: p } = await supabase
    .from('profiles').select('company_id, role, ops_role').eq('id', user.id).single()
  if (!p?.company_id) throw new Error('No organization')
  if (requireEdit && !canEditCompanyData(p)) throw new Error('Managers and up only')
  return { supabase, userId: user.id, companyId: p.company_id }
}

/* ── Label + href resolution, batched per type ────────────────────────────── */

type Ref = { type: LinkEntityType; id: string }

async function resolveRefs(
  supabase: Awaited<ReturnType<typeof ctx>>['supabase'],
  refs: Ref[],
): Promise<Map<string, { label: string; sublabel: string | null; href: string }>> {
  const out = new Map<string, { label: string; sublabel: string | null; href: string }>()
  const by = (t: LinkEntityType) => refs.filter((r) => r.type === t).map((r) => r.id)
  const key = (t: string, id: string) => `${t}:${id}`

  const [projects, phases, cos, punch, sheets, pricings] = await Promise.all([
    by('project').length ? supabase.from('projects').select('id, name, job_number').in('id', by('project')) : { data: [] },
    by('phase').length ? supabase.from('phases').select('id, name, project_id, start_date, end_date').in('id', by('phase')) : { data: [] },
    by('change_order').length ? supabase.from('change_orders').select('id, co_number, title, project_id').in('id', by('change_order')) : { data: [] },
    by('punch_item').length ? supabase.from('punch_items').select('id, number, title, project_id').in('id', by('punch_item')) : { data: [] },
    by('plan_sheet').length ? supabase.from('plan_sheets').select('id, sheet_number, title, project_id').in('id', by('plan_sheet')) : { data: [] },
    by('quote_pricing').length ? supabase.from('quote_pricings').select('id, title, job_number').in('id', by('quote_pricing')) : { data: [] },
  ])

  for (const r of projects.data ?? []) out.set(key('project', r.id), {
    label: r.name, sublabel: r.job_number ? `Job ${r.job_number}` : null, href: `/app/projects/${r.id}`,
  })
  for (const r of phases.data ?? []) out.set(key('phase', r.id), {
    label: r.name, sublabel: r.start_date ? `${r.start_date} → ${r.end_date}` : null,
    href: `/app/projects/${r.project_id}?tab=gantt`,
  })
  for (const r of cos.data ?? []) out.set(key('change_order', r.id), {
    label: `CO ${r.co_number ?? ''}`.trim(), sublabel: r.title ?? null, href: `/app/change-orders/${r.id}`,
  })
  for (const r of punch.data ?? []) out.set(key('punch_item', r.id), {
    label: `Punch #${r.number}`, sublabel: r.title, href: `/app/projects/${r.project_id}?tab=punch`,
  })
  for (const r of sheets.data ?? []) out.set(key('plan_sheet', r.id), {
    label: r.sheet_number ?? 'Sheet', sublabel: r.title ?? null, href: `/app/projects/${r.project_id}/plans/${r.id}`,
  })
  for (const r of pricings.data ?? []) out.set(key('quote_pricing', r.id), {
    label: r.title, sublabel: r.job_number ? `Job ${r.job_number}` : null, href: `/app/quotes/pricing/${r.id}`,
  })
  return out
}

/* ── List ─────────────────────────────────────────────────────────────────── */

export async function listLinks(entityType: LinkEntityType, entityId: string): Promise<LinkedItem[]> {
  const { supabase } = await ctx()
  const [outRes, inRes] = await Promise.all([
    supabase.from('item_links')
      .select('id, link_type, target_type, target_id')
      .eq('source_type', entityType).eq('source_id', entityId),
    supabase.from('item_links')
      .select('id, link_type, source_type, source_id')
      .eq('target_type', entityType).eq('target_id', entityId),
  ])

  const refs: Ref[] = [
    ...(outRes.data ?? []).map((l) => ({ type: l.target_type as LinkEntityType, id: l.target_id })),
    ...(inRes.data ?? []).map((l) => ({ type: l.source_type as LinkEntityType, id: l.source_id })),
  ]
  const resolved = await resolveRefs(supabase, refs)

  const items: LinkedItem[] = []
  for (const l of outRes.data ?? []) {
    const r = resolved.get(`${l.target_type}:${l.target_id}`)
    if (!r) continue // target deleted: skip rather than show a dead row
    items.push({ linkId: l.id, linkType: l.link_type as LinkType, direction: 'out', entityType: l.target_type as LinkEntityType, entityId: l.target_id, ...r })
  }
  for (const l of inRes.data ?? []) {
    const r = resolved.get(`${l.source_type}:${l.source_id}`)
    if (!r) continue
    items.push({ linkId: l.id, linkType: l.link_type as LinkType, direction: 'in', entityType: l.source_type as LinkEntityType, entityId: l.source_id, ...r })
  }
  return items
}

/* ── Search targets for the picker ────────────────────────────────────────── */

export interface LinkCandidate {
  entityType: LinkEntityType
  entityId: string
  label: string
  sublabel: string | null
}

export async function searchLinkTargets(query: string, typeFilter?: LinkEntityType): Promise<LinkCandidate[]> {
  const { supabase } = await ctx()
  const q = query.trim()
  if (q.length < 2) return []
  const like = `%${q}%`
  const want = (t: LinkEntityType) => !typeFilter || typeFilter === t

  const [projects, phases, cos, punch, sheets, pricings] = await Promise.all([
    want('project') ? supabase.from('projects').select('id, name, job_number')
      .or(`name.ilike.${like},job_number.ilike.${like},customer_name.ilike.${like}`)
      .eq('is_archived', false).limit(6) : { data: [] },
    want('phase') ? supabase.from('phases').select('id, name, project_id, projects(name)')
      .ilike('name', like).limit(6) : { data: [] },
    want('change_order') ? supabase.from('change_orders').select('id, co_number, title')
      .or(/^\d+$/.test(q) ? `title.ilike.${like},co_number.eq.${q}` : `title.ilike.${like}`).limit(6) : { data: [] },
    want('punch_item') ? supabase.from('punch_items').select('id, number, title')
      .ilike('title', like).limit(6) : { data: [] },
    want('plan_sheet') ? supabase.from('plan_sheets').select('id, sheet_number, title')
      .or(`title.ilike.${like},sheet_number.ilike.${like}`).limit(6) : { data: [] },
    want('quote_pricing') ? supabase.from('quote_pricings').select('id, title, job_number')
      .or(`title.ilike.${like},job_number.ilike.${like}`).limit(6) : { data: [] },
  ])

  const out: LinkCandidate[] = []
  for (const r of projects.data ?? []) out.push({ entityType: 'project', entityId: r.id, label: r.name, sublabel: r.job_number ? `Job ${r.job_number}` : null })
  for (const r of phases.data ?? []) out.push({ entityType: 'phase', entityId: r.id, label: r.name, sublabel: (r.projects as { name?: string } | null)?.name ?? null })
  for (const r of cos.data ?? []) out.push({ entityType: 'change_order', entityId: r.id, label: `CO ${r.co_number ?? ''}`.trim(), sublabel: r.title ?? null })
  for (const r of punch.data ?? []) out.push({ entityType: 'punch_item', entityId: r.id, label: `Punch #${r.number}`, sublabel: r.title })
  for (const r of sheets.data ?? []) out.push({ entityType: 'plan_sheet', entityId: r.id, label: r.sheet_number ?? 'Sheet', sublabel: r.title ?? null })
  for (const r of pricings.data ?? []) out.push({ entityType: 'quote_pricing', entityId: r.id, label: r.title, sublabel: r.job_number ? `Job ${r.job_number}` : null })
  return out.slice(0, 18)
}

/* ── Create / delete ──────────────────────────────────────────────────────── */

export async function createLink(input: {
  sourceType: LinkEntityType
  sourceId: string
  targetType: LinkEntityType
  targetId: string
  linkType: LinkType
  /** Project for the timeline event, when the host knows it. */
  projectId?: string | null
  sourceLabel?: string
  targetLabel?: string
}) {
  try {
    const { supabase, userId, companyId } = await ctx(true)
    if (!VALID_TYPES.has(input.sourceType) || !VALID_TYPES.has(input.targetType)) {
      return { ok: false as const, error: 'Unsupported item type.' }
    }
    if (!VALID_LINKS.has(input.linkType)) return { ok: false as const, error: 'Unsupported relationship type.' }
    if (input.sourceType === input.targetType && input.sourceId === input.targetId) {
      return { ok: false as const, error: 'An item cannot be linked to itself.' }
    }

    // The target must resolve inside this organization (RLS returns nothing
    // for foreign rows), which blocks cross-org links by construction.
    const resolved = await resolveRefs(supabase, [
      { type: input.sourceType, id: input.sourceId },
      { type: input.targetType, id: input.targetId },
    ])
    if (resolved.size !== 2) return { ok: false as const, error: 'One of the items could not be found.' }

    const { data: row, error } = await supabase.from('item_links').insert({
      company_id: companyId,
      source_type: input.sourceType, source_id: input.sourceId,
      target_type: input.targetType, target_id: input.targetId,
      link_type: input.linkType, created_by: userId,
    }).select('id').single()
    if (error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        return { ok: false as const, error: 'Those two items are already linked that way.' }
      }
      return { ok: false as const, error: error.message }
    }

    await logActivity(supabase, {
      companyId, projectId: input.projectId ?? null, actorId: userId,
      action: 'link_created', entityType: 'link', entityId: row.id,
      entityLabel: input.sourceLabel ?? null,
      payload: {
        link_type: input.linkType,
        source: `${input.sourceType}:${input.sourceLabel ?? input.sourceId}`,
        target: `${input.targetType}:${input.targetLabel ?? input.targetId}`,
      },
    })
    return { ok: true as const, id: row.id as string }
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : 'Failed' } }
}

export async function deleteLink(linkId: string, projectId?: string | null) {
  try {
    const { supabase, userId, companyId } = await ctx(true)
    const { error } = await supabase.from('item_links').delete().eq('id', linkId)
    if (error) return { ok: false as const, error: error.message }
    await logActivity(supabase, {
      companyId, projectId: projectId ?? null, actorId: userId,
      action: 'link_removed', entityType: 'link', entityId: linkId,
    })
    return { ok: true as const }
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : 'Failed' } }
}
