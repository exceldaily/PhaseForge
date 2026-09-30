'use server'

// Last-active tracking. The heartbeat and the read both go through database
// functions: touch_presence() stamps the time on the server, and
// member_activity() decides who the caller is allowed to see.

import { createClient } from '@/lib/supabase/server'
import { sectionPath, type ActivityRow } from '@/lib/presence'

/** "I am using the site right now." Never throws: a missed ping must not break a page. */
export async function touchPresence(path: string): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.rpc('touch_presence', { p_path: sectionPath(path) })
  } catch { /* best effort */ }
}

/**
 * Last activity for the caller's company (owners and admins only), or for
 * every company when `all` is set and the caller is a super admin. Anyone
 * else gets an empty list: the database does the checking, not this code.
 */
export async function getMemberActivity(all = false): Promise<ActivityRow[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('member_activity', { p_all: all })
    if (error || !data) return []
    return (data as { profile_id: string; last_seen_at: string | null; last_path: string | null; last_sign_in_at: string | null }[])
      .map((r) => ({ profileId: r.profile_id, lastSeenAt: r.last_seen_at, lastPath: r.last_path, lastSignInAt: r.last_sign_in_at }))
  } catch { return [] }
}
