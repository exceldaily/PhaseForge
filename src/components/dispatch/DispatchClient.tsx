'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { KanbanSquare, List, Plus, Radio, Search, Settings2, X } from 'lucide-react'
import type {
  CallStatus, CallWithRelations, Customer, DispatchFormField, PartStatus,
  PrioritizedCall, PriorityLevel, ProposalStatus, Store, Urgency, Vendor,
} from '@/lib/dispatch/types'
import { prioritizeCalls } from '@/lib/dispatch/priorityEngine'
import { applyCallFilters, EMPTY_FILTERS, matchesSearch, type CallFilters } from '@/lib/dispatch/filters'
import { titleCase } from '@/lib/dispatch/utils'
import { CallRow } from './CallRow'
import { CallDetailPanel } from './CallDetailPanel'
import { NewCallModal } from './NewCallModal'
import { KanbanView } from './KanbanView'
import { ManageModal } from './ManageModal'

const STATUS_OPTIONS: CallStatus[] = [
  'open', 'in_progress', 'awaiting_repair', 'incomplete', 'recall', 'parts_on_order',
  'part_received', 'partially_delivered', 'quote_requested', 'proposal_sent',
  'proposal_approved', 'proposal_rejected', 'completed', 'cancelled',
]
const URGENCIES: Urgency[] = ['urgent', 'high', 'normal', 'low']
const PART_STATUSES: PartStatus[] = ['none', 'part_needed', 'ordered', 'received', 'partially_delivered', 'installed']
const PROPOSAL_STATUSES: ProposalStatus[] = ['none', 'quote_requested', 'sent', 'approved', 'parts_received', 'rejected']

const selectCls = 'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'

