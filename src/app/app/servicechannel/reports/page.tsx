import Link from 'next/link'
import { requireSc, loadWorkOrders, contactedSinceUnsat, loadMetrics, loadSettings } from '@/lib/servicechannel/server'
import { loadInvestigations, loadProjects, loadRecoveries, loadTasks } from '@/lib/servicechannel/records'
import { buildActionCenter, WAITING_LABELS, type WaitingOn } from '@/lib/servicechannel/actionCenter'
import { buildAlerts } from '@/lib/servicechannel/alerts'
import { daysBetween, isActionable } from '@/lib/servicechannel/rules'
import { URGENT_PRIORITY } from '@/lib/servicechannel/views'
import { CAUSE_CLASS_LABELS, MEASURES, PROJECT_STATUS_LABELS, RECOVERY_OUTCOME_LABELS } from '@/lib/servicechannel/types'
import { fmtDate, fmtWhen } from '@/lib/servicechannel/format'
import type { WorkOrderView } from '@/lib/servicechannel/server'
import { ReportTools } from './ReportTools'

export const dynamic = 'force-dynamic'

// Weekly management report for the owners. Four parts: performance (official
// scores as recorded), operations (accountability this week), improvement
// projects, and what needs leadership. Every number comes from imported
// records and PhaseForge activity; where the data does not exist the report
// says so instead of filling the gap.
export default async function ScWeeklyReportPage() {
  const { admin, companyId } = await requireSc()
  const today = new Date().toISOString().slice(0, 10)
  const weekAgoIso = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86_400_000).toISOString()
  const [wos, tasks, recoveries, projects, investigations, metrics, settings] = await Promise.all([
    loadWorkOrders(admin, companyId), loadTasks(admin, companyId, { includeClosed: true }), loadRecoveries(admin, companyId), loadProjects(admin, companyId, today), loadInvestigations(admin, companyId), loadMetrics(admin, companyId), loadSettings(admin, companyId),
  ])
  const contacted = await contactedSinceUnsat(admin, companyId, wos)
  const openTasks = tasks.filter((t) => t.status !== 'verified_resolved')
  const ac = buildActionCenter({ wos, tasks: openTasks, recoveries, projects, contactedSinceUnsat: contacted, today, thresholds: settings.thresholds })
  const alerts = buildAlerts({ ac, wos, tasks: openTasks, projects, investigations, metrics, settings, today })
  const [verifiedEv, contactEv, escalations] = await Promise.all([
    admin.from('sc_events').select('work_order_id, body, actor_name, created_at').eq('company_id', companyId).eq('kind', 'verified').gte('created_at', weekAgoIso).order('created_at', { ascending: false }),
    admin.from('sc_events').select('id').eq('company_id', companyId).eq('kind', 'customer_contact').gte('created_at', weekAgoIso),
    admin.from('sc_events').select('id').eq('company_id', companyId).eq('kind', 'escalation').gte('created_at', weekAgoIso),
  ])
  const byId = new Map(wos.map((w) => [w.id, w]))
  const active = wos.filter(isActionable)
  const critical = active.filter((w) => !!w.priority && URGENT_PRIORITY.test(w.priority))
  const unsat = wos.filter((w) => w.statusExt === 'UNSATISFACTORY' && w.case.internalStatus !== 'verified_resolved')
  const reopened = active.filter((w) => w.reopenCount > 0)
  const tasksDoneWeek = tasks.filter((t) => t.status === 'verified_resolved' && t.verifiedAt && t.verifiedAt >= weekAgoIso)
  const tasksCreatedWeek = tasks.filter((t) => t.createdAt >= weekAgoIso)
  const overdueItems = ac.needsToday.find((s) => s.key === 'overdue')?.items ?? []
  const overdueByOwner = new Map<string, number>()
  for (const i of overdueItems) overdueByOwner.set(i.ownerName ?? 'No owner', (overdueByOwner.get(i.ownerName ?? 'No owner') ?? 0) + 1)
  const escalated = ac.needsToday.find((s) => s.key === 'escalated')?.items ?? []
  const blocked = ac.needsToday.find((s) => s.key === 'blocked')?.items ?? []
  const unack = ac.needsToday.find((s) => s.key === 'unack')?.items ?? []
  const waitingByDept = new Map<string, Partial<Record<WaitingOn, number>>>()
  for (const s of ac.waiting) for (const i of s.items) { const d = i.department ?? 'No department'; const m = waitingByDept.get(d) ?? {}; m[s.key as WaitingOn] = (m[s.key as WaitingOn] ?? 0) + 1; waitingByDept.set(d, m) }
  const openRecoveries = recoveries.filter((r) => r.status !== 'closed')
  const closedRecoveriesWeek = recoveries.filter((r) => r.status === 'closed' && r.updatedAt >= weekAgoIso)
  const openProjects = projects.filter((p) => p.status !== 'completed' && p.status !== 'cancelled')
  const openRca = investigations.filter((i) => i.status === 'open' || i.status === 'investigating')
  const verifiedRcaWeek = investigations.filter((i) => i.verificationDate && i.verificationDate >= weekAgoIso.slice(0, 10))
  const leadership = [
    ...openProjects.filter((p) => p.blockers).map((p) => ({ what: `Project: ${p.name}`, href: `/app/servicechannel/projects/${p.id}`, detail: p.blockers! })),
    ...escalated.map((i) => ({ what: `${i.title}`, href: i.href, detail: i.reason })),
    ...blocked.map((i) => ({ what: `${i.title}`, href: i.href, detail: i.reason })),
  ]
  const real = metrics.filter((m) => !m.isSample)
  const latestScore = (k: string) => real.find((m) => m.measure === k && (!m.filters || /company|all/i.test(m.filters))) ?? real.find((m) => m.measure === k) ?? null
  const scoreKeys = ['overall', 'speed', 'quality', 'engagement', 'price']
  const scoreLine = scoreKeys.map((k) => { const m = latestScore(k); const l = MEASURES.find((x) => x.key === k)?.label; return m ? `${l} ${m.value} (${fmtDate(m.snapshotDate)})` : `${l} not recorded` }).join('; ')
  const overall = latestScore('overall')

  const rows = [
    ...escalated.map((i) => ({ section: 'Escalated', tracking: i.kind === 'work_order' ? i.title : '', customer: '', store: '', owner: i.ownerName ?? '', detail: `${i.title}: ${i.reason}` })),
    ...critical.map((w) => ({ section: 'Critical issues', tracking: w.trackingNumber, customer: w.customerName ?? '', store: w.storeNumber ?? '', owner: w.case.ownerName ?? '', detail: `${w.priority} · ${w.statusExt ?? w.status}` })),
    ...unsat.map((w) => ({ section: 'Unresolved customer complaints', tracking: w.trackingNumber, customer: w.customerName ?? '', store: w.storeNumber ?? '', owner: w.case.ownerName ?? '', detail: contacted.has(w.id) ? 'Customer contacted' : 'No contact recorded' })),
    ...openRecoveries.map((r) => ({ section: 'Customer recoveries open', tracking: r.trackingNumber ?? '', customer: r.customerName ?? '', store: r.storeLabel ?? '', owner: r.ownerName ?? '', detail: `${r.status}${r.followUpDeadline ? `, deadline ${r.followUpDeadline}` : ''}` })),
    ...openProjects.map((p) => ({ section: 'Improvement projects', tracking: '', customer: p.scopeCustomer ?? '', store: '', owner: p.ownerName ?? '', detail: `${p.name}: ${p.status}, baseline ${p.baselineValue ?? '-'}, latest ${p.latestKpi?.value ?? '-'}, target ${p.targetValue ?? '-'}, ${p.tasksDone}/${p.tasksTotal} tasks` })),
    ...leadership.map((l) => ({ section: 'Needs leadership support', tracking: '', customer: '', store: '', owner: '', detail: `${l.what}: ${l.detail}` })),
  ]
  const text = [
    `ServiceChannel weekly report, seven days to ${fmtDate(today)}`,
    '',
    'PERFORMANCE',
    `Goal: Overall above ${settings.targetOverall} by ${fmtDate(settings.targetDate)}${overall ? `; now ${overall.value} (${fmtDate(overall.snapshotDate)})` : '; Overall not recorded yet'}.`,
    `Official scores: ${scoreLine}. Scores are as recorded from ServiceChannel; nothing is estimated.`,
    '',
    'OPERATIONS',
    `${wos.length} work orders held, ${active.length} active in the latest export${settings.lastImportAt ? ` (imported ${fmtWhen(settings.lastImportAt)})` : ''}.`,
    `Needs action today: ${ac.counts.needsToday} item(s): ${ac.counts.overdue} overdue, ${ac.counts.complaints} complaints without contact, ${ac.counts.escalated} escalated, ${ac.counts.unack} unacknowledged, ${ac.counts.unassigned} with no owner, ${ac.counts.blocked} blocked, ${ac.counts.verify} awaiting verification.`,
    `This week: ${tasksDoneWeek.length} corrective action(s) verified complete, ${tasksCreatedWeek.length} new responsibilities, ${(verifiedEv.data ?? []).length} case(s) verified resolved, ${(contactEv.data ?? []).length} customer contact(s) recorded, ${(escalations.data ?? []).length} escalation(s).`,
    `Customer recovery: ${openRecoveries.length} open, ${closedRecoveriesWeek.length} closed this week${closedRecoveriesWeek.length ? ` (${closedRecoveriesWeek.map((r) => r.outcome ? RECOVERY_OUTCOME_LABELS[r.outcome] : 'no outcome').join(', ')})` : ''}.`,
    `Root cause: ${openRca.length} investigation(s) open, ${verifiedRcaWeek.length} cause(s) verified this week.`,
    `${critical.length} active work order(s) carry an urgent priority; ${unsat.length} unsatisfactory report(s) open; ${reopened.length} reopened.`,
    overdueByOwner.size ? `Overdue by owner: ${[...overdueByOwner].map(([o, n]) => `${o} ${n}`).join(', ')}.` : 'Nothing overdue.',
    '',
    'IMPROVEMENT PROJECTS',
    ...(openProjects.length ? openProjects.map((p) => `- ${p.name} (${PROJECT_STATUS_LABELS[p.status]}, ${p.ownerName ?? 'no owner'}): ${p.kpi ?? 'KPI'} baseline ${p.baselineValue ?? '-'}${p.latestKpi ? `, latest ${p.latestKpi.value} (${fmtDate(p.latestKpi.snapshotDate)})` : ', no new reading'}, target ${p.targetValue ?? '-'}; ${p.tasksDone}/${p.tasksTotal} tasks verified${p.tasksOverdue ? `, ${p.tasksOverdue} overdue` : ''}${p.reviewDate ? `; next review ${fmtDate(p.reviewDate)}` : ''}.`) : ['- No improvement projects yet.']),
    '',
    'LEADERSHIP SUPPORT NEEDED',
    ...(leadership.length ? leadership.map((l) => `- ${l.what}: ${l.detail}`) : ['- Nothing escalated or blocked, and no project names a blocker.']),
    '',
    `Alerts: ${alerts.length ? alerts.map((a) => `${a.title} (${a.count})`).join('; ') : 'none'}.`,
  ].join('\n')

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-3 sm:p-5 print:p-0">
      <div className="flex flex-wrap items-start justify-between gap-2 print:hidden">
        <div><h1 className="text-xl font-bold text-slate-900">Weekly management report</h1><p className="mt-0.5 text-sm text-slate-500">Seven days to {fmtDate(today)}, for Bryan and Jesse. From imported records and PhaseForge activity only. Copy summary gives a plain-text version for email or chat.</p></div>
        <ReportTools rows={rows} filename={`servicechannel-weekly-${today}.csv`} text={text} />
      </div>

      <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
        <h2 className="text-sm font-bold text-slate-900">1. Performance</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-800">
          <li>Goal: Overall above <strong>{settings.targetOverall}</strong> by {fmtDate(settings.targetDate)} ({Math.max(0, daysBetween(today, settings.targetDate))} days left). {overall ? <>Now <strong>{overall.value}</strong>, recorded {fmtDate(overall.snapshotDate)}.</> : 'Overall not recorded yet.'}</li>
          <li>Official scores: {scoreLine}. Score movement is only what ServiceChannel reports; nothing here infers it from case counts.</li>
          {real.filter((m) => m.filters && !/company|all/i.test(m.filters)).slice(0, 6).map((m) => <li key={m.id}>{m.filters}: {MEASURES.find((x) => x.key === m.measure)?.label} <strong>{m.value}</strong> ({m.periodLabel ?? fmtDate(m.snapshotDate)})</li>)}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold text-slate-900">2. Operations</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-800">
          <li>{wos.length} work orders held; {active.length} active in the latest export ({settings.lastImportAt ? `imported ${fmtWhen(settings.lastImportAt)}` : 'no import yet'}).</li>
          <li>{ac.counts.needsToday} item(s) need action today: {ac.counts.overdue} overdue, {ac.counts.complaints} complaints without a recorded contact, {ac.counts.escalated} escalated, {ac.counts.unack} unacknowledged, {ac.counts.unassigned} with no owner, {ac.counts.blocked} blocked, {ac.counts.verify} awaiting verification.</li>
          <li>This week: {tasksDoneWeek.length} corrective action(s) verified complete, {tasksCreatedWeek.length} new responsibilities, {(verifiedEv.data ?? []).length} case(s) verified resolved, {(contactEv.data ?? []).length} customer contact(s) recorded, {(escalations.data ?? []).length} escalation(s).</li>
          <li>Customer recovery: {openRecoveries.length} open, {closedRecoveriesWeek.length} closed this week. Root cause: {openRca.length} open, {verifiedRcaWeek.length} verified this week.</li>
          <li>{critical.length} active work order(s) carry an urgent priority in the export; {unsat.length} unsatisfactory report(s) are open; {reopened.length} active work order(s) have been reopened.</li>
        </ul>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Escalated and unacknowledged">{escalated.length || unack.length ? <ul className="space-y-1 text-sm">{[...escalated, ...unack].slice(0, 25).map((i) => <li key={i.key}><Link className="font-semibold text-indigo-700" href={i.href}>{i.title}</Link> <span className="text-slate-600">{i.ownerName ?? 'no owner'}</span> <span className="text-xs text-slate-500">· {i.reason}</span></li>)}</ul> : <p className="text-xs text-slate-400">Nothing escalated or waiting on acknowledgment.</p>}</Section>
        <Section title="Overdue responsibilities by owner">{overdueByOwner.size ? <ul className="space-y-1 text-sm">{[...overdueByOwner].sort((a, b) => b[1] - a[1]).map(([o, n]) => <li key={o}>{o}: <strong>{n}</strong> overdue</li>)}</ul> : <p className="text-xs text-slate-400">Nothing overdue.</p>}</Section>
        <Section title="Critical issues (urgent priority in the export)">{list(critical.map((w) => ({ wo: w, detail: `${w.priority} · ${w.statusExt ?? w.status ?? ''}` })), 'None active.')}</Section>
        <Section title="Unresolved customer complaints">{list(unsat.map((w) => ({ wo: w, detail: contacted.has(w.id) ? 'customer contacted' : 'no contact recorded' })), 'No open unsatisfactory reports in the export.')}</Section>
        <Section title="Customer recoveries open">{openRecoveries.length ? <ul className="space-y-1 text-sm">{openRecoveries.slice(0, 25).map((r) => <li key={r.id}><Link className="font-semibold text-indigo-700" href={`/app/servicechannel/customer-recovery/${r.id}`}>{r.customerName ?? 'Customer'} {r.storeLabel ?? ''}</Link> <span className="text-xs text-slate-500">· {r.status.replace(/_/g, ' ')} · {r.ownerName ?? 'no owner'}{r.followUpDeadline ? ` · deadline ${fmtDate(r.followUpDeadline)}` : ''}</span></li>)}</ul> : <p className="text-xs text-slate-400">None open.</p>}</Section>
        <Section title="Reopened cases requiring review">{list(reopened.map((w) => ({ wo: w, detail: `reopened ${w.reopenCount}×, last ${fmtWhen(w.lastReopenedAt)}` })), 'None detected across imports so far.')}</Section>
        <Section title="Department bottlenecks (waiting on)">{waitingByDept.size ? <ul className="space-y-1 text-sm">{[...waitingByDept].map(([d, m]) => <li key={d}><strong>{d}</strong>: {Object.entries(m).map(([k, n]) => `${WAITING_LABELS[k as WaitingOn].replace('Waiting on ', '')} ${n}`).join(', ')}</li>)}</ul> : <p className="text-xs text-slate-400">Nothing is marked as waiting on anyone.</p>}</Section>
        <Section title="Verified resolutions this week">{(verifiedEv.data ?? []).length ? <ul className="space-y-1 text-sm">{(verifiedEv.data ?? []).map((e, k) => { const w = byId.get(e.work_order_id as string); return <li key={k}>{w ? <Link className="font-mono font-semibold text-indigo-700" href={`/app/servicechannel/work-orders/${w.id}`}>{w.trackingNumber}</Link> : '?'} <span className="text-slate-600">{String(e.body ?? '').slice(0, 120)}</span> <span className="text-xs text-slate-400">{e.actor_name} · {fmtWhen(String(e.created_at))}</span></li> })}</ul> : <p className="text-xs text-slate-400">None verified this week.</p>}</Section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold text-slate-900">3. Improvement projects</h2>
        {openProjects.length ? (
          <table className="mt-2 min-w-full text-sm"><thead className="text-left text-[11px] uppercase tracking-wide text-slate-500"><tr>{['Project', 'Owner', 'Status', 'Baseline', 'Latest', 'Target', 'Tasks', 'Next review'].map((h) => <th key={h} className="px-2 py-1 font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{openProjects.map((p) => <tr key={p.id}><td className="px-2 py-1"><Link className="font-semibold text-indigo-700" href={`/app/servicechannel/projects/${p.id}`}>{p.name}</Link><span className="block text-xs text-slate-500">{p.kpi ?? ''}</span></td><td className="px-2 py-1 text-xs">{p.ownerName ?? 'no owner'}</td><td className="px-2 py-1 text-xs">{PROJECT_STATUS_LABELS[p.status]}</td><td className="px-2 py-1 tabular-nums">{p.baselineValue ?? '-'}</td><td className="px-2 py-1 tabular-nums">{p.latestKpi ? <>{p.latestKpi.value}<span className="block text-[10px] text-slate-400">{fmtDate(p.latestKpi.snapshotDate)}</span></> : <span className="text-slate-400">no reading</span>}</td><td className="px-2 py-1 tabular-nums">{p.targetValue ?? '-'}</td><td className="px-2 py-1 text-xs tabular-nums">{p.tasksDone}/{p.tasksTotal}{p.tasksOverdue ? <span className="text-rose-700"> ({p.tasksOverdue} overdue)</span> : ''}</td><td className="px-2 py-1 text-xs">{p.reviewDate ? fmtDate(p.reviewDate) : '-'}</td></tr>)}</tbody></table>
        ) : <p className="mt-2 text-xs text-slate-400">No improvement projects yet.</p>}
        {openRca.length > 0 && <p className="mt-2 text-xs text-slate-600">Open investigations: {openRca.slice(0, 8).map((i) => `${i.title}${i.causeClass ? ` (${CAUSE_CLASS_LABELS[i.causeClass]})` : ''}`).join('; ')}{openRca.length > 8 ? ` and ${openRca.length - 8} more` : ''}.</p>}
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
        <h2 className="text-sm font-bold text-slate-900">4. Leadership support needed</h2>
        {leadership.length ? <ul className="mt-2 space-y-1 text-sm">{leadership.map((l, k) => <li key={k}><Link className="font-semibold text-indigo-700" href={l.href}>{l.what}</Link> <span className="text-slate-700">· {l.detail}</span></li>)}</ul> : <p className="mt-2 text-xs text-slate-500">Nothing escalated or blocked, and no project names a blocker. Record blockers on projects and escalations on responsibilities to surface them here.</p>}
        <p className="mt-2 text-xs text-slate-500">Alerts right now: {alerts.length ? alerts.map((a) => `${a.title} (${a.count})`).join('; ') : 'none'}.</p>
      </section>

      <Section title="Not available from the data"><ul className="list-disc space-y-1 pl-5 text-xs text-slate-600"><li>Billing exposure and completed-work closeout: needs a completed or invoiced export.</li><li>Official SLA deadlines, proposal and invoice status: not in the ServiceChannel export; recorded by hand where known.</li><li>Score movement: only recorded readings count; no score is derived from work orders or task counts.</li></ul></Section>
    </div>
  )
}

