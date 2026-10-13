import Link from 'next/link'
import { requireSc, loadWorkOrders, loadOpenTasksLite, contactedSinceUnsat, loadMetrics, loadSettings } from '@/lib/servicechannel/server'
import { buildActionCenter, WAITING_LABELS, type WaitingOn } from '@/lib/servicechannel/actionCenter'
import { daysBetween, isActionable } from '@/lib/servicechannel/rules'
import { URGENT_PRIORITY } from '@/lib/servicechannel/views'
import { MEASURES } from '@/lib/servicechannel/types'
import { fmtDate, fmtWhen } from '@/lib/servicechannel/format'
import type { WorkOrderView } from '@/lib/servicechannel/server'
import { ReportTools } from './ReportTools'

export const dynamic = 'force-dynamic'

// Weekly management summary. Every number is from imported records and
// PhaseForge activity in the last seven days. Where the data does not exist
// (official scores not recorded, completed-work reports not imported) the
// report says so instead of filling the gap.
export default async function ScWeeklyReportPage() {
  const { admin, companyId } = await requireSc()
  const today = new Date().toISOString().slice(0, 10)
  const weekAgoIso = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86_400_000).toISOString()
  const [wos, tasksByWo, metrics, settings] = await Promise.all([loadWorkOrders(admin, companyId), loadOpenTasksLite(admin, companyId), loadMetrics(admin, companyId), loadSettings(admin, companyId)])
  const contacted = await contactedSinceUnsat(admin, companyId, wos)
  const ac = buildActionCenter({ wos, tasksByWo, contactedSinceUnsat: contacted, today })
  const [verifiedEv, contactEv, tasksDone, verifiedCases] = await Promise.all([
    admin.from('sc_events').select('work_order_id, body, actor_name, created_at').eq('company_id', companyId).eq('kind', 'verified').gte('created_at', weekAgoIso).order('created_at', { ascending: false }),
    admin.from('sc_events').select('id').eq('company_id', companyId).eq('kind', 'customer_contact').gte('created_at', weekAgoIso),
    admin.from('sc_tasks').select('id').eq('company_id', companyId).eq('status', 'verified_resolved').gte('verified_at', weekAgoIso),
    admin.from('sc_cases').select('created_at, verified_resolved_at').eq('company_id', companyId).not('verified_resolved_at', 'is', null),
  ])
  const byId = new Map(wos.map((w) => [w.id, w]))
  const active = wos.filter(isActionable)
  const critical = active.filter((w) => !!w.priority && URGENT_PRIORITY.test(w.priority))
  const unsat = wos.filter((w) => w.statusExt === 'UNSATISFACTORY' && w.case.internalStatus !== 'verified_resolved')
  const reopened = active.filter((w) => w.reopenCount > 0)
  const overdueItems = ac.needsToday.find((s) => s.key === 'overdue')?.items ?? []
  const overdueByOwner = new Map<string, number>()
  for (const i of overdueItems) overdueByOwner.set(i.wo.case.ownerName ?? 'No owner', (overdueByOwner.get(i.wo.case.ownerName ?? 'No owner') ?? 0) + 1)
  const attention = [
    ...overdueItems.filter((i) => i.due && daysBetween(i.due, today) >= 7).map((i) => ({ wo: i.wo, why: `Overdue ${daysBetween(i.due!, today)} days` })),
    ...(ac.needsToday.find((s) => s.key === 'unack')?.items ?? []).map((i) => ({ wo: i.wo, why: i.reason })),
    ...(ac.needsToday.find((s) => s.key === 'blocked')?.items ?? []).map((i) => ({ wo: i.wo, why: i.reason })),
  ]
  const leadership = active.filter((w) => w.case.internalStatus === 'blocked' && w.case.blockerReason)
  const waitingByDept = new Map<string, Partial<Record<WaitingOn, number>>>()
  for (const w of active) if (w.case.waitingOn) { const d = w.case.department ?? 'No department'; const m = waitingByDept.get(d) ?? {}; m[w.case.waitingOn as WaitingOn] = (m[w.case.waitingOn as WaitingOn] ?? 0) + 1; waitingByDept.set(d, m) }
  const resolvedDays = (verifiedCases.data ?? []).map((c) => daysBetween(String(c.created_at), String(c.verified_resolved_at)))
  const avgResolution = resolvedDays.length ? Math.round((resolvedDays.reduce((a, b) => a + b, 0) / resolvedDays.length) * 10) / 10 : null
  const latestScore = (k: string) => metrics.find((m) => m.measure === k) ?? null
  const scoreKeys = ['overall', 'speed', 'quality', 'price', 'engagement']

  const rows = [
    ...attention.map((a) => ({ section: 'Needs management attention', tracking: a.wo.trackingNumber, customer: a.wo.customerName ?? '', store: a.wo.storeNumber ?? '', owner: a.wo.case.ownerName ?? '', detail: a.why })),
    ...critical.map((w) => ({ section: 'Critical issues', tracking: w.trackingNumber, customer: w.customerName ?? '', store: w.storeNumber ?? '', owner: w.case.ownerName ?? '', detail: `${w.priority} · ${w.statusExt ?? w.status}` })),
    ...unsat.map((w) => ({ section: 'Unresolved customer complaints', tracking: w.trackingNumber, customer: w.customerName ?? '', store: w.storeNumber ?? '', owner: w.case.ownerName ?? '', detail: contacted.has(w.id) ? 'Customer contacted' : 'No contact recorded' })),
    ...reopened.map((w) => ({ section: 'Reopened cases', tracking: w.trackingNumber, customer: w.customerName ?? '', store: w.storeNumber ?? '', owner: w.case.ownerName ?? '', detail: `Reopened ${w.reopenCount}×` })),
    ...leadership.map((w) => ({ section: 'Needs leadership support', tracking: w.trackingNumber, customer: w.customerName ?? '', store: w.storeNumber ?? '', owner: w.case.ownerName ?? '', detail: w.case.blockerReason ?? '' })),
  ]
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-3 sm:p-5 print:p-0">
      <div className="flex flex-wrap items-start justify-between gap-2 print:hidden">
        <div><h1 className="text-xl font-bold text-slate-900">Weekly management summary</h1><p className="mt-0.5 text-sm text-slate-500">Seven days to {fmtDate(today)}. From imported records and PhaseForge activity only.</p></div>
        <ReportTools rows={rows} filename={`servicechannel-weekly-${today}.csv`} />
      </div>
      <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
        <h2 className="text-sm font-bold text-slate-900">Executive summary</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-800">
          <li>{wos.length} work orders held; {active.length} active in the latest export ({settings.lastImportAt ? `imported ${fmtWhen(settings.lastImportAt)}` : 'no import yet'}).</li>
          <li>{ac.counts.needsToday} work order(s) need attention today: {ac.counts.unassigned} unassigned, {ac.counts.overdue} overdue, {ac.counts.complaints} complaints without a recorded contact, {ac.counts.unack} unacknowledged assignments, {ac.counts.blocked} blocked, {ac.counts.verify} awaiting verification.</li>
          <li>This week: {(verifiedEv.data ?? []).length} case(s) verified resolved, {(tasksDone.data ?? []).length} task(s) verified, {(contactEv.data ?? []).length} customer contact(s) recorded.</li>
          <li>{critical.length} active work order(s) carry an urgent priority in the export; {unsat.length} unsatisfactory report(s) are open; {reopened.length} active work order(s) have been reopened.</li>
          <li>Average internal resolution time: {avgResolution !== null ? `${avgResolution} days over ${resolvedDays.length} verified case(s)` : 'no verified cases yet, so not available'}.</li>
          <li>Official scores: {scoreKeys.map((k) => { const m = latestScore(k); const label = MEASURES.find((x) => x.key === k)?.label; return m ? `${label} ${m.value} (${m.periodLabel ?? fmtDate(m.snapshotDate)})` : `${label} not recorded` }).join('; ')}. Score movement is only what ServiceChannel reports; nothing here infers it from case counts.</li>
        </ul>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Cases requiring management attention">{list(attention.map((a) => ({ wo: a.wo, detail: a.why })), 'None: nothing overdue by a week, unacknowledged, or blocked without progress.')}</Section>
        <Section title="Critical issues (urgent priority in the export)">{list(critical.map((w) => ({ wo: w, detail: `${w.priority} · ${w.statusExt ?? w.status ?? ''}` })), 'None active.')}</Section>
        <Section title="Overdue internal responsibilities">{overdueByOwner.size ? <ul className="space-y-1 text-sm">{[...overdueByOwner].sort((a, b) => b[1] - a[1]).map(([o, n]) => <li key={o}>{o}: <strong>{n}</strong> overdue</li>)}</ul> : <p className="text-xs text-slate-400">Nothing overdue.</p>}</Section>
        <Section title="Unresolved customer complaints">{list(unsat.map((w) => ({ wo: w, detail: contacted.has(w.id) ? 'customer contacted' : 'no contact recorded' })), 'No open unsatisfactory reports in the export.')}</Section>
        <Section title="Reopened cases requiring review">{list(reopened.map((w) => ({ wo: w, detail: `reopened ${w.reopenCount}×, last ${fmtWhen(w.lastReopenedAt)}` })), 'None detected across imports so far.')}</Section>
        <Section title="Department bottlenecks (waiting on)">{waitingByDept.size ? <ul className="space-y-1 text-sm">{[...waitingByDept].map(([d, m]) => <li key={d}><strong>{d}</strong>: {Object.entries(m).map(([k, n]) => `${WAITING_LABELS[k as WaitingOn].replace('Waiting on ', '')} ${n}`).join(', ')}</li>)}</ul> : <p className="text-xs text-slate-400">No cases are marked as waiting on anyone. Record it in the quick editor to see bottlenecks here.</p>}</Section>
        <Section title="Verified resolutions this week">{(verifiedEv.data ?? []).length ? <ul className="space-y-1 text-sm">{(verifiedEv.data ?? []).map((e, k) => { const w = byId.get(e.work_order_id as string); return <li key={k}>{w ? <Link className="font-mono font-semibold text-indigo-700" href={`/app/servicechannel/work-orders/${w.id}`}>{w.trackingNumber}</Link> : '?'} <span className="text-slate-600">{String(e.body ?? '').slice(0, 120)}</span> <span className="text-xs text-slate-400">{e.actor_name} · {fmtWhen(String(e.created_at))}</span></li> })}</ul> : <p className="text-xs text-slate-400">None verified this week.</p>}</Section>
        <Section title="Operational improvements this week"><ul className="list-disc space-y-1 pl-5 text-sm text-slate-800"><li>{(tasksDone.data ?? []).length} follow-up task(s) verified complete</li><li>{(contactEv.data ?? []).length} customer contact(s) recorded</li><li>{wos.filter((w) => w.case.ownerProfileId).length} of {wos.length} work orders have an accountable owner</li><li>{wos.filter((w) => w.customerName).length} of {wos.length} work orders have a customer identified</li></ul></Section>
        <Section title="Actions requiring leadership support">{list(leadership.map((w) => ({ wo: w, detail: w.case.blockerReason ?? '' })), 'No blocked case names a blocker. Record blockers in the quick editor to surface them here.')}</Section>
        <Section title="Not available from the data"><ul className="list-disc space-y-1 pl-5 text-xs text-slate-600"><li>Billing exposure and completed-work closeout: needs a completed or invoiced export.</li><li>Official SLA deadlines, proposal and invoice status: not in the ServiceChannel export; recorded by hand where known.</li><li>Recurring technical issues: only links a person verified as recalls count; candidate matches are shown on each case.</li></ul></Section>
      </div>
    </div>
  )
}

