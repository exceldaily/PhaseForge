'use client'

// Add or edit a store. Used from the directory and from the store profile.

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { saveStore, saveTech, type StoreInput } from '@/app/app/pm/actions'
import { SYSTEM_LABEL, SYSTEM_TYPES, type PmStore, type PmTech } from '@/lib/pm/types'
import { ErrorNote, Field, fieldCls } from './ui'

const blank: StoreInput = { storeNumber: '', state: 'FL', isActive: true }

export function toInput(s: PmStore): StoreInput {
  return {
    id: s.id, storeNumber: s.storeNumber, address: s.address, city: s.city, county: s.county, state: s.state, postalCode: s.postalCode,
    region: s.region, facilityManager: s.facilityManager, fmPhone: s.fmPhone, fmEmail: s.fmEmail, storePhone: s.storePhone, contactNotes: s.contactNotes,
    primaryTechId: s.primaryTechId, secondaryTechId: s.secondaryTechId, systemType: s.systemType, refrigerant: s.refrigerant, notes: s.notes, isActive: s.isActive,
  }
}

export function StoreFormModal({ store, techs, onClose, onSaved }: {
  store: PmStore | null; techs: PmTech[]; onClose: () => void; onSaved: (id: string) => void
}) {
  const [form, setForm] = useState<StoreInput>(store ? toInput(store) : blank)
  const [list, setList] = useState(techs)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<StoreInput>) => setForm((f) => ({ ...f, ...patch }))
  const text = (k: keyof StoreInput, placeholder?: string) => (
    <input value={(form[k] as string | null | undefined) ?? ''} onChange={(e) => set({ [k]: e.target.value })} placeholder={placeholder} className={fieldCls} />
  )

  const save = async () => {
    setBusy(true); setError(null)
    const res = await saveStore(form)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    onSaved(res.id)
  }

  // Type a name that is not on the list yet and it becomes a technician.
  const addTech = async (which: 'primaryTechId' | 'secondaryTechId') => {
    const name = window.prompt('Technician name')?.trim()
    if (!name) return
    const res = await saveTech({ name })
    if (!res.ok) { setError(res.error); return }
    setList((cur) => [...cur, { id: res.id, name, profileId: null, employeeId: null, phone: null, email: null, isActive: true }].sort((a, b) => a.name.localeCompare(b.name)))
    set({ [which]: res.id })
  }
  const techSelect = (which: 'primaryTechId' | 'secondaryTechId') => (
    <div className="flex gap-1.5">
      <select value={form[which] ?? ''} onChange={(e) => set({ [which]: e.target.value || null })} className={fieldCls}>
        <option value="">Not assigned</option>
        {list.filter((t) => t.isActive || t.id === form[which]).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <button type="button" onClick={() => addTech(which)} className="shrink-0 rounded-lg border border-slate-300 px-2 text-xs font-medium text-slate-600 hover:border-indigo-300">New</button>
    </div>
  )

  return (
    <Modal open onClose={onClose} title={store ? `Edit store ${store.storeNumber}` : 'Add a store'} size="lg">
      <form className="-m-1 max-h-[70vh] space-y-4 overflow-y-auto p-1" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Store number">{text('storeNumber', '474-026')}</Field>
          <Field label="Region">{text('region')}</Field>
          <Field label="Status">
            <select value={form.isActive === false ? 'no' : 'yes'} onChange={(e) => set({ isActive: e.target.value === 'yes' })} className={fieldCls}>
              <option value="yes">Active</option><option value="no">Inactive</option>
            </select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-6">
          <Field label="Street address" className="sm:col-span-6">{text('address')}</Field>
          <Field label="City" className="sm:col-span-2">{text('city')}</Field>
          <Field label="County" className="sm:col-span-2">{text('county')}</Field>
          <Field label="State" className="sm:col-span-1">{text('state')}</Field>
          <Field label="ZIP" className="sm:col-span-1">{text('postalCode')}</Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="ALDI facility manager">{text('facilityManager')}</Field>
          <Field label="FM phone">{text('fmPhone')}</Field>
          <Field label="FM email">{text('fmEmail')}</Field>
          <Field label="Store phone">{text('storePhone')}</Field>
          <Field label="Other contact info" className="sm:col-span-2">{text('contactNotes', 'Store manager, gate codes, hours')}</Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Primary technician">{techSelect('primaryTechId')}</Field>
          <Field label="Secondary technician (optional)">{techSelect('secondaryTechId')}</Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Refrigeration system" hint="Decides which checklist items apply. Leave as Not recorded and nothing is hidden.">
            <select value={form.systemType ?? ''} onChange={(e) => set({ systemType: e.target.value || null })} className={fieldCls}>
              <option value="">Not recorded</option>
              {SYSTEM_TYPES.map((s) => <option key={s} value={s}>{SYSTEM_LABEL[s]}</option>)}
            </select>
          </Field>
          <Field label="Refrigerant" hint="For example R-448A or R-744.">{text('refrigerant')}</Field>
        </div>
        <Field label="Store notes">
          <textarea rows={3} value={form.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} className={fieldCls} />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" loading={busy}>{store ? 'Save' : 'Add store'}</Button>
        </div>
      </form>
    </Modal>
  )
}
