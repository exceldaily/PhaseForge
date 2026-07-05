'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, List, LayoutGrid, Columns3, BellDot } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { FilterBar, useUrlFilters, splitMulti, type FilterDef } from '@/components/operations/FilterBar'
import { OpsPageHeader, StatusPill, EmptyState, timeAgo, daysOpen } from '@/components/operations/shared'
import { CallDetailPanel } from './CallDetailPanel'
import { createCall } from './actions'
import type { Call, OrgCallSettings, Division } from '@/lib/operations/types'
import { cn } from '@/lib/utils'

export interface Option { id: string; name: string }
export interface LocationOpt extends Option { customer_id: string; location_number: string | null }
export interface AssetOpt extends Option { location_id: string; trade_category: string | null }
export interface StaffOpt { id: string; full_name: string; ops_role: string | null }
export interface ReadRow { call_id: string; last_read_at: string }
export interface NoteTemplate { id: string; name: string; body: string }

const PRIORITY_BAR: Record<string, string> = {
  emergency: 'bg-red-500',
  high: 'bg-orange-400',
  normal: 'bg-sky-400',
  low: 'bg-slate-300',
}

export function slaState(call: Call): 'overdue' | 'at_risk' | null {
  const target = call.sla_at ?? (call.due_date ? `${call.due_date}T23:59:59` : null)
  if (!target) return null
  const isClosed = ['completed', 'closed', 'cancelled'].includes(call.status)
  if (isClosed) return null
  const hours = (new Date(target).getTime() - Date.now()) / 3600000
  if (hours <= 0) return 'overdue'
  if (hours <= 24) return 'at_risk'
  return null
}

