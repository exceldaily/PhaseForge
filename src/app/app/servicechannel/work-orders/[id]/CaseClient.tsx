'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { AttachmentView, EventView, LinkView, ObservationView, Person, RelatedWo, TaskView, TemplateView, WorkOrderView } from '@/lib/servicechannel/server'
import type { NoteEvent } from '@/lib/servicechannel/notes'
import type { Suggestion } from '@/lib/servicechannel/rules'
import { QUEUES, QUEUE_LABELS, type InternalStatus } from '@/lib/servicechannel/types'
import { InternalChip, ObservationChip, OfficialChip, cx, fmtDate, fmtWhen, scLink } from '@/components/servicechannel/ui'
import { QuickEditor } from '@/components/servicechannel/QuickEditor'
import { addNoteAction, addTaskAction, setKalosJobAction, setObservationStateAction, updateTaskAction, verifyCaseAction } from '../../actions'
import { deleteAttachmentAction, linkWorkOrdersAction, resolveConflictAction, setCustomerAction, unlinkWorkOrdersAction, uploadAttachmentAction } from '../../opsActions'

interface Props {
  wo: Omit<WorkOrderView, 'notesRaw'>; tasks: TaskView[]; events: EventView[]; observations: ObservationView[]; notes: NoteEvent[]; suggestions: Suggestion[]
  links: LinkView[]; sameStore: RelatedWo[]; attachments: AttachmentView[]
  people: Person[]; departments: string[]; templates: TemplateView[]; jobUrlTemplate: string | null; today: string
}
type Result = { ok: boolean; error?: string }
const EVENT_LABEL: Record<string, string> = {
  imported: 'Imported', import_change: 'Changed in ServiceChannel', not_observed: 'Missing from export', case_update: 'Case updated', handoff_accepted: 'Handoff accepted', verified: 'Verified resolved',
  note: 'Note', customer_contact: 'Customer contact', department_followup: 'Department follow-up', observation_state: 'Observation', kalos_job: 'Kalos job', task_created: 'Task created', task_update: 'Task updated', linked: 'Related work order', attachment: 'Attachment',
}
const SOURCE_LABEL: Record<string, string> = { import: 'Imported from ServiceChannel', coverage: 'From the import filters', directory: 'From the store directory', location: 'Matched to a PhaseForge location', manual: 'Manually entered' }

