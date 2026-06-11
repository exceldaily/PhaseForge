'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFriendlyAuthError, normalizeAuthEmail, validatePassword } from '@/lib/auth/password'
import { sendWelcomeEmail } from '@/lib/brevo'
import { createUniqueSlug } from '@/lib/slugs'

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

  // 1. Sign up the user first
  const { data: auth, error: authErr } = await supabase.auth.signUp({
    email,
    password: formData.password,
    options: { data: { full_name: fullName } },
  })

  if (authErr) return { error: getFriendlyAuthError(authErr.message) }
  if (!auth.user) return { error: 'Failed to create user' }

  // Guard against duplicate company creation on retries / already-set-up users:
  // if this user already has a profile with a company, reuse it.
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('company_id')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (existingProfile?.company_id) {
    return { success: true, session: Boolean(auth.session) }
  }

  const { data: company, error: companyErr } = await admin
    .from('companies')
    .insert({ name: companyName, slug: createUniqueSlug(companyName, 'company') })
    .select()
    .single()

  if (companyErr) return { error: companyErr.message }

  // 3. Create / backfill profile (owner of their new company)
  const { error: profileErr } = await admin.from('profiles').upsert({
    id: auth.user.id,
    company_id: company.id,
    full_name: fullName,
    email,
    role: 'owner',
  })

  if (profileErr) return { error: profileErr.message }

  // Send welcome email (fire and forget; don't block signup on email failure)
  sendWelcomeEmail(email, fullName).catch(err => console.error('Welcome email failed:', err))

  // session is present only when email confirmation is OFF.
  // When ON, the workspace still exists and the user finishes after confirming.
  return { success: true, session: Boolean(auth.session) }
}
