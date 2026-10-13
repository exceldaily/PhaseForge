'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Person, TemplateView, WorkOrderView } from '@/lib/servicechannel/server'
import type { TaskFull } from '@/lib/servicechannel/records'
import type { ActionItem, Section } from '@/lib/servicechannel/actionCenter'
import type { Thresholds } from '@/lib/servicechannel/types'
import { INTERNAL_STATUS_LABELS } from '@/lib/servicechannel/types'
import { cx, fmtDate } from '@/components/servicechannel/ui'
import { QuickEditor } from '@/components/servicechannel/QuickEditor'
import { TaskEditor } from '@/components/servicechannel/Tasks'
import { btnSmall, input } from '@/components/servicechannel/fields'
import { acceptHandoffAction } from '../actions'
import { updateTaskFullAction } from '../recordActions'

interface Props {
  wos: WorkOrderView[]; tasks: TaskFull[]; sections: { needsToday: Section[]; upcoming: Section[]; waiting: Section[] }; counts: Record<string, number>
  people: Person[]; templates: TemplateView[]; departments: string[]; today: string; initialOpen: string | null; initialDept: string | null; initialOwner: string | null; thresholds: Thresholds
}
type GroupKind = 'today' | 'upcoming' | 'waiting'
const TODAY_KEYS = ['overdue', 'complaints', 'escalated', 'unack', 'unassigned', 'due_today', 'blocked', 'verify']
const KIND_LABEL: Record<ActionItem['kind'], string> = { work_order: 'Work order', task: 'Responsibility', recovery: 'Customer recovery', project: 'Project' }

