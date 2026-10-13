'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { EventView, ObservationView, Person, TaskView, WorkOrderView } from '@/lib/servicechannel/server'
import type { NoteEvent } from '@/lib/servicechannel/notes'
import { INTERNAL_STATUSES, INTERNAL_STATUS_LABELS, QUEUES, QUEUE_LABELS, type InternalStatus } from '@/lib/servicechannel/types'
import { InternalChip, ObservationChip, OfficialChip, cx, fmtDate, fmtWhen, scLink } from '@/components/servicechannel/ui'
import { acceptHandoffAction, addNoteAction, addTaskAction, setKalosJobAction, setObservationStateAction, updateCaseAction, updateTaskAction, verifyCaseAction } from '../../actions'

interface Props {
  wo: Omit<WorkOrderView, 'notesRaw'>; tasks: TaskView[]; events: EventView[]; observations: ObservationView[]; notes: NoteEvent[]
  people: Person[]; departments: string[]; jobUrlTemplate: string | null; today: string
}

type Result = { ok: boolean; error?: string }
const EVENT_LABEL: Record<string, string> = {
  imported: 'Imported', import_change: 'Changed in ServiceChannel', not_observed: 'Missing from export', case_update: 'Case updated', handoff_accepted: 'Handoff accepted',
  verified: 'Verified resolved', note: 'Note', customer_contact: 'Customer contact', department_followup: 'Department follow-up', observation_state: 'Observation', kalos_job: 'Kalos job', task_created: 'Task created', task_update: 'Task updated',
}

