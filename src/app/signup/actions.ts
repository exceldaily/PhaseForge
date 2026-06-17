'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFriendlyAuthError, normalizeAuthEmail, validatePassword } from '@/lib/auth/password'
import { sendWelcomeEmail } from '@/lib/brevo'
import { createUniqueSlug } from '@/lib/slugs'

const AUTH_USER_LOOKUP_PAGE_SIZE = 200

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

export async function createWorkspace(formData: {
  fullName: string
  companyName: string
  email: string
  password: string
  inviteToken?: string
}) {
  const supabase = await createClient()
  const admin = createAdminClient()
  const email = normalizeAuthEmail(formData.email)
  const fullName = formData.fullName.trim()
  const companyName = formData.companyName.trim()

  if (!fullName) return { error: 'Please enter your name.' }

  const passwordError = validatePassword(formData.password)
  if (passwordError) return { error: passwordError }

  // Check for invite token (invited users join existing company)
  let company: { id: string; name: string } | null = null
  if (formData.inviteToken) {
    const { data: invite, error: inviteErr } = await admin
      .from('company_invites')
      .select('company_id, email, companies(id, name)')
      .eq('token', formData.inviteToken)
      .eq('status', 'pending')
      .single()

    if (inviteErr || !invite) {
      return { error: 'Invalid or expired invite link.' }
    }

    // Verify email matches
    if (invite.email.toLowerCase() !== email) {
      return { error: `This invite is for ${invite.email}. Please sign up with that email address.` }
    }

    company = (invite.companies as any)
  } else {
    // Not invited — must provide company name
    if (!companyName) return { error: 'Please enter your company name.' }
  }

  const { data: existingUser } = await admin
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle()

  if (existingUser) {
    return { error: 'An account with this email already exists. Try signing in or resetting your password.' }
  }

  const existingAuthUser = await findAuthUserByEmail(admin, email)
  if (existingAuthUser) {
    const { data: existingAuthProfile } = await admin
      .from('profiles')
      .select('company_id')
      .eq('id', existingAuthUser.id)
      .maybeSingle()

    if (existingAuthProfile?.company_id) {
      return { error: 'An account with this email already exists. Try signing in or resetting your password.' }
    }
  }

  // If not invited, create a new company with domain check
  if (!company) {
    const emailDomain = email.split('@')[1].toLowerCase()
    const { data: existingCompanyWithDomain } = await admin
      .from('companies')
      .select('id, name')
      .eq('domain', emailDomain)
      .maybeSingle()

    if (existingCompanyWithDomain) {
      return { error: `A company with email domain "${emailDomain}" is already registered. Contact your company admin to be added to the workspace.` }
    }

    const { data: newCompany, error: companyErr } = await admin
      .from('companies')
      .insert({ name: companyName, slug: createUniqueSlug(companyName, 'company'), domain: emailDomain })
      .select()
      .single()

    if (companyErr) return { error: companyErr.message }
    company = newCompany
  }

  if (existingAuthUser) {
    const { error: updateAuthErr } = await admin.auth.admin.updateUserById(existingAuthUser.id, {
      password: formData.password,
      user_metadata: {
        ...(existingAuthUser.user_metadata ?? {}),
        full_name: fullName,
        company_id: company.id,
        role: 'owner',
      },
    })

    if (updateAuthErr) {
      await admin.from('companies').delete().eq('id', company.id)
      return { error: getFriendlyAuthError(updateAuthErr.message) }
    }

    const { error: recoveredProfileErr } = await admin.from('profiles').upsert({
      id: existingAuthUser.id,
      company_id: company.id,
      full_name: fullName,
      email,
      role: 'owner',
      is_active: true,
    })

    if (recoveredProfileErr) {
      return { error: recoveredProfileErr.message }
    }

    const { data: repairedSession } = await supabase.auth.signInWithPassword({
      email,
      password: formData.password,
    })

    sendWelcomeEmail(email, fullName).catch(err => console.error('Welcome email failed:', err))

    return { success: true, session: Boolean(repairedSession.session) }
  }

  const { data: auth, error: authErr } = await supabase.auth.signUp({
    email,
    password: formData.password,
    options: {
      data: {
        full_name: fullName,
        company_id: company.id,
        role: 'owner',
      },
    },
  })

  if (authErr) {
    await admin.from('companies').delete().eq('id', company.id)
    return { error: getFriendlyAuthError(authErr.message) }
  }
  if (!auth.user) {
    await admin.from('companies').delete().eq('id', company.id)
    return { error: 'Failed to create user' }
  }

  const { error: profileErr } = await admin.from('profiles').upsert({
    id: auth.user.id,
    company_id: company.id,
    full_name: fullName,
    email,
    role: 'owner',
    is_active: true,
  })

  if (profileErr) return { error: profileErr.message }

  // Mark invite as accepted if this was an invited signup
  if (formData.inviteToken) {
    await admin
      .from('company_invites')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('token', formData.inviteToken)
      .catch(err => console.error('Failed to mark invite as accepted:', err))
  }

  // Send welcome email (fire and forget; don't block signup on email failure)
  sendWelcomeEmail(email, fullName).catch(err => console.error('Welcome email failed:', err))

  // session is present only when email confirmation is OFF.
  // When ON, the workspace still exists and the user finishes after confirming.
  return { success: true, session: Boolean(auth.session) }
}
