'use client'

import { useState } from 'react'
import { ExternalLink, Trash2, X } from 'lucide-react'
import type {
  CallStatus, DispatchAsset, DispatchFormField, NextAction, NoteCategory, PartStatus,
  PrioritizedCall, PriorityLevel, ProposalStatus, Urgency, Vendor,
} from '@/lib/dispatch/types'
import { recommendNextAction } from '@/lib/dispatch/priorityEngine'
import {
  calendarDateKey, dateInputToNoonUtc, etaInputToIso, etaTimeKey, formatDateTime, formatEta, titleCase,
} from '@/lib/dispatch/utils'
import {
  acknowledgeCall, addCallNote, assignVendorsToCall, deleteServiceCall, updateServiceCall,
} from '@/app/app/dispatch/actions'

const STATUS_OPTIONS: CallStatus[] = [
  'open', 'in_progress', 'awaiting_repair', 'incomplete', 'recall', 'parts_on_order',
  'part_received', 'partially_delivered', 'quote_requested', 'proposal_sent',
  'proposal_approved', 'proposal_rejected', 'completed', 'cancelled',
]
const URGENCY_OPTIONS: Urgency[] = ['urgent', 'high', 'normal', 'low']
const PART_STATUS_OPTIONS: PartStatus[] = ['none', 'part_needed', 'ordered', 'received', 'partially_delivered', 'installed']
const PROPOSAL_STATUS_OPTIONS: ProposalStatus[] = ['none', 'quote_requested', 'sent', 'approved', 'parts_received', 'rejected']
const NEXT_ACTIONS: NextAction[] = [
  'none', 'assign_vendor', 'request_eta', 'follow_up_vendor', 'check_part_shipping',
  'schedule_repair', 'send_proposal', 'await_customer_approval', 'close_call',
]
const NOTE_CATEGORIES: NoteCategory[] = [
  'internal_note', 'customer_update', 'vendor_update', 'parts_update',
  'scheduling_update', 'proposal_update', 'completion_update',
]

const inputCls = 'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{children}</label>
}

