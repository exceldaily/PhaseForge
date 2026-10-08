import { loadStores, loadTechs, mapRows, requirePm } from '@/lib/pm/server'
import { quarterOf } from '@/lib/pm/quarters'
import type { PmCycle } from '@/lib/pm/types'
import { TrackerClient } from './TrackerClient'

// Opening a quarter attaches a checklist to every store's PM.
export const maxDuration = 60

export default async function PmTrackerPage({ searchParams }: { searchParams: Promise<{ year?: string; q?: string; view?: string }> }) {
  const params = await searchParams
  const ctx = await requirePm()
  const today = new Date().toISOString().slice(0, 10)
  const now = quarterOf(today)
  const year = /^20\d{2}$/.test(params.year ?? '') ? Number(params.year) : now.year
  const quarter = /^[1-4]$/.test(params.q ?? '') ? Number(params.q) : year === now.year ? now.quarter : 1

  const [stores, techs, { data: cycles }, { data: templates }] = await Promise.all([
    loadStores(ctx.supabase, ctx.companyId),
    loadTechs(ctx.supabase, ctx.companyId),
    ctx.supabase.from('pm_cycles').select('*').eq('company_id', ctx.companyId).eq('year', year).limit(5000),
    ctx.supabase.from('pm_template_versions').select('quarter').eq('company_id', ctx.companyId).eq('status', 'active'),
  ])
  return (
    <TrackerClient
      stores={stores}
      techs={techs}
      cycles={mapRows<PmCycle>(cycles)}
      year={year}
      initialQuarter={quarter}
      initialView={params.view === 'list' ? 'list' : 'matrix'}
      thisYear={now.year}
      today={today}
      canEdit={ctx.isCoordinator}
      quartersWithChecklist={(templates ?? []).map((t) => t.quarter as number)}
    />
  )
}
