'use client'

// CO detail: answers "what / where / who / how much / what's next / what
// happened" without hunting. Header carries the money + stage + owner +
// waiting-on + aging; sections below: next action & handoff, customer
// submission, revisions, approval & billing, permanent timeline.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, Send, UserRound, History, DollarSign, FileStack,
  CalendarClock, Archive, X, Pencil,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/dates'
import {
  coStage, fmtMoney, daysBetween, agingLevel, CO_BILLING_STATUSES,
  type ChangeOrderRow,
} from '@/lib/changeOrders'
import {
  assignOwner, updateCoFields, addRevision, recordCheck, addCoNote, archiveCo,
} from '../actions'
import { MoveStageModal } from '../ChangeOrdersClient'

interface Member { id: string; full_name: string; role: string }
interface CoEvent {
  id: string; event_type: string; field: string | null; old_value: string | null
  new_value: string | null; note: string | null; actor_id: string | null; created_at: string
}
interface CoRevision {
  id: string; revision_number: number; amount: number | null; reason: string | null
  description: string | null; customer_feedback: string | null; created_by: string | null; created_at: string
}
interface CoSubmission {
  id: string; portal: string | null; submitted_at: string; submitted_by: string | null
  amount: number | null; tracking_number: string | null; confirmation_number: string | null
  no_confirmation: boolean; status: string; last_checked_at: string | null; next_follow_up: string | null
}

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-800'

