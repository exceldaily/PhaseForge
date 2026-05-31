'use server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

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

  // 2. Use service role client to bypass RLS for company creation
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const slug = formData.companyName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  const { data: company, error: companyErr } = await admin
    .from('companies')
    .insert({ name: formData.companyName, slug: `${slug}-${Date.now()}` })
    .select()
    .single()

  if (companyErr) return { error: companyErr.message }

  // 3. Create profile
  await admin.from('profiles').upsert({
    id: auth.user.id,
    company_id: company.id,
    full_name: formData.fullName,
    email: formData.email,
    role: 'owner',
  })

  return { success: true }
}
