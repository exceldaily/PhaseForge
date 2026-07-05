'use client'

// Side drawer for a single call — inline-editable fields with an optimistic
// overlay (reconciled on updated_at change), categorized notes timeline, and
// mark-as-read on open. Modeled on the DispatchForge detail panel UX.

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Send, MapPin, Gauge, Camera, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { StatusPill, timeAgo, daysOpen } from '@/components/operations/shared'
import { readingFieldsForTrade, mapsUrl } from '@/lib/operations/readings'
import { updateCall, addCallNote, markCallRead, addAssetReading } from './actions'
import { slaState, type Option, type LocationOpt, type AssetOpt, type StaffOpt, type NoteTemplate } from './CallsClient'
import type { Call, CallNote, OrgCallSettings, Division, AssetReading } from '@/lib/operations/types'
import { cn } from '@/lib/utils'

const NOTE_CATEGORIES = [
  { key: 'internal', label: 'Internal' },
  { key: 'customer', label: 'Customer' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'parts', label: 'Parts' },
  { key: 'scheduling', label: 'Scheduling' },
  { key: 'quote', label: 'Quote' },
  { key: 'completion', label: 'Completion' },
]

const CATEGORY_COLORS: Record<string, string> = {
  internal: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  customer: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  vendor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  parts: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  scheduling: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  quote: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  completion: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}

const fieldLabel = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400'
const selectClass = 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'

