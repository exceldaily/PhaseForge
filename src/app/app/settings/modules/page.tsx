import { redirect } from 'next/navigation'
import { getOpsContext } from '@/lib/operations/server'
import { createClient } from '@/lib/supabase/server'
import { OPERATIONS_MODULES } from '@/lib/operations/modules'
import { ModulesClient } from './ModulesClient'

export const dynamic = 'force-dynamic'

export default async function ModulesSettingsPage() {
  const ctx = await getOpsContext()
  if (ctx.opsRole !== 'owner' && ctx.opsRole !== 'admin') redirect('/app/settings')

  const supabase = await createClient()
  const { data: rows } = await supabase
    .from('organization_modules')
    .select('module_key, enabled')
    .eq('company_id', ctx.companyId)

  const enabled = new Set((rows ?? []).filter((r) => r.enabled).map((r) => r.module_key))

  const modules = [
    ...OPERATIONS_MODULES.map((m) => ({ key: m.key, label: m.label, description: m.description })),
    { key: 'projects', label: 'Projects', description: 'Project management, Gantt, boards, punch lists (existing PhaseForge features)' },
    { key: 'reports', label: 'Reports', description: 'Operational and project reporting' },
  ]

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <ModulesClient
        modules={modules.map((m) => ({ ...m, enabled: enabled.has(m.key) }))}
      />
    </div>
  )
}
