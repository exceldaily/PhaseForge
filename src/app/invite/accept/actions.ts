'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface AcceptResult {
  success?: boolean
  needsPassword?: boolean
  error?: string
}

/**
 * Verify invitation token and authenticate user via temporary password
 */
export async function acceptInvite(token?: string, email?: string, tempPassword?: string): Promise<AcceptResult> {
  try {
    const supabase = await createClient()

    // If we have token + email + tempPassword, verify token and sign in
    if (token && email && tempPassword) {
      const admin = createAdminClient()

      // Verify token exists and is valid
      const { data: invitation } = await admin
        .from('invitations')
        .select('id, company_id, role, expires_at, accepted_at')
        .eq('token', token)
        .eq('email', email.toLowerCase())
        .maybeSingle()

      if (!invitation) {
        return { error: 'Invalid or expired invitation link.' }
      }

      if (invitation.accepted_at) {
        return { error: 'This invitation has already been accepted.' }
      }

      if (new Date(invitation.expires_at) < new Date()) {
        return { error: 'This invitation has expired.' }
      }

      // Sign in with temp password to establish session
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase(),
        password: tempPassword,
      })

      if (signInErr) {
        return { error: 'Failed to authenticate. Please try again or request a new invite.' }
      }

      // Get authenticated user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return { error: 'Authentication failed' }
      }

      const meta = user.user_metadata || {}
      const role = (meta.role as string | undefined) ?? 'member'

      // Ensure profile is set up with company + role
      await admin.from('profiles').upsert({
        id: user.id,
        email: user.email,
        full_name: (meta.full_name as string | undefined) ?? email.split('@')[0] ?? '',
        company_id: invitation.company_id,
        role,
      })

      // Mark invitation as accepted
      await admin
        .from('invitations')
        .update({ accepted_at: new Date().toISOString() })
        .eq('token', token)

      return { success: true, needsPassword: true }
    }

    // Fallback: check if already authenticated
    const { data: { user } } = await supabase.auth.getUser()

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

    return { success: true, needsPassword: true }
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