export function CallsClient({
  calls, settings, customers, locations, assets, divisions, vendors, staff, reads, noteTemplates, userId, opsRole,
}: {
  calls: Call[]
  settings: OrgCallSettings
  customers: Option[]
  locations: LocationOpt[]
  assets: AssetOpt[]
  divisions: Division[]
  vendors: Option[]
  staff: StaffOpt[]
  reads: ReadRow[]
  noteTemplates: NoteTemplate[]
  userId: string
  opsRole: string
}) {
  const router = useRouter()
  const [filters, setFilters] = useUrlFilters()
  // ?new=1 (e.g. from the dashboard quick action) opens the create form directly.
  const [createOpen, setCreateOpen] = useState(() => filters.new === '1')
  const [pending] = useTransition()

  const view = filters.view || settings.default_view
  const selectedCall = calls.find((c) => c.id === filters.call) ?? null

  const readAt = useMemo(() => new Map(reads.map((r) => [r.call_id, r.last_read_at])), [reads])

  // Yellow "new update" alert: someone else added a note after my last read.
  const hasUnread = (c: Call) => {
    if (!c.last_note_at) return false
    const read = readAt.get(c.id)
    return !read || c.last_note_at > read
  }

  const statusLabel = useMemo(
    () => new Map(settings.statuses.map((s) => [s.key, s.label])),
    [settings.statuses]
  )
  const priorityDef = useMemo(
    () => new Map(settings.priorities.map((p) => [p.key, p])),
    [settings.priorities]
  )
  const closedKeys = useMemo(
    () => new Set(settings.statuses.filter((s) => s.closed).map((s) => s.key)),
    [settings.statuses]
  )

  // ── filtering ──────────────────────────────────────────────────────────────
  const q = (filters.q ?? '').toLowerCase()
  const filtered = calls.filter((c) => {
    if (q && !`#${c.call_number} ${c.title} ${c.description ?? ''} ${c.customer?.name ?? ''} ${c.location?.name ?? ''}`.toLowerCase().includes(q)) return false
    const statuses = splitMulti(filters.status)
    if (statuses.length ? !statuses.includes(c.status) : closedKeys.has(c.status) && filters.show_closed !== 'yes') return false
    const priorities = splitMulti(filters.priority)
    if (priorities.length && !priorities.includes(c.priority)) return false
    if (filters.division && c.division_id !== filters.division) return false
    if (filters.customer && c.customer_id !== filters.customer) return false
    if (filters.location && c.location_id !== filters.location) return false
    if (filters.assigned && c.assigned_staff_id !== filters.assigned) return false
    if (filters.vendor && c.vendor_id !== filters.vendor) return false
    if (filters.unassigned === 'yes' && (c.assigned_staff_id || c.vendor_id)) return false
    if (filters.sla === 'overdue' && slaState(c) !== 'overdue') return false
    if (filters.sla === 'at_risk' && slaState(c) !== 'at_risk') return false
    if (filters.unread === 'yes' && !hasUnread(c)) return false
    if (filters.invoice_ready === 'yes' && !c.invoice_ready) return false
    if (filters.aging && daysOpen(c.created_at) < Number(filters.aging)) return false
    if (filters.created_from && c.created_at.slice(0, 10) < filters.created_from) return false
    if (filters.created_to && c.created_at.slice(0, 10) > filters.created_to) return false
    return true
  })

  // Needs-attention ordering: unread first, then SLA risk, then priority, then age.
  const priorityRank = new Map(settings.priorities.map((p, i) => [p.key, i]))
  const sorted = [...filtered].sort((a, b) => {
    const ua = hasUnread(a) ? 1 : 0, ub = hasUnread(b) ? 1 : 0
    if (ua !== ub) return ub - ua
    const sa = slaState(a) === 'overdue' ? 2 : slaState(a) === 'at_risk' ? 1 : 0
    const sb = slaState(b) === 'overdue' ? 2 : slaState(b) === 'at_risk' ? 1 : 0
    if (sa !== sb) return sb - sa
    const pa = priorityRank.get(a.priority) ?? 0, pb = priorityRank.get(b.priority) ?? 0
    if (pa !== pb) return pb - pa
    return a.created_at < b.created_at ? -1 : 1
  })

  const unreadCount = calls.filter((c) => !closedKeys.has(c.status) && hasUnread(c)).length

  const defs: FilterDef[] = [
    { key: 'status', label: 'Status', type: 'multiselect', options: settings.statuses.map((s) => ({ value: s.key, label: s.label })) },
    { key: 'priority', label: 'Priority', type: 'multiselect', options: settings.priorities.map((p) => ({ value: p.key, label: p.label })) },
    ...(settings.use_divisions && divisions.length ? [{ key: 'division', label: 'Division', type: 'select', options: divisions.map((d) => ({ value: d.id, label: d.name })) } as FilterDef] : []),
    { key: 'customer', label: 'Customer', type: 'select', options: customers.map((c) => ({ value: c.id, label: c.name })) },
    { key: 'assigned', label: 'Staff', type: 'select', options: staff.map((s) => ({ value: s.id, label: s.full_name })) },
    { key: 'vendor', label: 'Vendor', type: 'select', options: vendors.map((v) => ({ value: v.id, label: v.name })) },
    { key: 'sla', label: 'SLA', type: 'select', options: [
      { value: 'overdue', label: 'Overdue' }, { value: 'at_risk', label: 'Due within 24h' }] },
    { key: 'aging', label: 'Aging', type: 'select', options: [
      { value: '3', label: 'Open 3+ days' }, { value: '7', label: 'Open 7+ days' }, { value: '14', label: 'Open 14+ days' }] },
    { key: 'unread', label: 'Updates', type: 'select', options: [{ value: 'yes', label: 'New updates' }] },
    { key: 'invoice_ready', label: 'Invoicing', type: 'select', options: [{ value: 'yes', label: 'Invoice ready' }] },
    { key: 'show_closed', label: 'Closed', type: 'select', options: [{ value: 'yes', label: 'Include closed' }] },
    { key: 'created', label: 'Created', type: 'daterange' },
  ]

  const canCreate = opsRole !== 'read_only' && opsRole !== 'billing'

  const setView = (v: string) => setFilters({ ...filters, view: v })
  const openCall = (id: string) => setFilters({ ...filters, call: id })
  const closePanel = () => {
    const next = { ...filters }
    delete next.call
    setFilters(next)
    router.refresh()
  }

  return (
    <div>
      <OpsPageHeader
        title={settings.terminology}
        subtitle={unreadCount > 0
          ? `${unreadCount} ${settings.terminology.toLowerCase()} with new updates`
          : `Track, assign, and complete ${settings.terminology.toLowerCase()}`}
        actions={
          <>
            <div className="flex rounded-lg border border-slate-300 dark:border-slate-700">
              {([['list', List], ['card', LayoutGrid], ['board', Columns3]] as const).map(([v, Icon]) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  title={`${v} view`}
                  className={cn(
                    'px-2.5 py-1.5 first:rounded-l-lg last:rounded-r-lg',
                    view === v ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                  )}
                >
                  <Icon size={15} />
                </button>
              ))}
            </div>
            {canCreate && (
              <Button size="sm" onClick={() => setCreateOpen(true)} loading={pending}>
                <Plus size={15} /> New {settings.terminology.replace(/s$/, '')}
              </Button>
            )}
          </>
        }
      />

      {/* Smart queue chips — one-tap operational queues, DispatchForge-style */}
      <QueueChips calls={calls} closedKeys={closedKeys} hasUnread={hasUnread} filters={filters} onChange={setFilters} />

      <FilterBar defs={defs} filters={filters} onChange={setFilters} searchPlaceholder={`Search ${settings.terminology.toLowerCase()}…`} />

      {sorted.length === 0 ? (
        <EmptyState
          title={calls.length ? `No ${settings.terminology.toLowerCase()} match the current filters.` : `No ${settings.terminology.toLowerCase()} yet.`}
          hint={calls.length ? undefined : 'Create the first one to start dispatching work.'}
          action={canCreate && !calls.length ? <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={14} /> Create</Button> : undefined}
        />
      ) : view === 'board' ? (
        <BoardView calls={sorted} settings={settings} hasUnread={hasUnread} onOpen={openCall} />
      ) : view === 'card' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((c) => (
            <CallCard key={c.id} call={c} statusLabel={statusLabel} priorityDef={priorityDef} unread={hasUnread(c)} onOpen={() => openCall(c.id)} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((c) => (
            <CallRow key={c.id} call={c} settings={settings} statusLabel={statusLabel} priorityDef={priorityDef} unread={hasUnread(c)} onOpen={() => openCall(c.id)} />
          ))}
        </div>
      )}

      {selectedCall && (
        <CallDetailPanel
          call={selectedCall}
          settings={settings}
          customers={customers}
          locations={locations}
          assets={assets}
          divisions={divisions}
          vendors={vendors}
          staff={staff}
          noteTemplates={noteTemplates}
          userId={userId}
          opsRole={opsRole}
          onClose={closePanel}
        />
      )}

      {createOpen && (
        <CreateCallModal
          settings={settings}
          customers={customers}
          locations={locations}
          assets={assets}
          divisions={divisions}
          vendors={vendors}
          staff={staff}
          onClose={() => { setCreateOpen(false); router.refresh() }}
        />
      )}
    </div>
  )
}

