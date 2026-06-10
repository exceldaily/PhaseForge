'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface AcceptResult {
  success?: boolean
  needsPassword?: boolean
  error?: string
}

/**
 * Finalizes an invited user after they confirm their email.
 * Checks if they need to set a password.
 */
export async function acceptInvite(): Promise<AcceptResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Not authenticated yet - invite link hasn't been clicked
    if (!user) {
      return { error: 'Please click the invite link in your email to continue.' }
    }

    const meta = user.user_metadata || {}
    const companyId = meta.company_id as string | undefined
    const role = (meta.role as string | undefined) ?? 'member'

    const admin = createAdminClient()

    // Ensure the profile reflects the invited company + role
    await admin.from('profiles').upsert({
      id: user.id,
      email: user.email,
      full_name: (meta.full_name as string | undefined) ?? user.email?.split('@')[0] ?? '',
      company_id: companyId,
      role,
    })

    // Mark the latest pending invitation as accepted
    if (user.email && companyId) {
      await admin
        .from('invitations')
        .update({ accepted_at: new Date().toISOString() })
        .eq('company_id', companyId)
        .eq('email', user.email.toLowerCase())
        .is('accepted_at', null)
    }

    // Check if user has a password set
    // Invited users typically don't have passwords until they set one
    const needsPassword = !user.user_metadata?.password_set

    return { success: true, needsPassword }
  } catch (err) {
    console.error('acceptInvite error:', err)
    return { error: err instanceof Error ? err.message : 'Failed to accept invite' }
  }
}

/**
 * Sets password for an invited user
 */
export async function setInvitePassword(password: string): Promise<{ success?: boolean; error?: string }> {
  try {
    if (!password || password.length < 8) {
      return { error: 'Password must be at least 8 characters' }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Not authenticated' }
    }

    // Update user password
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      return { error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.error('setInvitePassword error:', err)
    return { error: err instanceof Error ? err.message : 'Failed to set password' }
  }
}
