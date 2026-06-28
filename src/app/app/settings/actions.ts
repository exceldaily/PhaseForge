'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function deleteOwnAccount(): Promise<{ error: string } | never> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()

  // Delete the auth user — the DB profile row uses ON DELETE CASCADE from auth.users,
  // so Supabase will cascade-delete the profiles row automatically.
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) return { error: error.message }

  // Sign out the current session (cookies) before redirecting.
  await supabase.auth.signOut()

  redirect('/?deleted=1')
}
