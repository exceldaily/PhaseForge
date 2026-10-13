import Link from 'next/link'
import { requireSc, loadWorkOrders, loadMetrics, loadSettings, contactedSinceUnsat, type MetricEntryView } from '@/lib/servicechannel/server'
import { loadInvestigations, loadProjects, loadRecoveries, loadTasks } from '@/lib/servicechannel/records'
import { buildActionCenter } from '@/lib/servicechannel/actionCenter'
import { buildAlerts } from '@/lib/servicechannel/alerts'
import { daysBetween } from '@/lib/servicechannel/rules'
import { MEASURES, PROJECT_STATUS_LABELS } from '@/lib/servicechannel/types'
import { fmtDate, fmtWhen } from '@/lib/servicechannel/format'
import { AlertsPanel } from '@/components/servicechannel/AlertsPanel'

export const dynamic = 'force-dynamic'

// The Command Center: the official scores exactly as recorded, the goal, and
// the operational counts that PhaseForge is accountable for. Every number
// links to the page where it is worked.
export default async function ScCommandCenterPage() {
  const { admin, companyId } = await requireSc()
  const today = new Date().toISOString().slice(0, 10)
  const weekAgoIso = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86_400_000).toISOString()
  const [wos, metrics, settings, tasks, recoveries, projects, investigations, doneWeek, verifiedCasesWeek] = await Promise.all([
    loadWorkOrders(admin, companyId), loadMetrics(admin, companyId), loadSettings(admin, companyId), loadTasks(admin, companyId), loadRecoveries(admin, companyId),
    loadProjects(admin, companyId, today), loadInvestigations(admin, companyId),
    admin.from('sc_tasks').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'verified_resolved').gte('verified_at', weekAgoIso),
    admin.from('sc_cases').select('id', { count: 'exact', head: true }).eq('company_id', companyId).gte('verified_resolved_at', weekAgoIso),
  ])
  const ac = buildActionCenter({ wos, tasks, recoveries, projects, contactedSinceUnsat: await contactedSinceUnsat(admin, companyId, wos), today, thresholds: settings.thresholds })
  const alerts = buildAlerts({ ac, wos, tasks, projects, investigations, metrics, settings, today })

  const openCases = wos.filter((w) => w.case.internalStatus !== 'new' && w.case.internalStatus !== 'verified_resolved').length
  const openTasks = tasks.length
  const openRecoveries = recoveries.filter((r) => r.status !== 'closed').length
  const openProjects = projects.filter((p) => p.status === 'active' || p.status === 'planned' || p.status === 'on_hold')
  const openRca = investigations.filter((i) => i.status === 'open' || i.status === 'investigating').length
  const q = (s: string) => `/app/servicechannel/action-center?open=${s}`
  const ops: [string, string | number, string, string, boolean][] = [
    ['Open responsibilities', openTasks + openCases, `${openTasks} tasks, ${openCases} cases being followed up`, '/app/servicechannel/action-center', false],
    ['Overdue', ac.counts.overdue, 'internal dates passed', q('overdue'), true],
    ['No owner', ac.counts.unassigned, 'responsibilities nobody owns', q('unassigned'), true],
    ['Unacknowledged', ac.counts.unack, `assigned ${settings.thresholds.unackDays}+ days, not accepted`, q('unack'), true],
    ['Complaints awaiting contact', ac.counts.complaints, 'unsatisfactory or recovery, no contact logged', q('complaints'), true],
    ['Escalated', ac.counts.escalated, 'handed to management, not cleared', q('escalated'), true],
    ['Pending verification', ac.counts.verify, 'marked done, not verified', q('verify'), false],
    ['Customer recoveries open', openRecoveries, 'complaint records in progress', '/app/servicechannel/customer-recovery', false],
    ['Root cause investigations', openRca, 'open or investigating', '/app/servicechannel/rca', false],
    ['Improvement projects', openProjects.length, `${openProjects.filter((p) => p.status === 'active').length} active`, '/app/servicechannel/projects', false],
    ['Corrective actions verified this week', `${doneWeek.count ?? 0}`, `plus ${verifiedCasesWeek.count ?? 0} case(s) verified resolved`, '/app/servicechannel/reports', false],
    ['Waiting on others', ac.counts.waiting, 'blocked on a person or a customer', '/app/servicechannel/action-center?open=customer', false],
  ]

  const byMeasure = new Map<string, MetricEntryView[]>()
  for (const m of metrics.filter((x) => !x.isSample)) byMeasure.set(m.measure, [...(byMeasure.get(m.measure) ?? []), m])
  const companyWide = (k: string) => (byMeasure.get(k) ?? []).find((m) => !m.filters || /company|all/i.test(m.filters)) ?? byMeasure.get(k)?.[0] ?? null
  const scores = MEASURES.filter((m) => ['overall', 'speed', 'quality', 'engagement', 'price'].includes(m.key))
  const overall = companyWide('overall')
  const daysLeft = daysBetween(today, settings.targetDate)
  const customerScores = metrics.filter((m) => !m.isSample && m.filters && !/company|all/i.test(m.filters) && ['quality', 'maintenance', 'overall', 'speed', 'price', 'engagement'].includes(m.measure))
  const latestPerCustomer = new Map<string, MetricEntryView>()
  for (const m of customerScores) { const k = `${m.filters}|${m.measure}`; if (!latestPerCustomer.has(k)) latestPerCustomer.set(k, m) }

  return (
    <div className="mx-auto max-w-none space-y-5 p-3 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">ServiceChannel Performance Recovery Center</h1>
          <p className="mt-0.5 text-sm text-slate-500">ServiceChannel runs the work orders. This is where Kalos owns the follow-through: who is accountable, what is being fixed, and whether the official score is moving.</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          {settings.lastImportAt ? <>Work orders as of <strong>{fmtWhen(settings.lastImportAt)}</strong> ({settings.lastImportSource ?? 'import'}). {wos.length} held.</> : <>No report imported yet. <Link className="font-semibold text-indigo-700" href="/app/servicechannel/import">Import one</Link>.</>}
        </div>
      </div>

      {/* Goal and official scores */}
      <section className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,3fr)]">
        <Link href="/app/servicechannel/scores" className="rounded-xl border-2 border-indigo-200 bg-indigo-50/40 p-4 hover:border-indigo-400">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">The goal</p>
          <p className="mt-1 text-sm text-slate-700">Official Overall score above <strong>{settings.targetOverall}</strong> by <strong>{fmtDate(settings.targetDate)}</strong>{daysLeft > 0 ? ` (${daysLeft} days left)` : ' (date passed)'}.</p>
          <div className="mt-3 flex items-end gap-3">
            <div><p className="text-[11px] text-slate-500">Now</p><p className={`text-4xl font-bold tabular-nums ${overall ? (overall.value! > settings.targetOverall ? 'text-emerald-700' : 'text-rose-700') : 'text-slate-300'}`}>{overall?.value ?? '-'}</p></div>
            <div className="pb-1 text-xs text-slate-500">{overall ? <>recorded {fmtDate(overall.snapshotDate)}<br />{overall.scorecardView ?? ''}</> : 'Not recorded yet'}</div>
            <div className="ml-auto pb-1 text-right"><p className="text-[11px] text-slate-500">Gap</p><p className="text-2xl font-bold tabular-nums text-slate-900">{overall ? `${Math.max(0, settings.targetOverall + 1 - overall.value!).toFixed(0)}` : '-'}</p></div>
          </div>
          {overall && overall.value! <= settings.targetOverall && <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.min(100, (overall.value! / settings.targetOverall) * 100)}%` }} /></div>}
          <p className="mt-2 text-[11px] text-slate-500">Scores are read from the ServiceChannel Marketplace Score dashboard and typed in with their date. Nothing here estimates a score.</p>
        </Link>
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {scores.map((m) => {
              const e = companyWide(m.key)
              const hist = (byMeasure.get(m.key) ?? []).filter((x) => x.value !== null && x.filters === e?.filters)
              const prev = hist[1] ?? null
              const delta = e && prev && e.value !== null && prev.value !== null ? e.value - prev.value : e?.previousValue != null && e.value !== null ? e.value - e.previousValue : null
              return (
                <Link key={m.key} href={`/app/servicechannel/scores#${m.key}`} className="rounded-xl border border-slate-200 bg-white p-3 hover:border-indigo-300">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{m.label}</p>
                  <p className={`mt-1 text-3xl font-bold tabular-nums ${!e ? 'text-slate-300' : m.key === 'overall' ? (e.value! > settings.targetOverall ? 'text-emerald-700' : 'text-rose-700') : e.value! >= 80 ? 'text-emerald-700' : e.value! < 65 ? 'text-rose-700' : 'text-slate-900'}`}>{e?.value ?? '-'}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{e ? <>{delta !== null && <span className={delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{delta >= 0 ? '+' : ''}{Math.round(delta * 100) / 100} · </span>}{fmtDate(e.snapshotDate)}</> : 'Not recorded'}</p>
                </Link>
              )
            })}
          </div>
          {latestPerCustomer.size > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {[...latestPerCustomer.values()].map((m) => (
                <Link key={m.id} href="/app/servicechannel/scores" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs hover:border-indigo-300">
                  <span className="font-semibold text-slate-800">{m.filters}</span> <span className="text-slate-500">{MEASURES.find((x) => x.key === m.measure)?.label}</span> <span className={`font-bold tabular-nums ${m.value! < 65 ? 'text-rose-700' : 'text-slate-900'}`}>{m.value}</span><span className="text-slate-400"> · {m.periodLabel ?? fmtDate(m.snapshotDate)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Alerts */}
      <section>
        <div className="mb-2 flex items-baseline justify-between"><h2 className="text-sm font-bold text-slate-900">Management alerts</h2><Link href="/app/servicechannel/settings" className="text-xs font-semibold text-indigo-700">Thresholds</Link></div>
        <AlertsPanel alerts={alerts} compact />
      </section>

      {/* Operational metrics */}
      <section>
        <div className="mb-2 flex items-baseline justify-between"><h2 className="text-sm font-bold text-slate-900">Accountability today</h2><Link href="/app/servicechannel/action-center" className="text-xs font-semibold text-indigo-700">Open the action queue</Link></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
          {ops.map(([label, value, hint, href, bad]) => (
            <Link key={label} href={href} className="rounded-xl border border-slate-200 bg-white p-3 hover:border-indigo-300">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${bad && Number(value) > 0 ? 'text-rose-700' : 'text-slate-900'}`}>{value}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Projects */}
      <section>
        <div className="mb-2 flex items-baseline justify-between"><h2 className="text-sm font-bold text-slate-900">Improvement projects</h2><Link href="/app/servicechannel/projects" className="text-xs font-semibold text-indigo-700">All projects</Link></div>
        {openProjects.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {openProjects.slice(0, 8).map((p) => {
              const pct = p.tasksTotal ? Math.round((p.tasksDone / p.tasksTotal) * 100) : null
              return (
                <Link key={p.id} href={`/app/servicechannel/projects/${p.id}`} className="rounded-xl border border-slate-200 bg-white p-3 hover:border-indigo-300">
                  <p className="truncate text-sm font-semibold text-slate-900" title={p.name}>{p.name}</p>
                  <p className="text-[11px] text-slate-500">{p.scopeCustomer ?? 'Company-wide'} · {PROJECT_STATUS_LABELS[p.status]} · {p.ownerName ?? 'no owner'}</p>
                  <div className="mt-2 flex items-end justify-between text-xs">
                    <span className="text-slate-600">{p.kpi ?? 'KPI'}: <strong className="tabular-nums">{p.baselineValue ?? '-'}</strong>{p.latestKpi ? <> → <strong className="tabular-nums">{p.latestKpi.value}</strong></> : null}{p.targetValue !== null ? <span className="text-slate-400"> / target {p.targetValue}</span> : null}</span>
                    <span className="text-slate-500">{pct !== null ? `${pct}% of tasks` : 'no tasks'}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct ?? 0}%` }} /></div>
                  {p.tasksOverdue > 0 && <p className="mt-1 text-[11px] font-semibold text-rose-700">{p.tasksOverdue} task(s) overdue</p>}
                </Link>
              )
            })}
          </div>
        ) : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">No improvement projects yet. <Link className="font-semibold text-indigo-700" href="/app/servicechannel/projects">Create the four starter projects</Link> from the October 13 review, or add your own.</div>}
      </section>

      <p className="text-[11px] text-slate-400">Open work orders, aging, and the imported detail live under Work Order Reference. Official scores and trends live under Score Performance.</p>
    </div>
  )
}