export function CaseClient({ wo, tasks, events, observations, notes, suggestions, links, sameStore, attachments, people, departments, templates, jobUrlTemplate, today }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [editor, setEditor] = useState<{ focus?: Suggestion['action'] } | null>(null)
  const c = wo.case
  const [note, setNote] = useState({ body: '', kind: 'note' as 'note' | 'customer_contact' | 'department_followup' })
  const [task, setTask] = useState({ title: '', queue: 'general', ownerId: '', nextAction: '', dueDate: '' })
  const [verifyNote, setVerifyNote] = useState('')
  const [obsNote, setObsNote] = useState('')
  const [job, setJob] = useState(wo.kalosJobNumber ?? '')
  const [customer, setCustomer] = useState(wo.customerName ?? '')
  const [tab, setTab] = useState<'all' | 'pf' | 'sc' | 'imports'>('all')
  const [linkNote, setLinkNote] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)

  const run = (fn: () => Promise<Result>, ok: string) => start(async () => { const r = await fn(); setMsg({ ok: r.ok, text: r.ok ? ok : (r.error ?? 'Something went wrong.') }); if (r.ok) router.refresh() })
  const person = (id: string) => people.find((p) => p.id === id)
  const timeline = useMemo(() => {
    const items: { at: string; kind: string; who: string | null; text: string; tone: 'pf' | 'sc' }[] = events.map((e) => ({ at: e.createdAt, kind: EVENT_LABEL[e.kind] ?? e.kind, who: e.actorName, text: e.body ?? '', tone: 'pf' as const }))
    for (const n of notes) if (n.date) items.push({ at: `${n.date}T00:00:00`, kind: 'ServiceChannel', who: n.actor, text: n.text, tone: 'sc' })
    return items.sort((a, b) => b.at.localeCompare(a.at))
  }, [events, notes])
  const contacts = events.filter((e) => e.kind === 'customer_contact')
  const openTasks = tasks.filter((t) => t.status !== 'verified_resolved').length
  const input = 'rounded-md border border-slate-300 px-2 py-1.5 text-sm'
  const box = 'rounded-xl border border-slate-200 bg-white p-4'
  const h2 = 'text-sm font-bold text-slate-900'
  const tag = (t: string, tone = 'bg-slate-100 text-slate-600') => <span className={cx('ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', tone)}>{t}</span>

  return (
    <div className="mx-auto max-w-none space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/app/servicechannel/work-orders" className="text-xs font-semibold text-indigo-700">← Work orders</Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold text-slate-900"><span className="font-mono">{wo.trackingNumber}</span><OfficialChip status={wo.status} statusExt={wo.statusExt} /><InternalChip status={c.internalStatus} /></h1>
          <p className="mt-0.5 text-sm text-slate-600">{wo.customerName ?? 'Customer not known'} · {wo.storeLabel ?? 'Store not in export'} · {wo.trade ?? '-'} · {wo.priority ?? '-'}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <button className="rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white" onClick={() => setEditor({})}>Update follow-up</button>
          <a className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-indigo-700 hover:bg-slate-50" target="_blank" rel="noreferrer" href={scLink(wo.trackingNumber)} title="Work-order URL pattern from the cleanup workbook">Open in ServiceChannel</a>
          {wo.kalosJobNumber && jobUrlTemplate && <a className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-indigo-700 hover:bg-slate-50" target="_blank" rel="noreferrer" href={jobUrlTemplate.replace('{job}', encodeURIComponent(wo.kalosJobNumber))}>Kalos job {wo.kalosJobNumber}</a>}
        </div>
      </div>
      {msg && <div className={cx('rounded-lg border p-3 text-sm', msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900')}>{msg.text}</div>}
      {(wo.observationState === 'not_in_latest' || wo.observationState === 'needs_verification') && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Not in the latest comparable export. The official status shown is the last one observed ({fmtWhen(wo.lastSeenAt)}); the reason it is missing is not known. Check ServiceChannel before acting.</div>}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
          <h2 className={h2}>Suggested next steps <span className="font-normal text-slate-500">(rules on the data we have; you decide)</span></h2>
          <ul className="mt-2 space-y-1.5">
            {suggestions.map((s) => (
              <li key={s.key} className="flex flex-wrap items-start gap-2 text-sm">
                <span className={cx('mt-0.5 rounded px-1.5 text-[10px] font-bold uppercase', s.kind === 'exception' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-700')}>{s.kind === 'exception' ? 'needs action' : 'suggestion'}</span>
                <span className="min-w-0 flex-1"><span className="font-medium text-slate-900">{s.title}</span><span className="block text-xs text-slate-500">{s.basis}</span></span>
                <button className="rounded-md border border-indigo-300 bg-white px-2 py-0.5 text-xs font-semibold text-indigo-700" onClick={() => setEditor({ focus: s.action })}>Act</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Work order summary */}
        <section className={box}>
          <h2 className={h2}>Work order summary{tag('Imported from ServiceChannel', 'bg-sky-100 text-sky-800')}</h2>
          <p className="mt-0.5 text-xs text-slate-500">As last observed {fmtWhen(wo.lastSeenAt)}. <ObservationChip state={wo.observationState} /></p>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <Field k="WO #" v={wo.woNumber} /><Field k="PO #" v={wo.poNumber} /><Field k="Category" v={wo.category} /><Field k="Priority" v={wo.priority} />
            <Field k="Call date" v={wo.callDate ? fmtDate(wo.callDate) : null} /><Field k="Scheduled" v={wo.scheduledDate ? fmtDate(wo.scheduledDate) : null} /><Field k="Original ETA" v={wo.originalEta ? fmtDate(wo.originalEta) : null} />
            <Field k="Reassigned" v={wo.reassignDate ? `${fmtDate(wo.reassignDate)} ${wo.reassignTime ?? ''}` : null} /><Field k="NTE" v={wo.nte !== null ? `${wo.currency ?? ''} ${wo.nte.toLocaleString()}` : null} /><Field k="Technician(s)" v={wo.technicians.join('; ') || null} />
            <Field k="Assignee" v={wo.assignee} /><Field k="Submitted by" v={wo.submittedBy} /><Field k="Region / district" v={[wo.region, wo.district].filter(Boolean).join(' / ') || null} /><Field k="Area" v={wo.area} />
            <Field k="Equipment" v={wo.equipment} /><Field k="Problem type" v={wo.problemType} /><Field k="Problem code" v={wo.problemCode} /><Field k="Tag ID" v={wo.tagId} />
            <Field k="Reopened" v={wo.reopenCount ? `${wo.reopenCount}× (last ${fmtWhen(wo.lastReopenedAt)})` : 'No'} /><Field k="Unsatisfactory" v={wo.unsatCount ? `${wo.unsatCount}× (last ${fmtWhen(wo.lastUnsatAt)})` : 'No'} />
          </dl>
          <div className="mt-3"><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Problem description</dt><dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">{wo.problemDescription ?? <span className="text-slate-400">not in export</span>}</dd></div>
          {wo.resolution && <div className="mt-3"><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Resolution (ServiceChannel)</dt><dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">{wo.resolution}</dd></div>}
          <p className="mt-3 text-[11px] text-slate-400">The export carries no proposal, invoice, or SLA fields. Those are recorded by hand under the action plan.</p>

          <div className="mt-4 border-t border-slate-100 pt-3 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Customer{tag(wo.customerName ? (SOURCE_LABEL[wo.customerSource ?? ''] ?? 'Recorded') : 'Not available', wo.customerSource === 'manual' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600')}</p>
            <div className="mt-1 flex gap-2"><input className={cx(input, 'flex-1')} value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Set the customer by hand" /><button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium disabled:opacity-50" disabled={pending || customer === (wo.customerName ?? '')} onClick={() => run(() => setCustomerAction({ workOrderId: wo.id, customerName: customer }), 'Customer saved.')}>Save</button></div>
            {wo.conflicts.filter((x) => !x.resolved).map((x, i) => (
              <p key={i} className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">An import on {fmtWhen(x.at)} said <strong>{x.imported}</strong>; kept <strong>{x.kept}</strong>.
                <button className="ml-2 underline" disabled={pending} onClick={() => run(() => resolveConflictAction({ workOrderId: wo.id, index: wo.conflicts.indexOf(x), choice: 'keep' }), 'Kept.')}>Keep</button>
                <button className="ml-2 underline" disabled={pending} onClick={() => run(() => resolveConflictAction({ workOrderId: wo.id, index: wo.conflicts.indexOf(x), choice: 'take' }), 'Took the import value.')}>Take import</button></p>
            ))}
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Kalos job number{tag(wo.kalosJobNumber ? 'Manually entered' : 'Not available')}</p>
            <div className="mt-1 flex gap-2"><input className={cx(input, 'w-40')} value={job} onChange={(e) => setJob(e.target.value)} /><button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium disabled:opacity-50" disabled={pending || job === (wo.kalosJobNumber ?? '')} onClick={() => run(() => setKalosJobAction({ workOrderId: wo.id, jobNumber: job }), 'Saved.')}>Save</button></div>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Observation</p>
            <div className="mt-1 flex flex-wrap gap-2"><input className={cx(input, 'min-w-[200px] flex-1')} placeholder="What you checked in ServiceChannel, and when" value={obsNote} onChange={(e) => setObsNote(e.target.value)} />
              <button className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium disabled:opacity-50" disabled={pending} onClick={() => run(() => setObservationStateAction({ workOrderId: wo.id, state: 'manually_verified', note: obsNote }), 'Marked verified.')}>Verified in SC</button>
              <button className="rounded-md border border-amber-300 px-2 py-1.5 text-xs font-medium text-amber-800 disabled:opacity-50" disabled={pending} onClick={() => run(() => setObservationStateAction({ workOrderId: wo.id, state: 'needs_verification', note: obsNote }), 'Flagged.')}>Needs check</button></div>
          </div>
        </section>

        {/* Internal action plan */}
        <section className={box}>
          <h2 className={h2}>Internal action plan{tag('PhaseForge', 'bg-indigo-100 text-indigo-800')}</h2>
          <p className="mt-0.5 text-xs text-slate-500">Manually maintained. Imports never change these.</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Accountable owner</dt><dd className="text-slate-900">{c.ownerName ?? <span className="text-rose-700">nobody</span>}{c.ownerProfileId && (c.handoffAcceptedAt ? <span className="block text-[11px] text-emerald-700">accepted {fmtWhen(c.handoffAcceptedAt)}</span> : c.externalAckAt ? <span className="block text-[11px] text-emerald-700">acknowledged by {c.externalAckBy}, recorded by {c.externalAckRecordedName}</span> : <span className="block text-[11px] text-amber-700">not acknowledged</span>)}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Next-action owner</dt><dd className="text-slate-900">{c.actionOwnerName ?? <span className="text-slate-400">same as accountable</span>}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Department</dt><dd className="text-slate-900">{c.department ?? <span className="text-slate-400">-</span>}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Waiting on</dt><dd className="text-slate-900">{c.waitingOn ? c.waitingOn.replace('_', ' ') : <span className="text-slate-400">-</span>}</dd></div>
            <div className="col-span-2"><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Next action</dt><dd className="text-slate-900">{c.nextAction ?? <span className="text-slate-400">not set</span>}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Due</dt><dd className={cx(c.dueDate && c.dueDate < today && c.internalStatus !== 'verified_resolved' ? 'font-semibold text-rose-700' : 'text-slate-900')}>{c.dueDate ? fmtDate(c.dueDate) : '-'}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Blocker</dt><dd className="text-slate-900">{c.blockerReason ?? '-'}</dd></div>
          </dl>
          <div className="mt-3 rounded-lg bg-slate-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recorded facts <span className="normal-case font-normal">(not in the export)</span></p>
            <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {([['Appointment / return', c.appointmentOn ? fmtDate(c.appointmentOn) : null], ['Approval', c.approvalStatus], ['Parts expected', c.partsExpectedOn ? fmtDate(c.partsExpectedOn) : null], ['Parts received', c.partsReceivedOn ? fmtDate(c.partsReceivedOn) : null], ['Equipment condition', c.equipmentCondition ? `${c.equipmentCondition}${c.conditionVerifiedAt ? ` (verified ${fmtDate(c.conditionVerifiedAt.slice(0, 10))})` : ''}` : null], ['Customer contact', c.customerContactName], ['Next contact', c.nextContactOn ? fmtDate(c.nextContactOn) : null]] as [string, string | null][]).map(([k, v]) => <div key={k}><dt className="text-slate-500">{k}</dt><dd className="text-slate-900">{v ?? <span className="text-slate-400">not recorded</span>}</dd></div>)}
            </dl>
          </div>
          <button className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => setEditor({})}>Update follow-up</button>
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Verify resolved</p>
            <p className="mt-0.5 text-xs text-slate-500">Needs no open tasks ({openTasks} open) and a note on what was confirmed with whom.</p>
            <div className="mt-2 flex gap-2"><input className={cx(input, 'flex-1')} placeholder="Confirmed with site contact / portal shows completed / photos" value={verifyNote} onChange={(e) => setVerifyNote(e.target.value)} /><button className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" disabled={pending || c.internalStatus === 'verified_resolved'} onClick={() => run(() => verifyCaseAction({ workOrderId: wo.id, note: verifyNote }), 'Verified resolved.')}>Verify</button></div>
            {c.verifiedResolvedAt && <p className="mt-1 text-xs text-emerald-700">Verified {fmtWhen(c.verifiedResolvedAt)}</p>}
          </div>
        </section>

        {/* Tasks + customer communication + attachments */}
        <div className="space-y-4">
          <section className={box}>
            <h2 className={h2}>Tasks <span className="font-normal text-slate-400">({openTasks} open)</span></h2>
            <ul className="mt-2 space-y-2">{tasks.map((t) => <TaskRow key={t.id} t={t} people={people} today={today} pending={pending} run={run} />)}{!tasks.length && <li className="text-xs text-slate-400">No tasks yet.</li>}</ul>
            <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
              <div className="flex gap-2"><input className={cx(input, 'flex-1')} placeholder="New task" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} /><select className={input} defaultValue="" onChange={(e) => { const tp = templates.find((x) => x.id === e.target.value); if (tp) setTask({ ...task, title: tp.title, queue: tp.queue, nextAction: tp.nextAction, dueDate: new Date(Date.parse(`${today}T00:00:00Z`) + tp.daysDue * 86_400_000).toISOString().slice(0, 10) }); e.target.value = '' }}><option value="">Template…</option>{templates.map((tp) => <option key={tp.id} value={tp.id}>{tp.title}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-2">
                <select className={input} value={task.queue} onChange={(e) => setTask({ ...task, queue: e.target.value })}>{QUEUES.map((q) => <option key={q} value={q}>{QUEUE_LABELS[q]}</option>)}</select>
                <select className={input} value={task.ownerId} onChange={(e) => setTask({ ...task, ownerId: e.target.value })}><option value="">Owner…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <input className={input} placeholder="Next action" value={task.nextAction} onChange={(e) => setTask({ ...task, nextAction: e.target.value })} />
                <input type="date" className={input} value={task.dueDate} onChange={(e) => setTask({ ...task, dueDate: e.target.value })} />
              </div>
              <button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50" disabled={pending || !task.title.trim()} onClick={() => run(() => addTaskAction({ workOrderId: wo.id, title: task.title, queue: task.queue, ownerProfileId: task.ownerId || null, ownerName: person(task.ownerId)?.name ?? null, nextAction: task.nextAction, dueDate: task.dueDate }).then((r) => { if (r.ok) setTask({ title: '', queue: 'general', ownerId: '', nextAction: '', dueDate: '' }); return r }), 'Task added.')}>Add task</button>
            </div>
          </section>

          <section className={box}>
            <h2 className={h2}>Customer communication</h2>
            <p className="mt-1 text-xs text-slate-600">Contact: {c.customerContactName ?? <span className="text-slate-400">not recorded</span>}{c.nextContactOn ? ` · next contact ${fmtDate(c.nextContactOn)}` : ''}</p>
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-sm">
              {contacts.map((e) => <li key={e.id} className="rounded-md bg-slate-50 px-2 py-1.5"><span className="mr-2 text-[11px] text-slate-500">{fmtWhen(e.createdAt)}</span>{e.body}<span className="ml-1 text-xs text-slate-500">({e.actorName})</span></li>)}
              {!contacts.length && <li className="text-xs text-slate-400">No customer contact recorded yet.</li>}
            </ul>
            <div className="mt-2 flex gap-2"><input className={cx(input, 'flex-1')} placeholder="Who you spoke to, what they said, what was agreed, next contact" value={note.kind === 'customer_contact' ? note.body : ''} onChange={(e) => setNote({ kind: 'customer_contact', body: e.target.value })} /><button className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" disabled={pending || note.kind !== 'customer_contact' || !note.body.trim()} onClick={() => run(() => addNoteAction({ workOrderId: wo.id, body: note.body, kind: 'customer_contact' }).then((r) => { if (r.ok) setNote({ kind: 'note', body: '' }); return r }), 'Contact recorded.')}>Record contact</button></div>
          </section>

          <section className={box}>
            <h2 className={h2}>Attachments and evidence</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {attachments.map((a) => <li key={a.id} className="flex items-center justify-between gap-2"><span className="min-w-0 truncate">{a.url ? <a className="text-indigo-700 hover:underline" href={a.url} target="_blank" rel="noreferrer">{a.name}</a> : a.name}<span className="ml-1 text-xs text-slate-400">{a.createdName} · {fmtWhen(a.createdAt)}</span></span><button className="text-xs text-rose-600" disabled={pending} onClick={() => { if (window.confirm('Remove this file?')) run(() => deleteAttachmentAction(a.id), 'Removed.') }}>×</button></li>)}
              {!attachments.length && <li className="text-xs text-slate-400">No files yet. Field photos, repair documentation, customer correspondence.</li>}
            </ul>
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set('workOrderId', wo.id); run(() => uploadAttachmentAction(fd), 'Uploaded.'); if (fileRef.current) fileRef.current.value = '' }}>
              <input ref={fileRef} type="file" name="files" multiple className="text-xs" /><button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium disabled:opacity-50" disabled={pending}>Upload</button>
            </form>
          </section>
        </div>
      </div>

      {/* Related */}
      <section className={box}>
        <h2 className={h2}>Related work orders <span className="font-normal text-slate-400">(same store; a person confirms whether they are related or a recall)</span></h2>
        {links.length > 0 && <ul className="mt-2 space-y-1 text-sm">{links.map((l) => <li key={l.id} className="flex flex-wrap items-center gap-2"><span className={cx('rounded px-1.5 text-[10px] font-bold uppercase', l.relation === 'recall' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-700')}>{l.relation === 'recall' ? 'verified recall' : 'related'}</span><Link className="font-mono font-semibold text-indigo-700" href={`/app/servicechannel/work-orders/${l.other.id}`}>{l.other.trackingNumber}</Link><span className="text-slate-600">{l.other.status}{l.other.statusExt ? ` / ${l.other.statusExt}` : ''} · {fmtDate(l.other.callDate)}</span><span className="truncate text-xs text-slate-500">{l.note ?? l.other.problemDescription ?? ''}</span><span className="text-[11px] text-slate-400">by {l.createdName}</span><button className="text-xs text-rose-600" disabled={pending} onClick={() => run(() => unlinkWorkOrdersAction(l.id), 'Unlinked.')}>unlink</button></li>)}</ul>}
        {sameStore.length > 0 ? (
          <ul className="mt-3 space-y-1.5 text-sm">
            {sameStore.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5">
                <Link className="font-mono font-semibold text-indigo-700" href={`/app/servicechannel/work-orders/${s.id}`}>{s.trackingNumber}</Link>
                <span className="text-slate-600">{s.status}{s.statusExt ? ` / ${s.statusExt}` : ''} · {fmtDate(s.callDate)}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-slate-500" title={s.problemDescription ?? ''}>{s.problemDescription ?? ''}</span>
                <input className={cx(input, 'w-44 py-1 text-xs')} placeholder="Why related (optional)" value={linkNote[s.id] ?? ''} onChange={(e) => setLinkNote({ ...linkNote, [s.id]: e.target.value })} />
                <button className="rounded-md border border-slate-300 px-2 py-1 text-xs" disabled={pending} onClick={() => run(() => linkWorkOrdersAction({ workOrderId: wo.id, relatedId: s.id, relation: 'related', note: linkNote[s.id] }), 'Linked as related.')}>Related</button>
                <button className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700" disabled={pending} onClick={() => run(() => linkWorkOrdersAction({ workOrderId: wo.id, relatedId: s.id, relation: 'recall', note: linkNote[s.id] }), 'Linked as a verified recall.')}>Verified recall</button>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-xs text-slate-400">No other work orders at this store in PhaseForge.</p>}
      </section>

      {/* History */}
      <section className={box}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={h2}>Follow-up history and import history</h2>
          <div className="flex gap-1">{([['all', 'Everything'], ['pf', 'PhaseForge only'], ['sc', 'ServiceChannel only'], ['imports', `Imports (${observations.length})`]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cx('rounded-full px-3 py-1 text-xs font-medium', tab === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600')}>{l}</button>)}</div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[160px_1fr_auto]">
          <select className={input} value={note.kind} onChange={(e) => setNote({ ...note, kind: e.target.value as typeof note.kind })}><option value="note">Note</option><option value="customer_contact">Customer contact</option><option value="department_followup">Department follow-up</option></select>
          <input className={input} placeholder="What happened, who said it, what was agreed" value={note.body} onChange={(e) => setNote({ ...note, body: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && note.body.trim()) run(() => addNoteAction({ workOrderId: wo.id, body: note.body, kind: note.kind }).then((r) => { if (r.ok) setNote({ ...note, body: '' }); return r }), 'Saved.') }} />
          <button className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50" disabled={pending || !note.body.trim()} onClick={() => run(() => addNoteAction({ workOrderId: wo.id, body: note.body, kind: note.kind }).then((r) => { if (r.ok) setNote({ ...note, body: '' }); return r }), 'Saved.')}>Add</button>
        </div>
        {tab !== 'imports' ? (
          <ul className="mt-3 max-h-[520px] space-y-1.5 overflow-auto">
            {timeline.filter((i) => tab === 'all' || (tab === 'pf' ? i.tone === 'pf' : i.tone === 'sc')).map((i, k) => (
              <li key={k} className={cx('rounded-md px-2 py-1.5 text-sm', i.tone === 'pf' ? 'bg-indigo-50/60' : 'bg-slate-50')}>
                <span className="mr-2 text-[11px] text-slate-500">{i.tone === 'sc' ? fmtDate(i.at.slice(0, 10)) : fmtWhen(i.at)}</span><span className={cx('mr-2 rounded px-1.5 text-[10px] font-bold uppercase', i.tone === 'pf' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-700')}>{i.kind}</span><span className="text-slate-800">{i.text}</span>{i.who && <span className="ml-1 text-xs text-slate-500">({i.who})</span>}
              </li>
            ))}
            {!timeline.length && <li className="text-xs text-slate-400">Nothing yet.</li>}
          </ul>
        ) : (
          <ul className="mt-3 max-h-[520px] space-y-1.5 overflow-auto text-sm">
            {observations.map((o) => (
              <li key={o.id} className="rounded-md bg-slate-50 px-2 py-1.5">
                <span className="mr-2 text-[11px] text-slate-500">{fmtWhen(o.observedAt)}</span><span className="mr-2 rounded bg-slate-200 px-1.5 text-[10px] font-bold uppercase text-slate-700">{o.kind}</span>
                <span className="text-slate-800">{o.status ?? '-'}{o.statusExt ? ` / ${o.statusExt}` : ''} · sched {fmtDate(o.scheduledDate)} · ETA {fmtDate(o.originalEta)} · {o.technicians.join('; ') || 'no tech'}</span><span className="ml-2 text-xs text-slate-500">{o.sourceName ?? ''}{o.flags.length ? ` · ${o.flags.join(', ')}` : ''}</span>
                {o.changes.length > 0 && <ul className="ml-4 mt-0.5 list-disc text-xs text-slate-600">{o.changes.map((ch, i) => <li key={i}>{ch.label}: {ch.from ?? 'blank'} → {ch.to ?? 'blank'}</li>)}</ul>}
              </li>
            ))}
          </ul>
        )}
      </section>
      {editor && <QuickEditor wo={wo as WorkOrderView} people={people} templates={templates} departments={departments} today={today} focus={editor.focus} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setMsg({ ok: true, text: 'Saved.' }); router.refresh() }} />}
    </div>
  )
}

function Field({ k, v }: { k: string; v: string | null | undefined }) {
  return <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k}</dt><dd className="text-slate-900">{v ?? <span className="text-slate-400">not in export</span>}</dd></div>
}

function TaskRow({ t, people, today, pending, run }: { t: TaskView; people: Person[]; today: string; pending: boolean; run: (fn: () => Promise<Result>, ok: string) => void }) {
  const [vnote, setVnote] = useState('')
  const over = t.dueDate && t.dueDate < today && t.status !== 'verified_resolved'
  const set = (patch: Parameters<typeof updateTaskAction>[0]['patch'], note?: string, ok = 'Task updated.') => run(() => updateTaskAction({ taskId: t.id, patch, note }), ok)
  return (
    <li className="rounded-lg border border-slate-200 p-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-1"><span className="font-medium text-slate-900">{t.title}</span><InternalChip status={t.status as InternalStatus} /></div>
      <p className="mt-0.5 text-xs text-slate-500">{QUEUE_LABELS[t.queue as keyof typeof QUEUE_LABELS] ?? t.queue} · {t.ownerName ?? 'no owner'}{t.ownerProfileId && !t.acceptedAt ? ' (unaccepted)' : ''}{t.dueDate ? ` · due ${fmtDate(t.dueDate)}` : ''}{over ? ' · OVERDUE' : ''}{t.nextAction ? ` · ${t.nextAction}` : ''}</p>
      {t.status !== 'verified_resolved' && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <select className="rounded-md border border-slate-300 px-1.5 py-1 text-xs" value={t.ownerProfileId ?? ''} onChange={(e) => set({ ownerProfileId: e.target.value || null, ownerName: people.find((p) => p.id === e.target.value)?.name ?? null })} disabled={pending}><option value="">Owner…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          {t.ownerProfileId && !t.acceptedAt && <button className="rounded-md border border-slate-300 px-2 py-1 text-xs" disabled={pending} onClick={() => set({ status: 'accepted' }, undefined, 'Accepted.')}>Accept</button>}
          {t.status !== 'pending_verification' && <><button className="rounded-md border border-slate-300 px-2 py-1 text-xs" disabled={pending} onClick={() => set({ status: 'in_progress' })}>In progress</button><button className="rounded-md border border-slate-300 px-2 py-1 text-xs" disabled={pending} onClick={() => set({ status: 'blocked' })}>Blocked</button><button className="rounded-md bg-violet-600 px-2 py-1 text-xs font-semibold text-white" disabled={pending} onClick={() => set({ status: 'pending_verification' }, undefined, 'Marked complete, awaiting verification.')}>Mark complete</button></>}
          {t.status === 'pending_verification' && <><input className="min-w-[160px] flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs" placeholder="What was verified" value={vnote} onChange={(e) => setVnote(e.target.value)} /><button className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white" disabled={pending} onClick={() => set({ status: 'verified_resolved' }, vnote, 'Task verified.')}>Verify</button><button className="rounded-md border border-slate-300 px-2 py-1 text-xs" disabled={pending} onClick={() => set({ status: 'in_progress' }, 'Sent back', 'Reopened.')}>Not done</button></>}
        </div>
      )}
      {t.verifiedAt && <p className="mt-1 text-[11px] text-emerald-700">Verified {fmtWhen(t.verifiedAt)}</p>}
    </li>
  )
}