export function CoDetailClient({
  co, project, events, revisions, submissions, members, currentUserId, isManager, isAdmin,
}: {
  co: ChangeOrderRow
  project: { id: string; name: string; customer_name: string | null; store_site_id: string | null; job_number: string | null } | null
  events: CoEvent[]
  revisions: CoRevision[]
  submissions: CoSubmission[]
  members: Member[]
  currentUserId: string
  isManager: boolean
  isAdmin: boolean
}) {
  const router = useRouter()
  const stage = coStage(co.stage)
  const stageDays = daysBetween(co.stage_entered_at)
  const totalDays = daysBetween(co.created_at)
  const aging = agingLevel(stageDays)
  const memberName = Object.fromEntries(members.map((m) => [m.id, m.full_name]))
  const canEdit = isManager || co.owner_id === currentUserId

  const [moving, setMoving] = useState(false)
  const [targetStage, setTargetStage] = useState('')
  const [handoff, setHandoff] = useState(false)
  const [revising, setRevising] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [notePending, startNote] = useTransition()
  const amount = co.approved_amount ?? co.current_amount ?? co.requested_amount

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link href="/app/change-orders" className="flex items-center gap-1 hover:text-indigo-600"><ArrowLeft size={13} /> Change Orders</Link>
        {project && (<><span>/</span><Link href={`/app/projects/${project.id}/change-orders`} className="hover:text-indigo-600 truncate">{project.name}</Link></>)}
      </div>

      {/* Header */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold text-indigo-600">{co.co_label}</span>
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
                style={{ backgroundColor: `${stage.color}1d`, color: stage.color }}>
                {stage.label.toUpperCase()}
              </span>
              {co.revision_number > 1 && <span className="text-[11px] font-semibold text-slate-400">Rev {co.revision_number}</span>}
              {co.archived_at && <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">ARCHIVED</span>}
            </div>
            <h1 className="mt-1 text-lg sm:text-xl font-bold text-slate-900 dark:text-white">{co.title}</h1>
            <p className="text-xs text-slate-500 truncate">
              {project?.name}{co.store_number ? ` · Store #${co.store_number}` : ''}{co.customer_name ? ` · ${co.customer_name}` : ''}{project?.job_number ? ` · Job# ${project.job_number}` : ''}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{fmtMoney(amount)}</p>
            {co.approved_amount != null && co.requested_amount != null && co.approved_amount !== co.requested_amount && (
              <p className={cn('text-[11px] font-semibold', co.approved_amount < co.requested_amount ? 'text-rose-600' : 'text-emerald-600')}>
                {co.approved_amount < co.requested_amount ? '' : '+'}{fmtMoney(co.approved_amount - co.requested_amount)} vs requested
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <HeaderStat label="Internal owner" value={co.owner_id ? memberName[co.owner_id] ?? '—' : 'Unassigned'} alert={!co.owner_id} />
          <HeaderStat label="Waiting on" value={co.waiting_on ?? '—'} tone="sky" />
          <HeaderStat label="Time in stage" value={aging.label} chipClass={aging.className} sub={`${totalDays}d total`} />
          <HeaderStat label="Follow-up" value={co.follow_up_date ? formatDate(co.follow_up_date) : co.due_date ? `Due ${formatDate(co.due_date)}` : '—'} />
        </div>

        {/* Next action banner */}
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-100 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/40 px-3 py-2.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-500 shrink-0">Next action</span>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 min-w-0 flex-1">{co.next_action ?? 'No next action set — set one so this never stalls.'}</p>
          {canEdit && (
            <div className="flex gap-1.5 shrink-0">
              <button onClick={() => setHandoff(true)}
                className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-indigo-300">
                <UserRound size={13} /> Hand off
              </button>
              <button onClick={() => { setMoving(true); setTargetStage('') }}
                className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
                <Send size={13} /> Move stage
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Left column: details, submission, revisions, billing */}
        <div className="lg:col-span-3 space-y-4">
          <DetailsCard co={co} canEdit={canEdit} onSaved={() => router.refresh()} />
          <SubmissionCard co={co} submissions={submissions} memberName={memberName} canEdit={canEdit} onChanged={() => router.refresh()} />
          <RevisionsCard co={co} revisions={revisions} memberName={memberName} canEdit={canEdit}
            revising={revising} setRevising={setRevising} onChanged={() => router.refresh()} />
          <BillingCard co={co} canEdit={isManager} onSaved={() => router.refresh()} />
          {isAdmin && !co.archived_at && (
            <button onClick={async () => { if (confirm(`Archive ${co.co_label}? It stays in history but leaves the pipeline.`)) { await archiveCo(co.id); router.push('/app/change-orders') } }}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-rose-600">
              <Archive size={13} /> Archive this change order
            </button>
          )}
        </div>

        {/* Right column: timeline */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100"><History size={15} className="text-indigo-500" /> Timeline</h2>
            <div className="mt-2 flex gap-2">
              <input value={noteText} onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && noteText.trim()) startNote(async () => { await addCoNote(co.id, noteText); setNoteText(''); router.refresh() }) }}
                placeholder="Add a note to the record…" className={inputCls} />
              <button disabled={!noteText.trim() || notePending}
                onClick={() => startNote(async () => { await addCoNote(co.id, noteText); setNoteText(''); router.refresh() })}
                className="rounded-lg bg-slate-900 dark:bg-slate-700 px-3 text-xs font-semibold text-white disabled:opacity-40">
                {notePending ? '…' : 'Add'}
              </button>
            </div>
            <ol className="mt-3 space-y-2.5 max-h-[560px] overflow-y-auto pr-1">
              {events.map((e) => (
                <li key={e.id} className="flex gap-2.5">
                  <span className="mt-1 h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: eventColor(e.event_type) }} />
                  <div className="min-w-0">
                    <p className="text-xs text-slate-700 dark:text-slate-200">{describeEvent(e, memberName)}</p>
                    {e.note && <p className="text-[11px] text-slate-500 italic">&ldquo;{e.note}&rdquo;</p>}
                    <p className="text-[10px] text-slate-400">
                      {e.actor_id ? memberName[e.actor_id] ?? 'Someone' : 'System'} · {formatDate(e.created_at, 'MMM d, yyyy')} {new Date(e.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                </li>
              ))}
              {events.length === 0 && <p className="text-xs text-slate-400">No events yet.</p>}
            </ol>
          </div>
        </div>
      </div>

      {moving && (
        <MoveStageModal co={co} targetStage={targetStage} setTargetStage={setTargetStage}
          onClose={() => setMoving(false)} onDone={() => { setMoving(false); router.refresh() }} />
      )}
      {handoff && (
        <HandoffModal coId={co.id} members={members} onClose={() => setHandoff(false)}
          onDone={() => { setHandoff(false); router.refresh() }} />
      )}
    </div>
  )
}

function HeaderStat({ label, value, sub, alert, tone, chipClass }: {
  label: string; value: string; sub?: string; alert?: boolean; tone?: 'sky'; chipClass?: string
}) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      {chipClass ? (
        <span className={cn('mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold', chipClass)}>{value}</span>
      ) : (
        <p className={cn('text-sm font-semibold truncate', alert ? 'text-rose-600' : tone === 'sky' ? 'text-sky-600' : 'text-slate-800 dark:text-slate-100')}>{value}</p>
      )}
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </div>
  )
}

// ── Details (inline editable) ────────────────────────────────────────────────

function DetailsCard({ co, canEdit, onSaved }: { co: ChangeOrderRow; canEdit: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [f, setF] = useState({
    title: co.title, description: co.description ?? '', nextAction: co.next_action ?? '',
    currentAmount: co.current_amount != null ? String(co.current_amount) : '',
    priority: co.priority, dueDate: co.due_date ?? '', followUpDate: co.follow_up_date ?? '',
    customerName: co.customer_name ?? '', storeNumber: co.store_number ?? '', portal: co.portal ?? '',
    waitingOn: co.waiting_on ?? '',
  })
  const save = () => start(async () => {
    setError('')
    const res = await updateCoFields(co.id, {
      title: f.title, description: f.description || null, nextAction: f.nextAction || null,
      currentAmount: f.currentAmount || null, priority: f.priority,
      dueDate: f.dueDate || null, followUpDate: f.followUpDate || null,
      customerName: f.customerName || null, storeNumber: f.storeNumber || null,
      portal: f.portal || null, waitingOn: f.waitingOn || null,
    })
    if (!res.success) { setError(res.error); return }
    setEditing(false); onSaved()
  })

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Details</h2>
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"><Pencil size={12} /> Edit</button>
        )}
      </div>
      {editing ? (
        <div className="mt-3 space-y-2.5">
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} placeholder="Title" />
          <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} className={inputCls} placeholder="Description" />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] font-semibold uppercase text-slate-400">Current amount
              <input value={f.currentAmount} onChange={(e) => setF({ ...f, currentAmount: e.target.value })} inputMode="decimal" className={inputCls} /></label>
            <label className="text-[10px] font-semibold uppercase text-slate-400">Priority
              <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} className={inputCls}>
                {['low', 'medium', 'high', 'critical'].map((p) => <option key={p} value={p}>{p}</option>)}
              </select></label>
            <label className="text-[10px] font-semibold uppercase text-slate-400">Due date
              <input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} className={inputCls} /></label>
            <label className="text-[10px] font-semibold uppercase text-slate-400">Follow-up date
              <input type="date" value={f.followUpDate} onChange={(e) => setF({ ...f, followUpDate: e.target.value })} className={inputCls} /></label>
            <label className="text-[10px] font-semibold uppercase text-slate-400">Customer
              <input value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} className={inputCls} /></label>
            <label className="text-[10px] font-semibold uppercase text-slate-400">Store #
              <input value={f.storeNumber} onChange={(e) => setF({ ...f, storeNumber: e.target.value })} className={inputCls} /></label>
            <label className="text-[10px] font-semibold uppercase text-slate-400">Portal
              <input value={f.portal} onChange={(e) => setF({ ...f, portal: e.target.value })} className={inputCls} placeholder="ServiceChannel…" /></label>
            <label className="text-[10px] font-semibold uppercase text-slate-400">Waiting on
              <input value={f.waitingOn} onChange={(e) => setF({ ...f, waitingOn: e.target.value })} className={inputCls} /></label>
          </div>
          <input value={f.nextAction} onChange={(e) => setF({ ...f, nextAction: e.target.value })} className={inputCls} placeholder="Next action" />
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300">Cancel</button>
            <button onClick={save} disabled={pending} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {pending && <Loader2 size={12} className="animate-spin" />} Save
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-2 text-sm">
          {co.description ? <p className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{co.description}</p> : <p className="text-xs text-slate-400">No description.</p>}
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1">
            <Dt label="Requested" value={fmtMoney(co.requested_amount)} />
            <Dt label="Current" value={fmtMoney(co.current_amount)} />
            <Dt label="Approved" value={fmtMoney(co.approved_amount)} strong={co.approved_amount != null} />
            <Dt label="Priority" value={co.priority} />
            <Dt label="Created" value={formatDate(co.created_at)} />
            <Dt label="Portal" value={co.portal ?? '—'} />
          </dl>
        </div>
      )}
    </div>
  )
}

