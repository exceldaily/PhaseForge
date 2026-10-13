'use client'

// Responsibilities (tasks) anywhere they appear: on a recovery, a project, an
// investigation, the department view, or standalone in the action queue. One
// editor panel for create and edit; one compact list with the in-place
// actions (accept, done, verify, escalate, acknowledge).

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Person } from '@/lib/servicechannel/server'
import type { RecordType, TaskFull } from '@/lib/servicechannel/records'
import { INTERNAL_STATUSES, INTERNAL_STATUS_LABELS, TASK_KINDS, TASK_KIND_LABELS, WAITING_LABELS, WAITING_ON } from '@/lib/servicechannel/types'
import { createTaskAction, escalateAction, recordTaskAckAction, updateTaskFullAction, type TaskPatch } from '@/app/app/servicechannel/recordActions'
import { InternalChip, cx, fmtDate } from './ui'
import { Area, DeptInput, PersonSelect, Select, Text, btn, btnPrimary, btnSmall, input, lbl } from './fields'

type Result = { ok: boolean; error?: string }
export type Link_ = { type: RecordType; id: string } | null

interface EditorProps { task?: TaskFull | null; link?: Link_; people: Person[]; departments: string[]; today: string; defaults?: Partial<TaskPatch>; onClose: () => void; onSaved: () => void }

