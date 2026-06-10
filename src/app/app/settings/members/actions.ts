'use server'

import { headers } from 'next/headers'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
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

function createPublicAuthClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
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
    const publicAuth = createPublicAuthClient()
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
    let tempPassword: string | undefined
    let authUserMetadata: Record<string, any> = {}

    // Create new auth user with a random temporary password
    tempPassword = crypto.randomUUID()
    const { data, error: createErr } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password: tempPassword,
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
          return { error: updateErr.message }
        }
      } else {
        return { error: createErr.message }
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
    const fullName = authUserMetadata?.full_name?.trim()
      ? authUserMetadata.full_name.trim()
      : normalizedEmail.split('@')[0]

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

    // Build the invite link with token (and temp password if new user)
    let inviteLink = origin
      ? `${origin}/invite/accept?token=${token}&email=${encodeURIComponent(normalizedEmail)}`
      : `https://phaseforge.vercel.app/invite/accept?token=${token}&email=${encodeURIComponent(normalizedEmail)}`

    if (tempPassword) {
      inviteLink += `&tempPassword=${encodeURIComponent(tempPassword)}`
    }

    // Send branded Brevo email
    const emailResult = await sendInviteEmail(normalizedEmail, inviteLink, companyName, role, inviterName, tempPassword)

    if (!emailResult.success) {
      console.error('[SendInvite] Brevo email failed:', {
        email: normalizedEmail,
        error: emailResult.error,
        brevoApiKey: process.env.BREVO_API_KEY ? 'SET' : 'NOT SET',
      })
    } else {
      console.log('[SendInvite] Email sent successfully:', { email: normalizedEmail, messageId: emailResult.messageId })
    }

    return { success: true, message: `Invitation sent to ${normalizedEmail}.` }
  } catch (err) {
    console.error('sendInvite error:', err)
    return { error: err instanceof Error ? err.message : 'Failed to send invite' }
  }
}
