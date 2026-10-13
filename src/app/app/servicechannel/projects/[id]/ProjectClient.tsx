'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Person } from '@/lib/servicechannel/server'
import type { ProjectBundle } from '@/lib/servicechannel/records'
import { MEASURES, PROJECT_STATUSES, PROJECT_STATUS_LABELS, SCORE_CATEGORIES } from '@/lib/servicechannel/types'
import { cx, fmtDate, fmtWhen } from '@/components/servicechannel/ui'
import { Area, Chip, DeptInput, Msg, PersonSelect, STATUS_TONE, Select, Text, box, btnPrimary, btnSmall, input } from '@/components/servicechannel/fields'
import { TaskList, Timeline } from '@/components/servicechannel/Tasks'
import { addProjectKpiAction, addProjectUpdateAction, deleteMilestoneAction, deleteProjectKpiAction, linkWorkOrdersToRecordAction, saveMilestoneAction, unlinkWorkOrderFromRecordAction, updateProjectAction } from '../../recordActions'

interface Props { bundle: ProjectBundle; people: Person[]; departments: string[]; today: string }
type Result = { ok: boolean; error?: string }
const label = (k: string | null) => MEASURES.find((m) => m.key === k)?.label ?? k ?? '-'

export function ProjectClient({ bundle, people, departments, today }: Props) {
  const { project: p, milestones, kpis, updates, links, tasks, investigations, events } = bundle
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [f, setF] = useState({
    name: p.name, scopeCustomer: p.scopeCustomer ?? '', department: p.department ?? '', scoreCategory: p.scoreCategory ?? '', kpi: p.kpi ?? '', baselineValue: p.baselineValue?.toString() ?? '', baselinePeriod: p.baselinePeriod ?? '', targetValue: p.targetValue?.toString() ?? '',
    ownerKey: p.ownerKey ?? '', ownerName: p.ownerName, startDate: p.startDate ?? '', targetDate: p.targetDate ?? '', reviewDate: p.reviewDate ?? '', rootProblem: p.rootProblem ?? '', actionPlan: p.actionPlan ?? '', verificationMethod: p.verificationMethod ?? '',
    managementNotes: p.managementNotes ?? '', blockers: p.blockers ?? '', status: p.status as string, note: '',
  })
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))
  const run = (fn: () => Promise<Result>, ok: string) => start(async () => { const r = await fn(); setMsg({ ok: r.ok, text: r.ok ? ok : (r.error ?? 'Something went wrong.') }); if (r.ok) router.refresh() })
  const save = () => { const { note, ...patch } = f; run(() => updateProjectAction({ id: p.id, patch: { ...patch, ownerKey: patch.ownerKey || null, baselineValue: patch.baselineValue || null, targetValue: patch.targetValue || null, startDate: patch.startDate || null, targetDate: patch.targetDate || null, reviewDate: patch.reviewDate || null }, note }).then((r) => { if (r.ok) setF((s) => ({ ...s, note: '' })); return r }), 'Saved.') }
  const [ms, setMs] = useState({ title: '', dueDate: '' })
  const [kpi, setKpi] = useState({ kind: 'progress', label: p.kpi ?? '', value: '', snapshotDate: today, periodLabel: '', source: '', note: '' })
  const [upd, setUpd] = useState('')
  const [tn, setTn] = useState('')
  const pct = p.tasksTotal ? Math.round((p.tasksDone / p.tasksTotal) * 100) : null
  const series = [...kpis].reverse()

  return (
    <div className="mx-auto max-w-none space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/app/servicechannel/projects" className="text-xs font-semibold text-indigo-700">← Improvement Projects</Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold text-slate-900">{p.name}<Chip tone={STATUS_TONE[p.status]}>{PROJECT_STATUS_LABELS[p.status]}</Chip></h1>
          <p className="mt-0.5 text-sm text-slate-600">{p.scopeCustomer ?? 'Company-wide'} · {label(p.scoreCategory)} · owner {p.ownerName ?? 'nobody'}{p.department ? ` · ${p.department}` : ''}</p>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2"><p className="text-[10px] font-semibold uppercase text-slate-500">Baseline</p><p className="text-xl font-bold tabular-nums">{p.baselineValue ?? '-'}</p></div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2"><p className="text-[10px] font-semibold uppercase text-slate-500">Latest</p><p className="text-xl font-bold tabular-nums">{p.latestKpi?.value ?? '-'}</p></div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2"><p className="text-[10px] font-semibold uppercase text-slate-500">Target</p><p className="text-xl font-bold tabular-nums">{p.targetValue ?? '-'}</p></div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2"><p className="text-[10px] font-semibold uppercase text-slate-500">Tasks done</p><p className="text-xl font-bold tabular-nums">{pct !== null ? `${pct}%` : '-'}</p></div>
        </div>
      </div>
      <Msg m={msg} />
      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct ?? 0}%` }} /></div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className={cx(box, 'lg:col-span-2')}>
          <h2 className="text-sm font-bold text-slate-900">Project definition</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Text className="lg:col-span-2" label="Name" value={f.name} onChange={set('name')} />
            <Select label="Status" value={f.status} onChange={set('status')} options={PROJECT_STATUSES.map((s) => [s, PROJECT_STATUS_LABELS[s]])} />
            <Text label="Customer scope" value={f.scopeCustomer} onChange={set('scopeCustomer')} placeholder="Blank for company-wide" />
            <DeptInput value={f.department} onChange={set('department')} departments={departments} />
            <Select label="Score category" value={f.scoreCategory} onChange={set('scoreCategory')} blank="None" options={SCORE_CATEGORIES.map((c) => [c, label(c)])} />
            <Text label="KPI being improved" value={f.kpi} onChange={set('kpi')} />
            <Text label="Baseline value" type="number" value={f.baselineValue} onChange={set('baselineValue')} />
            <Text label="Baseline period" value={f.baselinePeriod} onChange={set('baselinePeriod')} hint="Keep the original period; a 36-month average is not a one-month result." />
            <Text label="Target value" type="number" value={f.targetValue} onChange={set('targetValue')} />
            <PersonSelect label="Owner" value={f.ownerKey} people={people} onChange={(k, n) => setF((s) => ({ ...s, ownerKey: k, ownerName: n }))} />
            <Text label="Start" type="date" value={f.startDate} onChange={set('startDate')} />
            <Text label="Target date" type="date" value={f.targetDate} onChange={set('targetDate')} />
            <Text label="Next management review" type="date" value={f.reviewDate} onChange={set('reviewDate')} hint="Shows in the action queue when due." />
            <Area className="sm:col-span-2 lg:col-span-3" label="Root problem" value={f.rootProblem} onChange={set('rootProblem')} rows={3} />
            <Area className="sm:col-span-2 lg:col-span-3" label="Action plan" value={f.actionPlan} onChange={set('actionPlan')} rows={4} />
            <Area className="sm:col-span-2 lg:col-span-3" label="Verification method" value={f.verificationMethod} onChange={set('verificationMethod')} rows={2} />
            <Area className="sm:col-span-2" label="Management notes" value={f.managementNotes} onChange={set('managementNotes')} rows={2} />
            <Area label="Blockers (needs leadership)" value={f.blockers} onChange={set('blockers')} rows={2} hint="Appears in the weekly report under leadership support." />
            <Text className="sm:col-span-2 lg:col-span-3" label="Note for the history (optional)" value={f.note} onChange={set('note')} />
          </div>
          <div className="mt-3"><button className={btnPrimary} disabled={pending || !f.name.trim()} onClick={save}>{pending ? 'Saving…' : 'Save'}</button></div>
        </section>

        <div className="space-y-4">
          <section className={box}>
            <h2 className="text-sm font-bold text-slate-900">KPI readings <span className="font-normal text-slate-400">({kpis.length})</span></h2>
            <p className="mt-0.5 text-[11px] text-slate-500">Typed in from ServiceChannel with the date, the period, and where it was read. Never computed from work orders.</p>
            {series.length >= 2 && <Spark values={series.map((k) => k.value ?? 0)} />}
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs">
              {kpis.map((k) => <li key={k.id} className="flex items-start justify-between gap-2 rounded-md bg-slate-50 px-2 py-1"><span><span className="font-semibold tabular-nums text-slate-900">{k.value}</span> <span className="text-slate-700">{k.label}</span> <span className="text-slate-500">· {k.kind} · {fmtDate(k.snapshotDate)}{k.periodLabel ? ` · ${k.periodLabel}` : ''}</span><span className="block text-slate-400">{k.source}</span></span><button className="text-rose-600" disabled={pending} onClick={() => { if (window.confirm('Remove this reading?')) run(() => deleteProjectKpiAction({ id: k.id, projectId: p.id }), 'Reading removed.') }}>×</button></li>)}
              {!kpis.length && <li className="text-slate-400">No readings yet.</li>}
            </ul>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <select className={input} value={kpi.kind} onChange={(e) => setKpi({ ...kpi, kind: e.target.value })}><option value="progress">Progress</option><option value="baseline">Baseline</option><option value="result">Result</option></select>
              <input className={input} placeholder="KPI label" value={kpi.label} onChange={(e) => setKpi({ ...kpi, label: e.target.value })} />
              <input className={input} type="number" step="0.01" placeholder="Value" value={kpi.value} onChange={(e) => setKpi({ ...kpi, value: e.target.value })} />
              <input className={input} type="date" value={kpi.snapshotDate} onChange={(e) => setKpi({ ...kpi, snapshotDate: e.target.value })} />
              <input className={cx(input, 'col-span-2')} placeholder="Period (e.g. October 2026)" value={kpi.periodLabel} onChange={(e) => setKpi({ ...kpi, periodLabel: e.target.value })} />
              <input className={cx(input, 'col-span-2')} placeholder="Read from (which ServiceChannel view)" value={kpi.source} onChange={(e) => setKpi({ ...kpi, source: e.target.value })} />
              <button className={cx(btnSmall, 'col-span-2')} disabled={pending || !kpi.label.trim() || kpi.value === '' || !kpi.source.trim()} onClick={() => run(() => addProjectKpiAction({ projectId: p.id, ...kpi }).then((r) => { if (r.ok) setKpi({ ...kpi, value: '', periodLabel: '', note: '' }); return r }), 'Reading recorded.')}>Record reading</button>
            </div>
          </section>

          <section className={box}>
            <h2 className="text-sm font-bold text-slate-900">Milestones <span className="font-normal text-slate-400">({p.milestonesDone}/{p.milestonesTotal})</span></h2>
            <ul className="mt-2 space-y-1 text-sm">
              {milestones.map((m) => <li key={m.id} className="flex items-center gap-2"><input type="checkbox" checked={!!m.completedAt} disabled={pending} onChange={(e) => run(() => saveMilestoneAction({ id: m.id, projectId: p.id, title: m.title, dueDate: m.dueDate, note: m.note, done: e.target.checked }), e.target.checked ? 'Milestone completed.' : 'Milestone reopened.')} /><span className={cx('flex-1', m.completedAt && 'text-slate-400 line-through')}>{m.title}</span><span className={cx('text-xs', m.dueDate && m.dueDate < today && !m.completedAt ? 'font-semibold text-rose-700' : 'text-slate-500')}>{m.dueDate ? fmtDate(m.dueDate) : ''}</span><button className="text-xs text-rose-600" disabled={pending} onClick={() => run(() => deleteMilestoneAction({ id: m.id, projectId: p.id }), 'Milestone removed.')}>×</button></li>)}
              {!milestones.length && <li className="text-xs text-slate-400">No milestones yet.</li>}
            </ul>
            <div className="mt-2 flex gap-2"><input className={cx(input, 'flex-1')} placeholder="Milestone" value={ms.title} onChange={(e) => setMs({ ...ms, title: e.target.value })} /><input className={cx(input, 'w-36')} type="date" value={ms.dueDate} onChange={(e) => setMs({ ...ms, dueDate: e.target.value })} /><button className={btnSmall} disabled={pending || !ms.title.trim()} onClick={() => run(() => saveMilestoneAction({ projectId: p.id, title: ms.title, dueDate: ms.dueDate || null }).then((r) => { if (r.ok) setMs({ title: '', dueDate: '' }); return r }), 'Milestone added.')}>Add</button></div>
          </section>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={box}><TaskList tasks={tasks} people={people} departments={departments} today={today} link={{ type: 'project', id: p.id }} title="Corrective actions and tasks" defaults={{ kind: 'corrective_action', ownerKey: p.ownerKey ?? undefined, ownerName: p.ownerName ?? undefined, department: p.department ?? undefined }} /></section>
        <section className={box}>
          <h2 className="text-sm font-bold text-slate-900">Linked work orders <span className="font-normal text-slate-400">({links.length})</span>{investigations.length > 0 && <span className="ml-2 font-normal text-slate-500">· {investigations.length} investigation(s)</span>}</h2>
          <ul className="mt-2 max-h-56 space-y-1 overflow-auto text-sm">
            {links.map((l) => <li key={l.id} className="flex items-center gap-2"><Link className="font-mono text-xs font-semibold text-indigo-700 hover:underline" href={`/app/servicechannel/work-orders/${l.workOrderId}`}>{l.trackingNumber}</Link><span className="min-w-0 flex-1 truncate text-xs text-slate-600">{l.customerName ?? ''} {l.storeLabel ?? ''} · {l.status ?? ''}{l.statusExt ? ` / ${l.statusExt}` : ''}</span><button className="text-xs text-rose-600" disabled={pending} onClick={() => run(() => unlinkWorkOrderFromRecordAction({ type: 'project', id: p.id, linkId: l.id }), 'Unlinked.')}>×</button></li>)}
            {investigations.map((i) => <li key={i.id} className="text-xs"><Link className="font-semibold text-indigo-700 hover:underline" href={`/app/servicechannel/rca/${i.id}`}>RCA: {i.title}</Link> <span className="text-slate-500">· {i.status}</span></li>)}
            {!links.length && !investigations.length && <li className="text-xs text-slate-400">Nothing linked yet. Paste tracking numbers below.</li>}
          </ul>
          <div className="mt-2 flex gap-2"><input className={cx(input, 'flex-1')} placeholder="Tracking numbers, separated by commas or spaces" value={tn} onChange={(e) => setTn(e.target.value)} /><button className={btnSmall} disabled={pending || !tn.trim()} onClick={() => run(() => linkWorkOrdersToRecordAction({ type: 'project', id: p.id, trackingNumbers: tn.split(/[\s,;]+/) }).then((r) => { if (r.ok) setTn(''); return r.ok && 'missing' in r && r.missing.length ? { ok: true, error: `Not found: ${r.missing.join(', ')}` } : r }), 'Linked.')}>Link</button></div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={box}>
          <h2 className="text-sm font-bold text-slate-900">Progress updates <span className="font-normal text-slate-400">({updates.length})</span></h2>
          <div className="mt-2 flex gap-2"><textarea className={cx(input, 'flex-1')} rows={2} placeholder="What moved, what did not, what is next" value={upd} onChange={(e) => setUpd(e.target.value)} /><button className={btnSmall} disabled={pending || !upd.trim()} onClick={() => run(() => addProjectUpdateAction({ projectId: p.id, body: upd }).then((r) => { if (r.ok) setUpd(''); return r }), 'Update posted.')}>Post</button></div>
          <ul className="mt-2 max-h-72 space-y-2 overflow-auto text-sm">{updates.map((u) => <li key={u.id} className="rounded-md bg-slate-50 px-3 py-2"><p className="whitespace-pre-wrap text-slate-800">{u.body}</p><p className="mt-0.5 text-[11px] text-slate-400">{u.authorName} · {fmtWhen(u.createdAt)}</p></li>)}{!updates.length && <li className="text-xs text-slate-400">No updates yet.</li>}</ul>
        </section>
        <Timeline events={events} />
      </div>
    </div>
  )
}

function Spark({ values }: { values: number[] }) {
  const w = 240, h = 36
  const min = Math.min(...values), max = Math.max(...values)
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * (h - 6) - 3}`).join(' ')
  return <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 h-9 w-full text-indigo-500" aria-label="KPI trend"><polyline fill="none" stroke="currentColor" strokeWidth="2" points={pts} /></svg>
}
