import { loadStores, loadTechs, mapRows, requirePm, signPaths } from '@/lib/pm/server'
import { quarterOf } from '@/lib/pm/quarters'
import type { PmCycle } from '@/lib/pm/types'
import { ReportsClient, type PdfRow } from './ReportsClient'

export const metadata = { title: 'PM Reports | PhaseForge' }

export default async function PmReportsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const params = await searchParams
  const ctx = await requirePm()
  const today = new Date().toISOString().slice(0, 10)
  const now = quarterOf(today)
  const year = /^20\d{2}$/.test(params.year ?? '') ? Number(params.year) : now.year

  const [stores, techs, { data: cycles }, { data: years }, { data: pdfs }, { data: people }] = await Promise.all([
    loadStores(ctx.supabase, ctx.companyId),
    loadTechs(ctx.supabase, ctx.companyId),
    ctx.supabase.from('pm_cycles').select('*').eq('company_id', ctx.companyId).eq('year', year).limit(5000),
    ctx.supabase.from('pm_cycles').select('year').eq('company_id', ctx.companyId).order('year').limit(5000),
    ctx.supabase.from('pm_reports').select('id, pm_id, version, path, size_bytes, generated_by, generated_at, pm_cycles!inner(store_id, year, quarter, job_number)')
      .eq('company_id', ctx.companyId).order('generated_at', { ascending: false }).limit(60),
    ctx.supabase.from('profiles').select('id, full_name').eq('company_id', ctx.companyId),
  ])
  const urls = await signPaths((pdfs ?? []).map((p) => p.path as string), ctx.companyId)
  const pdfRows: PdfRow[] = (pdfs ?? []).map((p) => {
    const c = p.pm_cycles as unknown as { store_id: string; year: number; quarter: number; job_number: string | null }
    return {
      id: p.id as string, pmId: p.pm_id as string, version: p.version as number, generatedAt: p.generated_at as string, generatedBy: (p.generated_by as string | null) ?? null,
      storeId: c.store_id, year: c.year, quarter: c.quarter, jobNumber: c.job_number, url: urls[p.path as string] ?? null,
    }
  })
  return (
    <ReportsClient
      stores={stores}
      techs={techs}
      cycles={mapRows<PmCycle>(cycles)}
      pdfs={pdfRows}
      names={Object.fromEntries((people ?? []).map((p) => [p.id as string, ((p.full_name as string | null) ?? '').trim() || 'Someone']))}
      year={year}
      years={[...new Set([...(years ?? []).map((y) => y.year as number), now.year, year])].sort()}
      currentQuarter={year === now.year ? now.quarter : 4}
      today={today}
    />
  )
}