export function TaskEditor({ task, link, people, departments, defaults, onClose, onSaved }: EditorProps) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [f, setF] = useState({
    title: task?.title ?? defaults?.title ?? '', description: task?.description ?? '', kind: task?.kind ?? defaults?.kind ?? 'follow_up', status: task?.status ?? 'new',
    ownerKey: task?.ownerKey ?? defaults?.ownerKey ?? '', ownerName: task?.ownerName ?? defaults?.ownerName ?? null, department: task?.department ?? defaults?.department ?? '', waitingOn: task?.waitingOn ?? '',
    nextAction: task?.nextAction ?? defaults?.nextAction ?? '', dueDate: task?.dueDate ?? defaults?.dueDate ?? '', blockerReason: task?.blockerReason ?? '', note: '',
  })
  const [esc, setEsc] = useState({ to: task?.escalatedTo ?? '', note: task?.escalationNote ?? '' })
  const [ack, setAck] = useState('')
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))
  const save = () => start(async () => {
    setErr(null)
    const patch: TaskPatch = { title: f.title, description: f.description || null, kind: f.kind, ownerKey: f.ownerKey || null, ownerName: f.ownerName, department: f.department || null, waitingOn: f.waitingOn || null, nextAction: f.nextAction || null, dueDate: f.dueDate || null, blockerReason: f.blockerReason || null }
    if (task && f.status !== task.status) patch.status = f.status
    const r: Result = task ? await updateTaskFullAction({ taskId: task.id, patch, note: f.note }) : await createTaskAction({ ...patch, title: f.title, link: link ?? null })
    if (!r.ok) { setErr(r.error ?? 'Something went wrong.'); return }
    onSaved()
  })
  const escalate = (clear = false) => start(async () => {
    if (!task) return
    const r = await escalateAction({ target: 'task', id: task.id, to: clear ? '' : esc.to, note: esc.note })
    if (!r.ok) { setErr(r.error ?? 'Something went wrong.'); return }
    onSaved()
  })
  const recordAck = () => start(async () => {
    if (!task) return
    const r = await recordTaskAckAction({ taskId: task.id, who: ack })
    if (!r.ok) { setErr(r.error ?? 'Something went wrong.'); return }
    onSaved()
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f])
  const owner = people.find((p) => p.id === f.ownerKey)
  const needsVerifyNote = task && f.status === 'verified_resolved' && !f.note.trim()

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-4 shadow-2xl sm:p-5" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={task ? 'Edit responsibility' : 'New responsibility'}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">{task ? 'Responsibility' : 'New responsibility'}</h2>
            {task?.record && <p className="text-xs text-slate-500">On <Link className="font-semibold text-indigo-700" href={task.record.href}>{task.record.label}</Link></p>}
            {!task && !link && <p className="text-xs text-slate-500">Standalone: not tied to a work order, project, recovery, or investigation.</p>}
          </div>
          <button className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {err && <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800">{err}</p>}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Text className="col-span-2" label="What has to happen" value={f.title} onChange={set('title')} placeholder="One concrete responsibility" />
          <Select label="Kind" value={f.kind} onChange={set('kind')} options={TASK_KINDS.map((k) => [k, TASK_KIND_LABELS[k]])} />
          {task ? <Select label="Status" value={f.status} onChange={set('status')} options={INTERNAL_STATUSES.map((s) => [s, INTERNAL_STATUS_LABELS[s]])} hint={f.status === 'verified_resolved' ? 'Needs a note below saying what was confirmed.' : undefined} /> : <div />}
          <PersonSelect label="Owner" value={f.ownerKey} people={people} onChange={(k, n) => setF((s) => ({ ...s, ownerKey: k, ownerName: n, department: s.department || (people.find((p) => p.id === k)?.department ?? '') }))} />
          <DeptInput value={f.department} onChange={set('department')} departments={departments} />
          <Select label="Waiting on" value={f.waitingOn} onChange={set('waitingOn')} blank="Not waiting" options={WAITING_ON.map((w) => [w, WAITING_LABELS[w].replace('Waiting on ', '')])} />
          <Text label="Due" type="date" value={f.dueDate} onChange={set('dueDate')} />
          <Text className="col-span-2" label="Next step" value={f.nextAction} onChange={set('nextAction')} placeholder="The very next thing to do" />
          <Text className="col-span-2" label="Blocker" value={f.blockerReason} onChange={set('blockerReason')} placeholder="What is holding it, if anything" />
          <Area className="col-span-2" label="Details" value={f.description} onChange={set('description')} rows={2} />
          {task && <Area className="col-span-2" label={needsVerifyNote ? 'Verification note (required)' : 'Note for the history'} value={f.note} onChange={set('note')} rows={2} placeholder={f.status === 'verified_resolved' ? 'What was confirmed, with whom, how' : 'Optional'} />}
        </div>
        {task && f.ownerKey && !task.acceptedAt && !task.externalAckAt && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p>Assignment to {owner?.name ?? task.ownerName} is not acknowledged yet.{owner && !owner.hasLogin ? ' They have no PhaseForge login, so record their acknowledgment here under your name.' : ' If they confirmed outside PhaseForge, record it here.'}</p>
            <div className="mt-2 flex gap-2"><input className={cx(input, 'bg-white')} placeholder="Who acknowledged (name)" value={ack} onChange={(e) => setAck(e.target.value)} /><button className={cx(btnSmall, 'shrink-0 border-amber-300 text-amber-900')} disabled={pending || !ack.trim()} onClick={recordAck}>Record acknowledgment</button></div>
          </div>
        )}
        {task && (
          <div className="mt-3 rounded-lg bg-slate-50 p-3">
            <p className={lbl}>Escalation</p>
            {task.escalatedAt ? <p className="mt-1 text-xs text-slate-700">Escalated to <strong>{task.escalatedTo}</strong> on {fmtDate(task.escalatedAt.slice(0, 10))}{task.escalationNote ? `: ${task.escalationNote}` : ''}</p> : <p className="mt-1 text-xs text-slate-500">Hand this to a manager by name. It stays in the Escalated section until cleared.</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <input className={cx(input, 'w-44 bg-white')} placeholder="Escalate to (name)" value={esc.to} onChange={(e) => setEsc({ ...esc, to: e.target.value })} />
              <input className={cx(input, 'flex-1 bg-white')} placeholder="Why" value={esc.note} onChange={(e) => setEsc({ ...esc, note: e.target.value })} />
              <button className={btnSmall} disabled={pending || !esc.to.trim()} onClick={() => escalate(false)}>{task.escalatedAt ? 'Update' : 'Escalate'}</button>
              {task.escalatedAt && <button className={btnSmall} disabled={pending} onClick={() => escalate(true)}>Clear</button>}
            </div>
          </div>
        )}
        <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
          <button className={btnPrimary} disabled={pending || !f.title.trim() || !!needsVerifyNote} onClick={save}>{pending ? 'Saving…' : task ? 'Save' : 'Create'}</button>
          <button className={btn} onClick={onClose}>Cancel</button>
          <span className="ml-auto text-[11px] text-slate-400">Ctrl+Enter saves · Esc closes</span>
        </div>
      </aside>
    </div>
  )
}

interface ListProps { tasks: TaskFull[]; people: Person[]; departments: string[]; today: string; link?: Link_; showRecord?: boolean; title?: string; defaults?: Partial<TaskPatch>; compact?: boolean }

