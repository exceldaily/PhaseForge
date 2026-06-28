'use client'

import { useRef, useState, useTransition } from 'react'
import { X, AlertCircle, Trash2, CheckCircle, RefreshCw, Link2, Send } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DispatchBoard, DispatchColumn, DispatchCard, DispatchVendor, Profile } from '@/types/app'
import { DispatchActivityLog } from './DispatchActivityLog'
import {
  updateDispatchCard,
  moveDispatchCard,
  closeDispatchCard,
  reopenDispatchCard,
  deleteDispatchCard,
  createDispatchVendor,
  forwardTicketEmail,
} from '@/app/app/dispatch/actions'
import { cn } from '@/lib/utils'
import { getDispatchFieldLabel, makeDispatchFieldHref } from '@/lib/dispatchFields'

interface Props {
  card: DispatchCard
  board: DispatchBoard
  columns: DispatchColumn[]
  vendors: DispatchVendor[]
  members: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'>[]
  onClose: () => void
  onUpdated: (card: DispatchCard) => void
  onDeleted: (cardId: string) => void
  userRole: string
}

const URGENCY_STYLES = {
  critical: 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-700',
  high:     'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700',
  medium:   'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700',
  low:      'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600',
}

function buildForwardBody(card: DispatchCard) {
  const lines: string[] = []
  if (card.store)             lines.push(`Store: ${card.store}`)
  if (card.sc_number)         lines.push(`SC #: ${card.sc_number}`)
  if (card.kalos_job_number)  lines.push(`Job #: ${card.kalos_job_number}`)
  lines.push(`Urgency: ${card.urgency.charAt(0).toUpperCase() + card.urgency.slice(1)}`)
  if (card.eta_scheduled)     lines.push(`ETA: ${new Date(card.eta_scheduled).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`)
  if (card.rack_circuit_case) lines.push(`Rack/Circuit/Case: ${card.rack_circuit_case}`)
  if (card.description)       lines.push('', `Description:`, card.description)
  if (card.notes)             lines.push('', `Notes:`, card.notes)
  return lines.join('\n')
}

