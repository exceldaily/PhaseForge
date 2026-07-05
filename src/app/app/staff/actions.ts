'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireModule } from '@/lib/operations/server'

export async function upsertStaffDetails(profileId: string, patch: {
  division_id?: string | null
  phone?: string | null
  employment_status?: string
  skills?: string[]
  notes?: string | null
}) {
  const ctx = await requireModule('staff')
  if (!['owner', 'admin'].includes(ctx.opsRole) && profileId !== ctx.userId) {
    return { error: 'Not allowed.' }
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('staff_details')
    .upsert(
      { company_id: ctx.companyId, profile_id: profileId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'company_id,profile_id' }
    )
  if (error) return { error: error.message }
  revalidatePath('/app/staff')
  return { ok: true }
}

export async function setOpsRole(profileId: string, opsRole: string) {
  const ctx = await requireModule('staff')
  if (!['owner', 'admin'].includes(ctx.opsRole)) return { error: 'Only owners and admins can change roles.' }
  if (profileId === ctx.userId && opsRole !== 'owner' && opsRole !== 'admin') {
    return { error: 'You cannot demote yourself.' }
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ ops_role: opsRole })
    .eq('id', profileId)
    .eq('company_id', ctx.companyId)
  if (error) return { error: error.message }
  revalidatePath('/app/staff')
  revalidatePath('/app', 'layout')
  return { ok: true }
}

export async function addCertification(staffDetailsId: string, input: {
  name: string
  issuer?: string
  number?: string
  issued_on?: string
  expires_on?: string
}) {
  const ctx = await requireModule('staff')
  const supabase = await createClient()
  const { error } = await supabase.from('staff_certifications').insert({
    company_id: ctx.companyId,
    staff_id: staffDetailsId,
    name: input.name.trim(),
    issuer: input.issuer || null,
    number: input.number || null,
    issued_on: input.issued_on || null,
    expires_on: input.expires_on || null,
  })
  if (error) return { error: error.message }
  revalidatePath('/app/staff')
  return { ok: true }
}