export function CallDetailPanel({ call, vendors, assets = [], priorityLevels, formFields, hiddenBuiltinFields = [], canEdit, onClose, onChanged }: {
  call: PrioritizedCall
  vendors: Vendor[]
  assets?: DispatchAsset[]
  priorityLevels: PriorityLevel[]
  formFields: DispatchFormField[]
  hiddenBuiltinFields?: string[]
  canEdit: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [noteCategory, setNoteCategory] = useState<NoteCategory>('internal_note')
  const [savingNote, setSavingNote] = useState(false)
  const [tab, setTab] = useState<'details' | 'notes' | 'activity'>('details')
  const [etaDate, setEtaDate] = useState(calendarDateKey(call.eta_scheduled))
  const [etaTime, setEtaTime] = useState(etaTimeKey(call.eta_scheduled))

  // Store-less (customer-only) calls carry the customer directly.
  const callCustomerId = call.customer_id ?? call.store?.customer_id ?? null
  const customerLevels = priorityLevels
    .filter((p) => p.customer_id === callCustomerId)
    .sort((a, b) => a.sort_order - b.sort_order)
  const recommended = recommendNextAction(call)

  const patch = async (p: Parameters<typeof updateServiceCall>[1]) => {
    setError(null)
    const res = await updateServiceCall(call.id, p)
    if (res && 'error' in res && res.error) setError(res.error)
    else onChanged()
  }

  // Saves the ETA only when the combined date+time actually changed, so
  // tabbing between the two inputs doesn't spam updates.
  const commitEta = (nextDate: string, nextTime: string) => {
    const nextIso = nextDate ? etaInputToIso(nextDate, nextTime || null) : null
    const prevMs = call.eta_scheduled ? new Date(call.eta_scheduled).getTime() : null
    const nextMs = nextIso ? new Date(nextIso).getTime() : null
    if (prevMs !== nextMs) void patch({ eta_scheduled: nextIso })
  }

  const toggleVendor = async (vendorId: string) => {
    const current = call.vendors.map((v) => v.id)
    const next = current.includes(vendorId) ? current.filter((id) => id !== vendorId) : [...current, vendorId]
    const res = await assignVendorsToCall(call.id, next)
    if (res && 'error' in res && res.error) setError(res.error)
    else onChanged()
  }

  const submitNote = async () => {
    if (!noteText.trim()) return
    setSavingNote(true)
    const res = await addCallNote(call.id, noteCategory, noteText)
    setSavingNote(false)
    if (res && 'error' in res && res.error) setError(res.error)
    else { setNoteText(''); onChanged() }
  }

  const remove = async () => {
    if (!confirm(`Delete call ${call.service_call_number}? This is permanent.`)) return
    const res = await deleteServiceCall(call.id)
    if (res && 'error' in res && res.error) setError(res.error)
    else { onClose(); onChanged() }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {call.store ? `#${call.store.store_number} ${call.store.store_name}` : call.customer_name ?? 'No location'}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-indigo-600">
                  {call.tracking_url
                    ? <a href={call.tracking_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:underline">
                        {call.service_call_number} <ExternalLink size={10} />
                      </a>
                    : call.service_call_number}
                </span>
                {call.internal_job_number && <span>Job <b>{call.internal_job_number}</b></span>}
                {call.store && call.customer_name && <span>{call.customer_name}</span>}
                <span>{call.days_open}d open</span>
                {call.nte != null && <span>NTE ${Number(call.nte).toLocaleString()}</span>}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {canEdit && (
                <button onClick={remove} title="Delete call" className="p-1.5 text-rose-400 hover:text-rose-600"><Trash2 size={15} /></button>
              )}
              <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600"><X size={17} /></button>
            </div>
          </div>
          {call.needs_acknowledgment && canEdit && (
            <button onClick={async () => { const r = await acknowledgeCall(call.id); if (r && 'error' in r && r.error) setError(r.error); else onChanged() }}
              className="mt-2 w-full rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-300">
              New auto-imported call — mark as reviewed
            </button>
          )}
          {/* Tabs */}
          <div className="mt-2.5 flex gap-1">
            {(['details', 'notes', 'activity'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${tab === t ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                {titleCase(t)}{t === 'notes' ? ` (${call.notes.length})` : ''}
              </button>
            ))}
          </div>
          {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'details' && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2">
                <Label>Description</Label>
                <textarea className={inputCls} rows={3} defaultValue={call.description} readOnly={!canEdit}
                  onBlur={(e) => { if (canEdit && e.target.value.trim() !== call.description) void patch({ description: e.target.value.trim() }) }} />
              </div>
              <div>
                <Label>Status</Label>
                <select className={inputCls} value={call.status} disabled={!canEdit}
                  onChange={(e) => void patch({ status: e.target.value as CallStatus })}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                </select>
              </div>
              <div>
                <Label>{customerLevels.length > 0 ? 'Priority Level' : 'Urgency'}</Label>
                {customerLevels.length > 0 ? (
                  <select className={inputCls} value={call.priority_level_id ?? ''} disabled={!canEdit}
                    onChange={(e) => void patch({ priority_level_id: e.target.value || null })}>
                    <option value="">—</option>
                    {customerLevels.map((lvl) => <option key={lvl.id} value={lvl.id}>{lvl.code} — {lvl.label}</option>)}
                  </select>
                ) : (
                  <select className={inputCls} value={call.urgency} disabled={!canEdit}
                    onChange={(e) => void patch({ urgency: e.target.value as Urgency })}>
                    {URGENCY_OPTIONS.map((u) => <option key={u} value={u}>{titleCase(u)}</option>)}
                  </select>
                )}
              </div>
              <div>
                <Label>ETA (intake) — currently {formatEta(call.eta_scheduled)}</Label>
                <div className="flex gap-1.5">
                  <input type="date" className={inputCls} value={etaDate} readOnly={!canEdit}
                    onChange={(e) => setEtaDate(e.target.value)}
                    onBlur={() => { if (canEdit) commitEta(etaDate, etaTime) }} />
                  <input type="time" className={inputCls} style={{ maxWidth: '6.5rem' }} value={etaTime}
                    readOnly={!canEdit} disabled={!etaDate} title="Exact time (optional)"
                    onChange={(e) => setEtaTime(e.target.value)}
                    onBlur={() => { if (canEdit) commitEta(etaDate, etaTime) }} />
                </div>
              </div>
              <div>
                <Label>Scheduled Date</Label>
                <input type="date" className={inputCls} defaultValue={calendarDateKey(call.scheduled_date)} readOnly={!canEdit}
                  onBlur={(e) => { if (canEdit) void patch({ scheduled_date: e.target.value ? dateInputToNoonUtc(e.target.value) : null }) }} />
              </div>
              <div>
                <Label>Part Status</Label>
                <select className={inputCls} value={call.part_status} disabled={!canEdit}
                  onChange={(e) => void patch({ part_status: e.target.value as PartStatus })}>
                  {PART_STATUS_OPTIONS.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
                </select>
              </div>
              <div>
                <Label>Proposal Status</Label>
                <select className={inputCls} value={call.proposal_status} disabled={!canEdit}
                  onChange={(e) => void patch({ proposal_status: e.target.value as ProposalStatus })}>
                  {PROPOSAL_STATUS_OPTIONS.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <Label>Next Action (suggested: {titleCase(recommended)})</Label>
                <select className={inputCls} value={call.next_action} disabled={!canEdit}
                  onChange={(e) => void patch({ next_action: e.target.value as NextAction })}>
                  {NEXT_ACTIONS.map((a) => <option key={a} value={a}>{a === 'none' ? 'Auto (use suggestion)' : titleCase(a)}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <Label>Assigned Techs / Vendors</Label>
                <div className="flex flex-wrap gap-1.5">
                  {vendors.filter((v) => v.active).map((v) => {
                    const on = call.vendors.some((x) => x.id === v.id)
                    return (
                      <button key={v.id} type="button" disabled={!canEdit} onClick={() => void toggleVendor(v.id)}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${on ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 ring-1 ring-inset ring-slate-200 hover:ring-slate-300 dark:bg-slate-800 dark:ring-slate-700'}`}>
                        {v.name}
                      </button>
                    )
                  })}
                  {vendors.length === 0 && <span className="text-xs text-slate-400">No techs yet — add them under Manage.</span>}
                </div>
              </div>
              <div>
                <Label>Equipment (from customer records)</Label>
                <select className={inputCls} value={call.asset_id ?? ''} disabled={!canEdit}
                  onChange={(e) => void patch({ asset_id: e.target.value || null })}>
                  <option value="">—</option>
                  {assets
                    .filter((a) => a.customer_id === callCustomerId || a.id === call.asset_id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}{a.asset_type ? ` · ${a.asset_type}` : ''}
                      </option>
                    ))}
                </select>
              </div>
              {(!hiddenBuiltinFields.includes('rack_circuit_case') || call.rack_circuit_case) && (
                <div>
                  <Label>Rack / Circuit / Case</Label>
                  <input className={inputCls} defaultValue={call.rack_circuit_case ?? ''} readOnly={!canEdit}
                    onBlur={(e) => { if (canEdit && e.target.value !== (call.rack_circuit_case ?? '')) void patch({ rack_circuit_case: e.target.value.trim() || null }) }} />
                </div>
              )}
              <div>
                <Label>NTE ($)</Label>
                <input type="number" step="0.01" min="0" className={inputCls} defaultValue={call.nte ?? ''} readOnly={!canEdit}
                  onBlur={(e) => { if (canEdit) void patch({ nte: e.target.value.trim() ? Number(e.target.value) : null }) }} />
              </div>
              <div>
                <Label>Tracking # Link</Label>
                <input type="url" className={inputCls} defaultValue={call.tracking_url ?? ''} readOnly={!canEdit}
                  onBlur={(e) => { if (canEdit && e.target.value !== (call.tracking_url ?? '')) void patch({ tracking_url: e.target.value.trim() || null }) }} />
              </div>
              <div>
                <Label>Internal Job #</Label>
                <input className={inputCls} defaultValue={call.internal_job_number ?? ''} readOnly={!canEdit} placeholder="Job #"
                  onBlur={(e) => { if (canEdit && e.target.value !== (call.internal_job_number ?? '')) void patch({ internal_job_number: e.target.value.trim() || null }) }} />
              </div>
              {formFields.map((f) => (
                <div key={f.id}>
                  <Label>{f.label}</Label>
                  <input className={inputCls} defaultValue={call.custom_fields[f.id] ?? ''} readOnly={!canEdit}
                    onBlur={(e) => {
                      if (!canEdit || e.target.value === (call.custom_fields[f.id] ?? '')) return
                      void patch({ custom_fields: { ...call.custom_fields, [f.id]: e.target.value } })
                    }} />
                </div>
              ))}
              {canEdit && (
                <div className="col-span-2">
                  <Label>Manager Note</Label>
                  <textarea className={inputCls} rows={2} defaultValue={call.manager_note ?? ''}
                    onBlur={(e) => { if (e.target.value !== (call.manager_note ?? '')) void patch({ manager_note: e.target.value.trim() || null }) }} />
                </div>
              )}
            </div>
          )}

          {tab === 'notes' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <select className={inputCls} value={noteCategory} onChange={(e) => setNoteCategory(e.target.value as NoteCategory)}>
                  {NOTE_CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
                </select>
                <textarea className={inputCls} rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add an update…" />
                <button onClick={() => void submitNote()} disabled={savingNote || !noteText.trim()}
                  className="w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                  {savingNote ? 'Saving…' : 'Add Note'}
                </button>
              </div>
              {call.notes.map((n) => (
                <div key={n.id} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
                  <p className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-semibold text-slate-500">{titleCase(n.note_category)} · {n.user?.full_name ?? 'Unknown'}</span>
                    <span>{formatDateTime(n.created_at)}</span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-200">{n.note_text}</p>
                </div>
              ))}
              {call.notes.length === 0 && <p className="py-6 text-center text-xs text-slate-400">No notes yet.</p>}
            </div>
          )}

          {tab === 'activity' && (
            <div className="space-y-2">
              {call.activity.map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-2 text-xs dark:bg-slate-800/60">
                  <span className="text-slate-600 dark:text-slate-300">
                    <b>{titleCase(a.activity_type)}</b>
                    {a.previous_value || a.new_value
                      ? <> — {a.previous_value ? `${titleCase(String(a.previous_value)).slice(0, 24)} → ` : ''}{a.new_value ? titleCase(String(a.new_value)).slice(0, 24) : '—'}</>
                      : null}
                  </span>
                  <span className="whitespace-nowrap text-[11px] text-slate-400">{formatDateTime(a.created_at)}</span>
                </div>
              ))}
              {call.activity.length === 0 && <p className="py-6 text-center text-xs text-slate-400">No activity yet.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
