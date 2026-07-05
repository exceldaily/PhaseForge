'use client'

// Side drawer for a single call — inline-editable fields with an optimistic
// overlay (reconciled on updated_at change), categorized notes timeline, and
// mark-as-read on open. Modeled on the DispatchForge detail panel UX.

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { StatusPill, timeAgo, daysOpen } from '@/components/operations/shared'
import { updateCall, addCallNote, markCallRead } from './actions'
import { slaState, type Option, type LocationOpt, type AssetOpt, type StaffOpt, type NoteTemplate } from './CallsClient'
import type { Call, CallNote, OrgCallSettings, Division } from '@/lib/operations/types'
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
  call, settings, divisions, vendors, staff, noteTemplates, userId, opsRole, onClose,
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
              {c.location && <span>· {c.location.name}</span>}
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
