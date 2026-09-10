'use server'

// The company's job link pattern. Not tied to any plan: every company can
// point Job# at its own system. Managers and up can change it.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canEditCompanyData } from '@/lib/permissions'
import { jobUrlProblem } from '@/lib/jobLink'

export async function saveJobLinkTemplate(template: string): Promise<{ ok: true } | { error: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not signed in' }
    const { data: p } = await supabase.from('profiles').select('company_id, role, ops_role').eq('id', user.id).single()
    if (!p?.company_id || !canEditCompanyData(p)) return { error: 'Managers and up only' }
    const problem = jobUrlProblem(template)
    if (problem) return { error: problem }
    const { error } = await supabase.from('companies').update({ schedule_job_url_template: template.trim() || null }).eq('id', p.company_id)
    if (error) return { error: error.message }
    // Every page reads it through the app shell.
    revalidatePath('/app', 'layout')
    return { ok: true }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Failed' } }
}
