'use client'

// Filters and parts for one PM. A technician asks for what they need and
// marks it installed when it arrives; a coordinator carries each request
// through approval, ordering, and delivery.

import { useState } from 'react'
import { ChevronDown, Package, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { deleteMaterial, saveMaterial, setMaterialStatus, type MaterialInput } from '@/app/app/pm/workActions'
import { fmtDate } from '@/lib/pm/quarters'
import {
  MATERIAL_CATEGORY_LABEL, MATERIAL_OPEN, MATERIAL_STATUSES, MATERIAL_STATUS_LABEL, MATERIAL_TONE,
  type MaterialCategory, type MaterialStatus, type PmEquipment, type PmMaterial,
} from '@/lib/pm/types'
import { ErrorNote, Field, fieldCls } from './ui'

const blank = { name: '', partNumber: '', quantity: '1', unitLabel: '', category: 'filter' as MaterialCategory, notes: '' }

export function MaterialsPanel({ pmId, materials, onChange, canWork, canCoordinate, userId, equipment, names, today, itemId, big }: {
  pmId: string
  materials: PmMaterial[]
  onChange: (next: PmMaterial[]) => void
  /** May request and mark installed. */
  canWork: boolean
  /** May approve, order, receive, edit, and delete. */
  canCoordinate: boolean
  userId: string
  equipment: PmEquipment[]
  names: Record<string, string>
  today: string
  /** Request raised from a particular check. */
  itemId?: string | null
  /** Phone sized touch targets. */
  big?: boolean
}) {
  const [form, setForm] = useState<typeof blank | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const put = (m: PmMaterial) => onChange(materials.some((x) => x.id === m.id) ? materials.map((x) => (x.id === m.id ? m : x)) : [...materials, m])

  const request = async () => {
    if (!form) return
    setBusy(true); setError(null)
    const res = await saveMaterial({ pmId, itemId: itemId ?? null, name: form.name, partNumber: form.partNumber, quantity: Number(form.quantity) || 1, unitLabel: form.unitLabel, category: form.category, notes: form.notes })
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    put(res.material); setForm(null)
  }
  const move = async (m: PmMaterial, status: MaterialStatus) => {
    setError(null)
    const res = await setMaterialStatus({ id: m.id, status })
    if (!res.ok) { setError(res.error); return }
    if ('material' in res && res.material) put(res.material)
  }
  const saveDetails = async (m: PmMaterial, patch: Partial<MaterialInput>) => {
    setError(null)
    const res = await saveMaterial({ id: m.id, pmId, name: m.name, partNumber: m.partNumber, quantity: m.quantity, unitLabel: m.unitLabel, category: m.category, notes: m.notes, equipmentId: m.equipmentId, ...patch })
    if (!res.ok) { setError(res.error); return }
    put(res.material)
  }
  const remove = async (m: PmMaterial) => {
    if (!confirm(`Delete the request for ${m.name}?`)) return
    const res = await deleteMaterial({ id: m.id })
    if (!res.ok) { setError(res.error); return }
    onChange(materials.filter((x) => x.id !== m.id))
  }

  const sorted = [...materials].sort((a, b) => Number(MATERIAL_OPEN(b.status)) - Number(MATERIAL_OPEN(a.status)) || a.requestedDate.localeCompare(b.requestedDate))
  const btn = cn('rounded-lg border font-semibold', big ? 'px-3 py-2 text-sm' : 'px-2 py-1 text-xs')

  return (
    <div>
      <ErrorNote>{error}</ErrorNote>
      {sorted.length === 0 && !form && (
        <p className="flex items-center gap-2 px-4 py-5 text-sm text-slate-400"><Package size={16} /> No filters or parts requested for this PM.</p>
      )}
      <ul className="divide-y divide-slate-100">
        {sorted.map((m) => {
          const late = m.etaDate && m.etaDate < today && MATERIAL_OPEN(m.status) && !['received', 'partially_received'].includes(m.status)
          return (
            <li key={m.id} className={cn('px-4 py-3', !MATERIAL_OPEN(m.status) && 'opacity-60')}>
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block text-sm font-semibold text-slate-900">{m.quantity} x {m.name}</span>
                  <span className="block text-xs text-slate-500">
                    {[MATERIAL_CATEGORY_LABEL[m.category], m.partNumber && `Part ${m.partNumber}`, m.unitLabel && `For ${m.unitLabel}`,
                      `Asked ${fmtDate(m.requestedDate, today)}${m.requestedBy && names[m.requestedBy] ? ` by ${names[m.requestedBy]}` : ''}`].filter(Boolean).join(' · ')}
                  </span>
                  {(m.vendor || m.poNumber || m.orderedDate || m.etaDate || m.receivedDate || m.installedDate) && (
                    <span className="block text-xs text-slate-500">
                      {[m.vendor, m.poNumber && `PO ${m.poNumber}`, m.orderedDate && `Ordered ${fmtDate(m.orderedDate, today)}`, m.etaDate && `ETA ${fmtDate(m.etaDate, today)}`,
                        m.receivedDate && `Received ${fmtDate(m.receivedDate, today)}`, m.installedDate && `Installed ${fmtDate(m.installedDate, today)}`].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  {m.notes && <span className="mt-0.5 block text-xs italic text-slate-500">{m.notes}</span>}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {late && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">Late</span>}
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', MATERIAL_TONE[m.status])}>{MATERIAL_STATUS_LABEL[m.status]}</span>
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {canWork && ['received', 'partially_received'].includes(m.status) && <button type="button" onClick={() => move(m, 'installed')} className={cn(btn, 'border-emerald-300 bg-emerald-50 text-emerald-800')}>Mark installed</button>}
                {canWork && !canCoordinate && m.status === 'needed' && m.requestedBy === userId && <button type="button" onClick={() => move(m, 'cancelled')} className={cn(btn, 'border-slate-300 text-slate-600')}>Cancel request</button>}
                {canCoordinate && (
                  <>
                    <select value={m.status} onChange={(e) => move(m, e.target.value as MaterialStatus)} aria-label={`Status of ${m.name}`} className={cn('rounded-lg border border-slate-300 bg-white', big ? 'px-2 py-2 text-sm' : 'px-2 py-1 text-xs')}>
                      {MATERIAL_STATUSES.map((s) => <option key={s} value={s}>{MATERIAL_STATUS_LABEL[s]}</option>)}
                    </select>
                    <button type="button" onClick={() => setOpen(open === m.id ? null : m.id)} className={cn(btn, 'inline-flex items-center gap-1 border-slate-300 text-slate-600')}>Order details <ChevronDown size={12} className={cn(open === m.id && 'rotate-180')} /></button>
                    <button type="button" onClick={() => remove(m)} aria-label={`Delete ${m.name}`} className="p-1.5 text-slate-300 hover:text-rose-600"><Trash2 size={14} /></button>
                  </>
                )}
              </div>
              {canCoordinate && open === m.id && <OrderDetails m={m} onSave={(patch) => saveDetails(m, patch)} equipment={equipment} />}
            </li>
          )
        })}
      </ul>

      {canWork && (form ? (
        <div className="space-y-2 border-t border-slate-100 bg-slate-50 p-3">
          <div className="grid gap-2 sm:grid-cols-6">
            <Field label="What is needed" className="sm:col-span-3"><input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Merv 8 pleated filter 20x25x2" className={fieldCls} /></Field>
            <Field label="Qty"><input inputMode="decimal" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className={fieldCls} /></Field>
            <Field label="Type" className="sm:col-span-2">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as MaterialCategory })} className={fieldCls}>
                {(Object.keys(MATERIAL_CATEGORY_LABEL) as MaterialCategory[]).map((c) => <option key={c} value={c}>{MATERIAL_CATEGORY_LABEL[c]}</option>)}
              </select>
            </Field>
            <Field label="Part number" className="sm:col-span-2"><input value={form.partNumber} onChange={(e) => setForm({ ...form, partNumber: e.target.value })} className={fieldCls} /></Field>
            <Field label="Unit or equipment" className="sm:col-span-4">
              <input value={form.unitLabel} onChange={(e) => setForm({ ...form, unitLabel: e.target.value })} list="pm-equipment-names" placeholder="RTU 2, A-5 Deli, Compressor 4" className={fieldCls} />
              <datalist id="pm-equipment-names">{equipment.map((e) => <option key={e.id} value={e.label} />)}</datalist>
            </Field>
            <Field label="Notes" className="sm:col-span-6"><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={fieldCls} /></Field>
          </div>
          <div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setForm(null)}>Cancel</Button><Button size="sm" onClick={request} loading={busy} disabled={!form.name.trim()}>Request</Button></div>
        </div>
      ) : (
        <div className="border-t border-slate-100 px-4 py-3">
          <button type="button" onClick={() => setForm(blank)} data-help="pm-request-material"
            className={cn('inline-flex items-center gap-1.5 rounded-lg border border-dashed border-indigo-300 font-semibold text-indigo-700 hover:bg-indigo-50', big ? 'w-full justify-center px-4 py-3 text-sm' : 'px-3 py-1.5 text-xs')}>
            <Plus size={14} /> Request a filter or part
          </button>
        </div>
      ))}
    </div>
  )
}

function OrderDetails({ m, onSave, equipment }: { m: PmMaterial; onSave: (patch: Partial<MaterialInput>) => void; equipment: PmEquipment[] }) {
  const [d, setD] = useState({
    name: m.name, quantity: String(m.quantity), partNumber: m.partNumber ?? '', unitLabel: m.unitLabel ?? '', vendor: m.vendor ?? '', poNumber: m.poNumber ?? '',
    orderedDate: m.orderedDate ?? '', etaDate: m.etaDate ?? '', receivedDate: m.receivedDate ?? '', installedDate: m.installedDate ?? '', notes: m.notes ?? '',
  })
  const set = (patch: Partial<typeof d>) => setD((cur) => ({ ...cur, ...patch }))
  const date = (k: 'orderedDate' | 'etaDate' | 'receivedDate' | 'installedDate', label: string) => (
    <Field label={label}><input type="date" value={d[k]} onChange={(e) => set({ [k]: e.target.value })} className={fieldCls} /></Field>
  )
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <Field label="Material" className="sm:col-span-2"><input value={d.name} onChange={(e) => set({ name: e.target.value })} className={fieldCls} /></Field>
        <Field label="Qty"><input inputMode="decimal" value={d.quantity} onChange={(e) => set({ quantity: e.target.value })} className={fieldCls} /></Field>
        <Field label="Part number"><input value={d.partNumber} onChange={(e) => set({ partNumber: e.target.value })} className={fieldCls} /></Field>
        <Field label="Vendor" className="sm:col-span-2"><input value={d.vendor} onChange={(e) => set({ vendor: e.target.value })} className={fieldCls} /></Field>
        <Field label="PO number"><input value={d.poNumber} onChange={(e) => set({ poNumber: e.target.value })} className={fieldCls} /></Field>
        <Field label="Unit or equipment"><input value={d.unitLabel} onChange={(e) => set({ unitLabel: e.target.value })} list="pm-equipment-names-edit" className={fieldCls} /><datalist id="pm-equipment-names-edit">{equipment.map((e) => <option key={e.id} value={e.label} />)}</datalist></Field>
        {date('orderedDate', 'Order placed')}{date('etaDate', 'Estimated delivery')}{date('receivedDate', 'Received')}{date('installedDate', 'Installed')}
        <Field label="Notes" className="sm:col-span-4"><input value={d.notes} onChange={(e) => set({ notes: e.target.value })} className={fieldCls} /></Field>
      </div>
      <div className="flex justify-end"><Button size="sm" onClick={() => onSave({ ...d, quantity: Number(d.quantity) || m.quantity })}>Save details</Button></div>
    </div>
  )
}