function Row({ w, detail }: { w: WorkOrderView; detail: string }) {
  return (
    <li className="flex flex-wrap gap-x-2 text-sm"><Link className="font-mono font-semibold text-indigo-700" href={`/app/servicechannel/work-orders/${w.id}`}>{w.trackingNumber}</Link><span className="text-slate-700">{w.customerName ?? 'Customer not known'} {w.storeNumber ?? ''}</span><span className="text-slate-500">· {w.case.ownerName ?? 'no owner'}</span><span className="text-xs text-slate-500">· {detail}</span></li>
  )
}
function Section({ title, children, empty }: { title: string; children?: React.ReactNode; empty?: string }) {
  return <section className="break-inside-avoid rounded-xl border border-slate-200 bg-white p-4"><h2 className="text-sm font-bold text-slate-900">{title}</h2><div className="mt-2">{children ?? <p className="text-xs text-slate-400">{empty}</p>}</div></section>
}
function list(items: { wo: WorkOrderView; detail: string }[], empty: string, max = 25) {
  return items.length
    ? <ul className="space-y-1">{items.slice(0, max).map((i, k) => <Row key={`${i.wo.id}-${k}`} w={i.wo} detail={i.detail} />)}{items.length > max && <li className="text-xs text-slate-500">and {items.length - max} more</li>}</ul>
    : <p className="text-xs text-slate-400">{empty}</p>
}
