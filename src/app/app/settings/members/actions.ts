'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkMemberLimit } from '@/lib/planLimits'
import { sendInviteEmail } from '@/lib/brevo'

interface SendInviteResult {
  success?: boolean
  error?: string
  message?: string
}

const INVITE_RESEND_COOLDOWN_MINUTES = 1
const AUTH_USER_LOOKUP_PAGE_SIZE = 200

function getFriendlyInviteError(message: string) {
  const normalized = message.toLowerCase()

  if (normalized.includes('email rate limit exceeded')) {
    return `Invitation emails are being sent too quickly right now. Please wait about ${INVITE_RESEND_COOLDOWN_MINUTES} minutes and try again.`
  }

  if (normalized.includes('already registered')) {
    return 'That email already has an account. Ask them to sign in, or move them into this workspace from the admin console if needed.'
  }

  return message
}

async function getAppOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  }
  // Derive from the incoming request as a fallback.
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'https'
  return host ? `${proto}://${host}` : ''
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

async function recordInvitation(
  admin: ReturnType<typeof createAdminClient>,
  companyId: string,
  normalizedEmail: string,
  role: string,
  inviterId: string
) {
  const token = crypto.randomUUID()
  await admin.from('invitations').upsert(
    {
      company_id: companyId,
      email: normalizedEmail,
      role,
      token,
      invited_by: inviterId,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: 'token' }
  )
  return token
}

export async function sendInvite(
  companyId: string,
  email: string,
  role: string
): Promise<SendInviteResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    // Verify the inviter belongs to this company.
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (profile?.company_id !== companyId) {
      return { error: 'You can only invite members to your own workspace.' }
    }

    // Enforce plan member limit.
    const usage = await checkMemberLimit(companyId)
    if (!usage.allowed) {
      return { error: usage.reason ?? 'Member limit reached.' }
    }

    const normalizedEmail = email.trim().toLowerCase()
    const origin = await getAppOrigin()
    const admin = createAdminClient()
    const resendCutoff = new Date(Date.now() - INVITE_RESEND_COOLDOWN_MINUTES * 60 * 1000).toISOString()

    // Get company name and inviter name for the email
    const [{ data: company }, { data: inviterProfile }] = await Promise.all([
      admin.from('companies').select('name').eq('id', companyId).single(),
      admin.from('profiles').select('full_name').eq('id', user.id).single(),
    ])
    const companyName = company?.name || 'PhaseForge'
    const inviterName = inviterProfile?.full_name || user.email || 'A team member'

    const { data: existingMember } = await admin
      .from('profiles')
      .select('id')
      .eq('company_id', companyId)
      .ilike('email', normalizedEmail)
      .maybeSingle()

    if (existingMember) {
      return { error: 'That user is already a member of this workspace.' }
    }

    const { data: pendingInvite } = await admin
      .from('invitations')
      .select('id, created_at, expires_at, role')
      .eq('company_id', companyId)
      .eq('email', normalizedEmail)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .gte('created_at', resendCutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (pendingInvite) {
      return {
        success: true,
        message: `An invitation for ${normalizedEmail} was already sent recently. Ask them to check their inbox or wait ${INVITE_RESEND_COOLDOWN_MINUTES} minutes before resending.`,
      }
    }

    // Try to create a new auth user; if they already exist, update them instead
    let authUserId: string
    let authUserMetadata: Record<string, unknown> = {}

    // Create new auth user with a placeholder password (they'll set their own)
    const placeholderPassword = crypto.randomUUID()
    const { data, error: createErr } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password: placeholderPassword,
      user_metadata: {
        company_id: companyId,
        role,
      },
    })

    if (createErr) {
      // If user already exists, find and update them
      if (createErr.message.toLowerCase().includes('already exists')) {
        const existingAuthUser = await findAuthUserByEmail(admin, normalizedEmail)

        if (!existingAuthUser) {
          return { error: 'User exists but could not be found. Please try again.' }
        }

        authUserId = existingAuthUser.id
        authUserMetadata = existingAuthUser.user_metadata ?? {}

        // Update existing user's metadata
        const { error: updateErr } = await admin.auth.admin.updateUserById(existingAuthUser.id, {
          user_metadata: {
            ...authUserMetadata,
            company_id: companyId,
            role,
          },
        })

        if (updateErr) {
          return { error: getFriendlyInviteError(updateErr.message) }
        }
      } else {
        return { error: getFriendlyInviteError(createErr.message) }
      }
    } else {
      // New user was created successfully
      if (!data?.user) {
        return { error: 'Failed to create user' }
      }
      authUserId = data.user.id
      authUserMetadata = data.user.user_metadata ?? {}
    }

    // Ensure profile exists
    const candidateFullName =
      typeof authUserMetadata.full_name === 'string'
        ? authUserMetadata.full_name.trim()
        : ''
    const fullName = candidateFullName || normalizedEmail.split('@')[0]

    const { error: profileErr } = await admin.from('profiles').upsert({
      id: authUserId,
      company_id: companyId,
      email: normalizedEmail,
      full_name: fullName,
      role,
      is_active: true,
    })

    if (profileErr) {
      return { error: profileErr.message }
    }

    // Create invitation record and get token
    const token = await recordInvitation(admin, companyId, normalizedEmail, role, user.id)

    // Build the invite link with token and email
    const inviteLink = origin
      ? `${origin}/invite/accept?token=${token}&email=${encodeURIComponent(normalizedEmail)}`
      : `https://phaseforge.vercel.app/invite/accept?token=${token}&email=${encodeURIComponent(normalizedEmail)}`

    // Send branded Brevo email
    const emailResult = await sendInviteEmail(normalizedEmail, inviteLink, companyName, role, inviterName)

    if (!emailResult.success) {
      console.error('[SendInvite] Brevo email failed:', {
        email: normalizedEmail,
        error: emailResult.error,
        brevoApiKey: process.env.BREVO_API_KEY ? 'SET' : 'NOT SET',
      })
      await admin.from('invitations').delete().eq('token', token).eq('company_id', companyId)
      return { error: getFriendlyInviteError(emailResult.error ?? 'Failed to send invitation email.') }
    }

    console.log('[SendInvite] Email sent successfully:', { email: normalizedEmail, messageId: emailResult.messageId })
    return { success: true, message: `Invitation sent to ${normalizedEmail}.` }
  } catch (err) {
    console.error('sendInvite error:', err)
    return { error: err instanceof Error ? getFriendlyInviteError(err.message) : 'Failed to send invite' }
  }
}

