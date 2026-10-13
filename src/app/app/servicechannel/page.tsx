import Link from 'next/link'
import { requireSc, loadWorkOrders, loadMetrics, loadSettings, type MetricEntryView } from '@/lib/servicechannel/server'
import { MEASURES } from '@/lib/servicechannel/types'
import { AGE_BUCKETS, VIEWS, ageBucket, countViews } from '@/lib/servicechannel/views'
import { fmtDate, fmtWhen } from '@/lib/servicechannel/format'

export const dynamic = 'force-dynamic'

export default async function ScOverviewPage() {
  const { admin, companyId } = await requireSc()
  const today = new Date().toISOString().slice(0, 10)
  const [wos, metrics, settings, overdueTasks] = await Promise.all([
    loadWorkOrders(admin, companyId), loadMetrics(admin, companyId), loadSettings(admin, companyId),
    admin.from('sc_tasks').select('work_order_id').eq('company_id', companyId).neq('status', 'verified_resolved').lt('due_date', today).limit(5000),
  ])
  const overdueIds = new Set((overdueTasks.data ?? []).map((t) => t.work_order_id as string))
  const counts = countViews(wos, today, overdueIds)

  // Latest official entry per measure, with history for a trend.
  const byMeasure = new Map<string, MetricEntryView[]>()
  for (const m of metrics) byMeasure.set(m.measure, [...(byMeasure.get(m.measure) ?? []), m])
  const latest = (k: string) => byMeasure.get(k)?.[0] ?? null
  const scores = MEASURES.filter((m) => ['overall', 'speed', 'quality', 'price', 'engagement'].includes(m.key))
  const others = MEASURES.filter((m) => !['overall', 'speed', 'quality', 'price', 'engagement'].includes(m.key))

  const active = wos.filter((w) => w.observationState === 'observed' && /^(OPEN|IN PROGRESS)/.test(w.status ?? ''))
  const byExt = tally(active.map((w) => w.statusExt ?? 'No extended status'))
  const byAge = AGE_BUCKETS.map((b) => [b.label, active.filter((w) => ageBucket(w.callDate, today) === b.label).length] as [string, number])
  const byDept = tally(wos.filter((w) => w.case.internalStatus !== 'verified_resolved' && w.case.ownerProfileId).map((w) => w.case.department ?? 'No department'))
  const byTrade = tally(active.map((w) => w.trade ?? 'No trade'))

  return (
    <div className="mx-auto max-w-none space-y-5 p-3 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">ServiceChannel Command Center</h1>
          <p className="mt-0.5 text-sm text-slate-500">Goal: overall score above {settings.targetOverall} by {fmtDate(settings.targetDate)}. ServiceChannel remains the system of record; this is where follow-up is owned.</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          {settings.lastImportAt ? (
            <>Data as of <strong>{fmtWhen(settings.lastImportAt)}</strong> ({settings.lastImportSource ?? 'import'}){settings.lastCoverage?.statuses.length ? `, statuses ${settings.lastCoverage.statuses.join('/')}` : ''}{settings.lastCoverage?.callDateFrom ? `, calls from ${fmtDate(settings.lastCoverage.callDateFrom)}` : ''}. {wos.length} work orders held.</>
          ) : <>No report imported yet. <Link className="font-semibold text-indigo-700" href="/app/servicechannel/import">Import one</Link>.</>}
        </div>
      </div>

      {/* Official scores */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-slate-900">Official ServiceChannel scores</h2>
          <Link href="/app/servicechannel/settings" className="text-xs font-semibold text-indigo-700">Record a reading</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {scores.map((m) => {
            const e = latest(m.key)
            const hist = (byMeasure.get(m.key) ?? []).filter((x) => x.value !== null)
            const delta = e?.value !== null && e?.previousValue !== null && e ? e.value! - e.previousValue! : null
            const target = m.key === 'overall' ? settings.targetOverall : null
            return (
              <div key={m.key} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{m.label}</p>{e?.isSample && <span className="rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800">SAMPLE</span>}</div>
                <p className={`mt-1 text-3xl font-bold tabular-nums ${e?.value === null || !e ? 'text-slate-300' : target !== null ? (e.value! > target ? 'text-emerald-700' : 'text-rose-700') : 'text-slate-900'}`}>{e?.value ?? '-'}</p>
                {target !== null && <p className="text-[11px] text-slate-500">Target above {target}{e ? '' : '. Not captured yet: read it from the provider homepage and record it with its filters.'}</p>}
                {e && <p className="mt-1 text-[11px] text-slate-500">{delta !== null && <span className={delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{delta >= 0 ? '+' : ''}{round(delta)} vs previous · </span>}{e.periodLabel ?? fmtDate(e.snapshotDate)}{e.scorecardView ? ` · ${e.scorecardView}` : ''}</p>}
                {hist.length >= 2 && <Sparkline values={[...hist].reverse().map((x) => x.value!)} />}
              </div>
            )
          })}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {others.map((m) => {
            const e = latest(m.key)
            return (
              <div key={m.key} className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{m.label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{e?.value ?? '-'}<span className="ml-1 text-sm font-medium text-slate-400">{e ? m.unit === 'score' ? '' : m.unit : ''}</span>
                  {e?.previousValue !== null && e?.previousValue !== undefined && <span className="ml-2 text-xs font-medium text-slate-500">was {e.previousValue}</span>}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{e ? `${e.periodLabel ?? fmtDate(e.snapshotDate)}${e.filters ? ` · ${e.filters}` : ''}` : 'Not recorded'}</p>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Scores are typed in from ServiceChannel with their date, view, filters, and period. Nothing on this page estimates a score from work orders.</p>
      </section>

      {/* Operational overview */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-900">Operational overview</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {VIEWS.map((v) => (
            <Link key={v.key} href={`/app/servicechannel/work-orders?view=${v.key}`} className="rounded-xl border border-slate-200 bg-white p-3 hover:border-indigo-300" title={v.hint}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{v.label}</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${counts[v.key] && ['critical', 'unsat', 'overdue_actions'].includes(v.key) ? 'text-rose-700' : 'text-slate-900'}`}>{counts[v.key]}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">{v.hint}</p>
            </Link>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">{counts.unassigned} active work orders have no PhaseForge owner yet. <Link className="font-semibold text-indigo-700" href="/app/servicechannel/work-orders?view=unassigned">Assign them</Link>.</p>
      </section>

      {/* Charts from real data */}
      <section className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <Bars title="Active by extended status" rows={byExt} />
        <Bars title="Age of active work orders (since call date)" rows={byAge} />
        <Bars title="Active by trade" rows={byTrade} />
        <Bars title="Owned cases by department" rows={byDept} empty="Assign owners and departments to see this." />
      </section>
      <p className="text-[11px] text-slate-400">Open versus resolved over time and billing exposure need a completed-work report; import one from ServiceChannel (Completed or Invoiced statuses) and they fill in.</p>
    </div>
  )
}

const round = (n: number) => Math.round(n * 100) / 100
function tally(values: string[]): [string, number][] {
  const m = new Map<string, number>()
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, 12)
}

function Bars({ title, rows, empty }: { title: string; rows: [string, number][]; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r[1]))
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-2 space-y-1.5">
        {rows.map(([label, n]) => (
          <div key={label} className="flex items-center gap-2 text-xs">
            <span className="w-36 truncate text-slate-600" title={label}>{label}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${(n / max) * 100}%` }} /></div>
            <span className="w-8 text-right font-semibold tabular-nums text-slate-800">{n}</span>
          </div>
        ))}
        {!rows.length && <p className="text-xs text-slate-400">{empty ?? 'No data yet.'}</p>}
      </div>
    </div>
  )
}

function Sparkline({ values }: { values: number[] }) {
  const w = 120, h = 28
  const min = Math.min(...values), max = Math.max(...values)
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * (h - 4) - 2}`).join(' ')
  return <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 h-7 w-full text-indigo-500" aria-label="Trend"><polyline fill="none" stroke="currentColor" strokeWidth="2" points={pts} /></svg>
}
