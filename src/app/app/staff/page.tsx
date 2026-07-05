import { requireModule } from '@/lib/operations/server'
import { createClient } from '@/lib/supabase/server'
import { StaffClient } from './StaffClient'

export const dynamic = 'force-dynamic'

export default async function StaffPage() {
  const ctx = await requireModule('staff')
  const supabase = await createClient()

  const [{ data: profiles }, { data: details }, { data: certs }, { data: divisions }, { data: calls }] =
    await Promise.all([
      supabase.from('profiles').select('id, full_name, email, ops_role, job_title, avatar_url').eq('company_id', ctx.companyId).order('full_name'),
      supabase.from('staff_details').select('*').eq('company_id', ctx.companyId),
      supabase.from('staff_certifications').select('*').eq('company_id', ctx.companyId),
      supabase.from('divisions').select('*').eq('company_id', ctx.companyId).eq('is_active', true).order('sort_order'),
      supabase.from('calls').select('id, assigned_staff_id, status').eq('company_id', ctx.companyId),
    ])

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <StaffClient
        profiles={profiles ?? []}
        details={details ?? []}
        certs={certs ?? []}
        divisions={divisions ?? []}
        calls={calls ?? []}
        canWrite={['owner', 'admin'].includes(ctx.opsRole)}
      />
    </div>
  )
}
