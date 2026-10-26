import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SERVER_FETCH_TIMEOUT_MS, fetchWithTimeout } from './fetch'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // App data lives in the `phaseforge` schema (project shared with
      // ReelFishHelp, whose tables occupy `public`).
      db: { schema: 'phaseforge' },
      // Fail fast when Supabase hangs; see ./fetch.ts.
      global: { fetch: fetchWithTimeout(SERVER_FETCH_TIMEOUT_MS) },
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
