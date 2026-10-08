import { loadStores, loadTechs, mapMaterial, mapRows, requirePm } from '@/lib/pm/server'
import { quarterOf } from '@/lib/pm/quarters'
import type { PmCycle } from '@/lib/pm/types'
import { DashboardClient } from './DashboardClient'

export default async function PmDashboardPage({ searchParams }: { searchParams: Promise<{ year?: string; q?: string }> }) {
  const params = await searchParams
  const ctx = await requirePm()
  const today = new Date().toISOString().slice(0, 10)
  const now = quarterOf(today)
  const year = /^20\d{2}$/.test(params.year ?? '') ? Number(params.year) : now.year
  const quarter = /^[1-4]$/.test(params.q ?? '') ? Number(params.q) : year === now.year ? now.quarter : 4

  const [stores, techs, { data: cycles }, { data: materials }, { data: defs }, { data: years }] = await Promise.all([
    loadStores(ctx.supabase, ctx.companyId),
    loadTechs(ctx.supabase, ctx.companyId),
    ctx.supabase.from('pm_cycles').select('*').eq('company_id', ctx.companyId).eq('year', year).limit(5000),
    ctx.supabase.from('pm_materials').select('*').eq('company_id', ctx.companyId).not('status', 'in', '(installed,cancelled)').limit(2000),
    ctx.supabase.from('pm_deficiencies').select('store_id, severity').eq('company_id', ctx.companyId).not('repair_status', 'in', '(repaired,closed,declined)').limit(5000),
    ctx.supabase.from('pm_cycles').select('year').eq('company_id', ctx.companyId).order('year').limit(5000),
  ])
  const openByStore: Record<string, number> = {}
  for (const d of defs ?? []) openByStore[d.store_id as string] = (openByStore[d.store_id as string] ?? 0) + 1

  return (
    <DashboardClient
      stores={stores}
      techs={techs}
      cycles={mapRows<PmCycle>(cycles)}
      materials={(materials ?? []).map(mapMaterial)}
      openDeficienciesByStore={openByStore}
      year={year}
      quarter={quarter}
      years={[...new Set([...(years ?? []).map((y) => y.year as number), now.year, year])].sort()}
      today={today}
      role={ctx.role}
      myTechIds={ctx.techIds}
    />
  )
}
