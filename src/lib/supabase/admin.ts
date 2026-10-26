import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { ADMIN_FETCH_TIMEOUT_MS, fetchWithTimeout } from './fetch'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Missing Supabase admin environment variables')
  }

  return createSupabaseClient(url, serviceRoleKey, {
    // App data lives in the `phaseforge` schema (project shared with
    // ReelFishHelp, whose tables occupy `public`).
    db: { schema: 'phaseforge' },
    // Fail fast when Supabase hangs; see ./fetch.ts.
    global: { fetch: fetchWithTimeout(ADMIN_FETCH_TIMEOUT_MS) },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
