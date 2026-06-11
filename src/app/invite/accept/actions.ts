'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface AcceptResult {
  success?: boolean
  needsPassword?: boolean
  error?: string
}

/**
 * Verify invitation token and set up for password entry
 */
export async function acceptInvite(token?: string, email?: string): Promise<AcceptResult> {
  try {
    const admin = createAdminClient()

    // Verify token and email from the invite link
    if (token && email) {
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

      // Token is valid - show password form so they can create their password
      return { success: true, needsPassword: true }
    }

    return { error: 'Please click the invite link in your email to continue.' }
  } catch (err) {
    console.error('acceptInvite error:', err)
    return { error: err instanceof Error ? err.message : 'Failed to accept invite' }
  }
}

/**
 * Sets password for an invited user, and marks invitation as accepted
 */
export async function setInvitePassword(
  password: string,
  token?: string,
  email?: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    if (!password || password.length < 8) {
      return { error: 'Password must be at least 8 characters' }
    }

    const admin = createAdminClient()

    // Find the user by email
    let authUserId: string | null = null

    if (email) {
      // Search for the user by email
      let page = 1
      while (page <= 10) {
        const { data, error } = await admin.auth.admin.listUsers({
          page,
          perPage: 200,
        })

        if (error) {
          return { error: 'Failed to find user account' }
        }

        const foundUser = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
        if (foundUser) {
          authUserId = foundUser.id
          break
        }

        if (data.users.length < 200) {
          break
        }

        page += 1
      }
    }

    if (!authUserId) {
      return { error: 'User account not found. Please request a new invite.' }
    }

    // Update user password and mark as confirmed (they proved they have the email by clicking the link)
    const { error: updateErr } = await admin.auth.admin.updateUserById(authUserId, {
      password,
      email_confirm: true,
    })

    if (updateErr) {
      return { error: updateErr.message }
    }

    // Mark invitation as accepted (fire and forget)
    if (token && email) {
      admin
        .from('invitations')
        .update({ accepted_at: new Date().toISOString() })
        .eq('token', token)
        .eq('email', email.toLowerCase())
    }

    // Sign them in with their new password
    const supabase = await createClient()
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: email!.toLowerCase(),
      password,
    })

    if (signInErr) {
      // Password was set but sign in failed - still a success, they can sign in manually
      console.error('Auto sign-in failed:', signInErr)
    }

    return { success: true }
  } catch (err) {
    console.error('setInvitePassword error:', err)
    return { error: err instanceof Error ? err.message : 'Failed to set password' }
  }
}
