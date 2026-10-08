import { notFound } from 'next/navigation'
import { completionGaps, fieldCompleteGaps } from '@/lib/pm/progress'
import { activeTemplate, loadActivity, loadPmBundle, loadTechs, mapRows, requirePm, signPaths } from '@/lib/pm/server'
import { PmRecordClient, type JobNumberRow, type ReportRow } from './PmRecordClient'

export const metadata = { title: 'PM Record | PhaseForge' }
// Building a report with photos can take a while.
export const maxDuration = 60

export default async function PmRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requirePm()
  const bundle = await loadPmBundle(ctx.supabase, ctx.companyId, id, { sign: true })
  if (!bundle) notFound()

  const [{ data: can }, techs, { data: people }, { data: jobs }, { data: reports }, activity, live] = await Promise.all([
    ctx.supabase.rpc('pm_can_work', { p_pm: id }),
    loadTechs(ctx.supabase, ctx.companyId),
    ctx.supabase.from('profiles').select('id, full_name').eq('company_id', ctx.companyId),
    ctx.supabase.from('pm_job_numbers').select('id, pm_id, job_number, received_date, is_current, entered_by, entered_at, superseded_at').eq('pm_id', id).order('entered_at', { ascending: false }),
    ctx.supabase.from('pm_reports').select('id, version, path, size_bytes, checklist_done, checklist_total, generated_by, generated_at').eq('pm_id', id).order('version', { ascending: false }),
    loadActivity(ctx.supabase, { companyId: ctx.companyId, pmId: id, limit: 150 }),
    bundle.cycle.templateVersionId ? Promise.resolve(null) : activeTemplate(ctx.supabase, ctx.companyId, bundle.cycle.quarter),
  ])
  const reportRows = mapRows<ReportRow>(reports)
  const urls = await signPaths(reportRows.map((r) => r.path), ctx.companyId)
  const started = !!bundle.cycle.templateVersionId
  const { progress, cycle, store, template, attachments, materials, deficiencies, equipment, rules } = bundle

  return (
    <PmRecordClient
      cycle={cycle} store={store} template={template} attachments={attachments} materials={materials} deficiencies={deficiencies} equipment={equipment} rules={rules}
      sections={progress.sections}
      counts={{ fails: progress.fails, failsUnlinked: progress.failsUnlinked, uninspected: progress.uninspected, incomplete: progress.incomplete }}
      fieldGaps={started ? fieldCompleteGaps(progress, bundle.cycle, bundle.rules) : ['The checklist has not been started']}
      closeGaps={started ? completionGaps(progress, { ...bundle.cycle, reportCount: bundle.reportCount }, bundle.rules) : ['The checklist has not been started']}
      techs={techs}
      jobNumbers={mapRows<JobNumberRow>(jobs)}
      reports={reportRows.map((r) => ({ ...r, url: urls[r.path] ?? null }))}
      activity={activity}
      names={Object.fromEntries((people ?? []).map((p) => [p.id as string, ((p.full_name as string | null) ?? '').trim() || 'Someone']))}
      canWork={!!can}
      canCoordinate={ctx.isCoordinator}
      isAdmin={ctx.isAdmin}
      userId={ctx.userId}
      today={new Date().toISOString().slice(0, 10)}
      checklistAvailable={started || !!live}
    />
  )
}
