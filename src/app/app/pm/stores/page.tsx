import { loadStores, loadTechs, mapRows, requirePm } from '@/lib/pm/server'
import { quarterOf } from '@/lib/pm/quarters'
import type { PmCycle } from '@/lib/pm/types'
import { StoresClient } from './StoresClient'

export default async function PmStoresPage() {
  const ctx = await requirePm()
  const today = new Date().toISOString().slice(0, 10)
  const { year, quarter } = quarterOf(today)
  const [stores, techs, { data: cycles }, { data: staged }] = await Promise.all([
    loadStores(ctx.supabase, ctx.companyId),
    loadTechs(ctx.supabase, ctx.companyId),
    ctx.supabase.from('pm_cycles').select('id, store_id, status, job_number, checklist_done, checklist_total, waiting_filters, waiting_parts, return_visit_needed, blocking_deficiencies')
      .eq('company_id', ctx.companyId).eq('year', year).eq('quarter', quarter),
    ctx.isCoordinator
      ? ctx.supabase.from('pm_import_batches').select('id, kind, source, rows, created_at').eq('company_id', ctx.companyId).eq('status', 'draft').eq('kind', 'stores').order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as { id: string; kind: string; source: string | null; rows: unknown[]; created_at: string }[] }),
  ])
  return (
    <StoresClient
      stores={stores}
      techs={techs}
      current={mapRows<Pick<PmCycle, 'id' | 'storeId' | 'status' | 'jobNumber' | 'checklistDone' | 'checklistTotal' | 'waitingFilters' | 'waitingParts' | 'returnVisitNeeded' | 'blockingDeficiencies'>>(cycles)}
      staged={(staged ?? []).map((b) => ({ id: b.id as string, source: (b.source as string | null) ?? null, count: Array.isArray(b.rows) ? b.rows.length : 0 }))}
      year={year}
      quarter={quarter}
      canEdit={ctx.isCoordinator}
    />
  )
}
