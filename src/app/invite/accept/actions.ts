'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface AcceptResult {
  success?: boolean
  error?: string
}

/**
 * Finalizes an invited user after they confirm their email.
 * Ensures their profile carries the company_id + role from their auth
 * metadata, and marks the matching invitation as accepted.
 */
export async function acceptInvite(): Promise<AcceptResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const meta = user.user_metadata || {}
    const companyId = meta.company_id as string | undefined
    const role = (meta.role as string | undefined) ?? 'member'

    if (!companyId) {
      // Nothing to attach — user can still proceed to the app.
      return { success: true }
    }

    const admin = createAdminClient()

    // Ensure the profile reflects the invited company + role.
    await admin.from('profiles').upsert({
      id: user.id,
      email: user.email,
      full_name: (meta.full_name as string | undefined) ?? user.email?.split('@')[0] ?? '',
      company_id: companyId,
      role,
    })

    // Mark the latest pending invitation for this email/company as accepted.
    if (user.email) {
      await admin
        .from('invitations')
        .update({ accepted_at: new Date().toISOString() })
        .eq('company_id', companyId)
        .eq('email', user.email.toLowerCase())
        .is('accepted_at', null)
    }

    return { success: true }
  } catch (err) {
    console.error('acceptInvite error:', err)
    return { error: err instanceof Error ? err.message : 'Failed to accept invite' }
  }
}