/** Compact task list with in-place actions and an Add button. Refreshes the page after each write. */
export function TaskList({ tasks, people, departments, today, link, showRecord, title = 'Responsibilities', defaults, compact }: ListProps) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState<TaskFull | 'new' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [vnote, setVnote] = useState<Record<string, string>>({})
  const run = (fn: () => Promise<Result>, ok: string) => start(async () => { const r = await fn(); setMsg(r.ok ? ok : (r.error ?? 'Something went wrong.')); if (r.ok) router.refresh() })
  const open = tasks.filter((t) => t.status !== 'verified_resolved'), done = tasks.filter((t) => t.status === 'verified_resolved')
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900">{title} <span className="font-normal text-slate-400">({open.length} open{done.length ? `, ${done.length} verified` : ''})</span></h2>
        <button className={btnSmall} onClick={() => setEditing('new')}>Add</button>
      </div>
      {msg && <p className="mt-1 text-xs text-slate-600">{msg}</p>}
      <ul className="mt-2 space-y-1.5">
        {[...open, ...(compact ? [] : done)].map((t) => {
          const over = t.status !== 'verified_resolved' && t.dueDate && t.dueDate < today
          return (
            <li key={t.id} className={cx('rounded-lg border px-3 py-2 text-sm', over ? 'border-rose-200 bg-rose-50/40' : t.status === 'verified_resolved' ? 'border-slate-100 bg-slate-50 opacity-70' : 'border-slate-200 bg-white')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2"><button className="text-left font-medium text-slate-900 hover:underline" onClick={() => setEditing(t)}>{t.title}</button><InternalChip status={t.status} />{t.escalatedAt && <span className="rounded bg-rose-600 px-1.5 text-[10px] font-bold text-white">ESCALATED</span>}<span className="text-[11px] text-slate-400">{TASK_KIND_LABELS[t.kind] ?? t.kind}</span></p>
                  <p className="mt-0.5 text-xs text-slate-500">{t.ownerName ?? <span className="text-rose-700">no owner</span>}{t.ownerKey && !t.acceptedAt && !t.externalAckAt ? ' (not acknowledged)' : ''}{t.department ? ` · ${t.department}` : ''}{t.dueDate ? ` · due ${fmtDate(t.dueDate)}` : ''}{over ? ' · OVERDUE' : ''}{t.waitingOn ? ` · ${WAITING_LABELS[t.waitingOn as keyof typeof WAITING_LABELS] ?? t.waitingOn}` : ''}{t.nextAction ? ` · ${t.nextAction}` : ''}</p>
                  {showRecord && t.record && <p className="text-xs"><Link className="text-indigo-700 hover:underline" href={t.record.href}>{t.record.label}</Link></p>}
                </div>
                {t.status !== 'verified_resolved' && (
                  <div className="flex flex-wrap items-center gap-1">
                    {t.ownerKey && !t.acceptedAt && !t.externalAckAt && people.find((p) => p.id === t.ownerKey)?.hasLogin && <button className={btnSmall} disabled={pending} onClick={() => run(() => updateTaskFullAction({ taskId: t.id, patch: { status: 'accepted' } }), 'Accepted.')}>Accept</button>}
                    {t.status !== 'pending_verification' && <button className={btnSmall} disabled={pending} onClick={() => run(() => updateTaskFullAction({ taskId: t.id, patch: { status: 'pending_verification' } }), 'Marked done, awaiting verification.')}>Done</button>}
                    {t.status === 'pending_verification' && <><input className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs" placeholder="What was verified" value={vnote[t.id] ?? ''} onChange={(e) => setVnote({ ...vnote, [t.id]: e.target.value })} /><button className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50" disabled={pending || !(vnote[t.id] ?? '').trim()} onClick={() => run(() => updateTaskFullAction({ taskId: t.id, patch: { status: 'verified_resolved' }, note: vnote[t.id] }), 'Verified.')}>Verify</button></>}
                    <button className={btnSmall} onClick={() => setEditing(t)}>Edit</button>
                  </div>
                )}
              </div>
            </li>
          )
        })}
        {!tasks.length && <li className="text-xs text-slate-400">Nothing yet. Add the first responsibility: who does what, by when.</li>}
      </ul>
      {editing && <TaskEditor task={editing === 'new' ? null : editing} link={link} people={people} departments={departments} today={today} defaults={defaults} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setMsg('Saved.'); router.refresh() }} />}
    </div>
  )
}

export function Timeline({ events, title = 'History' }: { events: { id: string; kind: string; actorName: string | null; body: string | null; createdAt: string }[]; title?: string }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-bold text-slate-900">{title} <span className="font-normal text-slate-400">({events.length})</span></h2>
      <ol className="mt-2 max-h-96 space-y-1.5 overflow-auto text-sm">
        {events.map((e) => <li key={e.id} className="flex gap-2"><span className="w-28 shrink-0 text-[11px] text-slate-400">{new Date(e.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span><span className="min-w-0"><span className="mr-1 rounded bg-slate-100 px-1 text-[10px] font-semibold uppercase text-slate-500">{e.kind.replace(/_/g, ' ')}</span>{e.body}<span className="ml-1 text-xs text-slate-400">{e.actorName}</span></span></li>)}
        {!events.length && <li className="text-xs text-slate-400">Nothing recorded yet.</li>}
      </ol>
    </section>
  )
}
