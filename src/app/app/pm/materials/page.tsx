import { loadStores, loadTechs, mapMaterial, mapRows, requirePm } from '@/lib/pm/server'
import { shiftDays } from '@/lib/pm/quarters'
import type { PmCycle } from '@/lib/pm/types'
import { MaterialsClient } from './MaterialsClient'

export const metadata = { title: 'PM Materials | PhaseForge' }

export default async function PmMaterialsPage() {
  const ctx = await requirePm()
  const today = new Date().toISOString().slice(0, 10)
  const since = shiftDays(today, -120)
  const [stores, techs, { data: open }, { data: closed }, { data: people }] = await Promise.all([
    loadStores(ctx.supabase, ctx.companyId),
    loadTechs(ctx.supabase, ctx.companyId),
    ctx.supabase.from('pm_materials').select('*').eq('company_id', ctx.companyId).not('status', 'in', '(installed,cancelled)').order('requested_date').limit(3000),
    ctx.supabase.from('pm_materials').select('*').eq('company_id', ctx.companyId).in('status', ['installed', 'cancelled']).gte('requested_date', since).order('requested_date', { ascending: false }).limit(1000),
    ctx.supabase.from('profiles').select('id, full_name').eq('company_id', ctx.companyId),
  ])
  const materials = [...(open ?? []), ...(closed ?? [])].map(mapMaterial)
  const pmIds = [...new Set(materials.map((m) => m.pmId))]
  const { data: cycles } = pmIds.length
    ? await ctx.supabase.from('pm_cycles').select('id, store_id, year, quarter, job_number, tech_id, status').in('id', pmIds)
    : { data: [] }
  return (
    <MaterialsClient
      materials={materials}
      stores={stores}
      techs={techs}
      cycles={mapRows<Pick<PmCycle, 'id' | 'storeId' | 'year' | 'quarter' | 'jobNumber' | 'techId' | 'status'>>(cycles)}
      names={Object.fromEntries((people ?? []).map((p) => [p.id as string, ((p.full_name as string | null) ?? '').trim() || 'Someone']))}
      canCoordinate={ctx.isCoordinator}
      myTechIds={ctx.techIds}
      today={today}
    />
  )
}