export function CaseClient({ wo, tasks, events, observations, notes, people, departments, jobUrlTemplate, today }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const c = wo.case
  const [form, setForm] = useState({ internalStatus: c.internalStatus as string, ownerId: c.ownerProfileId ?? '', department: c.department ?? '', nextAction: c.nextAction ?? '', dueDate: c.dueDate ?? '', blockerReason: c.blockerReason ?? '' })
  const [note, setNote] = useState({ body: '', kind: 'note' as 'note' | 'customer_contact' | 'department_followup' })
  const [task, setTask] = useState({ title: '', queue: 'general', ownerId: '', nextAction: '', dueDate: '' })
  const [verifyNote, setVerifyNote] = useState('')
  const [obsNote, setObsNote] = useState('')
  const [job, setJob] = useState(wo.kalosJobNumber ?? '')
  const [tab, setTab] = useState<'timeline' | 'sc' | 'observations'>('timeline')

  const run = (fn: () => Promise<Result>, ok: string) => start(async () => {
    const r = await fn()
    setMsg({ ok: r.ok, text: r.ok ? ok : (r.error ?? 'Something went wrong.') })
    if (r.ok) router.refresh()
  })
  const person = (id: string) => people.find((p) => p.id === id)

  const timeline = useMemo(() => {
    const items: { at: string; kind: string; who: string | null; text: string; tone: 'pf' | 'sc' }[] = events.map((e) => ({ at: e.createdAt, kind: EVENT_LABEL[e.kind] ?? e.kind, who: e.actorName, text: e.body ?? '', tone: 'pf' as const }))
    for (const n of notes) if (n.date) items.push({ at: `${n.date}T00:00:00`, kind: 'ServiceChannel', who: n.actor, text: n.text, tone: 'sc' })
    return items.sort((a, b) => b.at.localeCompare(a.at))
  }, [events, notes])

  const openTasks = tasks.filter((t) => t.status !== 'verified_resolved').length
  const input = 'rounded-md border border-slate-300 px-2 py-1.5 text-sm'
  const box = 'rounded-xl border border-slate-200 bg-white p-4'

  return (
    <div className="mx-auto max-w-none space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/app/servicechannel/work-orders" className="text-xs font-semibold text-indigo-700">← Work orders</Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold text-slate-900"><span className="font-mono">{wo.trackingNumber}</span><OfficialChip status={wo.status} statusExt={wo.statusExt} /><InternalChip status={c.internalStatus} /></h1>
          <p className="mt-0.5 text-sm text-slate-600">{wo.customerName ?? 'Unknown customer'} · {wo.storeLabel ?? 'Unknown store'} · {wo.trade ?? '-'} · {wo.priority ?? '-'}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <a className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-indigo-700 hover:bg-slate-50" target="_blank" rel="noreferrer" href={scLink(wo.trackingNumber)}>Open in ServiceChannel</a>
          {wo.kalosJobNumber && jobUrlTemplate && <a className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-indigo-700 hover:bg-slate-50" target="_blank" rel="noreferrer" href={jobUrlTemplate.replace('{job}', encodeURIComponent(wo.kalosJobNumber))}>Kalos job {wo.kalosJobNumber}</a>}
        </div>
      </div>
      {msg && <div className={cx('rounded-lg border p-3 text-sm', msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900')}>{msg.text}</div>}
      {wo.statusExt === 'UNSATISFACTORY' && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"><strong>Unsatisfactory report.</strong> Contact the reporting manager, compare what they report against the approved scope, and record the outcome as a customer contact below.</div>}
      {(wo.observationState === 'not_in_latest' || wo.observationState === 'needs_verification') && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This work order was not in the latest comparable export. The official status shown is the last one observed ({fmtWhen(wo.lastSeenAt)}). Check ServiceChannel before acting on it.</div>}

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Official record */}
        <section className={box}>
          <h2 className="text-sm font-bold text-slate-900">ServiceChannel record <span className="font-normal text-slate-400">(as last observed {fmtWhen(wo.lastSeenAt)})</span></h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            {([['WO #', wo.woNumber], ['PO #', wo.poNumber], ['Category', wo.category], ['Priority', wo.priority], ['Call date', fmtDate(wo.callDate)], ['Scheduled', fmtDate(wo.scheduledDate)], ['Original ETA', fmtDate(wo.originalEta)], ['Reassigned', wo.reassignDate ? `${fmtDate(wo.reassignDate)} ${wo.reassignTime ?? ''}` : null],
              ['NTE', wo.nte !== null ? `${wo.currency ?? ''} ${wo.nte.toLocaleString()}` : null], ['Technician(s)', wo.technicians.join('; ') || null], ['Assignee', wo.assignee], ['Submitted by', wo.submittedBy], ['Region / district', [wo.region, wo.district].filter(Boolean).join(' / ') || null],
              ['Area', wo.area], ['Equipment', wo.equipment], ['Problem type', wo.problemType], ['Problem code', wo.problemCode], ['Tag ID', wo.tagId], ['Reopened', wo.reopenCount ? `${wo.reopenCount}× (last ${fmtWhen(wo.lastReopenedAt)})` : 'No'], ['Unsatisfactory', wo.unsatCount ? `${wo.unsatCount}× (last ${fmtWhen(wo.lastUnsatAt)})` : 'No']] as [string, string | null][]).map(([k, v]) => (
              <div key={k}><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k}</dt><dd className="text-slate-900">{v ?? <span className="text-slate-400">-</span>}</dd></div>
            ))}
          </dl>
          <div className="mt-3"><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Problem description</dt><dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">{wo.problemDescription ?? '-'}</dd></div>
          {wo.resolution && <div className="mt-3"><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Resolution (from ServiceChannel)</dt><dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">{wo.resolution}</dd></div>}
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Observation</p>
            <p className="mt-1 text-sm"><ObservationChip state={wo.observationState} />{wo.verifiedNote && <span className="ml-2 text-xs text-slate-500">{wo.verifiedNote}</span>}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input className={cx(input, 'min-w-[220px] flex-1')} placeholder="What you checked in ServiceChannel, and when" value={obsNote} onChange={(e) => setObsNote(e.target.value)} />
              <button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50" disabled={pending} onClick={() => run(() => setObservationStateAction({ workOrderId: wo.id, state: 'manually_verified', note: obsNote }), 'Marked as verified in ServiceChannel.')}>Verified in ServiceChannel</button>
              <button className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 disabled:opacity-50" disabled={pending} onClick={() => run(() => setObservationStateAction({ workOrderId: wo.id, state: 'needs_verification', note: obsNote }), 'Flagged for verification.')}>Needs verification</button>
            </div>
            <div className="mt-3 flex gap-2">
              <input className={cx(input, 'w-40')} placeholder="Kalos job number" value={job} onChange={(e) => setJob(e.target.value)} />
              <button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50" disabled={pending || job === (wo.kalosJobNumber ?? '')} onClick={() => run(() => setKalosJobAction({ workOrderId: wo.id, jobNumber: job }), 'Kalos job number saved.')}>Save</button>
            </div>
          </div>
        </section>

        {/* Internal follow-up */}
        <section className={box}>
          <h2 className="text-sm font-bold text-slate-900">PhaseForge follow-up</h2>
          <p className="mt-0.5 text-xs text-slate-500">Separate from the official status. Imports never change this.</p>
          <div className="mt-3 grid gap-2">
            <label className="text-xs font-semibold text-slate-600">Internal status
              <select className={cx(input, 'mt-1 block w-full')} value={form.internalStatus} onChange={(e) => setForm({ ...form, internalStatus: e.target.value })}>
                {INTERNAL_STATUSES.filter((s) => s !== 'verified_resolved').map((s) => <option key={s} value={s}>{INTERNAL_STATUS_LABELS[s]}</option>)}
                {c.internalStatus === 'verified_resolved' && <option value="verified_resolved">Verified resolved</option>}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">Accountable owner
              <select className={cx(input, 'mt-1 block w-full')} value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}><option value="">Nobody yet</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </label>
            {c.ownerProfileId && !c.handoffAcceptedAt && (
              <div className="flex items-center justify-between rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">Handoff to {c.ownerName} not accepted yet<button className="font-semibold underline" disabled={pending} onClick={() => run(() => acceptHandoffAction(wo.id), 'Handoff accepted.')}>Accept responsibility</button></div>
            )}
            {c.handoffAcceptedAt && <p className="text-[11px] text-emerald-700">Accepted {fmtWhen(c.handoffAcceptedAt)}</p>}
            <label className="text-xs font-semibold text-slate-600">Department
              <input className={cx(input, 'mt-1 block w-full')} list="sc-depts" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /><datalist id="sc-depts">{departments.map((d) => <option key={d} value={d} />)}</datalist>
            </label>
            <label className="text-xs font-semibold text-slate-600">Next action<input className={cx(input, 'mt-1 block w-full')} value={form.nextAction} onChange={(e) => setForm({ ...form, nextAction: e.target.value })} placeholder="One concrete step" /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold text-slate-600">Due<input type="date" className={cx(input, 'mt-1 block w-full')} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
              <label className="text-xs font-semibold text-slate-600">Blocker<input className={cx(input, 'mt-1 block w-full')} value={form.blockerReason} onChange={(e) => setForm({ ...form, blockerReason: e.target.value })} placeholder="What is holding it" /></label>
            </div>
            <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={pending} onClick={() => run(() => updateCaseAction({ workOrderId: wo.id, patch: {
              internalStatus: form.internalStatus === 'verified_resolved' ? undefined : form.internalStatus, ownerProfileId: form.ownerId || null, ownerName: person(form.ownerId)?.name ?? null,
              department: form.department, nextAction: form.nextAction, dueDate: form.dueDate || null, blockerReason: form.blockerReason,
            } }), 'Follow-up saved.')}>Save follow-up</button>
            {c.dueDate && c.dueDate < today && c.internalStatus !== 'verified_resolved' && <p className="text-xs font-semibold text-rose-700">Due date passed ({fmtDate(c.dueDate)}).</p>}
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Verify resolved</p>
            <p className="mt-0.5 text-xs text-slate-500">Needs no open tasks ({openTasks} open) and a note on what was confirmed with whom.</p>
            <div className="mt-2 flex gap-2">
              <input className={cx(input, 'flex-1')} placeholder="Confirmed with site contact / portal shows completed / photos" value={verifyNote} onChange={(e) => setVerifyNote(e.target.value)} />
              <button className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" disabled={pending || c.internalStatus === 'verified_resolved'} onClick={() => run(() => verifyCaseAction({ workOrderId: wo.id, note: verifyNote }), 'Verified resolved.')}>Verify</button>
            </div>
            {c.verifiedResolvedAt && <p className="mt-1 text-xs text-emerald-700">Verified {fmtWhen(c.verifiedResolvedAt)}</p>}
          </div>
        </section>

        {/* Tasks */}
        <section className={box}>
          <h2 className="text-sm font-bold text-slate-900">Tasks <span className="font-normal text-slate-400">({openTasks} open)</span></h2>
          <ul className="mt-2 space-y-2">
            {tasks.map((t) => <TaskRow key={t.id} t={t} people={people} today={today} pending={pending} run={run} />)}
            {!tasks.length && <li className="text-xs text-slate-400">No tasks yet.</li>}
          </ul>
          <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
            <input className={input} placeholder="New task" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <select className={input} value={task.queue} onChange={(e) => setTask({ ...task, queue: e.target.value })}>{QUEUES.map((q) => <option key={q} value={q}>{QUEUE_LABELS[q]}</option>)}</select>
              <select className={input} value={task.ownerId} onChange={(e) => setTask({ ...task, ownerId: e.target.value })}><option value="">Owner…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              <input className={input} placeholder="Next action" value={task.nextAction} onChange={(e) => setTask({ ...task, nextAction: e.target.value })} />
              <input type="date" className={input} value={task.dueDate} onChange={(e) => setTask({ ...task, dueDate: e.target.value })} />
            </div>
            <button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50" disabled={pending || !task.title.trim()} onClick={() => run(() => addTaskAction({ workOrderId: wo.id, title: task.title, queue: task.queue, ownerProfileId: task.ownerId || null, ownerName: person(task.ownerId)?.name ?? null, nextAction: task.nextAction, dueDate: task.dueDate }).then((r) => { if (r.ok) setTask({ title: '', queue: 'general', ownerId: '', nextAction: '', dueDate: '' }); return r }), 'Task added.')}>Add task</button>
          </div>
        </section>
      </div>

      {/* Notes and timeline */}
      <section className={box}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">Timeline</h2>
          <div className="flex gap-1">
            {([['timeline', 'Everything'], ['sc', 'ServiceChannel only'], ['observations', `Imports (${observations.length})`]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={cx('rounded-full px-3 py-1 text-xs font-medium', tab === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600')}>{l}</button>
            ))}
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[160px_1fr_auto]">
          <select className={input} value={note.kind} onChange={(e) => setNote({ ...note, kind: e.target.value as typeof note.kind })}><option value="note">Note</option><option value="customer_contact">Customer contact</option><option value="department_followup">Department follow-up</option></select>
          <input className={input} placeholder="What happened, who said it, what was agreed" value={note.body} onChange={(e) => setNote({ ...note, body: e.target.value })} />
          <button className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50" disabled={pending || !note.body.trim()} onClick={() => run(() => addNoteAction({ workOrderId: wo.id, body: note.body, kind: note.kind }).then((r) => { if (r.ok) setNote({ ...note, body: '' }); return r }), 'Saved.')}>Add</button>
        </div>
        {tab !== 'observations' ? (
          <ul className="mt-3 max-h-[520px] space-y-1.5 overflow-auto">
            {timeline.filter((i) => tab === 'timeline' || i.tone === 'sc').map((i, k) => (
              <li key={k} className={cx('rounded-md px-2 py-1.5 text-sm', i.tone === 'pf' ? 'bg-indigo-50/60' : 'bg-slate-50')}>
                <span className="mr-2 text-[11px] text-slate-500">{i.tone === 'sc' ? fmtDate(i.at.slice(0, 10)) : fmtWhen(i.at)}</span>
                <span className={cx('mr-2 rounded px-1.5 text-[10px] font-bold uppercase', i.tone === 'pf' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-700')}>{i.kind}</span>
                <span className="text-slate-800">{i.text}</span>{i.who && <span className="ml-1 text-xs text-slate-500">({i.who})</span>}
              </li>
            ))}
            {!timeline.length && <li className="text-xs text-slate-400">Nothing yet.</li>}
          </ul>
        ) : (
          <ul className="mt-3 max-h-[520px] space-y-1.5 overflow-auto text-sm">
            {observations.map((o) => (
              <li key={o.id} className="rounded-md bg-slate-50 px-2 py-1.5">
                <span className="mr-2 text-[11px] text-slate-500">{fmtWhen(o.observedAt)}</span><span className="mr-2 rounded bg-slate-200 px-1.5 text-[10px] font-bold uppercase text-slate-700">{o.kind}</span>
                <span className="text-slate-800">{o.status ?? '-'}{o.statusExt ? ` / ${o.statusExt}` : ''} · sched {fmtDate(o.scheduledDate)} · ETA {fmtDate(o.originalEta)} · {o.technicians.join('; ') || 'no tech'}</span>
                <span className="ml-2 text-xs text-slate-500">{o.sourceName ?? ''}{o.flags.length ? ` · ${o.flags.join(', ')}` : ''}</span>
                {o.changes.length > 0 && <ul className="ml-4 mt-0.5 list-disc text-xs text-slate-600">{o.changes.map((ch, i) => <li key={i}>{ch.label}: {ch.from ?? 'blank'} → {ch.to ?? 'blank'}</li>)}</ul>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function TaskRow({ t, people, today, pending, run }: { t: TaskView; people: Person[]; today: string; pending: boolean; run: (fn: () => Promise<Result>, ok: string) => void }) {
  const [vnote, setVnote] = useState('')
  const over = t.dueDate && t.dueDate < today && t.status !== 'verified_resolved'
  const set = (patch: Parameters<typeof updateTaskAction>[0]['patch'], note?: string, ok = 'Task updated.') => run(() => updateTaskAction({ taskId: t.id, patch, note }), ok)
  return (
    <li className="rounded-lg border border-slate-200 p-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className="font-medium text-slate-900">{t.title}</span>
        <InternalChip status={t.status as InternalStatus} />
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{QUEUE_LABELS[t.queue as keyof typeof QUEUE_LABELS] ?? t.queue} · {t.ownerName ?? 'no owner'}{t.ownerProfileId && !t.acceptedAt ? ' (unaccepted)' : ''}{t.dueDate ? ` · due ${fmtDate(t.dueDate)}` : ''}{over ? ' · OVERDUE' : ''}{t.nextAction ? ` · ${t.nextAction}` : ''}</p>
      {t.status !== 'verified_resolved' && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <select className="rounded-md border border-slate-300 px-1.5 py-1 text-xs" value={t.ownerProfileId ?? ''} onChange={(e) => set({ ownerProfileId: e.target.value || null, ownerName: people.find((p) => p.id === e.target.value)?.name ?? null })} disabled={pending}><option value="">Owner…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          {t.ownerProfileId && !t.acceptedAt && <button className="rounded-md border border-slate-300 px-2 py-1 text-xs" disabled={pending} onClick={() => set({ status: 'accepted' }, undefined, 'Accepted.')}>Accept</button>}
          {t.status !== 'pending_verification' && <button className="rounded-md border border-slate-300 px-2 py-1 text-xs" disabled={pending} onClick={() => set({ status: 'in_progress' })}>In progress</button>}
          {t.status !== 'pending_verification' && <button className="rounded-md border border-slate-300 px-2 py-1 text-xs" disabled={pending} onClick={() => set({ status: 'blocked' })}>Blocked</button>}
          {t.status !== 'pending_verification' && <button className="rounded-md bg-violet-600 px-2 py-1 text-xs font-semibold text-white" disabled={pending} onClick={() => set({ status: 'pending_verification' }, undefined, 'Marked complete, awaiting verification.')}>Mark complete</button>}
          {t.status === 'pending_verification' && (
            <>
              <input className="min-w-[160px] flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs" placeholder="What was verified" value={vnote} onChange={(e) => setVnote(e.target.value)} />
              <button className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white" disabled={pending} onClick={() => set({ status: 'verified_resolved' }, vnote, 'Task verified.')}>Verify</button>
              <button className="rounded-md border border-slate-300 px-2 py-1 text-xs" disabled={pending} onClick={() => set({ status: 'in_progress' }, 'Sent back', 'Reopened.')}>Not done</button>
            </>
          )}
        </div>
      )}
      {t.verifiedAt && <p className="mt-1 text-[11px] text-emerald-700">Verified {fmtWhen(t.verifiedAt)}</p>}
    </li>
  )
}
