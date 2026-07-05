'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getOpsContext } from '@/lib/operations/server'

// Toggle a module for the caller's organization. RLS also enforces that only
// owner/admin within the same org can write organization_modules — this check
// is defense in depth, not the only gate.
export async function setModuleEnabled(moduleKey: string, enabled: boolean) {
  const ctx = await getOpsContext()
  if (ctx.opsRole !== 'owner' && ctx.opsRole !== 'admin') {
    return { error: 'Only organization owners and admins can change modules.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('organization_modules')
    .upsert(
      { company_id: ctx.companyId, module_key: moduleKey, enabled, updated_by: ctx.userId, updated_at: new Date().toISOString() },
      { onConflict: 'company_id,module_key' }
    )

  if (error) return { error: error.message }
  revalidatePath('/app', 'layout')
  return { ok: true }
}
