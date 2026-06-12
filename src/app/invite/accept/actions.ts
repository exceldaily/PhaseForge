'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFriendlyAuthError, normalizeAuthEmail, validatePassword } from '@/lib/auth/password'

interface AcceptResult {
  success?: boolean
  needsPassword?: boolean
  error?: string
}

const AUTH_USER_LOOKUP_PAGE_SIZE = 200

interface InvitationRecord {
  id: string
  company_id: string
  role: string
  expires_at: string
  accepted_at: string | null
}

interface InvitationValidationResult {
  invitation?: InvitationRecord
  error?: string
}

async function findInvitation(
  admin: ReturnType<typeof createAdminClient>,
  token: string,
  email: string
): Promise<InvitationRecord | null> {
  const { data, error } = await admin
    .from('invitations')
    .select('id, company_id, role, expires_at, accepted_at')
    .eq('token', token)
    .eq('email', normalizeAuthEmail(email))
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

function validateInvitation(invitation: InvitationRecord | null): InvitationValidationResult {
  if (!invitation) {
    return { error: 'Invalid or expired invitation link.' }
  }

  if (invitation.accepted_at) {
    return { error: 'This invitation has already been accepted.' }
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return { error: 'This invitation has expired.' }
  }

  return { invitation }
}

async function findAuthUserByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  let page = 1

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: AUTH_USER_LOOKUP_PAGE_SIZE,
    })

    if (error) {
      throw error
    }

    const foundUser = data.users.find((user) => user.email?.toLowerCase() === email)
    if (foundUser) {
      return foundUser
    }

    if (data.users.length < AUTH_USER_LOOKUP_PAGE_SIZE) {
      break
    }

    page += 1
  }

  return null
}

/**
 * Verify invitation token and set up for password entry
 */
export async function acceptInvite(token?: string, email?: string): Promise<AcceptResult> {
  try {
    const admin = createAdminClient()

    // Verify token and email from the invite link
    if (token && email) {
      const invitation = await findInvitation(admin, token, email)
      const validation = validateInvitation(invitation)

      if (validation.error) {
        return { error: validation.error }
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
    const passwordError = validatePassword(password)
    if (passwordError) {
      return { error: passwordError }
    }

    if (!token || !email) {
      return { error: 'Please open the invitation link from your email and try again.' }
    }

    const admin = createAdminClient()
    const normalizedEmail = normalizeAuthEmail(email)
    const invitation = await findInvitation(admin, token, normalizedEmail)
    const validation = validateInvitation(invitation)

    if (validation.error || !validation.invitation) {
      return { error: validation.error ?? 'Invalid or expired invitation link.' }
    }

    const validInvitation = validation.invitation

    // Find the user by email
    const authUser = await findAuthUserByEmail(admin, normalizedEmail)
    if (!authUser) {
      return { error: 'User account not found. Please request a new invite.' }
    }

    // Update user password and mark as confirmed (they proved they have the email by clicking the link)
    const { error: updateErr } = await admin.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...(authUser.user_metadata ?? {}),
        company_id: validInvitation.company_id,
        role: validInvitation.role,
      },
    })

    if (updateErr) {
      return { error: getFriendlyAuthError(updateErr.message) }
    }

    const { error: profileErr } = await admin.from('profiles').upsert({
      id: authUser.id,
      company_id: validInvitation.company_id,
      email: normalizedEmail,
      full_name: (authUser.user_metadata?.full_name as string | undefined)?.trim() || normalizedEmail.split('@')[0],
      role: validInvitation.role,
      is_active: true,
    })

    if (profileErr) {
      return { error: profileErr.message }
    }

    const { error: inviteUpdateErr } = await admin
      .from('invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('token', token)
      .eq('email', normalizedEmail)

    if (inviteUpdateErr) {
      return { error: inviteUpdateErr.message }
    }

    // Sign them in with their new password
    const supabase = await createClient()
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })

    if (signInErr) {
      // Password was set but sign in failed - still a success, they can sign in manually
      console.error('Auto sign-in failed:', signInErr)
    }

    return { success: true }
  } catch (err) {
    console.error('setInvitePassword error:', err)
    return { error: err instanceof Error ? getFriendlyAuthError(err.message) : 'Failed to set password' }
  }
}