// ── Queue chips — rule-based operational queues with live counts ─────────────

function QueueChips({
  calls, closedKeys, hasUnread, filters, onChange,
}: {
  calls: Call[]
  closedKeys: Set<string>
  hasUnread: (c: Call) => boolean
  filters: Record<string, string>
  onChange: (next: Record<string, string>) => void
}) {
  const active = calls.filter((c) => !closedKeys.has(c.status))
  const aging7 = active.filter((c) => daysOpen(c.created_at) >= 7).length

  const chips: { key: string; label: string; count: number; apply: Record<string, string>; tone: string }[] = [
    { key: 'all', label: 'All Active', count: active.length, apply: {}, tone: 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300' },
    { key: 'unread', label: 'New Updates', count: active.filter(hasUnread).length, apply: { unread: 'yes' }, tone: 'border-yellow-400 text-yellow-700 dark:text-yellow-400' },
    { key: 'unassigned', label: 'No Tech or Vendor', count: active.filter((c) => !c.assigned_staff_id && !c.vendor_id).length, apply: { unassigned: 'yes' }, tone: 'border-rose-300 text-rose-600 dark:border-rose-600 dark:text-rose-400' },
    { key: 'sla', label: 'SLA Overdue', count: active.filter((c) => slaState(c) === 'overdue').length, apply: { sla: 'overdue' }, tone: 'border-rose-300 text-rose-600 dark:border-rose-600 dark:text-rose-400' },
    { key: 'aging', label: 'Aging 7d+', count: aging7, apply: { aging: '7' }, tone: 'border-orange-300 text-orange-600 dark:border-orange-600 dark:text-orange-400' },
    { key: 'invoice', label: 'Invoice Ready', count: active.filter((c) => c.invoice_ready).length, apply: { invoice_ready: 'yes' }, tone: 'border-emerald-300 text-emerald-600 dark:border-emerald-600 dark:text-emerald-400' },
  ]

  const QUEUE_KEYS = ['unread', 'unassigned', 'sla', 'aging', 'invoice_ready']
  const isChipActive = (apply: Record<string, string>) => {
    const activeQueue = QUEUE_KEYS.filter((k) => filters[k])
    const applyKeys = Object.keys(apply)
    if (applyKeys.length === 0) return activeQueue.length === 0
    return applyKeys.every((k) => filters[k] === apply[k]) && activeQueue.length === applyKeys.length
  }

  const applyChip = (apply: Record<string, string>) => {
    const next = { ...filters }
    for (const k of QUEUE_KEYS) delete next[k]
    onChange({ ...next, ...apply })
  }

  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {chips.filter((c) => c.key === 'all' || c.count > 0).map((chip) => (
        <button
          key={chip.key}
          onClick={() => applyChip(chip.apply)}
          className={cn(
            'flex items-center gap-1.5 rounded-full border bg-white px-3 py-1 text-xs font-medium transition dark:bg-slate-900',
            chip.tone,
            isChipActive(chip.apply)
              ? 'ring-2 ring-indigo-500/40 shadow-sm'
              : 'opacity-80 hover:opacity-100'
          )}
        >
          {chip.label}
          <span className="font-bold">{chip.count}</span>
        </button>
      ))}
    </div>
  )
}

