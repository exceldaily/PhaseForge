'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type {
  CallStatus, DispatchFormField, PartStatus, PriorityLevel, ProposalStatus, Store, Urgency, Vendor,
} from '@/lib/dispatch/types'
import { dateInputToNoonUtc, titleCase } from '@/lib/dispatch/utils'
import { addFormField, createServiceCall, removeFormField } from '@/app/app/dispatch/actions'

const URGENCY_OPTIONS: Urgency[] = ['urgent', 'high', 'normal', 'low']
// Quote/proposal states live only in the Proposal Status field, not here.
const STATUS_OPTIONS: CallStatus[] = [
  'open', 'in_progress', 'awaiting_repair', 'incomplete', 'recall', 'parts_on_order',
  'part_received', 'partially_delivered', 'completed', 'cancelled',
]
const PART_STATUS_OPTIONS: PartStatus[] = ['none', 'part_needed', 'ordered', 'received', 'partially_delivered', 'installed']
const PROPOSAL_STATUS_OPTIONS: ProposalStatus[] = ['none', 'quote_requested', 'sent', 'approved', 'parts_received', 'rejected']

const inputCls = 'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{children}</label>
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="sm:col-span-2 mt-1 flex items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">{children}</span>
      <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
    </div>
  )
}

export function NewCallModal({ stores, vendors, priorityLevels, formFields, canEdit, onClose, onCreated }: {
  stores: Store[]
  vendors: Vendor[]
  priorityLevels: PriorityLevel[]
  formFields: DispatchFormField[]
  canEdit: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? '')
  const [callNumber, setCallNumber] = useState('')
  const [trackingUrl, setTrackingUrl] = useState('')
  const [jobNumber, setJobNumber] = useState('')
  const [jobUrl, setJobUrl] = useState('')
  const [urgency, setUrgency] = useState<Urgency>('normal')
  const [priorityLevelId, setPriorityLevelId] = useState('')
  const [status, setStatus] = useState<CallStatus>('open')
  const [dateStarted, setDateStarted] = useState(new Date().toISOString().slice(0, 10))
  const [eta, setEta] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [rack, setRack] = useState('')
  const [nte, setNte] = useState('')
  const [description, setDescription] = useState('')
  const [managerNote, setManagerNote] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [partStatus, setPartStatus] = useState<PartStatus>('none')
  const [proposalStatus, setProposalStatus] = useState<ProposalStatus>('none')
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [addingField, setAddingField] = useState(false)
  // Local mirror so added/removed fields show immediately inside the open modal.
  const [fields, setFields] = useState<DispatchFormField[]>(formFields)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedStore = stores.find((s) => s.id === storeId)
  const customerLevels = priorityLevels
    .filter((p) => p.customer_id === selectedStore?.customer_id)
    .sort((a, b) => a.sort_order - b.sort_order)

  function handleStoreChange(newStoreId: string) {
    setStoreId(newStoreId)
    const newCustomerId = stores.find((s) => s.id === newStoreId)?.customer_id
    if (!priorityLevels.some((p) => p.id === priorityLevelId && p.customer_id === newCustomerId)) {
      setPriorityLevelId('')
    }
  }

  async function handleAddField() {
    const label = newFieldLabel.trim()
    if (!label) return
    const res = await addFormField(label)
    if ('error' in res && res.error) { setError(res.error); return }
    if ('id' in res && res.id) {
      setFields((f) => [...f, {
        id: res.id!, company_id: '', label, sort_order: f.length, is_active: true,
        created_at: new Date().toISOString(),
      }])
    }
    setNewFieldLabel('')
    setAddingField(false)
  }

  async function handleRemoveField(id: string) {
    if (!confirm('Remove this field from the call card? Values already saved on calls are kept.')) return
    const res = await removeFormField(id)
    if ('error' in res && res.error) { setError(res.error); return }
    setFields((f) => f.filter((x) => x.id !== id))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!storeId || !callNumber.trim() || !description.trim()) {
      setError('Store, service call #, and description are required.')
      return
    }
    if (customerLevels.length > 0 && !priorityLevelId) {
      setError("Choose a priority level for this store's customer.")
      return
    }
    setSaving(true)
    const cleanCustom = Object.fromEntries(
      Object.entries(customValues).filter(([id, v]) => v.trim() && fields.some((f) => f.id === id)),
    )
    const res = await createServiceCall({
      store_id: storeId,
      service_call_number: callNumber.trim(),
      tracking_url: trackingUrl.trim() || null,
      internal_job_number: jobNumber.trim() || null,
      internal_job_url: jobUrl.trim() || null,
      urgency,
      priority_level_id: priorityLevelId || null,
      status,
      date_started: new Date(dateStarted).toISOString(),
      eta_scheduled: eta ? dateInputToNoonUtc(eta) : null,
      scheduled_date: scheduledDate ? dateInputToNoonUtc(scheduledDate) : null,
      rack_circuit_case: rack.trim() || null,
      nte: nte.trim() ? Number(nte) : null,
      description: description.trim(),
      manager_note: managerNote.trim() || null,
      assigned_vendor_id: vendorId || null,
      part_status: partStatus,
      proposal_status: proposalStatus,
      custom_fields: cleanCustom,
    })
    setSaving(false)
    if ('error' in res && res.error) setError(res.error)
    else onCreated()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onClick={onClose}>
      <div className="mt-4 w-full max-w-xl rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">New Service Call</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FieldLabel>Store</FieldLabel>
              <select className={inputCls} value={storeId} onChange={(e) => handleStoreChange(e.target.value)}>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>#{s.store_number} — {s.store_name}</option>
                ))}
              </select>
            </div>

            <SectionLabel>External</SectionLabel>
            <div>
              <FieldLabel>Service Call #</FieldLabel>
              <input className={inputCls} value={callNumber} onChange={(e) => setCallNumber(e.target.value)} placeholder="SC-20481" />
            </div>
            <div>
              <FieldLabel>Tracking # Link (URL, optional)</FieldLabel>
              <input type="url" className={inputCls} value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="https://…" />
            </div>

            <SectionLabel>Internal</SectionLabel>
            <div>
              <FieldLabel>Internal Job #</FieldLabel>
              <input className={inputCls} value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <FieldLabel>Job # Link (URL, optional)</FieldLabel>
              <input type="url" className={inputCls} value={jobUrl} onChange={(e) => setJobUrl(e.target.value)} placeholder="https://…" />
            </div>

            <SectionLabel>Details</SectionLabel>
            <div>
              <FieldLabel>Date Started</FieldLabel>
              <input type="date" className={inputCls} value={dateStarted} onChange={(e) => setDateStarted(e.target.value)} />
            </div>
            <div>
              <FieldLabel>{customerLevels.length > 0 ? 'Priority Level' : 'Urgency'}</FieldLabel>
              {customerLevels.length > 0 ? (
                <select className={inputCls} value={priorityLevelId} onChange={(e) => setPriorityLevelId(e.target.value)}>
                  <option value="" disabled>Select priority level…</option>
                  {customerLevels.map((lvl) => (
                    <option key={lvl.id} value={lvl.id}>{lvl.code} — {lvl.label}</option>
                  ))}
                </select>
              ) : (
                <select className={inputCls} value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)}>
                  {URGENCY_OPTIONS.map((u) => <option key={u} value={u}>{titleCase(u)}</option>)}
                </select>
              )}
            </div>
            <div>
              <FieldLabel>Workorder Status</FieldLabel>
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as CallStatus)}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>Assigned Tech / Vendor</FieldLabel>
              <select className={inputCls} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">Unassigned</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}{v.company ? ` (${v.company})` : ''}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>ETA (from call intake)</FieldLabel>
              <input type="date" className={inputCls} value={eta} onChange={(e) => setEta(e.target.value)} />
            </div>
            <div>
              <FieldLabel>Scheduled Date (optional)</FieldLabel>
              <input type="date" className={inputCls} value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
            </div>
            <div>
              <FieldLabel>Rack / Circuit / Case</FieldLabel>
              <input className={inputCls} value={rack} onChange={(e) => setRack(e.target.value)} placeholder="e.g. Rack 3 - Dairy" />
            </div>
            <div>
              <FieldLabel>NTE ($, optional)</FieldLabel>
              <input type="number" step="0.01" min="0" className={inputCls} value={nte} onChange={(e) => setNte(e.target.value)} placeholder="Not to exceed" />
            </div>
            <div>
              <FieldLabel>Part Status</FieldLabel>
              <select className={inputCls} value={partStatus} onChange={(e) => setPartStatus(e.target.value as PartStatus)}>
                {PART_STATUS_OPTIONS.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>Proposal Status</FieldLabel>
              <select className={inputCls} value={proposalStatus} onChange={(e) => setProposalStatus(e.target.value as ProposalStatus)}>
                {PROPOSAL_STATUS_OPTIONS.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
              </select>
            </div>

            {/* ── Org custom fields: fillable blanks, addable/removable ── */}
            {(fields.length > 0 || canEdit) && <SectionLabel>Your Fields</SectionLabel>}
            {fields.map((f) => (
              <div key={f.id} className="group relative">
                <FieldLabel>
                  {f.label}
                  {canEdit && (
                    <button type="button" title="Remove this field from the card"
                      onClick={() => handleRemoveField(f.id)}
                      className="ml-1.5 hidden text-rose-400 hover:text-rose-600 group-hover:inline pointer-coarse:inline">
                      <X size={10} className="inline" />
                    </button>
                  )}
                </FieldLabel>
                <input className={inputCls} value={customValues[f.id] ?? ''}
                  onChange={(e) => setCustomValues((v) => ({ ...v, [f.id]: e.target.value }))} />
              </div>
            ))}
            {canEdit && (
              <div className="flex items-end">
                {addingField ? (
                  <div className="flex w-full gap-1.5">
                    <input autoFocus className={inputCls} value={newFieldLabel}
                      onChange={(e) => setNewFieldLabel(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAddField() } }}
                      placeholder="New field name…" />
                    <button type="button" onClick={() => void handleAddField()}
                      className="rounded-md bg-indigo-600 px-2.5 text-xs font-medium text-white">Add</button>
                    <button type="button" onClick={() => setAddingField(false)} className="px-1 text-xs text-slate-400">✕</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setAddingField(true)}
                    className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-2.5 py-1.5 text-xs text-slate-400 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-600">
                    <Plus size={12} /> Add a field
                  </button>
                )}
              </div>
            )}

            <div className="sm:col-span-2">
              <FieldLabel>Manager Note</FieldLabel>
              <textarea className={inputCls} rows={2} value={managerNote}
                onChange={(e) => setManagerNote(e.target.value)}
                placeholder="Special handling, manager context, or quick detail…" />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel>Description</FieldLabel>
              <textarea className={inputCls} rows={3} value={description}
                onChange={(e) => setDescription(e.target.value)} placeholder="What's wrong, what's needed…" />
            </div>
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <button type="submit" disabled={saving}
            className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create Call'}
          </button>
        </form>
      </div>
    </div>
  )
}