export function ActionCenterClient({ wos, tasks, sections, counts, people, templates, departments, today, initialOpen, initialDept, initialOwner, thresholds }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const woById = useMemo(() => new Map(wos.map((w) => [w.id, w])), [wos])
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const [editingWo, setEditingWo] = useState<{ id: string; focus?: ActionItem['focus'] } | null>(null)
  const [editingTask, setEditingTask] = useState<TaskFull | 'new' | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set(initialOpen ? [initialOpen] : TODAY_KEYS))
  const [filter, setFilter] = useState({ dept: initialDept ?? '', owner: initialOwner ?? '', q: '' })
  const [msg, setMsg] = useState<string | null>(null)
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { const r = await fn(); setMsg(r.ok ? ok : (r.error ?? 'Something went wrong.')); if (r.ok) router.refresh() })
  const owners = useMemo(() => [...new Set([...sections.needsToday, ...sections.upcoming, ...sections.waiting].flatMap((s) => s.items.map((i) => i.ownerName)).filter((x): x is string => !!x))].sort(), [sections])
  const depts = useMemo(() => [...new Set([...departments, ...[...sections.needsToday, ...sections.upcoming, ...sections.waiting].flatMap((s) => s.items.map((i) => i.department)).filter((x): x is string => !!x)])].sort(), [sections, departments])
  const keep = (i: ActionItem) => (!filter.dept || (filter.dept === '__none' ? !i.department : i.department === filter.dept)) && (!filter.owner || (filter.owner === '__none' ? !i.ownerName : i.ownerName === filter.owner))
    && (!filter.q.trim() || `${i.title} ${i.subtitle} ${i.reason} ${i.nextAction ?? ''}`.toLowerCase().includes(filter.q.trim().toLowerCase()))
  const filt = (list: Section[]) => list.map((s) => ({ ...s, items: s.items.filter(keep) }))
  const today_ = filt(sections.needsToday), upcoming = filt(sections.upcoming), waiting = filt(sections.waiting)
  const total = (s: Section[]) => s.reduce((n, x) => n + x.items.length, 0)
  const editWo = editingWo ? woById.get(editingWo.id) : null

  const row = (it: ActionItem, group: GroupKind) => {
    const overdue = !!it.due && it.due < today && group === 'today'
    const t = it.taskId ? taskById.get(it.taskId) : null
    const w = it.woId ? woById.get(it.woId) : null
    return (
      <li key={it.key} className={cx('grid gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm md:grid-cols-[150px_minmax(0,1.5fr)_minmax(0,1.1fr)_100px_60px_auto]', overdue ? 'border-rose-200 bg-rose-50/40' : it.escalated ? 'border-rose-300 bg-white' : 'border-slate-200 bg-white')}>
        <div className="min-w-0">
          <Link href={it.href} className={cx('block truncate text-xs font-bold text-indigo-700 hover:underline', it.kind === 'work_order' && 'font-mono')}>{it.title}</Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px]"><span className="rounded bg-slate-100 px-1 font-semibold uppercase text-slate-500">{KIND_LABEL[it.kind]}</span><span className="text-slate-500">{INTERNAL_STATUS_LABELS[it.status as keyof typeof INTERNAL_STATUS_LABELS] ?? it.status.replace(/_/g, ' ')}</span></p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-slate-700" title={it.subtitle}>{it.subtitle}</p>
          <p className="truncate text-xs font-medium text-slate-800">{it.reason}</p>
        </div>
        <div className="min-w-0 text-xs">
          <p className="truncate text-slate-800"><span className="text-slate-400">Owner </span>{it.ownerName ?? <span className="text-rose-700">nobody</span>}{it.department ? <span className="text-slate-500"> · {it.department}</span> : null}</p>
          <p className="truncate text-slate-700" title={it.nextAction ?? ''}><span className="text-slate-400">Next </span>{it.nextAction ?? <span className="text-slate-400">not set</span>}</p>
        </div>
        <div className={cx('text-xs', overdue ? 'font-semibold text-rose-700' : 'text-slate-600')}>{it.due ? fmtDate(it.due) : '-'}</div>
        <div className="text-xs text-slate-500" title="Days since the last internal activity">{it.daysWaiting}d</div>
        <div className="flex flex-wrap items-center gap-1">
          {t && <button className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white" onClick={() => setEditingTask(t)}>Edit</button>}
          {!t && w && <button className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white" onClick={() => setEditingWo({ id: w.id, focus: it.focus })}>Edit</button>}
          {!t && !w && <Link href={it.href} className={btnSmall}>Open</Link>}
          {w && !t && w.case.ownerProfileId && !w.case.handoffAcceptedAt && !w.case.externalAckAt && people.find((p) => p.id === w.case.ownerProfileId)?.hasLogin && <button className={btnSmall} disabled={pending} onClick={() => act(() => acceptHandoffAction(w.id), 'Accepted.')}>Accept</button>}
          {t && t.status !== 'pending_verification' && <button className={btnSmall} disabled={pending} onClick={() => act(() => updateTaskFullAction({ taskId: t.id, patch: { status: 'pending_verification' } }), 'Marked done, awaiting verification.')}>Done</button>}
        </div>
      </li>
    )
  }
  const group = (title: string, list: Section[], kind: GroupKind, tone: string) => (
    <section>
      <h2 className={cx('mb-2 flex items-baseline gap-2 text-sm font-bold', tone)}>{title}<span className="text-xs font-medium text-slate-500">{total(list)} item(s)</span></h2>
      <div className="space-y-2">
        {list.map((s) => (
          <div key={s.key} className="rounded-xl border border-slate-200 bg-slate-50/60">
            <button className="flex w-full items-center justify-between px-3 py-2 text-left" onClick={() => toggle(s.key)}>
              <span className="text-sm font-semibold text-slate-800">{s.label}</span>
              <span className={cx('rounded-full px-2 py-0.5 text-xs font-bold', s.items.length ? (kind === 'today' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-700') : 'bg-slate-100 text-slate-400')}>{s.items.length}</span>
            </button>
            {open.has(s.key) && s.items.length > 0 && <ul className="space-y-1.5 px-3 pb-3">{s.items.map((it) => row(it, kind))}</ul>}
          </div>
        ))}
      </div>
    </section>
  )

  return (
    <div className="mx-auto max-w-none space-y-5 p-3 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">My Action Queue</h1>
          <p className="mt-0.5 text-sm text-slate-500">Responsibilities people created or recorded, plus what the export proves. An imported work order is not a task until someone makes it one. Unacknowledged after {thresholds.unackDays} day(s), blocked after {thresholds.staleDays} without an update.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white" onClick={() => setEditingTask('new')}>New responsibility</button>
          <button className="text-xs text-indigo-700 underline" onClick={() => setOpen(new Set([...sections.needsToday, ...sections.upcoming, ...sections.waiting].map((s) => s.key)))}>Expand all</button>
          <button className="text-xs text-slate-500 underline" onClick={() => setOpen(new Set())}>Collapse all</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input className={cx(input, 'w-64')} placeholder="Search the queue" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
        <select className={cx(input, 'w-auto')} value={filter.dept} onChange={(e) => setFilter({ ...filter, dept: e.target.value })}><option value="">Every department</option><option value="__none">No department</option>{depts.map((d) => <option key={d}>{d}</option>)}</select>
        <select className={cx(input, 'w-auto')} value={filter.owner} onChange={(e) => setFilter({ ...filter, owner: e.target.value })}><option value="">Every owner</option><option value="__none">No owner</option>{owners.map((o) => <option key={o}>{o}</option>)}</select>
        {(filter.dept || filter.owner || filter.q) && <button className="text-xs text-slate-500 underline" onClick={() => setFilter({ dept: '', owner: '', q: '' })}>Clear filters</button>}
      </div>
      {msg && <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm text-slate-800">{msg}</div>}
      {counts.needsToday === 0 && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Nothing needs action today. Check Waiting on others and Upcoming below.</div>}
      {group('Needs action today', today_, 'today', 'text-rose-800')}
      {group('Waiting on others', waiting, 'waiting', 'text-slate-900')}
      {group('Upcoming', upcoming, 'upcoming', 'text-slate-900')}
      {editWo && <QuickEditor wo={editWo} people={people} templates={templates} departments={departments} today={today} focus={editingWo?.focus} onClose={() => setEditingWo(null)} onSaved={() => { setEditingWo(null); setMsg('Saved.'); router.refresh() }} />}
      {editingTask && <TaskEditor task={editingTask === 'new' ? null : editingTask} people={people} departments={departments} today={today} onClose={() => setEditingTask(null)} onSaved={() => { setEditingTask(null); setMsg('Saved.'); router.refresh() }} />}
    </div>
  )
}