function Dt({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={cn('text-slate-700 dark:text-slate-200', strong && 'font-bold text-emerald-600')}>{value}</dd>
    </div>
  )
}

// ── Customer submission ──────────────────────────────────────────────────────

function SubmissionCard({ co, submissions, memberName, canEdit, onChanged }: {
  co: ChangeOrderRow; submissions: CoSubmission[]; memberName: Record<string, string>
  canEdit: boolean; onChanged: () => void
}) {
  const [pending, start] = useTransition()
  const [followUp, setFollowUp] = useState('')
  const latest = submissions[0]
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100"><Send size={14} className="text-sky-500" /> Customer submission</h2>
      {co.submitted_date ? (
        <dl className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          <Dt label="Submitted" value={`${formatDate(co.submitted_date)} ${new Date(co.submitted_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`} />
          <Dt label="By" value={co.submitted_by ? memberName[co.submitted_by] ?? '—' : '—'} />
          <Dt label="Portal" value={co.portal ?? '—'} />
          <Dt label="Tracking #" value={co.tracking_number ?? (co.no_confirmation ? 'None provided by portal' : '—')} strong={!!co.tracking_number} />
          <Dt label="Confirmation #" value={co.confirmation_number ?? '—'} />
          <Dt label="Last checked" value={latest?.last_checked_at ? formatDate(latest.last_checked_at) : '—'} />
        </dl>
      ) : (
        <p className="mt-2 text-xs text-slate-400">Not submitted to the customer yet. Moving this CO to &ldquo;Submitted to Customer&rdquo; records the portal and tracking number.</p>
      )}
      {canEdit && co.submitted_date && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
          <CalendarClock size={13} className="text-slate-400" />
          <span className="text-xs text-slate-500">Checked the portal?</span>
          <input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)}
            className="rounded-md border border-slate-300 dark:border-slate-600 px-2 py-1 text-xs dark:bg-slate-800" />
          <button disabled={pending}
            onClick={() => start(async () => { await recordCheck(co.id, followUp || null); setFollowUp(''); onChanged() })}
            className="rounded-lg bg-slate-900 dark:bg-slate-700 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {pending ? 'Saving…' : 'Log check + set follow-up'}
          </button>
        </div>
      )}
      {submissions.length > 1 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-slate-400">Submission history ({submissions.length})</summary>
          <ul className="mt-1 space-y-1 text-[11px] text-slate-500">
            {submissions.map((s) => (
              <li key={s.id}>{formatDate(s.submitted_at)} — {s.portal ?? 'portal'} {s.tracking_number ? `· #${s.tracking_number}` : s.no_confirmation ? '· no confirmation #' : ''} {s.amount != null ? `· ${fmtMoney(s.amount)}` : ''}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

// ── Revisions ────────────────────────────────────────────────────────────────

function RevisionsCard({ co, revisions, memberName, canEdit, revising, setRevising, onChanged }: {
  co: ChangeOrderRow; revisions: CoRevision[]; memberName: Record<string, string>
  canEdit: boolean; revising: boolean; setRevising: (b: boolean) => void; onChanged: () => void
}) {
  const [pending, start] = useTransition()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const rows: { revision_number: number; amount: number | null; reason: string | null; created_at: string; created_by: string | null }[] =
    revisions.length > 0 || co.revision_number > 1
      ? revisions
      : [{ revision_number: 1, amount: co.requested_amount, reason: 'Original request', created_at: co.created_at, created_by: co.created_by }]

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100"><FileStack size={14} className="text-violet-500" /> Revisions</h2>
        {canEdit && !revising && (
          <button onClick={() => { setRevising(true); setAmount(co.current_amount != null ? String(co.current_amount) : '') }}
            className="text-xs text-indigo-600 hover:underline">+ New revision</button>
        )}
      </div>
      {revising && (
        <div className="mt-2 space-y-2 rounded-xl bg-violet-50/60 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900 p-3">
          <div className="grid grid-cols-2 gap-2">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="New amount ($)" inputMode="decimal" className={inputCls} />
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for revision" className={inputCls} />
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setRevising(false)} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300">Cancel</button>
            <button disabled={pending} onClick={() => start(async () => {
              setError('')
              const r = await addRevision(co.id, { amount: amount || null, reason })
              if (!r.success) { setError(r.error); return }
              setRevising(false); setAmount(''); setReason(''); onChanged()
            })} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {pending ? 'Saving…' : `Create Rev ${co.revision_number + 1}`}
            </button>
          </div>
        </div>
      )}
      <ol className="mt-2 space-y-1.5">
        {rows.map((r, i) => {
          const prev = rows[i + 1]
          const delta = r.amount != null && prev?.amount != null ? r.amount - prev.amount : null
          const isCurrent = r.revision_number === co.revision_number
          return (
            <li key={r.revision_number} className={cn('flex flex-wrap items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs',
              isCurrent ? 'bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-900' : 'bg-slate-50 dark:bg-slate-800/50')}>
              <span className={cn('font-bold', isCurrent ? 'text-violet-700 dark:text-violet-300' : 'text-slate-500')}>Rev {r.revision_number}</span>
              {isCurrent && <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-bold text-white">CURRENT</span>}
              <span className="font-semibold text-slate-800 dark:text-slate-100">{fmtMoney(r.amount)}</span>
              {delta != null && delta !== 0 && (
                <span className={cn('font-semibold', delta > 0 ? 'text-emerald-600' : 'text-rose-600')}>{delta > 0 ? '+' : ''}{fmtMoney(delta)}</span>
              )}
              {r.reason && <span className="text-slate-500 truncate">— {r.reason}</span>}
              <span className="ml-auto text-[10px] text-slate-400">{r.created_by ? memberName[r.created_by] ?? '' : ''} {formatDate(r.created_at)}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ── Billing ──────────────────────────────────────────────────────────────────

function BillingCard({ co, canEdit, onSaved }: { co: ChangeOrderRow; canEdit: boolean; onSaved: () => void }) {
  const [pending, start] = useTransition()
  const [status, setStatus] = useState(co.billing_status)
  const [invoice, setInvoice] = useState(co.invoice_number ?? '')
  const [billed, setBilled] = useState(co.billed_amount != null ? String(co.billed_amount) : '')
  const [error, setError] = useState('')
  const anb = co.approved_amount != null && !['billed', 'paid'].includes(co.billing_status)
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100"><DollarSign size={14} className="text-emerald-500" /> Approval &amp; billing</h2>
        {anb && <span className="rounded-full bg-amber-100 dark:bg-amber-950 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">APPROVED — NOT BILLED</span>}
      </div>
      <dl className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        <Dt label="Approved amount" value={fmtMoney(co.approved_amount)} strong={co.approved_amount != null} />
        <Dt label="Approved date" value={co.approved_date ? formatDate(co.approved_date) : '—'} />
        <Dt label="Approved by" value={co.approved_by_name ?? '—'} />
        <Dt label="Approval ref" value={co.approval_reference ?? '—'} />
        <Dt label="Invoice #" value={co.invoice_number ?? '—'} />
        <Dt label="Billed amount" value={fmtMoney(co.billed_amount)} />
      </dl>
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5">
          <label className="text-[10px] font-semibold uppercase text-slate-400">Billing status
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={cn(inputCls, 'mt-0.5 w-44')}>
              {CO_BILLING_STATUSES.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select></label>
          <label className="text-[10px] font-semibold uppercase text-slate-400">Invoice #
            <input value={invoice} onChange={(e) => setInvoice(e.target.value)} className={cn(inputCls, 'mt-0.5 w-36')} /></label>
          <label className="text-[10px] font-semibold uppercase text-slate-400">Billed amount
            <input value={billed} onChange={(e) => setBilled(e.target.value)} inputMode="decimal" className={cn(inputCls, 'mt-0.5 w-32')} /></label>
          <button disabled={pending} onClick={() => start(async () => {
            setError('')
            const r = await updateCoFields(co.id, { billingStatus: status, invoiceNumber: invoice || null, billedAmount: billed || null })
            if (!r.success) { setError(r.error); return }
            onSaved()
          })} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {pending ? 'Saving…' : 'Save billing'}
          </button>
          {error && <p className="w-full text-xs text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  )
}

// ── Handoff modal ────────────────────────────────────────────────────────────

function HandoffModal({ coId, members, onClose, onDone }: {
  coId: string; members: Member[]; onClose: () => void; onDone: () => void
}) {
  const [pending, start] = useTransition()
  const [ownerId, setOwnerId] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Hand off this CO</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 space-y-2.5">
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={inputCls}>
            <option value="">Assign to…</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
          <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Next action for them (e.g. Review revised pricing)" className={inputCls} />
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional note (lands on the timeline + their notification)" className={inputCls} />
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>
        <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">Cancel</button>
          <button disabled={!ownerId || pending} onClick={() => start(async () => {
            setError('')
            const r = await assignOwner(coId, ownerId, { nextAction: nextAction || undefined, dueDate: dueDate || null, note: note || undefined })
            if (!r.success) { setError(r.error); return }
            onDone()
          })} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {pending && <Loader2 size={14} className="animate-spin" />} Hand off
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Timeline rendering helpers ───────────────────────────────────────────────

function eventColor(type: string): string {
  switch (type) {
    case 'created': return '#6366f1'
    case 'stage_change': return '#0ea5e9'
    case 'owner_change': return '#8b5cf6'
    case 'amount_change': return '#f59e0b'
    case 'revision': return '#a855f7'
    case 'submission': case 'tracking': return '#06b6d4'
    case 'approval': return '#10b981'
    case 'rejection': return '#e11d48'
    case 'billing': return '#84cc16'
    case 'follow_up': return '#f97316'
    case 'archive': return '#64748b'
    default: return '#94a3b8'
  }
}

function describeEvent(e: CoEvent, names: Record<string, string>): string {
  const nameOf = (v: string | null) => (v && names[v]) || v || '—'
  switch (e.event_type) {
    case 'created': return `Created ${e.new_value ?? ''}`
    case 'stage_change': return `Stage: ${e.old_value ?? '—'} → ${e.new_value ?? '—'}`
    case 'owner_change': return `Assigned to ${nameOf(e.new_value)}`
    case 'amount_change': return `Amount: ${e.old_value ? `$${e.old_value}` : '—'} → ${e.new_value ? `$${e.new_value}` : '—'}`
    case 'revision': return `Revision: ${e.old_value ?? ''} → ${e.new_value ?? ''}`
    case 'tracking': return `Tracking #: ${e.old_value ?? '—'} → ${e.new_value ?? '—'}`
    case 'approval': return `Approved at $${e.new_value ?? ''}${e.old_value ? ` (requested $${e.old_value})` : ''}`
    case 'billing': return `Billing: ${e.old_value ?? '—'} → ${e.new_value ?? '—'}`
    case 'follow_up': return e.field === 'checked' ? `Portal checked${e.new_value ? `, next follow-up ${e.new_value}` : ''}` : `Follow-up set: ${e.new_value ?? 'cleared'}`
    case 'archive': return 'Archived'
    case 'restore': return 'Restored from archive'
    case 'note': return 'Note'
    default: return e.event_type
  }
}