/**
 * Update a user's role in the organization
 */
export async function updateUserRole(
  userId: string,
  newRole: string,
  companyId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    // Verify the current user is an owner
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .eq('company_id', companyId)
      .single()

    if (profile?.role !== 'owner') {
      return { error: 'Only organization owners can change member roles.' }
    }

    // Can't change the owner's role
    const { data: targetUser } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .eq('company_id', companyId)
      .single()

    if (targetUser?.role === 'owner') {
      return { error: 'Cannot change the owner\'s role.' }
    }

    // Update the role
    const admin = createAdminClient()
    const { error: updateErr } = await admin.from('profiles').update({ role: newRole }).eq('id', userId).eq('company_id', companyId)

    if (updateErr) {
      return { error: updateErr.message }
    }

    return { success: true }
  } catch (err) {
    console.error('updateUserRole error:', err)
    return { error: err instanceof Error ? err.message : 'Failed to update role' }
  }
}

/**
 * Delete a user from the organization
 */
export async function deleteUser(
  userId: string,
  companyId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    // Verify the current user is an owner
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .eq('company_id', companyId)
      .single()

    if (profile?.role !== 'owner') {
      return { error: 'Only organization owners can remove members.' }
    }

    // Can't delete yourself
    if (userId === user.id) {
      return { error: 'You cannot remove yourself from the organization.' }
    }

    // Can't delete the owner
    const { data: targetUser } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .eq('company_id', companyId)
      .single()

    if (targetUser?.role === 'owner') {
      return { error: 'Cannot remove the organization owner.' }
    }

    // Delete the user from the organization
    const admin = createAdminClient()
    const { error: deleteErr } = await admin.from('profiles').delete().eq('id', userId).eq('company_id', companyId)

    if (deleteErr) {
      return { error: deleteErr.message }
    }

    return { success: true }
  } catch (err) {
    console.error('deleteUser error:', err)
    return { error: err instanceof Error ? err.message : 'Failed to delete user' }
  }
}
