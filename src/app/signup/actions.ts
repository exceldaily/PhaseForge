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
}) {
  const supabase = await createClient()
  const admin = createAdminClient()
  const email = normalizeAuthEmail(formData.email)
  const fullName = formData.fullName.trim()
  const companyName = formData.companyName.trim()

  if (!fullName) return { error: 'Please enter your name.' }
  if (!companyName) return { error: 'Please enter your company name.' }

  const passwordError = validatePassword(formData.password)
  if (passwordError) return { error: passwordError }

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

  // Extract email domain and check for duplicate companies
  const emailDomain = email.split('@')[1].toLowerCase()
  const { data: existingCompanyWithDomain } = await admin
    .from('companies')
    .select('id, name')
    .eq('domain', emailDomain)
    .maybeSingle()

  if (existingCompanyWithDomain) {
    return { error: `A company with email domain "${emailDomain}" is already registered. Contact your company admin to be added to the workspace.` }
  }

  const { data: company, error: companyErr } = await admin
    .from('companies')
    .insert({ name: companyName, slug: createUniqueSlug(companyName, 'company'), domain: emailDomain })
    .select()
    .single()

  if (companyErr) return { error: companyErr.message }

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

  // Send welcome email (fire and forget; don't block signup on email failure)
  sendWelcomeEmail(email, fullName).catch(err => console.error('Welcome email failed:', err))

  // session is present only when email confirmation is OFF.
  // When ON, the workspace still exists and the user finishes after confirming.
  return { success: true, session: Boolean(auth.session) }
}
