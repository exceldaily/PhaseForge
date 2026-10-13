'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Person, TemplateView, WorkOrderView } from '@/lib/servicechannel/server'
import { InternalChip, cx, fmtDate } from '@/components/servicechannel/ui'
import { QuickEditor } from '@/components/servicechannel/QuickEditor'
import { acceptHandoffAction, updateTaskAction } from '../actions'

interface Item { id: string; reason: string; due: string | null; daysWaiting: number; taskId?: string }
interface Section { key: string; label: string; items: Item[] }
interface Props {
  wos: WorkOrderView[]; sections: { needsToday: Section[]; upcoming: Section[]; waiting: Section[] }; counts: Record<string, number>
  people: Person[]; templates: TemplateView[]; departments: string[]; today: string
}

export function ActionCenterClient({ wos, sections, counts, people, templates, departments, today }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const byId = useMemo(() => new Map(wos.map((w) => [w.id, w])), [wos])
  const [editing, setEditing] = useState<{ id: string; focus?: 'assign' | 'contact' | 'follow_up' | 'accept' } | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set(['unassigned', 'overdue', 'complaints', 'unack', 'due_today', 'blocked', 'verify']))
  const [msg, setMsg] = useState<string | null>(null)
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { const r = await fn(); setMsg(r.ok ? ok : (r.error ?? 'Something went wrong.')); if (r.ok) router.refresh() })
  const editingWo = editing ? byId.get(editing.id) : null
  const ctx: RowCtx = { byId, today, pending, counts, open, toggle, act, setEditing }

  return (
    <div className="mx-auto max-w-none space-y-5 p-3 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Action Center</h1>
          <p className="mt-0.5 text-sm text-slate-500">What needs attention today, what is coming, and what is waiting on someone else. Built only from the imported data and what has been recorded on cases.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <button className="text-indigo-700 underline" onClick={() => setOpen(new Set([...sections.needsToday, ...sections.upcoming, ...sections.waiting].map((s) => s.key)))}>Expand all</button>
          <button className="text-slate-500 underline" onClick={() => setOpen(new Set())}>Collapse all</button>
        </div>
      </div>
      {msg && <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm text-slate-800">{msg}</div>}
      {counts.needsToday === 0 && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Nothing needs attention today. Check Upcoming and Waiting on others below.</div>}
      <Group title="Needs attention today" list={sections.needsToday} group="today" tone="text-rose-800" ctx={ctx} />
      <Group title="Upcoming" list={sections.upcoming} group="upcoming" tone="text-slate-900" ctx={ctx} />
      <Group title="Waiting on others" list={sections.waiting} group="waiting" tone="text-slate-900" ctx={ctx} />
      {editingWo && <QuickEditor wo={editingWo} people={people} templates={templates} departments={departments} today={today} focus={editing?.focus} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setMsg('Saved.'); router.refresh() }} />}
    </div>
  )
}