export function DispatchCardModal({ card, board, columns, vendors, members, onClose, onUpdated, onDeleted, userRole }: Props) {
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [localVendors, setLocalVendors] = useState<DispatchVendor[]>(vendors)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  const [forwarding, setForwarding] = useState(false)
  const [forwardForm, setForwardForm] = useState(() => ({
    to: card.vendor_email ?? '',
    subject: `Ticket: ${[card.store, card.sc_number].filter(Boolean).join(' – ')}`,
    body: buildForwardBody(card),
  }))
  const [forwardLoading, setForwardLoading] = useState(false)
  const [forwardResult, setForwardResult] = useState<{ success?: boolean; error?: string } | null>(null)

  // Edit form state
  const [form, setForm] = useState({
    store:            card.store ?? '',
    urgency:          card.urgency,
    sc_number:        card.sc_number ?? '',
    kalos_job_number: card.kalos_job_number ?? '',
    date_started:     card.date_started ?? '',
    eta_scheduled:    card.eta_scheduled ? card.eta_scheduled.slice(0, 16) : '',
    rack_circuit_case:card.rack_circuit_case ?? '',
    description:      card.description ?? '',
    part_ordered:     card.part_ordered,
    who_ordered:      card.who_ordered ?? '',
    notes:            card.notes ?? '',
    assigned_to:      card.assigned_to ?? '',
    vendor_id:        card.vendor_id ?? '',
    vendor_email:     card.vendor_email ?? '',
    needs_review:     card.needs_review,
    alert_at:         card.alert_at ? card.alert_at.slice(0, 16) : '',
    alert_note:       card.alert_note ?? '',
    column_id:        card.column_id ?? '',
  })
  const [fieldLinks, setFieldLinks] = useState<Record<string, string>>(card.card_links ?? {})

  const canManage = ['owner', 'admin', 'manager'].includes(userRole)
  const canEdit = ['owner', 'admin', 'manager', 'member'].includes(userRole)
  const isClosed = !!card.closed_at

  const currentColumn = columns.find(c => c.id === card.column_id)
  const trackingHref = makeDispatchFieldHref(board, 'sc_number', card.sc_number, card)

  const set = (key: string, value: unknown) => setForm(prev => ({ ...prev, [key]: value }))

  const setFieldLink = (field: 'sc_number' | 'kalos_job_number') => {
    const label = getDispatchFieldLabel(board, field)
    const current = fieldLinks[field] ?? ''
    const next = window.prompt(`Paste a link for ${label}. Leave blank to remove it.`, current)
    if (next === null) return
    setFieldLinks(prev => {
      const updated = { ...prev }
      const clean = next.trim()
      if (clean) updated[field] = clean
      else delete updated[field]
      return updated
    })
  }

  const handleLinkKeyDown = (field: 'sc_number' | 'kalos_job_number') => (event: React.KeyboardEvent<HTMLInputElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      setFieldLink(field)
    }
  }

  const handleSave = () => {
    setError('')
    const updates: Record<string, unknown> = {
      store:             form.store.trim() || null,
      urgency:           form.urgency,
      sc_number:         form.sc_number.trim() || null,
      kalos_job_number:  form.kalos_job_number.trim() || null,
      date_started:      form.date_started || null,
      eta_scheduled:     form.eta_scheduled ? new Date(form.eta_scheduled).toISOString() : null,
      rack_circuit_case: form.rack_circuit_case.trim() || null,
      description:       form.description.trim() || null,
      part_ordered:      form.part_ordered,
      who_ordered:       form.who_ordered.trim() || null,
      notes:             form.notes.trim() || null,
      assigned_to:       form.assigned_to || null,
      vendor_id:         form.vendor_id || null,
      vendor_email:      form.vendor_email.trim() || null,
      needs_review:      form.needs_review,
      alert_at:          form.alert_at ? new Date(form.alert_at).toISOString() : null,
      alert_note:        form.alert_note.trim() || null,
      card_links:        fieldLinks,
    }

    // Build change log for activity tracking
    const changeLog = [
      { field: 'store', label: 'Store', oldValue: card.store ?? '', newValue: form.store.trim() },
      { field: 'urgency', label: 'Urgency', oldValue: card.urgency, newValue: form.urgency },
      { field: 'sc_number', label: 'SC #', oldValue: card.sc_number ?? '', newValue: form.sc_number.trim() },
      { field: 'kalos_job_number', label: 'Kalos Job #', oldValue: card.kalos_job_number ?? '', newValue: form.kalos_job_number.trim() },
      { field: 'card_links', label: 'Field links', oldValue: JSON.stringify(card.card_links ?? {}), newValue: JSON.stringify(fieldLinks) },
      { field: 'description', label: 'Description', oldValue: card.description ?? '', newValue: form.description.trim() },
      { field: 'rack_circuit_case', label: 'Rack/Circuit/Case', oldValue: card.rack_circuit_case ?? '', newValue: form.rack_circuit_case.trim() },
      { field: 'part_ordered', label: 'Part Ordered', oldValue: String(card.part_ordered), newValue: String(form.part_ordered) },
      { field: 'who_ordered', label: 'Who Ordered', oldValue: card.who_ordered ?? '', newValue: form.who_ordered.trim() },
      { field: 'needs_review', label: 'Needs Review', oldValue: String(card.needs_review), newValue: String(form.needs_review) },
    ]

    startTransition(async () => {
      const result = await updateDispatchCard(card.id, board.id, updates, changeLog)
      if (result.error) { setError(result.error); return }

      // Handle column move separately
      const newColId = form.column_id || null
      if (newColId !== card.column_id) {
        const newCol = columns.find(c => c.id === newColId)
        const oldCol = columns.find(c => c.id === card.column_id)
        await moveDispatchCard(card.id, board.id, newColId, newCol?.name ?? 'Unassigned', oldCol?.name ?? 'Unassigned')
      }

      const updatedCard: DispatchCard = {
        ...card,
        ...updates,
        column_id: newColId,
        updated_at: new Date().toISOString(),
        card_links: fieldLinks,
        vendor: localVendors.find(v => v.id === form.vendor_id),
        assigned_profile: members.find(m => m.id === form.assigned_to) as DispatchCard['assigned_profile'],
      }
      onUpdated(updatedCard)
      setEditing(false)
    })
  }

  const handleClose = () => {
    startTransition(async () => {
      const result = await closeDispatchCard(card.id, board.id)
      if (result.error) { setError(result.error); return }
      onUpdated({ ...card, closed_at: new Date().toISOString() })
    })
  }

  const handleReopen = () => {
    startTransition(async () => {
      const result = await reopenDispatchCard(card.id, board.id)
      if (result.error) { setError(result.error); return }
      onUpdated({ ...card, closed_at: null })
    })
  }

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteDispatchCard(card.id, board.id)
      if (result.error) { setError(result.error); return }
      onDeleted(card.id)
    })
  }

  const handleForwardSend = async () => {
    if (!forwardForm.to.trim()) return
    setForwardLoading(true)
    setForwardResult(null)
    const result = await forwardTicketEmail(card.id, board.id, forwardForm.to.trim(), forwardForm.subject.trim(), forwardForm.body)
    setForwardLoading(false)
    if (result.error) {
      setForwardResult({ error: result.error })
    } else {
      setForwardResult({ success: true })
      setTimeout(() => { setForwarding(false); setForwardResult(null) }, 2000)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-5xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {card.store || 'No store'}
                </h2>
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium border', URGENCY_STYLES[card.urgency] ?? URGENCY_STYLES.medium)}>
                  {card.urgency.charAt(0).toUpperCase() + card.urgency.slice(1)}
                </span>
                {isClosed && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600">
                    Closed
                  </span>
                )}
                {card.needs_review && !editing && (
                  <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700">
                    <AlertCircle size={11} />
                    Needs Review
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                {card.sc_number && (
                  <span>
                    {getDispatchFieldLabel(board, 'sc_number')}{' '}
                    {trackingHref ? (
                      <a href={trackingHref} target="_blank" rel="noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                        {card.sc_number}
                      </a>
                    ) : card.sc_number}
                  </span>
                )}
                {currentColumn && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: currentColumn.color }} />
                    {currentColumn.name}
                  </span>
                )}
                {!card.kalos_job_number && (
                  <span className="text-rose-500 font-medium">Missing {getDispatchFieldLabel(board, 'kalos_job_number')}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {canEdit && !editing && (
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col sm:flex-row min-h-0">
          {/* Fields */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 sm:border-r border-slate-200 dark:border-slate-700">
            {!editing ? (
              <ReadView board={board} card={card} columns={columns} vendors={localVendors} members={members} />
            ) : (
              <EditForm
                board={board}
                form={form}
                set={set}
                columns={columns}
                vendors={localVendors}
                onVendorAdded={v => { setLocalVendors(prev => [...prev, v]); set('vendor_id', v.id) }}
                members={members}
                fieldLinks={fieldLinks}
                setFieldLink={setFieldLink}
                handleLinkKeyDown={handleLinkKeyDown}
              />
            )}

            {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

            {editing && (
              <div className="flex gap-2 mt-6">
                <Button onClick={handleSave} loading={isPending}>Save Changes</Button>
                <Button variant="secondary" onClick={() => { setEditing(false); setError('') }} disabled={isPending}>
                  Cancel
                </Button>
              </div>
            )}

            {/* Card actions */}
            {!editing && (
              <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 flex-wrap">
                  {!isClosed ? (
                    <Button variant="secondary" size="sm" onClick={handleClose} loading={isPending}>
                      <CheckCircle size={14} />
                      Close Card
                    </Button>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={handleReopen} loading={isPending}>
                      <RefreshCw size={14} />
                      Reopen Card
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => { setForwarding(f => !f); setForwardResult(null) }}
                  >
                    <Send size={14} />
                    Forward
                  </Button>
                  {canManage && (
                    confirmDelete ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Are you sure?</span>
                        <Button variant="danger" size="sm" onClick={handleDelete} loading={isPending}>Delete</Button>
                        <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 ml-auto">
                        <Trash2 size={14} />
                        Delete
                      </Button>
                    )
                  )}
                </div>

                {/* Forward compose panel */}
                {forwarding && (
                  <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Forward Ticket</p>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">To</label>
                      <input
                        type="email"
                        value={forwardForm.to}
                        onChange={e => setForwardForm(f => ({ ...f, to: e.target.value }))}
                        className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="vendor@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Subject</label>
                      <input
                        type="text"
                        value={forwardForm.subject}
                        onChange={e => setForwardForm(f => ({ ...f, subject: e.target.value }))}
                        className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Body</label>
                      <textarea
                        rows={8}
                        value={forwardForm.body}
                        onChange={e => setForwardForm(f => ({ ...f, body: e.target.value }))}
                        className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y font-mono"
                      />
                    </div>
                    {forwardResult?.error && (
                      <p className="text-xs text-rose-600">{forwardResult.error}</p>
                    )}
                    {forwardResult?.success && (
                      <p className="text-xs text-emerald-600 font-medium">Email sent successfully.</p>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleForwardSend} loading={forwardLoading} disabled={!forwardForm.to.trim()}>
                        <Send size={13} />
                        Send
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => { setForwarding(false); setForwardResult(null) }} disabled={forwardLoading}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Activity log — hidden on mobile, visible on sm+ */}
          <div className="hidden sm:flex w-80 shrink-0 flex-col overflow-hidden p-4">
            <DispatchActivityLog cardId={card.id} boardId={board.id} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Read view ─────────────────────────────────────────────────────────────────

function ReadView({ board, card, columns, vendors, members }: {
  board: DispatchBoard
  card: DispatchCard
  columns: DispatchColumn[]
  vendors: DispatchVendor[]
  members: Props['members']
}) {
  const vendor = vendors.find(v => v.id === card.vendor_id)
  const assignee = members.find(m => m.id === card.assigned_to)
  void board

  return (
    <div className="space-y-6">
      {/* Status & Assignment */}
      <Section title="Status & Assignment">
        <FieldGrid>
          <Field label="Status (Column)" value={columns.find(c => c.id === card.column_id)?.name ?? '—'} />
          <Field label="Urgency" value={card.urgency.charAt(0).toUpperCase() + card.urgency.slice(1)} />
          <Field label="Assigned To" value={assignee?.full_name ?? '—'} />
          <Field label="Vendor" value={vendor?.name ?? '—'} />
          {card.vendor_email && <Field label="Vendor Email" value={card.vendor_email} />}
        </FieldGrid>
      </Section>

      {/* Service Call Details */}
      <Section title="Service Call Details">
        <FieldGrid>
          <Field label="Store" value={card.store ?? '—'} />
          <Field label="Date Started" value={card.date_started ? new Date(card.date_started + 'T00:00:00').toLocaleDateString() : '—'} />
          <Field label={getDispatchFieldLabel(board, 'sc_number')} value={card.sc_number ?? '—'} href={makeDispatchFieldHref(board, 'sc_number', card.sc_number, card)} />
          <Field label={getDispatchFieldLabel(board, 'kalos_job_number')} value={card.kalos_job_number ?? '—'} highlight={!card.kalos_job_number} href={makeDispatchFieldHref(board, 'kalos_job_number', card.kalos_job_number, card)} />
          <Field label="ETA / Scheduled" value={card.eta_scheduled ? new Date(card.eta_scheduled).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'} />
          <Field label="Rack / Circuit / Case" value={card.rack_circuit_case ?? '—'} />
        </FieldGrid>
        {card.description && (
          <div className="mt-3">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Description</p>
            <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{card.description}</p>
          </div>
        )}
      </Section>

      {/* Parts & Notes */}
      <Section title="Parts & Notes">
        <FieldGrid>
          <Field label="Part Ordered" value={card.part_ordered ? 'Yes' : 'No'} />
          {card.part_ordered && <Field label="Ordered By" value={card.who_ordered ?? '—'} />}
          <Field label="Needs Review" value={card.needs_review ? 'Yes' : 'No'} />
        </FieldGrid>
        {card.notes && (
          <div className="mt-3">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Notes</p>
            <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{card.notes}</p>
          </div>
        )}
      </Section>

      {/* Alert */}
      {card.alert_at && (() => {
        const alertDate = new Date(card.alert_at)
        const isOverdue = alertDate <= new Date()
        return (
          <Section title="Alert">
            <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 ${isOverdue ? 'bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-700' : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700'}`}>
              <span className={`text-lg ${isOverdue ? 'text-rose-500' : 'text-amber-500'}`}>🔔</span>
              <div>
                <p className={`text-sm font-semibold ${isOverdue ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300'}`}>
                  {isOverdue ? 'Alert overdue' : 'Alert scheduled'} — {alertDate.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
                {card.alert_note && <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{card.alert_note}</p>}
              </div>
            </div>
          </Section>
        )
      })()}

      {/* Email details (if present) */}
      {card.gmail_thread_id && (
        <Section title="Email Thread">
          <FieldGrid>
            <Field label="Subject" value={card.email_subject ?? '—'} />
            <Field label="From" value={card.email_sender ?? '—'} />
            <Field label="Last Email" value={card.last_email_date ? new Date(card.last_email_date).toLocaleString() : '—'} />
          </FieldGrid>
        </Section>
      )}

      {/* Metadata */}
      <Section title="Info">
        <FieldGrid>
          <Field label="Source" value={card.source} />
          <Field label="Created" value={new Date(card.created_at).toLocaleString()} />
          {card.closed_at && <Field label="Closed" value={new Date(card.closed_at).toLocaleString()} />}
        </FieldGrid>
      </Section>
    </div>
  )
}

// ── Edit form ─────────────────────────────────────────────────────────────────

function EditForm({ board, form, set, columns, vendors, onVendorAdded, members, fieldLinks, setFieldLink, handleLinkKeyDown }: {
  board: DispatchBoard
  form: Record<string, unknown>
  set: (key: string, value: unknown) => void
  columns: DispatchColumn[]
  vendors: DispatchVendor[]
  onVendorAdded: (v: DispatchVendor) => void
  members: Props['members']
  fieldLinks: Record<string, string>
  setFieldLink: (field: 'sc_number' | 'kalos_job_number') => void
  handleLinkKeyDown: (field: 'sc_number' | 'kalos_job_number') => (event: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  const [addingVendor, setAddingVendor] = useState(false)
  const [newVendorName, setNewVendorName] = useState('')
  const [vendorSaving, setVendorSaving] = useState(false)
  const vendorInputRef = useRef<HTMLInputElement>(null)
  const f = form as Record<string, string | boolean>
  void board

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
    <div className="space-y-5">
      {/* Status & Assignment */}
      <Section title="Status & Assignment">
        <FieldGrid>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Column</label>
            <select value={String(f.column_id)} onChange={e => set('column_id', e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Unassigned</option>
              {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Urgency</label>
            <select value={String(f.urgency)} onChange={e => set('urgency', e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Assigned To</label>
            <select value={String(f.assigned_to)} onChange={e => set('assigned_to', e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Unassigned</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Vendor</label>
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
                  className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={vendorSaving}
                />
                <button onClick={confirmNewVendor} disabled={vendorSaving || !newVendorName.trim()} className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  {vendorSaving ? '…' : 'Add'}
                </button>
                <button onClick={() => { setAddingVendor(false); setNewVendorName('') }} className="px-2 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50">✕</button>
              </div>
            ) : (
              <select
                value={String(f.vendor_id)}
                onChange={e => { if (e.target.value === '__new__') { setAddingVendor(true); return } set('vendor_id', e.target.value) }}
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">None</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                <option value="__new__">+ Add new vendor…</option>
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Vendor Email</label>
            <input type="email" value={String(f.vendor_email)} onChange={e => set('vendor_email', e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="vendor@email.com" />
          </div>
        </FieldGrid>
      </Section>

      {/* Service Call Details */}
      <Section title="Service Call Details">
        <FieldGrid>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Store</label>
            <input value={String(f.store)} onChange={e => set('store', e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Store name" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Date Started</label>
            <input type="date" value={String(f.date_started)} onChange={e => set('date_started', e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">SC #</label>
              <button type="button" onClick={() => setFieldLink('sc_number')} className="text-slate-400 hover:text-indigo-500" title="Add link (Ctrl+K)">
                <Link2 size={13} />
              </button>
            </div>
            <input value={String(f.sc_number)} onChange={e => set('sc_number', e.target.value)} onKeyDown={handleLinkKeyDown('sc_number')}
              className={cn('w-full px-2.5 py-1.5 text-sm rounded-lg border dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500', fieldLinks.sc_number ? 'border-indigo-400 dark:border-indigo-500' : 'border-slate-300 dark:border-slate-600')}
              placeholder="Service call #" />
            {fieldLinks.sc_number && <p className="mt-1 text-[11px] text-indigo-500 truncate">Linked</p>}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                Kalos Job # <span className="text-rose-500">*</span>
              </label>
              <button type="button" onClick={() => setFieldLink('kalos_job_number')} className="text-slate-400 hover:text-indigo-500" title="Add link (Ctrl+K)">
                <Link2 size={13} />
              </button>
            </div>
            <input value={String(f.kalos_job_number)} onChange={e => set('kalos_job_number', e.target.value)} onKeyDown={handleLinkKeyDown('kalos_job_number')}
              className={cn('w-full px-2.5 py-1.5 text-sm rounded-lg border dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500', fieldLinks.kalos_job_number ? 'border-indigo-400 dark:border-indigo-500' : 'border-slate-300 dark:border-slate-600')}
              placeholder="Leave blank if not yet assigned" />
            {fieldLinks.kalos_job_number && <p className="mt-1 text-[11px] text-indigo-500 truncate">Linked</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">ETA / Scheduled</label>
            <input type="datetime-local" value={String(f.eta_scheduled)} onChange={e => set('eta_scheduled', e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Rack / Circuit / Case</label>
            <input value={String(f.rack_circuit_case)} onChange={e => set('rack_circuit_case', e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Rack 3, Circuit 7" />
          </div>
        </FieldGrid>
        <div className="mt-3">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Description</label>
          <textarea rows={3} value={String(f.description)} onChange={e => set('description', e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            placeholder="Describe the issue..." />
        </div>
      </Section>

      {/* Parts & Notes */}
      <Section title="Parts & Notes">
        <div className="flex items-center gap-4 mb-3">
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={Boolean(f.part_ordered)} onChange={e => set('part_ordered', e.target.checked)}
              className="rounded" />
            Part Ordered
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={Boolean(f.needs_review)} onChange={e => set('needs_review', e.target.checked)}
              className="rounded" />
            Needs Review
          </label>
        </div>
        {Boolean(f.part_ordered) && (
          <div className="mb-3">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Who Ordered</label>
            <input value={String(f.who_ordered)} onChange={e => set('who_ordered', e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Person who ordered the part" />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Notes</label>
          <textarea rows={3} value={String(f.notes)} onChange={e => set('notes', e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            placeholder="Additional notes..." />
        </div>
      </Section>

      {/* Alert */}
      <Section title="Alert">
        <FieldGrid>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Alert time</label>
            <input type="datetime-local" value={String(f.alert_at)} onChange={e => set('alert_at', e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Alert note</label>
            <input value={String(f.alert_note)} onChange={e => set('alert_note', e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Follow up with vendor" />
          </div>
        </FieldGrid>
        {f.alert_at && (
          <button onClick={() => { set('alert_at', ''); set('alert_note', '') }}
            className="mt-2 text-xs text-rose-500 hover:text-rose-700">
            Clear alert
          </button>
        )}
      </Section>
    </div>
  )
}

// ── Helper sub-components ─────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3">{title}</h3>
      {children}
    </div>
  )
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-6 gap-y-3">{children}</div>
}

function Field({ label, value, highlight, href }: { label: string; value: string; highlight?: boolean; href?: string | null }) {
  if (href && value) {
    return (
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">{label}</p>
        <a href={href} target="_blank" rel="noreferrer" className={cn('text-sm font-medium hover:underline', highlight ? 'text-rose-500' : 'text-indigo-600 dark:text-indigo-400')}>
          {value}
        </a>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">{label}</p>
      <p className={cn('text-sm font-medium', highlight ? 'text-rose-500' : 'text-slate-900 dark:text-white')}>
        {value || '—'}
      </p>
    </div>
  )
}
