'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Person } from '@/lib/servicechannel/server'
import type { ProjectView } from '@/lib/servicechannel/records'
import { MEASURES, PROJECT_STATUSES, PROJECT_STATUS_LABELS, SCORE_CATEGORIES } from '@/lib/servicechannel/types'
import { cx, fmtDate } from '@/components/servicechannel/ui'
import { Area, Chip, DeptInput, Msg, PersonSelect, STATUS_TONE, Select, Text, box, btn, btnPrimary } from '@/components/servicechannel/fields'
import { createProjectAction, createStarterProjectsAction } from '../recordActions'

interface Props { projects: ProjectView[]; people: Person[]; departments: string[]; today: string }
const label = (k: string | null) => MEASURES.find((m) => m.key === k)?.label ?? k ?? '-'

export function ProjectsClient({ projects, people, departments, today }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [show, setShow] = useState(false)
  const [showClosed, setShowClosed] = useState(false)
  const [f, setF] = useState({ name: '', scopeCustomer: '', department: '', scoreCategory: 'overall', kpi: '', baselineValue: '', baselinePeriod: '', targetValue: '', ownerKey: '', ownerName: null as string | null, startDate: today, targetDate: '', reviewDate: '', rootProblem: '', actionPlan: '', verificationMethod: '' })
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { const r = await fn(); setMsg({ ok: r.ok, text: r.ok ? ok : (r.error ?? 'Something went wrong.') }); if (r.ok) router.refresh() })
  const create = () => start(async () => {
    const r = await createProjectAction({ ...f, ownerKey: f.ownerKey || null, baselineValue: f.baselineValue || null, targetValue: f.targetValue || null, targetDate: f.targetDate || null, reviewDate: f.reviewDate || null })
    setMsg({ ok: r.ok, text: r.ok ? 'Project created.' : (r.error ?? 'Something went wrong.') })
    if (r.ok && 'id' in r) router.push(`/app/servicechannel/projects/${r.id}`)
  })
  const rows = projects.filter((p) => showClosed || (p.status !== 'completed' && p.status !== 'cancelled'))

  return (
    <div className="mx-auto max-w-none space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Improvement Projects</h1>
          <p className="mt-0.5 text-sm text-slate-500">Each project names the problem, the KPI it moves, the baseline as recorded, the target, the owner, and the corrective actions. Progress is the share of tasks verified complete; the KPI only moves when a new reading is typed in from ServiceChannel.</p>
        </div>
        <div className="flex gap-2">
          {!projects.length && <button className={btn} disabled={pending} onClick={() => act(() => createStarterProjectsAction(), 'Four starter projects created from the October 13 review.')}>Create the four starter projects</button>}
          <button className={btnPrimary} onClick={() => setShow(!show)}>{show ? 'Close form' : 'New project'}</button>
        </div>
      </div>
      <Msg m={msg} />
      {!projects.length && (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">Starter projects from the October 13, 2026 review</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
            <li><strong>A. Cumberland Farms Quality Recovery</strong>: Quality 56 as displayed; first task is to find which Quality KPI drives it.</li>
            <li><strong>B. CubeSmart Maintenance Compliance</strong>: Maintenance 43; check-in 36% and schedule confirmation 49%, both over 36 complete months through September 2026 (kept as the original period).</li>
            <li><strong>C. Speed Improvement</strong>: Speed 70, company-wide.</li>
            <li><strong>D. Repeat Repair Reduction</strong>: recall rate 9% in September 2026 (12 recall orders, 10 ALDI), from the October 10 review.</li>
          </ul>
          <p className="mt-1 text-xs text-slate-500">Each gets its baseline recorded with the source, a review date two weeks out, and the goal date of October 13, 2027. Owners and tasks are yours to add.</p>
        </section>
      )}

      {show && (
        <section className={cx(box, 'border-indigo-200')}>
          <h2 className="text-sm font-bold text-slate-900">New project</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Text className="lg:col-span-2" label="Name" value={f.name} onChange={set('name')} />
            <Text label="Customer scope" value={f.scopeCustomer} onChange={set('scopeCustomer')} placeholder="Blank for company-wide" />
            <DeptInput value={f.department} onChange={set('department')} departments={departments} />
            <Select label="Score category" value={f.scoreCategory} onChange={set('scoreCategory')} options={SCORE_CATEGORIES.map((c) => [c, label(c)])} />
            <Text label="KPI being improved" value={f.kpi} onChange={set('kpi')} placeholder="e.g. CubeSmart check-in compliance" />
            <Text label="Baseline value" type="number" value={f.baselineValue} onChange={set('baselineValue')} />
            <Text label="Baseline period" value={f.baselinePeriod} onChange={set('baselinePeriod')} placeholder="As displayed Oct 13 2026, or 36 months through Sep 2026" />
            <Text label="Target value" type="number" value={f.targetValue} onChange={set('targetValue')} />
            <PersonSelect label="Owner" value={f.ownerKey} people={people} onChange={(k, n) => setF((s) => ({ ...s, ownerKey: k, ownerName: n }))} />
            <Text label="Start" type="date" value={f.startDate} onChange={set('startDate')} />
            <Text label="Target date" type="date" value={f.targetDate} onChange={set('targetDate')} />
            <Text label="Next management review" type="date" value={f.reviewDate} onChange={set('reviewDate')} />
            <Area className="sm:col-span-2" label="Root problem" value={f.rootProblem} onChange={set('rootProblem')} rows={3} />
            <Area className="sm:col-span-2" label="Action plan" value={f.actionPlan} onChange={set('actionPlan')} rows={3} />
            <Area className="sm:col-span-2 lg:col-span-4" label="Verification method" value={f.verificationMethod} onChange={set('verificationMethod')} rows={2} placeholder="Which ServiceChannel reading, taken how often, proves it worked" />
          </div>
          <div className="mt-3 flex gap-2"><button className={btnPrimary} disabled={pending || !f.name.trim()} onClick={create}>Create</button><button className={btn} onClick={() => setShow(false)}>Cancel</button></div>
        </section>
      )}

      <div className="flex items-center gap-3 text-xs text-slate-600"><label className="flex items-center gap-1"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />Show completed and cancelled</label><span>{rows.length} project(s)</span></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((p) => {
          const pct = p.tasksTotal ? Math.round((p.tasksDone / p.tasksTotal) * 100) : null
          const lateReview = p.reviewDate && p.reviewDate < today && p.status !== 'completed' && p.status !== 'cancelled'
          return (
            <Link key={p.id} href={`/app/servicechannel/projects/${p.id}`} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-300">
              <div className="flex items-start justify-between gap-2"><p className="font-semibold text-slate-900">{p.name}</p><Chip tone={STATUS_TONE[p.status]}>{PROJECT_STATUS_LABELS[p.status]}</Chip></div>
              <p className="mt-0.5 text-xs text-slate-500">{p.scopeCustomer ?? 'Company-wide'} · {label(p.scoreCategory)}{p.department ? ` · ${p.department}` : ''} · {p.ownerName ?? <span className="text-rose-700">no owner</span>}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] font-semibold uppercase text-slate-500">Baseline</p><p className="text-lg font-bold tabular-nums text-slate-900">{p.baselineValue ?? '-'}</p></div>
                <div className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] font-semibold uppercase text-slate-500">Latest</p><p className="text-lg font-bold tabular-nums text-slate-900">{p.latestKpi?.value ?? <span className="text-slate-300">-</span>}</p>{p.latestKpi && <p className="text-[10px] text-slate-400">{fmtDate(p.latestKpi.snapshotDate)}</p>}</div>
                <div className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] font-semibold uppercase text-slate-500">Target</p><p className="text-lg font-bold tabular-nums text-slate-900">{p.targetValue ?? '-'}</p></div>
              </div>
              <p className="mt-2 truncate text-xs text-slate-600" title={p.kpi ?? ''}>{p.kpi ?? 'KPI not named'}{p.baselinePeriod ? <span className="text-slate-400"> · {p.baselinePeriod}</span> : null}</p>
              <div className="mt-2 flex items-center justify-between text-xs"><span className="text-slate-600">{pct !== null ? `${pct}% of ${p.tasksTotal} task(s) verified` : 'No tasks yet'}</span><span className="text-slate-500">{p.milestonesDone}/{p.milestonesTotal} milestones</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct ?? 0}%` }} /></div>
              <p className="mt-2 text-[11px] text-slate-500">{p.tasksOverdue > 0 && <span className="font-semibold text-rose-700">{p.tasksOverdue} overdue · </span>}{p.reviewDate ? <span className={cx(lateReview && 'font-semibold text-rose-700')}>review {fmtDate(p.reviewDate)}</span> : 'no review date'}{p.targetDate ? ` · target ${fmtDate(p.targetDate)}` : ''}</p>
            </Link>
          )
        })}
        {!rows.length && projects.length > 0 && <p className="text-sm text-slate-500">Every project is completed or cancelled.</p>}
      </div>
      <p className="text-[11px] text-slate-400">Statuses: {PROJECT_STATUSES.map((s) => PROJECT_STATUS_LABELS[s]).join(', ')}.</p>
    </div>
  )
}
