import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

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
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