export function DispatchClient({ stores, vendors, customers, priorityLevels, formFields, calls, canEdit }: {
  stores: Store[]
  vendors: Vendor[]
  customers: Customer[]
  priorityLevels: PriorityLevel[]
  formFields: DispatchFormField[]
  calls: CallWithRelations[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [view, setView] = useState<'list' | 'kanban'>('list')
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<CallFilters>(EMPTY_FILTERS)
  const [showFilters, setShowFilters] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showManage, setShowManage] = useState(false)
  const [openCallId, setOpenCallId] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)

  const prioritized = useMemo(() => prioritizeCalls(calls), [calls])
  const visible = useMemo(() => {
    let rows = applyCallFilters(prioritized, filters).filter((c) => matchesSearch(c, query))
    if (!showClosed && !filters.status) {
      rows = rows.filter((c) => c.status !== 'completed' && c.status !== 'cancelled')
    }
    return rows
  }, [prioritized, filters, query, showClosed])

  const openCall = openCallId ? prioritized.find((c) => c.id === openCallId) ?? null : null
  const activeFilterCount = Object.entries(filters).filter(([k, v]) =>
    Array.isArray(v) ? v.length > 0 : v !== '' && v !== 0 && k !== 'minDaysOpen' || (k === 'minDaysOpen' && v !== 0),
  ).length

  const set = <K extends keyof CallFilters>(k: K, v: CallFilters[K]) => setFilters((f) => ({ ...f, [k]: v }))

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <Radio size={16} className="text-indigo-500" /> Dispatch
          </span>
          <div className="flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <button onClick={() => setView('list')}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium ${view === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
              <List size={13} /> List
            </button>
            <button onClick={() => setView('kanban')}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium ${view === 'kanban' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
              <KanbanSquare size={13} /> Kanban
            </button>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search calls, stores, techs…"
              className="w-56 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-xs outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <button onClick={() => setShowFilters((s) => !s)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${showFilters || activeFilterCount ? 'border-indigo-300 text-indigo-600' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}>
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </button>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="accent-indigo-600" />
            Show closed
          </label>
          <div className="ml-auto flex gap-2">
            {canEdit && (
              <>
                <button onClick={() => setShowManage(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:text-slate-300">
                  <Settings2 size={13} /> Manage
                </button>
                <button onClick={() => setShowNew(true)}
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">
                  <Plus size={13} /> New Call
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Filter bar ── */}
        {showFilters && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <select className={selectCls} value={filters.customerId} onChange={(e) => set('customerId', e.target.value)}>
              <option value="">All customers</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className={selectCls} value={filters.storeId} onChange={(e) => set('storeId', e.target.value)}>
              <option value="">All stores</option>
              {stores.map((s) => <option key={s.id} value={s.id}>#{s.store_number} — {s.store_name}</option>)}
            </select>
            <select className={selectCls} value={filters.status} onChange={(e) => set('status', e.target.value as CallStatus | '')}>
              <option value="">Any status</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
            </select>
            <select className={selectCls} value={filters.urgencies[0] ?? ''}
              onChange={(e) => set('urgencies', e.target.value ? [e.target.value as Urgency] : [])}>
              <option value="">Any urgency</option>
              {URGENCIES.map((u) => <option key={u} value={u}>{titleCase(u)}</option>)}
            </select>
            <select className={selectCls} value={filters.vendorId} onChange={(e) => set('vendorId', e.target.value)}>
              <option value="">Any tech</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <select className={selectCls} value={filters.partStatus} onChange={(e) => set('partStatus', e.target.value as PartStatus | '')}>
              <option value="">Any part status</option>
              {PART_STATUSES.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
            </select>
            <select className={selectCls} value={filters.proposalStatus} onChange={(e) => set('proposalStatus', e.target.value as ProposalStatus | '')}>
              <option value="">Any proposal</option>
              {PROPOSAL_STATUSES.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs text-slate-500">
              Open ≥
              <input type="number" min={0} value={filters.minDaysOpen || ''} placeholder="0"
                onChange={(e) => set('minDaysOpen', Number(e.target.value) || 0)}
                className="w-14 rounded-lg border border-slate-200 px-1.5 py-1.5 text-xs outline-none dark:border-slate-700 dark:bg-slate-800" />
              days
            </label>
            <input type="date" className={selectCls} value={filters.dateFrom} onChange={(e) => set('dateFrom', e.target.value)} />
            <input type="date" className={selectCls} value={filters.dateTo} onChange={(e) => set('dateTo', e.target.value)} />
            <button onClick={() => setFilters(EMPTY_FILTERS)}
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-rose-500">
              <X size={12} /> Clear
            </button>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-4 dark:bg-slate-950">
        {stores.length === 0 ? (
          <div className="mx-auto max-w-md py-16 text-center">
            <Radio size={36} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">Set up Dispatch</p>
            <p className="mt-1 text-sm text-slate-400">
              Add your stores and techs first — open <b>Manage</b> above. Then create service calls
              and this becomes your prioritized dispatch queue.
            </p>
          </div>
        ) : view === 'list' ? (
          <div className="mx-auto max-w-6xl space-y-2">
            {visible.length === 0 && (
              <p className="py-16 text-center text-sm text-slate-400">No calls match — adjust filters or create one.</p>
            )}
            {visible.map((call) => (
              <CallRow key={call.id} call={call} onOpen={() => setOpenCallId(call.id)} />
            ))}
          </div>
        ) : (
          <KanbanView calls={visible} onOpen={(id) => setOpenCallId(id)} />
        )}
      </div>

      {/* ── Overlays ── */}
      {showNew && (
        <NewCallModal
          stores={stores} vendors={vendors} priorityLevels={priorityLevels} formFields={formFields}
          canEdit={canEdit}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); router.refresh() }}
        />
      )}
      {openCall && (
        <CallDetailPanel
          call={openCall as PrioritizedCall}
          vendors={vendors} priorityLevels={priorityLevels} formFields={formFields}
          canEdit={canEdit}
          onClose={() => setOpenCallId(null)}
          onChanged={() => router.refresh()}
        />
      )}
      {showManage && (
        <ManageModal
          stores={stores} vendors={vendors} customers={customers}
          priorityLevels={priorityLevels} formFields={formFields}
          onClose={() => setShowManage(false)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  )
}
