import 'server-only'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { canUseTradeFilter } from '@/lib/constants'

export const TRADE_COOKIE = 'pf-trade'

/**
 * The org-wide trade filter (premium): reads the trade chosen in the top-bar
 * switcher. Returns null (no filtering) when unset, "all", or when the plan
 * doesn't include the feature — a stale cookie can never trap a lower plan in
 * a filtered view. Fetches the plan itself so callers don't have to.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function activeTrade(supabase: SupabaseClient<any, any, any>, companyId: string): Promise<string | null> {
  const jar = await cookies()
  const v = jar.get(TRADE_COOKIE)?.value?.trim()
  if (!v || v === 'all') return null
  const { data: company } = await supabase.from('companies').select('plan').eq('id', companyId).single()
  return canUseTradeFilter(company?.plan) ? v : null
}
