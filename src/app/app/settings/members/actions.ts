'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkMemberLimit } from '@/lib/planLimits'

interface SendInviteResult {
  success?: boolean
  error?: string
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

    // Send the Supabase-native invite email. This creates the auth user (if
    // new) and emails a confirmation link. company_id + role flow through
    // user metadata so handle_new_user() provisions the profile correctly.
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
      normalizedEmail,
      {
        data: { company_id: companyId, role },
        redirectTo: origin ? `${origin}/invite/accept` : undefined,
      }
    )

    if (inviteErr) {
      // Common case: the email already has an account.
      return { error: inviteErr.message }
    }

    // Record the invitation for audit / pending-list display.
    const token = crypto.randomUUID()
    await admin.from('invitations').upsert(
      {
        company_id: companyId,
        email: normalizedEmail,
        role,
        token,
        invited_by: user.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: 'token' }
    )

    return { success: true }
  } catch (err) {
    console.error('sendInvite error:', err)
    return { error: err instanceof Error ? err.message : 'Failed to send invite' }
  }
}
