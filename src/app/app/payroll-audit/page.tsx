import { requirePayrollAudit, ensureSettings, loadExclusions, expireStaleRuns, findExclusion, isWorkerOnline, payPeriod } from '@/lib/payroll-audit/server'
import { PayrollAuditClient, type FindingView, type RunView, type ReviewLogView } from './PayrollAuditClient'

export const dynamic = 'force-dynamic'

export default async function PayrollAuditPage() {
  const { admin, companyId } = await requirePayrollAudit()
  await expireStaleRuns(admin, companyId)
  const settings = await ensureSettings(admin, companyId)

  const [exclusions, runsRes, findingsRes, logRes, companyRes] = await Promise.all([
    loadExclusions(admin, companyId),
    admin.from('payroll_audit_runs').select('*').eq('company_id', companyId).order('queued_at', { ascending: false }).limit(25),
    admin.from('payroll_audit_findings').select('*').eq('company_id', companyId).is('superseded_at', null)
      .order('work_date', { ascending: false, nullsFirst: false }).limit(1500),
    admin.from('payroll_audit_review_log').select('id, finding_id, actor_name, from_status, to_status, note, created_at')
      .eq('company_id', companyId).order('created_at', { ascending: false }).limit(1500),
    admin.from('companies').select('schedule_job_url_template').eq('id', companyId).single(),
  ])

  // People on the exclusion list never appear, even for findings stored before they were added.
  const visible = (findingsRes.data ?? []).filter((r) => !findExclusion(exclusions, (r.kalos_employee_id as string | null) ?? null, (r.employee_name as string | null) ?? ''))
  const findings: FindingView[] = visible.map((r) => ({
    id: r.id as string, category: r.category as string, employeeName: (r.employee_name as string | null) ?? null,
    kalosEmployeeId: (r.kalos_employee_id as string | null) ?? null, workDate: (r.work_date as string | null) ?? null,
    travelType: (r.travel_type as string | null) ?? null, originLabel: (r.origin_label as string | null) ?? null, destLabel: (r.dest_label as string | null) ?? null,
    jobNumbers: (r.job_numbers as string[]) ?? [], recordedMinutes: (r.recorded_minutes as number | null) ?? null,
    estimatedMinutes: (r.estimated_minutes as number | null) ?? null, allowedMinutes: (r.allowed_minutes as number | null) ?? null,
    excessMinutes: (r.excess_minutes as number | null) ?? null, routeProvider: (r.route_provider as string | null) ?? null,
    summary: r.summary as string, evidence: (r.evidence as Record<string, unknown>) ?? {}, assumptions: (r.assumptions as string[]) ?? [],
    reviewStatus: r.review_status as string, reviewNote: (r.review_note as string | null) ?? null, reviewedAt: (r.reviewed_at as string | null) ?? null,
    firstSeen: r.created_at as string,
  }))

  const jobs = [...new Set(findings.flatMap((f) => f.jobNumbers))]
  const links: Record<string, { projectId: string; title: string }> = {}
  if (jobs.length) {
    const { data: projects } = await admin.from('projects').select('id, name, job_number').eq('company_id', companyId).in('job_number', jobs.slice(0, 500))
    for (const p of projects ?? []) if (p.job_number) links[p.job_number as string] = { projectId: p.id as string, title: (p.name as string) ?? '' }
  }

  const runs: RunView[] = (runsRes.data ?? []).map((r) => ({
    id: r.id as string, status: r.status as string, trigger: r.trigger as string, rangeStart: r.range_start as string, rangeEnd: r.range_end as string,
    phase: (r.phase as string | null) ?? null, message: (r.message as string | null) ?? null, progressCurrent: Number(r.progress_current),
    progressTotal: Number(r.progress_total), error: (r.error as string | null) ?? null, errorCode: (r.error_code as string | null) ?? null,
    stats: (r.stats as Record<string, number>) ?? {}, queuedAt: r.queued_at as string, startedAt: (r.started_at as string | null) ?? null,
    completedAt: (r.completed_at as string | null) ?? null, cancelRequested: !!r.cancel_requested,
  }))

  const history: ReviewLogView[] = (logRes.data ?? []).map((l) => ({
    id: l.id as string, findingId: l.finding_id as string, actor: (l.actor_name as string | null) ?? 'Someone',
    from: (l.from_status as string | null) ?? null, to: l.to_status as string, note: (l.note as string | null) ?? null, at: l.created_at as string,
  }))

  return (
    <PayrollAuditClient
      settings={{ ...settings, workerOnline: isWorkerOnline(settings) }}
      exclusions={exclusions}
      runs={runs}
      findings={findings}
      history={history}
      projectLinks={links}
      jobUrlTemplate={(companyRes.data?.schedule_job_url_template as string | null) ?? null}
      periods={{ current: payPeriod('current', settings.timezone), previous: payPeriod('previous', settings.timezone) }}
    />
  )
}
