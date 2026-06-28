'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Printer, ClipboardList, Trash2, Loader2, Upload } from 'lucide-react'
import { PunchItemCard } from './PunchItemCard'
import { PunchItemForm } from './PunchItemForm'
import { PunchCompleteForm } from './PunchCompleteForm'
import { PunchPrintModal, PunchPrintScope } from './PunchPrintModal'
import { PunchImportModal } from './PunchImportModal'
import { updatePunchItem, deletePunchItem } from '@/app/app/projects/[id]/punch-actions'
import { PUNCH_STATUS_ORDER, PUNCH_STATUS_LABELS, PUNCH_STATUS_COLOR } from '@/lib/punch'
import { formatDate } from '@/lib/dates'
import { PunchItem, PunchStatus, Profile, Project } from '@/types/app'
import { cn } from '@/lib/utils'

interface PunchListTabProps {
  project: Project
  items: PunchItem[]
  members: Profile[]
  currentUserId: string
  canEdit: boolean
  canPrint: boolean
}

type StatusFilter = PunchStatus | 'all'

export function PunchListTab({ project, items, members, currentUserId, canEdit, canPrint }: PunchListTabProps) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [completing, setCompleting] = useState<PunchItem | null>(null)
  const [detail, setDetail] = useState<PunchItem | null>(null)
  const [printScope, setPrintScope] = useState<PunchPrintScope | null>(null)
  const [printMenuOpen, setPrintMenuOpen] = useState(false)
  const [filter, setFilter] = useState<StatusFilter>('all')

  const memberMap = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m.full_name])), [members])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length }
    for (const s of PUNCH_STATUS_ORDER) c[s] = 0
    for (const it of items) c[it.status] = (c[it.status] ?? 0) + 1
    return c
  }, [items])

  const visible = filter === 'all' ? items : items.filter((i) => i.status === filter)

  // Group visible items by status for the board layout.
  const groups = useMemo(() => {
    return PUNCH_STATUS_ORDER.map((status) => ({
      status,
      items: visible.filter((i) => i.status === status),
    })).filter((g) => g.items.length > 0)
  }, [visible])

  const canEditItem = (item: PunchItem) => canEdit || item.assigned_to === currentUserId

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList size={18} className="text-indigo-500" />
          <h2 className="text-sm font-semibold text-slate-700">Punch List</h2>
          <span className="text-xs text-slate-400">{items.length} total</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {canPrint && items.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setPrintMenuOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <Printer size={15} /> Export
              </button>
              {printMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setPrintMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                    {(['all', 'open', 'completed'] as PunchPrintScope[]).map((scope) => (
                      <button
                        key={scope}
                        onClick={() => { setPrintScope(scope); setPrintMenuOpen(false) }}
                        className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                      >
                        {scope === 'all' ? 'Full punch list' : scope === 'open' ? 'Open items only' : 'Completed items only'}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {canEdit && (
            <button
              onClick={() => setImporting(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <Upload size={15} /> Import
            </button>
          )}
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus size={16} /> New Punch Item
          </button>
        </div>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip label={`All (${counts.all})`} active={filter === 'all'} onClick={() => setFilter('all')} />
        {PUNCH_STATUS_ORDER.map((s) => (
          <FilterChip
            key={s}
            label={`${PUNCH_STATUS_LABELS[s]} (${counts[s] ?? 0})`}
            active={filter === s}
            color={PUNCH_STATUS_COLOR[s]}
            onClick={() => setFilter(s)}
          />
        ))}
      </div>

      {/* Board */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center">
          <ClipboardList size={28} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">No punch items yet</p>
          <p className="mt-0.5 text-xs text-slate-400">Snap a photo and log the first issue.</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-400">
          No items in this status.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.status}>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PUNCH_STATUS_COLOR[group.status] }} />
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {PUNCH_STATUS_LABELS[group.status]}
                </h3>
                <span className="text-xs text-slate-400">{group.items.length}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.items.map((item) => (
                  <PunchItemCard
                    key={item.id}
                    item={item}
                    assigneeName={item.assigned_to ? memberMap[item.assigned_to] ?? null : null}
                    onOpen={setDetail}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {creating && (
        <PunchItemForm projectId={project.id} members={members} onClose={() => setCreating(false)} />
      )}
      {importing && (
        <PunchImportModal projectId={project.id} onClose={() => setImporting(false)} />
      )}
      {completing && (
        <PunchCompleteForm item={completing} onClose={() => setCompleting(null)} />
      )}
      {detail && (
        <PunchDetailSheet
          item={detail}
          memberMap={memberMap}
          members={members}
          canEdit={canEditItem(detail)}
          canDelete={canEdit}
          onClose={() => setDetail(null)}
          onComplete={() => { setCompleting(detail); setDetail(null) }}
          onChanged={() => { setDetail(null); router.refresh() }}
        />
      )}
      {printScope && (
        <PunchPrintModal
          project={project}
          items={items}
          memberMap={memberMap}
          scope={printScope}
          onClose={() => setPrintScope(null)}
        />
      )}
    </div>
  )
}

function FilterChip({ label, active, color, onClick }: { label: string; active: boolean; color?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      )}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: active ? '#fff' : color }} />}
      {label}
    </button>
  )
}

