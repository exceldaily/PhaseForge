import { notFound } from 'next/navigation'
import { activeTemplate, loadPmBundle, loadTechs, requirePm } from '@/lib/pm/server'
import { ChecklistClient } from './ChecklistClient'

export const metadata = { title: 'PM Checklist | PhaseForge' }

export default async function PmWorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requirePm()
  const bundle = await loadPmBundle(ctx.supabase, ctx.companyId, id, { sign: true })
  if (!bundle) notFound()
  const [{ data: can }, techs, { data: people }, live] = await Promise.all([
    ctx.supabase.rpc('pm_can_work', { p_pm: id }),
    loadTechs(ctx.supabase, ctx.companyId),
    ctx.supabase.from('profiles').select('id, full_name').eq('company_id', ctx.companyId),
    bundle.cycle.templateVersionId ? Promise.resolve(null) : activeTemplate(ctx.supabase, ctx.companyId, bundle.cycle.quarter),
  ])
  // The big objects stay on the server; the client gets the plain parts.
  const { progress: _progress, ...rest } = bundle
  void _progress
  return (
    <ChecklistClient
      {...rest}
      canWork={!!can}
      canCoordinate={ctx.isCoordinator}
      isAdmin={ctx.isAdmin}
      userId={ctx.userId}
      techName={techs.find((t) => t.id === bundle.cycle.techId)?.name ?? null}
      names={Object.fromEntries((people ?? []).map((p) => [p.id as string, ((p.full_name as string | null) ?? '').trim() || 'Someone']))}
      today={new Date().toISOString().slice(0, 10)}
      checklistAvailable={!!bundle.cycle.templateVersionId || !!live}
    />
  )
}
