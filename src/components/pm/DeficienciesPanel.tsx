'use client'

// Deficiencies found on a PM. Written up by whoever finds them, with photos;
// the coordinator tracks the proposal and the repair. They stay on the store
// after the PM closes, and a later repair job can be linked without
// reopening the PM.

import { useState } from 'react'
import { AlertTriangle, Camera, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { deleteDeficiency, saveDeficiency, type DeficiencyInput } from '@/app/app/pm/workActions'
import { fmtDate } from '@/lib/pm/quarters'
import {
  PROPOSAL_LABEL, REPAIR_LABEL, REPAIR_OPEN, REPAIR_STATUSES, SEVERITIES, SEVERITY_LABEL, SEVERITY_TONE,
  type PmAttachment, type PmDeficiency, type PmEquipment, type ProposalStatus, type RepairStatus, type Severity,
} from '@/lib/pm/types'
import { ErrorNote, Field, fieldCls } from './ui'

export interface DeficiencySeed { itemId: string; itemCode: string; description?: string; proposalRequired?: boolean }

interface Form {
  id?: string
  itemId: string | null
  itemCode: string | null
  description: string
  severity: Severity
  equipmentLabel: string
  recommendedRepair: string
  proposalRequired: boolean
  returnVisitRequired: boolean
  affectsPm: boolean
  proposalStatus: ProposalStatus
  proposalSubmittedDate: string
  followupJobNumber: string
  repairStatus: RepairStatus
  resolutionNote: string
}

const fromSeed = (seed?: DeficiencySeed | null): Form => ({
  itemId: seed?.itemId ?? null, itemCode: seed?.itemCode ?? null, description: seed?.description ?? '', severity: 'medium', equipmentLabel: '',
  recommendedRepair: '', proposalRequired: !!seed?.proposalRequired, returnVisitRequired: false, affectsPm: false,
  proposalStatus: seed?.proposalRequired ? 'needed' : 'not_required', proposalSubmittedDate: '', followupJobNumber: '', repairStatus: 'open', resolutionNote: '',
})
const fromRow = (d: PmDeficiency): Form => ({
  id: d.id, itemId: d.itemId, itemCode: d.itemCode, description: d.description, severity: d.severity, equipmentLabel: d.equipmentLabel ?? '',
  recommendedRepair: d.recommendedRepair ?? '', proposalRequired: d.proposalRequired, returnVisitRequired: d.returnVisitRequired, affectsPm: d.affectsPm,
  proposalStatus: d.proposalStatus, proposalSubmittedDate: d.proposalSubmittedDate ?? '', followupJobNumber: d.followupJobNumber ?? '',
  repairStatus: d.repairStatus, resolutionNote: d.resolutionNote ?? '',
})

export function DeficienciesPanel({ pmId, storeId, deficiencies, onChange, attachments, canWork, canCoordinate, equipment, names, today, seed, onSeedUsed, onAddPhotos, pendingPhotoCount, big }: {
  pmId: string | null
  storeId: string
  deficiencies: PmDeficiency[]
  onChange: (next: PmDeficiency[]) => void
  attachments: PmAttachment[]
  canWork: boolean
  canCoordinate: boolean
  equipment: PmEquipment[]
  names: Record<string, string>
  today: string
  /** Opened from a failed check: start a write-up tied to it. */
  seed?: DeficiencySeed | null
  onSeedUsed?: () => void
  onAddPhotos?: (files: File[], deficiencyId: string) => void
  pendingPhotoCount?: (deficiencyId: string) => number
  big?: boolean
}) {
  const [form, setForm] = useState<Form | null>(seed ? fromSeed(seed) : null)
  const [lastSeed, setLastSeed] = useState(seed ?? null)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A new failed check asks for a write-up while the panel is already open.
  if (seed && seed !== lastSeed) { setLastSeed(seed); setForm(fromSeed(seed)) }
  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f))

  const save = async () => {
    if (!form) return
    setBusy(true); setError(null)
    const input: DeficiencyInput = {
      id: form.id, pmId, storeId, itemId: form.itemId, itemCode: form.itemCode, description: form.description, severity: form.severity,
      equipmentLabel: form.equipmentLabel, recommendedRepair: form.recommendedRepair, proposalRequired: form.proposalRequired,
      returnVisitRequired: form.returnVisitRequired, affectsPm: form.affectsPm,
      ...(canCoordinate ? { proposalStatus: form.proposalStatus, proposalSubmittedDate: form.proposalSubmittedDate, followupJobNumber: form.followupJobNumber, repairStatus: form.repairStatus, resolutionNote: form.resolutionNote } : {}),
    }
    const res = await saveDeficiency(input)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    onChange(deficiencies.some((d) => d.id === res.deficiency.id) ? deficiencies.map((d) => (d.id === res.deficiency.id ? res.deficiency : d)) : [...deficiencies, res.deficiency])
    setForm(null)
    setOpen(res.deficiency.id)
    onSeedUsed?.()
  }
  const remove = async (d: PmDeficiency) => {
    if (!confirm('Delete this deficiency? This cannot be undone.')) return
    const res = await deleteDeficiency({ id: d.id })
    if (!res.ok) { setError(res.error); return }
    onChange(deficiencies.filter((x) => x.id !== d.id))
  }
  const check = (k: 'proposalRequired' | 'returnVisitRequired' | 'affectsPm', label: string, hint: string) => (
    <label className="flex items-start gap-2 text-sm text-slate-700">
      <input type="checkbox" className={cn('mt-0.5', big && 'h-5 w-5')} checked={form?.[k] ?? false} onChange={(e) => set({ [k]: e.target.checked, ...(k === 'proposalRequired' && form?.proposalStatus === 'not_required' && e.target.checked ? { proposalStatus: 'needed' as ProposalStatus } : {}) })} />
      <span><span className="font-medium">{label}</span><span className="block text-xs text-slate-500">{hint}</span></span>
    </label>
  )

  const sorted = [...deficiencies].sort((a, b) => Number(REPAIR_OPEN(b.repairStatus)) - Number(REPAIR_OPEN(a.repairStatus)) || b.createdAt.localeCompare(a.createdAt))

  return (
    <div>
      <ErrorNote>{error}</ErrorNote>
      {sorted.length === 0 && !form && <p className="flex items-center gap-2 px-4 py-5 text-sm text-slate-400"><AlertTriangle size={16} /> No deficiencies written up on this PM.</p>}
      <ul className="divide-y divide-slate-100">
        {sorted.map((d) => {
          const photos = attachments.filter((a) => a.deficiencyId === d.id)
          const waiting = pendingPhotoCount?.(d.id) ?? 0
          return (
            <li key={d.id} className="px-4 py-3">
              <button type="button" onClick={() => setOpen(open === d.id ? null : d.id)} className="flex w-full flex-wrap items-start gap-x-3 gap-y-1 text-left">
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', SEVERITY_TONE[d.severity])}>{SEVERITY_LABEL[d.severity]}</span>
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block text-sm text-slate-900">{d.itemCode && <span className="mr-1.5 font-bold">{d.itemCode}</span>}{d.description}</span>
                  <span className="block text-xs text-slate-500">
                    {[fmtDate(d.createdAt, today), d.createdBy && names[d.createdBy], d.equipmentLabel, d.proposalStatus !== 'not_required' && PROPOSAL_LABEL[d.proposalStatus],
                      d.returnVisitRequired && 'Return visit', d.affectsPm && 'Holds up the PM', d.followupJobNumber && `Follow-up job ${d.followupJobNumber}`,
                      photos.length + waiting > 0 && `${photos.length + waiting} ${photos.length + waiting === 1 ? 'photo' : 'photos'}`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', REPAIR_OPEN(d.repairStatus) ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')}>{REPAIR_LABEL[d.repairStatus]}</span>
                <ChevronDown size={14} className={cn('mt-0.5 text-slate-400', open === d.id && 'rotate-180')} />
              </button>
              {open === d.id && (
                <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
                  {d.recommendedRepair && <p><span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recommended repair</span><span className="block whitespace-pre-wrap text-slate-700">{d.recommendedRepair}</span></p>}
                  {d.resolutionNote && <p><span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Resolution</span><span className="block whitespace-pre-wrap text-slate-700">{d.resolutionNote}{d.resolvedOn ? ` (${fmtDate(d.resolvedOn, today)})` : ''}</span></p>}
                  {photos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {photos.map((a) => (a.url ? (
                        <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="block h-20 w-20 overflow-hidden rounded-lg border border-slate-200 bg-white">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                        </a>
                      ) : <span key={a.id} className="flex h-20 w-20 items-center justify-center rounded-lg border border-slate-200 bg-white text-[10px] text-slate-400">{a.name}</span>))}
                    </div>
                  )}
                  {waiting > 0 && <p className="text-xs text-amber-700">{waiting} {waiting === 1 ? 'photo is' : 'photos are'} still uploading.</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    {canWork && onAddPhotos && (
                      <label className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white font-semibold text-slate-700', big ? 'px-3 py-2 text-sm' : 'px-2 py-1 text-xs')}>
                        <Camera size={14} /> Add photos
                        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; if (files.length) onAddPhotos(files, d.id) }} />
                      </label>
                    )}
                    {(canWork || canCoordinate) && <button type="button" onClick={() => setForm(fromRow(d))} className={cn('rounded-lg border border-slate-300 bg-white font-semibold text-slate-700', big ? 'px-3 py-2 text-sm' : 'px-2 py-1 text-xs')}>{canCoordinate ? 'Edit, proposal, and repair' : 'Edit'}</button>}
                    {canCoordinate && <button type="button" onClick={() => remove(d)} aria-label="Delete deficiency" className="ml-auto p-1.5 text-slate-300 hover:text-rose-600"><Trash2 size={14} /></button>}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {form ? (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50 p-3" id="pm-deficiency-form">
          <p className="text-sm font-semibold text-slate-800">{form.id ? 'Edit deficiency' : form.itemCode ? `Write up ${form.itemCode}` : 'New deficiency'}</p>
          <Field label="What is wrong"><textarea autoFocus rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Compressor 4 is shorted to ground" className={fieldCls} /></Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Severity">
              <div className="flex gap-1">{SEVERITIES.map((s) => (
                <button key={s} type="button" onClick={() => set({ severity: s })} className={cn('flex-1 rounded-lg border font-semibold', big ? 'py-2.5 text-sm' : 'py-1.5 text-xs', form.severity === s ? cn(SEVERITY_TONE[s], 'border-current') : 'border-slate-300 bg-white text-slate-500')}>{SEVERITY_LABEL[s]}</button>
              ))}</div>
            </Field>
            <Field label="Equipment">
              <input value={form.equipmentLabel} onChange={(e) => set({ equipmentLabel: e.target.value })} list="pm-def-equipment" placeholder="Compressor 4, A-8 Produce" className={fieldCls} />
              <datalist id="pm-def-equipment">{equipment.map((e) => <option key={e.id} value={e.label} />)}</datalist>
            </Field>
          </div>
          <Field label="Recommended repair"><textarea rows={2} value={form.recommendedRepair} onChange={(e) => set({ recommendedRepair: e.target.value })} className={fieldCls} /></Field>
          <div className="space-y-2">
            {check('proposalRequired', 'Needs an FOPM proposal', 'ALDI has to approve the repair before it is done.')}
            {check('returnVisitRequired', 'Needs a return visit', 'The repair cannot be done on this visit.')}
            {check('affectsPm', 'The PM cannot be finished until this is dealt with', 'Leave this off for a repair that follows the PM. Tick it only when the inspection itself is held up.')}
          </div>
          {canCoordinate && (
            <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2">
              <Field label="Proposal">
                <select value={form.proposalStatus} onChange={(e) => set({ proposalStatus: e.target.value as ProposalStatus })} className={fieldCls}>{(Object.keys(PROPOSAL_LABEL) as ProposalStatus[]).map((p) => <option key={p} value={p}>{PROPOSAL_LABEL[p]}</option>)}</select>
              </Field>
              <Field label="Proposal submitted on"><input type="date" value={form.proposalSubmittedDate} onChange={(e) => set({ proposalSubmittedDate: e.target.value })} className={fieldCls} /></Field>
              <Field label="Repair status">
                <select value={form.repairStatus} onChange={(e) => set({ repairStatus: e.target.value as RepairStatus })} className={fieldCls}>{REPAIR_STATUSES.map((r) => <option key={r} value={r}>{REPAIR_LABEL[r]}</option>)}</select>
              </Field>
              <Field label="Follow-up job number" hint="Links this to the repair job. The PM is not reopened."><input value={form.followupJobNumber} onChange={(e) => set({ followupJobNumber: e.target.value })} className={fieldCls} /></Field>
              <Field label="Resolution note" className="sm:col-span-2"><input value={form.resolutionNote} onChange={(e) => set({ resolutionNote: e.target.value })} className={fieldCls} /></Field>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => { setForm(null); onSeedUsed?.() }}>Cancel</Button>
            <Button size="sm" onClick={save} loading={busy} disabled={!form.description.trim()}>{form.id ? 'Save' : 'Write it up'}</Button>
          </div>
          {!form.id && onAddPhotos && <p className="text-xs text-slate-500">Save it first, then add photos to it.</p>}
        </div>
      ) : canWork && (
        <div className="border-t border-slate-100 px-4 py-3">
          <button type="button" onClick={() => setForm(fromSeed(null))} data-help="pm-add-deficiency"
            className={cn('inline-flex items-center gap-1.5 rounded-lg border border-dashed border-rose-300 font-semibold text-rose-700 hover:bg-rose-50', big ? 'w-full justify-center px-4 py-3 text-sm' : 'px-3 py-1.5 text-xs')}>
            <Plus size={14} /> Write up a deficiency
          </button>
        </div>
      )}
    </div>
  )
}