// ── Detail sheet: view full item + status controls + complete/delete ─────────

function PunchDetailSheet({
  item,
  memberMap,
  members,
  canEdit,
  canDelete,
  onClose,
  onComplete,
  onChanged,
}: {
  item: PunchItem
  memberMap: Record<string, string>
  members: Profile[]
  canEdit: boolean
  canDelete: boolean
  onClose: () => void
  onComplete: () => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const setStatus = async (status: PunchStatus) => {
    setBusy(true); setError('')
    const result = await updatePunchItem(item.id, { status })
    setBusy(false)
    if (!result.success) { setError(result.error); return }
    onChanged()
  }

  const setAssignee = async (assigned_to: string) => {
    setBusy(true); setError('')
    const result = await updatePunchItem(item.id, { assigned_to: assigned_to || null })
    setBusy(false)
    if (!result.success) { setError(result.error); return }
    onChanged()
  }

  const handleDelete = async () => {
    if (!confirm('Delete this punch item? This cannot be undone.')) return
    setBusy(true); setError('')
    const result = await deletePunchItem(item.id)
    setBusy(false)
    if (!result.success) { setError(result.error); return }
    onChanged()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            Punch Item {item.number ? `#${item.number}` : ''}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {item.issue_photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.issue_photo_url} alt="Issue" className="max-h-72 w-full rounded-xl border border-slate-200 object-contain bg-slate-50" />
          )}
          {item.title && <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>}
          <p className="text-sm text-slate-700">{item.issue_description}</p>

          <dl className="grid grid-cols-2 gap-2 text-xs text-slate-500">
            {item.location && <div><dt className="font-semibold text-slate-400">Location</dt><dd className="text-slate-700">{item.location}</dd></div>}
            {item.category && <div><dt className="font-semibold text-slate-400">Category</dt><dd className="text-slate-700">{item.category}</dd></div>}
            {item.due_date && <div><dt className="font-semibold text-slate-400">Due</dt><dd className="text-slate-700">{formatDate(item.due_date, 'MMM d, yyyy')}</dd></div>}
          </dl>

          {/* Completion details if completed */}
          {item.status === 'completed' && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700">Completion</p>
              {item.completion_photo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.completion_photo_url} alt="Completion" className="mb-2 max-h-60 w-full rounded-lg border border-emerald-200 object-contain bg-white" />
              )}
              <p className="text-sm text-slate-700">{item.completion_description}</p>
              {item.completed_at && (
                <p className="mt-1 text-xs text-slate-500">
                  By {item.completed_by ? memberMap[item.completed_by] ?? '—' : '—'} on {formatDate(item.completed_at, 'MMM d, yyyy')}
                </p>
              )}
            </div>
          )}

          {/* Controls */}
          {canEdit && (
            <div className="space-y-3 border-t border-slate-100 pt-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Status</label>
                <div className="flex flex-wrap gap-1.5">
                  {PUNCH_STATUS_ORDER.filter((s) => s !== 'completed').map((s) => (
                    <button
                      key={s}
                      disabled={busy || item.status === s}
                      onClick={() => setStatus(s)}
                      className={cn(
                        'rounded-lg border px-2.5 py-1.5 text-xs font-medium',
                        item.status === s ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      {PUNCH_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Assigned to</label>
                <select
                  value={item.assigned_to ?? ''}
                  disabled={busy}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </div>
            </div>
          )}

          {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-4">
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-3 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              <Trash2 size={15} />
            </button>
          )}
          {canEdit && item.status !== 'completed' && (
            <button
              onClick={onComplete}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              Complete item
            </button>
          )}
          {(!canEdit || item.status === 'completed') && (
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
