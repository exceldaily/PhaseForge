'use server'

import { createClient } from '@/lib/supabase/server'
import { PLAN_LIMITS, DEFAULT_PLAN } from '@/lib/constants'

export interface UsageResult {
  allowed: boolean
  current: number
  limit: number
  plan: string
  reason?: string
}

export async function checkProjectLimit(companyId: string): Promise<UsageResult> {
  const supabase = await createClient()

  const [{ data: company }, { count }] = await Promise.all([
    supabase.from('companies').select('plan').eq('id', companyId).single(),
    supabase.from('projects').select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_archived', false),
  ])

  const plan = company?.plan ?? DEFAULT_PLAN
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS[DEFAULT_PLAN]
  const current = count ?? 0

  if (current >= limits.projects) {
    return {
      allowed: false,
      current,
      limit: limits.projects,
      plan,
      reason: `Your ${plan} plan allows up to ${limits.projects} active project${limits.projects === 1 ? '' : 's'}. Archive or delete a project, or upgrade your plan.`,
    }
  }

  return { allowed: true, current, limit: limits.projects, plan }
}

export async function checkMemberLimit(companyId: string): Promise<UsageResult> {
  const supabase = await createClient()

  const [{ data: company }, { count }] = await Promise.all([
    supabase.from('companies').select('plan').eq('id', companyId).single(),
    supabase.from('profiles').select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_active', true),
  ])

  const plan = company?.plan ?? DEFAULT_PLAN
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS[DEFAULT_PLAN]
  const current = count ?? 0

  if (current >= limits.members) {
    return {
      allowed: false,
      current,
      limit: limits.members,
      plan,
      reason: `Your ${plan} plan allows up to ${limits.members} member${limits.members === 1 ? '' : 's'}. Remove a member or upgrade your plan.`,
    }
  }

  return { allowed: true, current, limit: limits.members, plan }
}
