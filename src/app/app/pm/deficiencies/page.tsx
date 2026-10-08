import { loadStores, mapRows, requirePm } from '@/lib/pm/server'
import type { PmCycle, PmDeficiency } from '@/lib/pm/types'
import { DeficienciesClient } from './DeficienciesClient'

export const metadata = { title: 'PM Deficiencies | PhaseForge' }

export default async function PmDeficienciesPage() {
  const ctx = await requirePm()
  const [stores, { data: defs }, { data: people }] = await Promise.all([
    loadStores(ctx.supabase, ctx.companyId),
    ctx.supabase.from('pm_deficiencies').select('*').eq('company_id', ctx.companyId).order('created_at', { ascending: false }).limit(3000),
    ctx.supabase.from('profiles').select('id, full_name').eq('company_id', ctx.companyId),
  ])
  const deficiencies = mapRows<PmDeficiency>(defs)
  const pmIds = [...new Set(deficiencies.map((d) => d.pmId).filter(Boolean) as string[])]
  const { data: cycles } = pmIds.length ? await ctx.supabase.from('pm_cycles').select('id, year, quarter, job_number').in('id', pmIds) : { data: [] }
  return (
    <DeficienciesClient
      deficiencies={deficiencies}
      stores={stores}
      cycles={mapRows<Pick<PmCycle, 'id' | 'year' | 'quarter' | 'jobNumber'>>(cycles)}
      names={Object.fromEntries((people ?? []).map((p) => [p.id as string, ((p.full_name as string | null) ?? '').trim() || 'Someone']))}
      canCoordinate={ctx.isCoordinator}
      today={new Date().toISOString().slice(0, 10)}
    />
  )
}
