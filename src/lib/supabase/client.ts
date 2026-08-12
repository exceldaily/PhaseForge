import { createBrowserClient } from '@supabase/ssr'

// All app data lives in the `phaseforge` schema (the Supabase project is
// shared with ReelFishHelp, whose tables occupy `public`).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: 'phaseforge' } }
  )
}