// ── Row (list view) — mirrors the DispatchForge call-row density ─────────────

function CallRow({
  call, settings, statusLabel, priorityDef, unread, onOpen,
}: {
  call: Call
  settings: OrgCallSettings
  statusLabel: Map<string, string>
  priorityDef: Map<string, { key: string; label: string; color: string }>
  unread: boolean
  onOpen: () => void
}) {
  const sla = slaState(call)
  const p = priorityDef.get(call.priority)
  return (
    <button
      onClick={onOpen}
      className={cn(
        'flex w-full items-stretch gap-3 rounded-xl border bg-white px-3 py-2.5 text-left transition hover:shadow-sm dark:bg-slate-900',
        unread
          ? 'border-yellow-400 bg-yellow-50/70 hover:bg-yellow-50 dark:border-yellow-500/60 dark:bg-yellow-500/10'
          : sla === 'overdue'
            ? 'border-rose-300 bg-rose-50/50 dark:border-rose-500/50 dark:bg-rose-500/10'
            : sla === 'at_risk'
              ? 'border-orange-300 bg-orange-50/50 dark:border-orange-500/40 dark:bg-orange-500/10'
              : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
      )}
    >
      <span className={cn('w-1 shrink-0 rounded-full', PRIORITY_BAR[call.priority] ?? 'bg-slate-300')} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {unread && (
            <span className="flex items-center gap-1 rounded bg-yellow-400 px-1.5 py-0.5 text-[10px] font-bold text-yellow-950">
              <BellDot size={10} /> NEW UPDATE
            </span>
          )}
          <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">#{call.call_number}</span>
          <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{call.title}</span>
          <StatusPill status={call.status} label={statusLabel.get(call.status)} />
          {p && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${p.color}22`, color: p.color }}>
              {p.label}
            </span>
          )}
          {call.invoice_ready && (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              Invoice Ready
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
          {call.customer && <span>{call.customer.name}</span>}
          {call.location && (
            <span>
              {call.location.location_number && <span className="font-mono">#{call.location.location_number} </span>}
              {call.location.name}
            </span>
          )}
          {settings.use_divisions && call.division && <span style={{ color: call.division.color }}>{call.division.name}</span>}
          <span>
            {call.assigned_staff?.full_name ?? call.vendor?.name ?? <span className="text-rose-500 font-medium">Unassigned</span>}
          </span>
          {sla && (
            <span className={cn('font-semibold', sla === 'overdue' ? 'text-rose-600' : 'text-orange-600')}>
              {sla === 'overdue' ? 'SLA overdue' : 'Due <24h'}
            </span>
          )}
          <span>{daysOpen(call.created_at)}d open</span>
          <span>Updated {timeAgo(call.last_activity_at)}</span>
        </div>
      </div>
    </button>
  )
}

// ── Card view ────────────────────────────────────────────────────────────────

function CallCard({
  call, statusLabel, priorityDef, unread, onOpen,
}: {
  call: Call
  statusLabel: Map<string, string>
  priorityDef: Map<string, { key: string; label: string; color: string }>
  unread: boolean
  onOpen: () => void
}) {
  const sla = slaState(call)
  const p = priorityDef.get(call.priority)
  return (
    <button
      onClick={onOpen}
      className={cn(
        'rounded-xl border bg-white p-4 text-left transition hover:shadow-sm dark:bg-slate-900',
        unread ? 'border-yellow-400 dark:border-yellow-500/60'
          : sla === 'overdue' ? 'border-rose-300 dark:border-rose-500/50'
          : 'border-slate-200 dark:border-slate-700'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-xs text-slate-400">#{call.call_number}</span>
        <div className="flex items-center gap-1.5">
          {unread && <BellDot size={14} className="text-yellow-500" />}
          <StatusPill status={call.status} label={statusLabel.get(call.status)} />
        </div>
      </div>
      <p className="mt-1.5 line-clamp-2 text-sm font-semibold text-slate-800 dark:text-slate-100">{call.title}</p>
      <p className="mt-1 text-xs text-slate-500">
        {[call.customer?.name, call.location?.name].filter(Boolean).join(' · ') || '—'}
      </p>
      <div className="mt-3 flex items-center justify-between text-[11px]">
        {p && <span className="font-semibold" style={{ color: p.color }}>{p.label}</span>}
        <span className="text-slate-400">
          {call.assigned_staff?.full_name ?? call.vendor?.name ?? 'Unassigned'} · {daysOpen(call.created_at)}d
        </span>
      </div>
    </button>
  )
}

// ── Board view (status lanes) ────────────────────────────────────────────────

function BoardView({
  calls, settings, hasUnread, onOpen,
}: {
  calls: Call[]
  settings: OrgCallSettings
  hasUnread: (c: Call) => boolean
  onOpen: (id: string) => void
}) {
  const lanes = settings.statuses.filter((s) => !s.closed || s.key === 'completed')
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {lanes.map((lane) => {
        const laneCalls = calls.filter((c) => c.status === lane.key)
        return (
          <div key={lane.key} className="w-64 shrink-0">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{lane.label}</span>
              <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">{laneCalls.length}</span>
            </div>
            <div className="space-y-2 rounded-xl bg-slate-100/60 p-2 dark:bg-slate-800/40">
              {laneCalls.length === 0 && <p className="py-6 text-center text-[11px] text-slate-400">Empty</p>}
              {laneCalls.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onOpen(c.id)}
                  className={cn(
                    'w-full rounded-lg border bg-white p-2.5 text-left text-xs shadow-sm transition hover:shadow dark:bg-slate-900',
                    hasUnread(c) ? 'border-yellow-400' : 'border-slate-200 dark:border-slate-700'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-slate-400">#{c.call_number}</span>
                    <span className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_BAR[c.priority] ?? 'bg-slate-300')} />
                  </div>
                  <p className="mt-1 line-clamp-2 font-medium text-slate-700 dark:text-slate-200">{c.title}</p>
                  <p className="mt-1 truncate text-[10px] text-slate-400">
                    {c.customer?.name ?? '—'}{c.assigned_staff ? ` · ${c.assigned_staff.full_name}` : c.vendor ? ` · ${c.vendor.name}` : ''}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Create modal (template-aware) ────────────────────────────────────────────

function CreateCallModal({
  settings, customers, locations, assets, divisions, vendors, staff, onClose,
}: {
  settings: OrgCallSettings
  customers: Option[]
  locations: LocationOpt[]
  assets: AssetOpt[]
  divisions: Division[]
  vendors: Option[]
  staff: StaffOpt[]
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [customerId, setCustomerId] = useState('')
  const [locationId, setLocationId] = useState('')

  const locs = customerId ? locations.filter((l) => l.customer_id === customerId) : locations
  const locAssets = locationId ? assets.filter((a) => a.location_id === locationId) : []
  const isResidential = settings.template_kind === 'residential'
  const single = settings.terminology.replace(/s$/, '')

  return (
    <Modal open onClose={onClose} title={`New ${single}`} size="lg">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          startTransition(async () => {
            const res = await createCall({
              title: String(fd.get('title') ?? ''),
              description: String(fd.get('description') ?? '') || undefined,
              customer_id: customerId || null,
              location_id: locationId || null,
              asset_id: String(fd.get('asset_id') ?? '') || null,
              division_id: String(fd.get('division_id') ?? '') || null,
              priority: String(fd.get('priority') ?? 'normal'),
              assigned_staff_id: String(fd.get('assigned_staff_id') ?? '') || null,
              vendor_id: String(fd.get('vendor_id') ?? '') || null,
              due_date: String(fd.get('due_date') ?? '') || null,
              sla_at: String(fd.get('sla_at') ?? '') ? new Date(String(fd.get('sla_at'))).toISOString() : null,
              service_type: String(fd.get('service_type') ?? '') || null,
            })
            if (res?.error) setError(res.error)
            else onClose()
          })
        }}
      >
        <Input name="title" label="Title" required autoFocus placeholder="Short description of the issue" />
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Customer
            <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setLocationId('') }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">—</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Location
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">—</option>
              {locs.map((l) => (
                <option key={l.id} value={l.id}>{l.location_number ? `#${l.location_number} ` : ''}{l.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {locAssets.length > 0 && (
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              Asset / equipment
              <select name="asset_id" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">—</option>
                {locAssets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Priority
            <select name="priority" defaultValue="normal" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {settings.priorities.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
          {settings.use_divisions && divisions.length > 0 && (
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              Division
              <select name="division_id" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">—</option>
                {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          )}
        </div>
        {isResidential && (
          <Input name="service_type" label="Service type" placeholder="Repair, maintenance, install…" />
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Assign staff
            <select name="assigned_staff_id" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Unassigned</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Assign vendor
            <select name="vendor_id" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">—</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input name="due_date" label="Due date" type="date" />
          <Input name="sla_at" label="SLA target" type="datetime-local" />
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Description
          <textarea name="description" rows={3} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={pending}>Create</Button>
        </div>
      </form>
    </Modal>
  )
}
