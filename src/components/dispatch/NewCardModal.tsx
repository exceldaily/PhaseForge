'use client'

import { useRef, useState, useTransition } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { DispatchBoard, DispatchColumn, DispatchCard, DispatchVendor, Profile } from '@/types/app'
import { createDispatchCard, createDispatchVendor } from '@/app/app/dispatch/actions'
import { DispatchCardFieldConfig, getVisibleDispatchCardFields } from '@/lib/dispatchFields'

interface Props {
  open: boolean
  board: DispatchBoard
  boardId: string
  columnId: string | null
  columns: DispatchColumn[]
  vendors: DispatchVendor[]
  members: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'>[]
  onClose: () => void
  onCreated: (card: DispatchCard) => void
}

type CardForm = Record<string, string | boolean>

const initialForm: CardForm = {
  store: '',
  urgency: 'medium',
  sc_number: '',
  kalos_job_number: '',
  description: '',
  date_started: '',
  eta_scheduled: '',
  rack_circuit_case: '',
  part_ordered: false,
  who_ordered: '',
  notes: '',
  assigned_to: '',
  vendor_id: '',
  vendor_email: '',
  needs_review: false,
  alert_at: '',
  alert_note: '',
}

export function NewCardModal({ open, board, boardId, columnId, columns, vendors, members, onClose, onCreated }: Props) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<CardForm>(initialForm)
  const [selectedColumn, setSelectedColumn] = useState(columnId ?? '')
  const [error, setError] = useState('')
  const [localVendors, setLocalVendors] = useState<DispatchVendor[]>(vendors)

  const visibleFields = getVisibleDispatchCardFields(board)
  const effectiveColumn = selectedColumn || columnId || columns[0]?.id || ''

  const set = (key: string, value: string | boolean) => setForm(prev => ({ ...prev, [key]: value }))

  const handleClose = () => {
    setForm(initialForm)
    setSelectedColumn('')
    setError('')
    onClose()
  }

  const handleSubmit = () => {
    setError('')
    const fd = new FormData()
    fd.set('boardId', boardId)
    fd.set('columnId', effectiveColumn)

    for (const field of visibleFields) {
      fd.set(field.key, String(form[field.key] ?? ''))
    }

    startTransition(async () => {
      const result = await createDispatchCard(fd)
      if (result.error) {
        setError(result.error)
        return
      }

      const newCard: DispatchCard = {
        id: result.cardId!,
        company_id: '',
        board_id: boardId,
        column_id: effectiveColumn || null,
        store: String(form.store || '') || null,
        urgency: String(form.urgency || 'medium') as DispatchCard['urgency'],
        date_started: String(form.date_started || '') || null,
        sc_number: String(form.sc_number || '') || null,
        kalos_job_number: String(form.kalos_job_number || '') || null,
        card_links: {},
        eta_scheduled: String(form.eta_scheduled || '') || null,
        rack_circuit_case: String(form.rack_circuit_case || '') || null,
        description: String(form.description || '') || null,
        part_ordered: Boolean(form.part_ordered),
        who_ordered: String(form.who_ordered || '') || null,
        notes: String(form.notes || '') || null,
        assigned_to: String(form.assigned_to || '') || null,
        vendor_id: String(form.vendor_id || '') || null,
        vendor_email: String(form.vendor_email || '') || null,
        gmail_thread_id: null,
        last_gmail_msg_id: null,
        last_email_date: null,
        email_sender: null,
        email_subject: null,
        needs_review: Boolean(form.needs_review),
        alert_at: form.alert_at ? new Date(String(form.alert_at)).toISOString() : null,
        alert_note: String(form.alert_note || '') || null,
        source: 'manual',
        closed_at: null,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        vendor: localVendors.find(v => v.id === form.vendor_id),
        assigned_profile: members.find(m => m.id === form.assigned_to) as DispatchCard['assigned_profile'],
      }
      onCreated(newCard)
      handleClose()
    })
  }

  return (
    <Modal open={open} onClose={handleClose} title="New Card" size="lg">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Column</label>
          <select
            value={effectiveColumn}
            onChange={e => setSelectedColumn(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-white"
          >
            {columns.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visibleFields.map(field => (
            <CardFieldInput
              key={field.key}
              field={field}
              value={form[field.key] ?? ''}
              set={set}
              vendors={localVendors}
              onVendorAdded={v => { setLocalVendors(prev => [...prev, v]); set('vendor_id', v.id) }}
              members={members}
            />
          ))}
        </div>

        {/* Alert */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Alert time (optional)</label>
            <input type="datetime-local" value={String(form.alert_at ?? '')} onChange={e => set('alert_at', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Alert note</label>
            <input type="text" value={String(form.alert_note ?? '')} onChange={e => set('alert_note', e.target.value)}
              placeholder="e.g. Follow up with vendor"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-white" />
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={handleClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSubmit} loading={isPending}>Create Card</Button>
        </div>
      </div>
    </Modal>
  )
}

function CardFieldInput({
  field, value, set, vendors, onVendorAdded, members,
}: {
  field: DispatchCardFieldConfig
  value: string | boolean
  set: (key: string, value: string | boolean) => void
  vendors: DispatchVendor[]
  onVendorAdded: (v: DispatchVendor) => void
  members: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'>[]
}) {
  const [addingVendor, setAddingVendor] = useState(false)
  const [newVendorName, setNewVendorName] = useState('')
  const [vendorSaving, setVendorSaving] = useState(false)
  const vendorInputRef = useRef<HTMLInputElement>(null)
  const baseClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-white'

  if (field.key === 'description' || field.key === 'notes') {
    return (
      <div className="sm:col-span-2">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{field.label}</label>
        <textarea
          rows={3}
          className={`${baseClass} resize-none`}
          value={String(value)}
          onChange={e => set(field.key, e.target.value)}
        />
      </div>
    )
  }

  if (field.key === 'urgency') {
    return (
      <FieldWrap label={field.label}>
        <select value={String(value)} onChange={e => set(field.key, e.target.value)} className={baseClass}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </FieldWrap>
    )
  }

  if (field.key === 'assigned_to') {
    return (
      <FieldWrap label={field.label}>
        <select value={String(value)} onChange={e => set(field.key, e.target.value)} className={baseClass}>
          <option value="">Unassigned</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
      </FieldWrap>
    )
  }

  if (field.key === 'vendor_id') {
    const confirmNewVendor = async () => {
      const name = newVendorName.trim()
      if (!name) { setAddingVendor(false); return }
      setVendorSaving(true)
      const fd = new FormData(); fd.set('name', name)
      const res = await createDispatchVendor(fd)
      setVendorSaving(false)
      if (res.error || !res.vendor) { setAddingVendor(false); setNewVendorName(''); return }
      onVendorAdded(res.vendor as DispatchVendor)
      setAddingVendor(false)
      setNewVendorName('')
    }
    return (
      <FieldWrap label={field.label}>
        {addingVendor ? (
          <div className="flex gap-1.5">
            <input
              ref={vendorInputRef}
              autoFocus
              type="text"
              placeholder="Vendor name"
              value={newVendorName}
              onChange={e => setNewVendorName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmNewVendor(); if (e.key === 'Escape') { setAddingVendor(false); setNewVendorName('') } }}
              className={baseClass}
              disabled={vendorSaving}
            />
            <button onClick={confirmNewVendor} disabled={vendorSaving || !newVendorName.trim()} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap">
              {vendorSaving ? '…' : 'Add'}
            </button>
            <button onClick={() => { setAddingVendor(false); setNewVendorName('') }} className="px-2 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50">✕</button>
          </div>
        ) : (
          <select
            value={String(value)}
            onChange={e => {
              if (e.target.value === '__new__') { setAddingVendor(true); return }
              set(field.key, e.target.value)
            }}
            className={baseClass}
          >
            <option value="">None</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            <option value="__new__">+ Add new vendor…</option>
          </select>
        )}
      </FieldWrap>
    )
  }

  if (field.key === 'part_ordered' || field.key === 'needs_review') {
    return (
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={e => set(field.key, e.target.checked)}
          className="rounded"
        />
        {field.label}
      </label>
    )
  }

  const inputType = field.key === 'date_started' ? 'date' : field.key === 'eta_scheduled' ? 'datetime-local' : field.key === 'vendor_email' ? 'email' : 'text'

  return (
    <FieldWrap label={field.label}>
      <input
        type={inputType}
        value={String(value)}
        onChange={e => set(field.key, e.target.value)}
        className={baseClass}
      />
    </FieldWrap>
  )
}

function FieldWrap({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</label>
      {children}
    </div>
  )
}
