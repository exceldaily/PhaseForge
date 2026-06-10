'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function createWorkspace(formData: {
  fullName: string
  companyName: string
  email: string
  password: string
}) {
  const supabase = await createClient()

  // 1. Sign up the user first
  const { data: auth, error: authErr } = await supabase.auth.signUp({
    email: formData.email,
    password: formData.password,
    options: { data: { full_name: formData.fullName } },
  })

  if (authErr) return { error: authErr.message }
  if (!auth.user) return { error: 'Failed to create user' }

  // 2. Use service-role client to bypass RLS for company/profile creation
  const admin = createAdminClient()

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

  const slug = formData.companyName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')

  const { data: company, error: companyErr } = await admin
    .from('companies')
    .insert({ name: formData.companyName, slug: `${slug}-${Date.now()}` })
    .select()
    .single()

  if (companyErr) return { error: companyErr.message }

  // 3. Create / backfill profile (owner of their new company)
  const { error: profileErr } = await admin.from('profiles').upsert({
    id: auth.user.id,
    company_id: company.id,
    full_name: formData.fullName,
    email: formData.email,
    role: 'owner',
  })

  if (profileErr) return { error: profileErr.message }

  // session is present only when email confirmation is OFF.
  // When ON, the workspace still exists and the user finishes after confirming.
  return { success: true, session: Boolean(auth.session) }
}