function Row({ w, detail }: { w: WorkOrderView; detail: string }) {
  return <li className="flex flex-wrap gap-x-2 text-sm"><Link className="font-mono font-semibold text-indigo-700" href={`/app/servicechannel/work-orders/${w.id}`}>{w.trackingNumber}</Link><span className="text-slate-700">{w.customerName ?? 'Customer not known'} {w.storeNumber ?? ''}</span><span className="text-slate-500">· {w.case.ownerName ?? 'no owner'}</span><span className="text-xs text-slate-500">· {detail}</span></li>
}
function Section({ title, children }: { title: string; children?: React.ReactNode }) {
  return <section className="break-inside-avoid rounded-xl border border-slate-200 bg-white p-4"><h2 className="text-sm font-bold text-slate-900">{title}</h2><div className="mt-2">{children}</div></section>
}
function list(items: { wo: WorkOrderView; detail: string }[], empty: string, max = 25) {
  return items.length
    ? <ul className="space-y-1">{items.slice(0, max).map((i, k) => <Row key={`${i.wo.id}-${k}`} w={i.wo} detail={i.detail} />)}{items.length > max && <li className="text-xs text-slate-500">and {items.length - max} more</li>}</ul>
    : <p className="text-xs text-slate-400">{empty}</p>
}
