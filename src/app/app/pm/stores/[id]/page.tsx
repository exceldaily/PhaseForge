import { notFound } from 'next/navigation'
import { loadActivity, loadTechs, mapRows, mapStore, requirePm } from '@/lib/pm/server'
import type { PmCycle, PmDeficiency, PmEquipment, PmExclusion } from '@/lib/pm/types'
import { StoreProfileClient, type JobNumberRow } from './StoreProfileClient'

export default async function PmStorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requirePm()
  const { data: s } = await ctx.supabase.from('pm_stores').select('*').eq('id', id).eq('company_id', ctx.companyId).maybeSingle()
  if (!s) notFound()

  const [techs, { data: cycles }, { data: jobs }, { data: equipment }, { data: exclusions }, { data: deficiencies }, { data: codes }, activity, { data: people }] = await Promise.all([
    loadTechs(ctx.supabase, ctx.companyId),
    ctx.supabase.from('pm_cycles').select('*').eq('store_id', id).order('year', { ascending: false }).order('quarter', { ascending: false }),
    ctx.supabase.from('pm_job_numbers').select('id, pm_id, job_number, received_date, is_current, entered_by, entered_at, superseded_at').eq('store_id', id).order('entered_at', { ascending: false }),
    ctx.supabase.from('pm_equipment').select('*').eq('store_id', id).order('kind').order('sort_order'),
    ctx.supabase.from('pm_store_exclusions').select('id, store_id, item_code, equipment_id, reason').eq('store_id', id).order('item_code'),
    ctx.supabase.from('pm_deficiencies').select('*').eq('store_id', id).order('created_at', { ascending: false }).limit(200),
    ctx.supabase.from('pm_template_items').select('code, description, sort_order, pm_template_versions!inner(status)').eq('company_id', ctx.companyId).neq('pm_template_versions.status', 'retired').order('sort_order'),
    loadActivity(ctx.supabase, { companyId: ctx.companyId, storeId: id, limit: 40 }),
    ctx.supabase.from('profiles').select('id, full_name').eq('company_id', ctx.companyId),
  ])
  const seen = new Set<string>()
  const checkCodes = (codes ?? []).filter((c) => !seen.has(c.code as string) && !!seen.add(c.code as string))
    .map((c) => ({ code: c.code as string, description: c.description as string }))

  return (
    <StoreProfileClient
      store={mapStore(s)}
      techs={techs}
      cycles={mapRows<PmCycle>(cycles)}
      jobNumbers={mapRows<JobNumberRow>(jobs)}
      equipment={mapRows<PmEquipment>(equipment)}
      exclusions={mapRows<PmExclusion>(exclusions)}
      deficiencies={mapRows<PmDeficiency>(deficiencies)}
      checkCodes={checkCodes}
      activity={activity}
      names={Object.fromEntries((people ?? []).map((p) => [p.id as string, ((p.full_name as string | null) ?? '').trim() || 'Someone']))}
      canEdit={ctx.isCoordinator}
      today={new Date().toISOString().slice(0, 10)}
    />
  )
}