interface RowCtx {
  byId: Map<string, WorkOrderView>; today: string; pending: boolean; counts: Record<string, number>; open: Set<string>
  toggle: (k: string) => void; act: (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => void
  setEditing: (v: { id: string; focus?: 'assign' | 'contact' | 'follow_up' | 'accept' } | null) => void
}
type GroupKind = 'today' | 'upcoming' | 'waiting'
const total = (s: Section[]) => s.reduce((n, x) => n + x.items.length, 0)

function Row({ it, group, ctx }: { it: Item; group: GroupKind; ctx: RowCtx }) {
  const w = ctx.byId.get(it.id)
  if (!w) return null
  const c = w.case
  const overdue = it.due && it.due < ctx.today && group === 'today'
  const focus = it.reason.startsWith('No owner') ? 'assign' : it.reason.startsWith('Unsatisfactory') ? 'contact' : it.reason.startsWith('Assigned to') ? 'accept' : 'follow_up'
  return (
    <li className={cx('grid gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm md:grid-cols-[130px_minmax(0,1.4fr)_minmax(0,1.2fr)_110px_70px_auto]', overdue ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200 bg-white')}>
      <div className="min-w-0">
        <Link href={`/app/servicechannel/work-orders/${w.id}`} className="font-mono text-xs font-bold text-indigo-700 hover:underline">{w.trackingNumber}</Link>
        <div className="mt-0.5"><InternalChip status={c.internalStatus} /></div>
      </div>
      <div className="min-w-0">
        <p className="truncate text-slate-900">{w.customerName ?? <span className="text-slate-400">Customer not known</span>} · <span className="text-slate-600">{w.storeNumber ?? '-'}</span></p>
        <p className="truncate text-xs text-slate-500" title={w.problemDescription ?? ''}>{w.problemDescription ?? 'No problem description in the export'}</p>
        <p className="truncate text-xs text-slate-600">{it.reason}</p>
      </div>
      <div className="min-w-0 text-xs">
        <p className="truncate text-slate-800"><span className="text-slate-400">Owner </span>{c.ownerName ?? <span className="text-rose-700">nobody</span>}{c.actionOwnerName && c.actionOwnerName !== c.ownerName ? <span className="text-slate-500"> · next: {c.actionOwnerName}</span> : null}</p>
        <p className="truncate text-slate-700" title={c.nextAction ?? ''}><span className="text-slate-400">Next </span>{c.nextAction ?? <span className="text-slate-400">not set</span>}</p>
      </div>
      <div className={cx('text-xs', overdue ? 'font-semibold text-rose-700' : 'text-slate-600')}>{it.due ? fmtDate(it.due) : '-'}</div>
      <div className="text-xs text-slate-500" title="Days since the last internal activity">{it.daysWaiting}d</div>
      <div className="flex flex-wrap items-center gap-1">
        <button className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white" onClick={() => ctx.setEditing({ id: w.id, focus })}>Edit</button>
        {c.ownerProfileId && !c.handoffAcceptedAt && !c.externalAckAt && <button className="rounded-md border border-slate-300 px-2 py-1 text-xs" disabled={ctx.pending} onClick={() => ctx.act(() => acceptHandoffAction(w.id), 'Accepted.')}>Accept</button>}
        {it.taskId && <button className="rounded-md border border-slate-300 px-2 py-1 text-xs" disabled={ctx.pending} onClick={() => ctx.act(() => updateTaskAction({ taskId: it.taskId!, patch: { status: 'pending_verification' } }), 'Task marked complete, awaiting verification.')}>Done</button>}
      </div>
    </li>
  )
}

function Group({ title, list, group, tone, ctx }: { title: string; list: Section[]; group: GroupKind; tone: string; ctx: RowCtx }) {
  return (
    <section>
      <h2 className={cx('mb-2 flex items-baseline gap-2 text-sm font-bold', tone)}>{title}<span className="text-xs font-medium text-slate-500">{total(list)} item(s){group === 'today' ? `, ${ctx.counts.needsToday} work order(s)` : ''}</span></h2>
      <div className="space-y-2">
        {list.map((s) => (
          <div key={s.key} className="rounded-xl border border-slate-200 bg-slate-50/60">
            <button className="flex w-full items-center justify-between px-3 py-2 text-left" onClick={() => ctx.toggle(s.key)}>
              <span className="text-sm font-semibold text-slate-800">{s.label}</span>
              <span className={cx('rounded-full px-2 py-0.5 text-xs font-bold', s.items.length ? (group === 'today' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-700') : 'bg-slate-100 text-slate-400')}>{s.items.length}</span>
            </button>
            {ctx.open.has(s.key) && s.items.length > 0 && <ul className="space-y-1.5 px-3 pb-3">{s.items.map((it) => <Row key={`${s.key}-${it.id}-${it.taskId ?? ''}`} it={it} group={group} ctx={ctx} />)}</ul>}
          </div>
        ))}
      </div>
    </section>
  )
}
