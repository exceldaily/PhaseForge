import { redirect } from 'next/navigation'
import { existingStoresFor, loadExistingCycles } from '@/lib/pm/importServer'
import type { ImportKind, RawRow } from '@/lib/pm/importers'
import { quarterOf } from '@/lib/pm/quarters'
import { loadStores, loadTechs, requirePm } from '@/lib/pm/server'
import { ImportClient } from './ImportClient'

const KINDS: ImportKind[] = ['stores', 'job_numbers', 'pm_records']

export default async function PmImportPage({ searchParams }: { searchParams: Promise<{ kind?: string; batch?: string }> }) {
  const params = await searchParams
  const ctx = await requirePm()
  if (!ctx.isCoordinator) redirect('/app/pm')

  const [stores, techs, cycles] = await Promise.all([loadStores(ctx.supabase, ctx.companyId), loadTechs(ctx.supabase, ctx.companyId), loadExistingCycles(ctx)])
  let batch: { id: string; kind: ImportKind; source: string | null; rows: RawRow[] } | null = null
  if (params.batch) {
    const { data } = await ctx.supabase.from('pm_import_batches').select('id, kind, source, rows').eq('id', params.batch).eq('company_id', ctx.companyId).eq('status', 'draft').maybeSingle()
    if (data) batch = { id: data.id as string, kind: data.kind as ImportKind, source: (data.source as string | null) ?? null, rows: (data.rows as RawRow[]) ?? [] }
  }
  const today = new Date().toISOString().slice(0, 10)
  return (
    <ImportClient
      key={batch?.id ?? 'new'}
      initialKind={batch?.kind ?? (KINDS.includes(params.kind as ImportKind) ? (params.kind as ImportKind) : 'stores')}
      batch={batch}
      existingStores={existingStoresFor(stores, techs)}
      stores={stores.map((s) => ({ id: s.id, storeNumber: s.storeNumber, isActive: s.isActive }))}
      cycles={cycles}
      techs={techs.map((t) => ({ id: t.id, name: t.name }))}
      now={quarterOf(today)}
    />
  )
}
