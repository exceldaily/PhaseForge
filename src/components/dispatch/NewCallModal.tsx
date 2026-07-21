'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type {
  CallStatus, Customer, DispatchAsset, DispatchFormField, PartStatus, PriorityLevel,
  ProposalStatus, Store, Urgency, Vendor,
} from '@/lib/dispatch/types'
import { dateInputToNoonUtc, etaInputToIso, titleCase } from '@/lib/dispatch/utils'
import {
  addFormField, createCustomer, createServiceCall, createStore, removeFormField,
  setBuiltinFieldHidden,
} from '@/app/app/dispatch/actions'

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

export function NewCallModal({ stores, vendors, customers, assets, priorityLevels, formFields, hiddenBuiltinFields, canEdit, onClose, onCreated }: {
  stores: Store[]
  vendors: Vendor[]
  customers: Customer[]
  assets: DispatchAsset[]
  priorityLevels: PriorityLevel[]
  formFields: DispatchFormField[]
  hiddenBuiltinFields: string[]
  canEdit: boolean
  onClose: () => void
  onCreated: () => void
}) {
  // Local mirrors so inline-created customers/stores appear without a reload.
  const [customerList, setCustomerList] = useState<Customer[]>(customers)
  const [storeList, setStoreList] = useState<Store[]>(stores)
  const [customerId, setCustomerId] = useState('')
  const [storeId, setStoreId] = useState('')
  const [assetId, setAssetId] = useState('')
  const [addingCustomer, setAddingCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [addingStore, setAddingStore] = useState(false)
  const [newStoreNum, setNewStoreNum] = useState('')
  const [newStoreName, setNewStoreName] = useState('')
  const [callNumber, setCallNumber] = useState('')
  const [trackingUrl, setTrackingUrl] = useState('')
  const [jobNumber, setJobNumber] = useState('')
  const [urgency, setUrgency] = useState<Urgency>('normal')
  const [priorityLevelId, setPriorityLevelId] = useState('')
  const [status, setStatus] = useState<CallStatus>('open')
  const [dateStarted, setDateStarted] = useState(new Date().toISOString().slice(0, 10))
  const [eta, setEta] = useState('')
  const [etaTime, setEtaTime] = useState('')
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
  // Local mirrors so added/removed fields show immediately inside the open modal.
  const [fields, setFields] = useState<DispatchFormField[]>(formFields)
  const [hiddenBuiltin, setHiddenBuiltin] = useState<string[]>(hiddenBuiltinFields)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedStore = storeList.find((s) => s.id === storeId)
  // Customer drives the store list, priority scale, and equipment picker.
  const effectiveCustomerId = customerId || selectedStore?.customer_id || ''
  const visibleStores = customerId ? storeList.filter((s) => s.customer_id === customerId) : storeList
  const customerAssets = assets.filter((a) => a.customer_id === effectiveCustomerId && a.status !== 'retired')
  const customerLevels = priorityLevels
    .filter((p) => p.customer_id === effectiveCustomerId)
    .sort((a, b) => a.sort_order - b.sort_order)

  function handleCustomerChange(newCustomerId: string) {
    setCustomerId(newCustomerId)
    // Keep the store only if it belongs to the newly chosen customer — a store
    // is optional, so never auto-pick one the dispatcher didn't choose.
    const stillValid = storeList.some((s) => s.id === storeId && (!newCustomerId || s.customer_id === newCustomerId))
    if (!stillValid) setStoreId('')
    setAssetId('')
    setPriorityLevelId('')
  }

  function handleStoreChange(newStoreId: string) {
    setStoreId(newStoreId)
    const nextCustomerId = customerId || storeList.find((s) => s.id === newStoreId)?.customer_id
    if (!priorityLevels.some((p) => p.id === priorityLevelId && p.customer_id === nextCustomerId)) {
      setPriorityLevelId('')
    }
    setAssetId('')
  }

  async function handleAddCustomer() {
    const name = newCustomerName.trim()
    if (!name) return
    const res = await createCustomer(name)
    if ('error' in res && res.error) { setError(res.error); return }
    if ('id' in res && res.id) {
      setCustomerList((l) => [...l, { id: res.id!, company_id: '', name, created_at: new Date().toISOString() }])
      setCustomerId(res.id)
      setStoreId('')
    }
    setNewCustomerName('')
    setAddingCustomer(false)
  }

  async function handleAddStore() {
    const num = newStoreNum.trim(); const name = newStoreName.trim()
    if (!num || !name) { setError('Store number and name are required.'); return }
    const res = await createStore({ store_number: num, store_name: name, customer_id: customerId || null })
    if ('error' in res && res.error) { setError(res.error); return }
    if ('id' in res && res.id) {
      const store: Store = {
        id: res.id, company_id: '', customer_id: customerId || null,
        store_number: num, store_name: name, address: null, city: null, state: null,
        main_tech_id: null, store_manager: null, district_manager: null,
        google_maps_url: null, notes: null, created_at: new Date().toISOString(),
      }
      setStoreList((l) => [...l, store])
      setStoreId(res.id)
    }
    setNewStoreNum(''); setNewStoreName('')
    setAddingStore(false)
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

  // Built-in optional fields (rack/circuit/case) hide and restore per org,
  // same feel as the custom fields.
  async function setRackHidden(hidden: boolean) {
    if (hidden && !confirm('Remove Rack / Circuit / Case from your call forms? You can bring it back anytime with the + button below.')) return
    const res = await setBuiltinFieldHidden('rack_circuit_case', hidden)
    if ('error' in res && res.error) { setError(res.error); return }
    setHiddenBuiltin((h) => (hidden ? [...h, 'rack_circuit_case'] : h.filter((f) => f !== 'rack_circuit_case')))
    if (hidden) setRack('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!callNumber.trim() || !description.trim() || (!storeId && !effectiveCustomerId)) {
      setError('Service call #, description, and a customer or store are required.')
      return
    }
    if (customerLevels.length > 0 && !priorityLevelId) {
      setError('Choose a priority level for this customer.')
      return
    }
    setSaving(true)
    const cleanCustom = Object.fromEntries(
      Object.entries(customValues).filter(([id, v]) => v.trim() && fields.some((f) => f.id === id)),
    )
    const res = await createServiceCall({
      store_id: storeId || null,
      customer_id: effectiveCustomerId || null,
      service_call_number: callNumber.trim(),
      tracking_url: trackingUrl.trim() || null,
      internal_job_number: jobNumber.trim() || null,
      urgency,
      priority_level_id: priorityLevelId || null,
      status,
      date_started: new Date(dateStarted).toISOString(),
      eta_scheduled: eta ? etaInputToIso(eta, etaTime || null) : null,
      scheduled_date: scheduledDate ? dateInputToNoonUtc(scheduledDate) : null,
      rack_circuit_case: rack.trim() || null,
      asset_id: assetId || null,
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
            <SectionLabel>Customer / Store</SectionLabel>
            <div>
              <FieldLabel>
                Customer
                {canEdit && !addingCustomer && (
                  <button type="button" onClick={() => setAddingCustomer(true)}
                    className="ml-1.5 font-semibold text-indigo-500 hover:text-indigo-700 normal-case">+ new</button>
                )}
              </FieldLabel>
              {addingCustomer ? (
                <div className="flex gap-1.5">
                  <input autoFocus className={inputCls} value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAddCustomer() } }}
                    placeholder="Customer name…" />
                  <button type="button" onClick={() => void handleAddCustomer()}
                    className="rounded-md bg-indigo-600 px-2.5 text-xs font-medium text-white">Add</button>
                  <button type="button" onClick={() => setAddingCustomer(false)} className="px-1 text-xs text-slate-400">✕</button>
                </div>
              ) : (
                <select className={inputCls} value={customerId} onChange={(e) => handleCustomerChange(e.target.value)}>
                  <option value="">Any customer</option>
                  {customerList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>
            <div>
              <FieldLabel>
                Store / Location
                {canEdit && !addingStore && (
                  <button type="button" onClick={() => setAddingStore(true)}
                    className="ml-1.5 font-semibold text-indigo-500 hover:text-indigo-700 normal-case">+ new</button>
                )}
              </FieldLabel>
              {addingStore ? (
                <div className="flex gap-1.5">
                  <input autoFocus className={inputCls} value={newStoreNum} style={{ maxWidth: '5.5rem' }}
                    onChange={(e) => setNewStoreNum(e.target.value)} placeholder="Store #" />
                  <input className={inputCls} value={newStoreName}
                    onChange={(e) => setNewStoreName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAddStore() } }}
                    placeholder="Store name…" />
                  <button type="button" onClick={() => void handleAddStore()}
                    className="rounded-md bg-indigo-600 px-2.5 text-xs font-medium text-white">Add</button>
                  <button type="button" onClick={() => setAddingStore(false)} className="px-1 text-xs text-slate-400">✕</button>
                </div>
              ) : (
                <select className={inputCls} value={storeId} onChange={(e) => handleStoreChange(e.target.value)}>
                  <option value="">No store (customer only)</option>
                  {visibleStores.map((s) => (
                    <option key={s.id} value={s.id}>#{s.store_number} — {s.store_name}</option>
                  ))}
                </select>
              )}
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
            <div />


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
              <div className="flex gap-1.5">
                <input type="date" className={inputCls} value={eta} onChange={(e) => setEta(e.target.value)} />
                <input type="time" className={inputCls} style={{ maxWidth: '7.5rem' }} value={etaTime}
                  onChange={(e) => setEtaTime(e.target.value)} disabled={!eta} title="Exact time (optional)" />
              </div>
            </div>
            <div>
              <FieldLabel>Scheduled Date (optional)</FieldLabel>
              <input type="date" className={inputCls} value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
            </div>
            <div>
              <FieldLabel>Equipment (from customer records)</FieldLabel>
              <select className={inputCls} value={assetId} onChange={(e) => setAssetId(e.target.value)}
                disabled={customerAssets.length === 0}>
                <option value="">
                  {customerAssets.length === 0
                    ? (effectiveCustomerId ? 'No equipment on file for this customer' : 'Pick a customer first')
                    : 'Select the unit having issues…'}
                </option>
                {customerAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}{a.asset_type ? ` · ${a.asset_type}` : ''}{a.make || a.model ? ` (${[a.make, a.model].filter(Boolean).join(' ')})` : ''}
                  </option>
                ))}
              </select>
            </div>
            {!hiddenBuiltin.includes('rack_circuit_case') && (
              <div className="group relative">
                <FieldLabel>
                  Rack / Circuit / Case
                  {canEdit && (
                    <button type="button" title="Remove this field from your call forms"
                      onClick={() => void setRackHidden(true)}
                      className="ml-1.5 hidden text-rose-400 hover:text-rose-600 group-hover:inline pointer-coarse:inline">
                      <X size={10} className="inline" />
                    </button>
                  )}
                </FieldLabel>
                <input className={inputCls} value={rack} onChange={(e) => setRack(e.target.value)} placeholder="e.g. Rack 3 - Dairy" />
              </div>
            )}
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
            {(fields.length > 0 || canEdit) && (
              <>
                <SectionLabel>Custom Fields</SectionLabel>
                {canEdit && (
                  <p className="sm:col-span-2 -mt-1.5 text-[11px] leading-snug text-slate-400">
                    Extra blanks your org wants on every call card, like PO #, gate code, or
                    landlord contact. Add or remove them here or under Manage &gt; Card Fields.
                  </p>
                )}
              </>
            )}
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
              <div className="flex flex-wrap items-end gap-1.5">
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
                  <>
                    <button type="button" onClick={() => setAddingField(true)}
                      className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-2.5 py-1.5 text-xs text-slate-400 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-600">
                      <Plus size={12} /> Add a field
                    </button>
                    {hiddenBuiltin.includes('rack_circuit_case') && (
                      <button type="button" onClick={() => void setRackHidden(false)}
                        title="Bring the built-in Rack / Circuit / Case field back"
                        className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-2.5 py-1.5 text-xs text-slate-400 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-600">
                        <Plus size={12} /> Rack / Circuit / Case
                      </button>
                    )}
                  </>
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
