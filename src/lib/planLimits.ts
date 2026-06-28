'use server'

import { createClient } from '@/lib/supabase/server'
import { PLAN_LIMITS, DEFAULT_PLAN, PLAN_LABELS } from '@/lib/constants'

export interface UsageResult {
  allowed: boolean
  current: number
  limit: number        // 0 = unlimited
  plan: string
  planLabel: string
  reason?: string
}

function getLimit(plan: string): typeof PLAN_LIMITS[string] {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS[DEFAULT_PLAN]
}

function unlimited(limit: number) {
  return limit === 0
}

// ── Boards ────────────────────────────────────────────────────────────────────
export async function checkBoardLimit(companyId: string): Promise<UsageResult> {
  const supabase = await createClient()

  const [{ data: company }, { count }] = await Promise.all([
    supabase.from('companies').select('plan').eq('id', companyId).single(),
    supabase.from('boards').select('*', { count: 'exact', head: true })
      .eq('company_id', companyId),
  ])

  const plan = company?.plan ?? DEFAULT_PLAN
  const limits = getLimit(plan)
  const current = count ?? 0
  const planLabel = PLAN_LABELS[plan] ?? plan

  if (!unlimited(limits.boards) && current >= limits.boards) {
    return {
      allowed: false,
      current,
      limit: limits.boards,
      plan,
      planLabel,
      reason: `Your ${planLabel} plan allows up to ${limits.boards} board${limits.boards === 1 ? '' : 's'}. Upgrade your plan to create more boards.`,
    }
  }

  return { allowed: true, current, limit: limits.boards, plan, planLabel }
}

// ── Projects ──────────────────────────────────────────────────────────────────
export async function checkProjectLimit(companyId: string): Promise<UsageResult> {
  const supabase = await createClient()

  const [{ data: company }, { count }] = await Promise.all([
    supabase.from('companies').select('plan').eq('id', companyId).single(),
    supabase.from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_archived', false),
  ])

  const plan = company?.plan ?? DEFAULT_PLAN
  const limits = getLimit(plan)
  const current = count ?? 0
  const planLabel = PLAN_LABELS[plan] ?? plan

  if (!unlimited(limits.projects) && current >= limits.projects) {
    return {
      allowed: false,
      current,
      limit: limits.projects,
      plan,
      planLabel,
      reason: `Your ${planLabel} plan allows up to ${limits.projects} active project${limits.projects === 1 ? '' : 's'}. Archive or delete a project, or upgrade your plan.`,
    }
  }

  return { allowed: true, current, limit: limits.projects, plan, planLabel }
}

// ── Members ───────────────────────────────────────────────────────────────────
export async function checkMemberLimit(companyId: string): Promise<UsageResult> {
  const supabase = await createClient()

  const [{ data: company }, { count }] = await Promise.all([
    supabase.from('companies').select('plan').eq('id', companyId).single(),
    supabase.from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_active', true),
  ])

  const plan = company?.plan ?? DEFAULT_PLAN
  const limits = getLimit(plan)
  const current = count ?? 0
  const planLabel = PLAN_LABELS[plan] ?? plan

  if (!unlimited(limits.members) && current >= limits.members) {
    return {
      allowed: false,
      current,
      limit: limits.members,
      plan,
      planLabel,
      reason: `Your ${planLabel} plan allows up to ${limits.members} member${limits.members === 1 ? '' : 's'}. Remove a member or upgrade your plan.`,
    }
  }

  return { allowed: true, current, limit: limits.members, plan, planLabel }
}

// ── Usage summary (for billing/settings page) ─────────────────────────────────
export async function getUsageSummary(companyId: string) {
  const supabase = await createClient()

  const [{ data: company }, boardCount, projectCount, memberCount] = await Promise.all([
    supabase.from('companies').select('plan').eq('id', companyId).single(),
    supabase.from('boards').select('*', { count: 'exact', head: true }).eq('company_id', companyId),
    supabase.from('projects').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_archived', false),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_active', true),
  ])

  const plan = company?.plan ?? DEFAULT_PLAN
  const limits = getLimit(plan)
  const planLabel = PLAN_LABELS[plan] ?? plan

  return {
    plan,
    planLabel,
    boards:   { current: boardCount.count ?? 0,   limit: limits.boards,   unlimited: unlimited(limits.boards)   },
    projects: { current: projectCount.count ?? 0, limit: limits.projects, unlimited: unlimited(limits.projects) },
    members:  { current: memberCount.count ?? 0,  limit: limits.members,  unlimited: unlimited(limits.members)  },
    teams:    { limit: limits.teams, unlimited: unlimited(limits.teams) },
  }
}
