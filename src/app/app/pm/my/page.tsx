import { loadStores, loadTechs, mapRows, requirePm } from '@/lib/pm/server'
import { shiftDays } from '@/lib/pm/quarters'
import type { PmCycle } from '@/lib/pm/types'
import { MyPmsClient } from './MyPmsClient'

export const metadata = { title: 'My PMs | PhaseForge' }

export default async function MyPmsPage() {
  const ctx = await requirePm()
  const today = new Date().toISOString().slice(0, 10)
  const recent = shiftDays(today, -21)
  const [stores, techs, { data: open }, { data: done }, { data: templates }] = await Promise.all([
    loadStores(ctx.supabase, ctx.companyId),
    loadTechs(ctx.supabase, ctx.companyId),
    ctx.supabase.from('pm_cycles').select('*').eq('company_id', ctx.companyId).not('status', 'in', '(completed,cancelled)').not('tech_id', 'is', null).limit(3000),
    ctx.supabase.from('pm_cycles').select('*').eq('company_id', ctx.companyId).eq('status', 'completed').gte('closed_at', recent).not('tech_id', 'is', null).limit(500),
    ctx.supabase.from('pm_template_versions').select('quarter').eq('company_id', ctx.companyId).eq('status', 'active'),
  ])
  return (
    <MyPmsClient
      stores={stores}
      techs={techs}
      cycles={mapRows<PmCycle>([...(open ?? []), ...(done ?? [])])}
      myTechIds={ctx.techIds}
      canCoordinate={ctx.isCoordinator}
      quartersWithChecklist={(templates ?? []).map((t) => t.quarter as number)}
      today={today}
    />
  )
}