export function CallDetailPanel({
  call, settings, assets, divisions, vendors, staff, noteTemplates, userId, opsRole, onClose,
}: {
  call: Call
  settings: OrgCallSettings
  customers: Option[]
  locations: LocationOpt[]
  assets: AssetOpt[]
  divisions: Division[]
  vendors: Option[]
  staff: StaffOpt[]
  noteTemplates: NoteTemplate[]
  userId: string
  opsRole: string
  onClose: () => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [notes, setNotes] = useState<CallNote[]>([])
  const [noteText, setNoteText] = useState('')
  const [noteCategory, setNoteCategory] = useState('internal')
  const [savingNote, setSavingNote] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Optimistic overlay reconciled when fresh server data arrives (DispatchForge pattern).
  const [optimistic, setOptimistic] = useState<Partial<Call>>({})
  const [syncedUpdatedAt, setSyncedUpdatedAt] = useState(call.updated_at)
  if (call.updated_at !== syncedUpdatedAt) {
    setSyncedUpdatedAt(call.updated_at)
    setOptimistic({})
  }
  const c = { ...call, ...optimistic }

  const canEdit = opsRole !== 'read_only' && (
    ['owner', 'admin', 'dispatcher', 'project_manager'].includes(opsRole) ||
    call.assigned_staff_id === userId
  )
  const canInvoiceFlag = ['owner', 'admin', 'dispatcher', 'project_manager', 'billing'].includes(opsRole)

  // Load notes + mark read on open
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('call_notes')
      .select('*')
      .eq('call_id', call.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setNotes(data ?? []))
    markCallRead(call.id)
  }, [call.id])

  function patch(update: Record<string, string | boolean | null>) {
    setOptimistic((o) => ({ ...o, ...update }))
    setError(null)
    startTransition(async () => {
      const res = await updateCall(call.id, update)
      if (res?.error) {
        setOptimistic({})
        setError(res.error)
      }
      router.refresh()
    })
  }

  async function submitNote() {
    if (!noteText.trim()) return
    setSavingNote(true)
    const res = await addCallNote(call.id, noteCategory, noteText)
    setSavingNote(false)
    if (res?.error) { setError(res.error); return }
    setNoteText('')
    const supabase = createClient()
    const { data } = await supabase.from('call_notes').select('*').eq('call_id', call.id).order('created_at', { ascending: false })
    setNotes(data ?? [])
    router.refresh()
  }

  const sla = slaState(c)
  const single = settings.terminology.replace(/s$/, '')

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div>
            <p className="font-mono text-xs text-slate-400">{single} #{c.call_number}</p>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{c.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {c.customer && <span>{c.customer.name}</span>}
              {c.location && (
                <span className="inline-flex items-center gap-1">
                  · {c.location.name}
                  {mapsUrl(c.location.address, c.location.city, c.location.state) && (
                    <a
                      href={mapsUrl(c.location.address, c.location.city, c.location.state)!}
                      target="_blank"
                      rel="noreferrer"
                      title="Open in Google Maps"
                      className="text-indigo-500 hover:text-indigo-600"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MapPin size={12} />
                    </a>
                  )}
                </span>
              )}
              <span>· {daysOpen(c.created_at)}d open</span>
              {sla && (
                <span className={cn('font-semibold', sla === 'overdue' ? 'text-rose-600' : 'text-orange-600')}>
                  · {sla === 'overdue' ? 'SLA OVERDUE' : 'Due <24h'}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

          {/* Status + priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Status</label>
              <select value={c.status} disabled={!canEdit} onChange={(e) => patch({ status: e.target.value })} className={selectClass}>
                {settings.statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className={fieldLabel}>Priority</label>
              <select value={c.priority} disabled={!canEdit} onChange={(e) => patch({ priority: e.target.value })} className={selectClass}>
                {settings.priorities.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
          </div>

          {/* Assignment */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Assigned staff</label>
              <select value={c.assigned_staff_id ?? ''} disabled={!canEdit} onChange={(e) => patch({ assigned_staff_id: e.target.value || null })} className={selectClass}>
                <option value="">Unassigned</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className={fieldLabel}>Vendor</label>
              <select value={c.vendor_id ?? ''} disabled={!canEdit} onChange={(e) => patch({ vendor_id: e.target.value || null })} className={selectClass}>
                <option value="">—</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          </div>

          {/* Dates + division */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Due date</label>
              <input type="date" value={c.due_date ?? ''} disabled={!canEdit} onChange={(e) => patch({ due_date: e.target.value || null })} className={selectClass} />
            </div>
            {settings.use_divisions && divisions.length > 0 && (
              <div>
                <label className={fieldLabel}>Division</label>
                <select value={c.division_id ?? ''} disabled={!canEdit} onChange={(e) => patch({ division_id: e.target.value || null })} className={selectClass}>
                  <option value="">—</option>
                  {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Description */}
          {c.description && (
            <div>
              <label className={fieldLabel}>Description</label>
              <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">{c.description}</p>
            </div>
          )}

          {/* Invoice-ready */}
          {canInvoiceFlag && (
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={c.invoice_ready}
                onChange={(e) => patch({ invoice_ready: e.target.checked })}
              />
              Invoice ready — work is billable and complete enough to invoice
            </label>
          )}

          {/* Completion notes (required-closeout aware) */}
          {(c.status === 'completed' || settings.required_closeout_fields.includes('completion_notes')) && (
            <div>
              <label className={fieldLabel}>Completion notes</label>
              <textarea
                defaultValue={c.completion_notes ?? ''}
                disabled={!canEdit}
                rows={2}
                onBlur={(e) => e.target.value !== (c.completion_notes ?? '') && patch({ completion_notes: e.target.value || null })}
                className={selectClass}
              />
            </div>
          )}

          {/* Equipment update — trade-aware readings for the linked asset */}
          {c.asset_id && (
            <EquipmentUpdateSection
              call={c}
              asset={assets.find((a) => a.id === c.asset_id) ?? null}
              canEdit={canEdit}
              companyId={c.company_id}
              userId={userId}
            />
          )}

          {/* Notes timeline */}
          <div>
            <label className={fieldLabel}>Notes</label>
            {canEdit && (
              <div className="mb-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <select value={noteCategory} onChange={(e) => setNoteCategory(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    {NOTE_CATEGORIES.map((nc) => <option key={nc.key} value={nc.key}>{nc.label}</option>)}
                  </select>
                  {noteTemplates.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => {
                        const t = noteTemplates.find((x) => x.id === e.target.value)
                        if (t) setNoteText((prev) => (prev ? `${prev}\n${t.body}` : t.body))
                      }}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="">Insert template…</option>
                      {noteTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  )}
                </div>
                <div className="flex gap-2">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows={2}
                    placeholder="Add a note…"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                  <Button size="sm" onClick={submitNote} loading={savingNote} disabled={!noteText.trim()}>
                    <Send size={13} />
                  </Button>
                </div>
              </div>
            )}
            {notes.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">No notes yet.</p>
            ) : (
              <ol className="space-y-2.5">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize', CATEGORY_COLORS[n.category] ?? CATEGORY_COLORS.internal)}>
                          {n.category}
                        </span>
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{n.author_name ?? 'Unknown'}</span>
                      </span>
                      <span className="text-[10px] text-slate-400">{timeAgo(n.created_at)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{n.body}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Meta */}
          <div className="border-t border-slate-100 pt-3 text-[11px] text-slate-400 dark:border-slate-800">
            <p>Created {new Date(c.created_at).toLocaleString()} · <StatusPill status={c.status} label={settings.statuses.find((s) => s.key === c.status)?.label} /></p>
            {c.completed_at && <p>Completed {new Date(c.completed_at).toLocaleString()}</p>}
          </div>
        </div>
      </aside>
    </>
  )
}

// ── Equipment update: trade-specific readings + photos for the linked asset ──

function EquipmentUpdateSection({
  call, asset, canEdit, companyId, userId,
}: {
  call: Call
  asset: AssetOpt | null
  canEdit: boolean
  companyId: string
  userId: string
}) {
  const trade = asset?.trade_category ?? 'general'
  const fields = readingFieldsForTrade(trade)
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<AssetReading[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!call.asset_id) return
    const supabase = createClient()
    supabase
      .from('asset_readings')
      .select('*')
      .eq('asset_id', call.asset_id)
      .order('recorded_at', { ascending: false })
      .limit(5)
      .then(({ data }) => setHistory(data ?? []))
  }, [call.asset_id, saved])

  async function save() {
    if (saving) return
    setSaving(true)
    setError(null)
    const res = await addAssetReading({
      assetId: call.asset_id!,
      callId: call.id,
      tradeCategory: trade,
      readings: values,
      notes: note,
    })
    if (res?.error || !res?.id) {
      setError(res?.error ?? 'Could not save the reading.')
      setSaving(false)
      return
    }
    // Attach photos to the reading via org_files (record_type 'asset_reading')
    if (photos.length) {
      const supabase = createClient()
      for (const photo of photos) {
        const path = `${companyId}/asset_reading/${crypto.randomUUID()}-${photo.name}`
        const { error: upErr } = await supabase.storage.from('org-files').upload(path, photo)
        if (upErr) { setError(`Reading saved, but a photo failed: ${upErr.message}`); continue }
        await supabase.from('org_files').insert({
          company_id: companyId,
          storage_path: path,
          file_name: photo.name,
          mime_type: photo.type || null,
          size_bytes: photo.size,
          record_type: 'asset_reading',
          record_id: res.id,
          customer_id: call.customer_id,
          location_id: call.location_id,
          uploaded_by: userId,
        })
      }
    }
    setValues({})
    setNote('')
    setPhotos([])
    setSaving(false)
    setSaved((s) => !s) // triggers history refetch
    setOpen(false)
  }

  const labelFor = (key: string) => fields.find((f) => f.key === key)?.label ?? key.replace(/_/g, ' ')
  const unitFor = (key: string) => fields.find((f) => f.key === key)?.unit

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200"
      >
        <span className="flex items-center gap-2">
          <Gauge size={15} className="text-indigo-500" />
          Equipment update
          {asset && <span className="text-xs font-normal text-slate-400">{asset.name} · {trade}</span>}
        </span>
        <ChevronDown size={15} className={cn('text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 px-3 py-3 dark:border-slate-800">
          {canEdit && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {fields.map((f) => (
                  <label key={f.key} className="flex flex-col gap-1 text-[11px] font-medium text-slate-500">
                    {f.label}{f.unit ? ` (${f.unit})` : ''}
                    {f.type === 'select' ? (
                      <select
                        value={values[f.key] ?? ''}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        className={selectClass}
                      >
                        <option value="">—</option>
                        {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input
                        type={f.type === 'number' ? 'number' : 'text'}
                        step="any"
                        value={values[f.key] ?? ''}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        className={selectClass}
                      />
                    )}
                  </label>
                ))}
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Technician notes for this reading…"
                className={selectClass}
              />
              <div className="flex items-center justify-between gap-2">
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600">
                  <Camera size={14} />
                  {photos.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''} attached` : 'Attach photos'}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
                  />
                </label>
                <Button size="sm" onClick={save} loading={saving}>Save reading</Button>
              </div>
              {error && <p className="text-xs text-rose-600">{error}</p>}
            </>
          )}

          {/* Service history */}
          {history.length > 0 && (
            <div className="space-y-2 border-t border-slate-100 pt-2 dark:border-slate-800">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Recent history</p>
              {history.map((r) => (
                <div key={r.id} className="rounded-lg bg-slate-50 px-2.5 py-2 text-xs dark:bg-slate-800">
                  <p className="mb-1 text-[10px] text-slate-400">{new Date(r.recorded_at).toLocaleString()}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {Object.entries(r.readings).map(([k, v]) => (
                      <span key={k} className="text-slate-600 dark:text-slate-300">
                        {labelFor(k)}: <span className="font-semibold">{v}{unitFor(k) ? ` ${unitFor(k)}` : ''}</span>
                      </span>
                    ))}
                  </div>
                  {r.notes && <p className="mt-1 italic text-slate-500">{r.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
