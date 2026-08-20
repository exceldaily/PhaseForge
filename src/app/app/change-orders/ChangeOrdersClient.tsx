'use client'

// Change Order Control Center — KPI cards (clickable filters), Table / Kanban /
// Projects / My Queue views, instant search, quick create, and Add Project to
// CO Process. Mobile renders cards instead of the table.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plus, Search, LayoutGrid, Table2, FolderKanban, UserRound, X, ChevronDown,
  AlertTriangle, Building2, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CO_STAGES, CO_KANBAN_STAGES, CO_PENDING_STAGES, CO_INTERNAL_ACTION_STAGES,
  coStage, fmtMoney, coDisplayAmount, daysBetween, agingLevel,
  type ChangeOrderRow, type CoStageKey, CO_PRIORITIES,
} from '@/lib/changeOrders'
import { createChangeOrder, setCoTracking, changeStage, bulkAssignOwner } from './actions'

interface Member { id: string; full_name: string; role: string }
interface CoProject {
  id: string; name: string; customer_name: string | null; store_site_id: string | null
  job_number: string | null; project_manager?: string | null
  original_contract_value?: number | null; co_tracking_enabled?: boolean
}
interface EligibleProject {
  id: string; name: string; customer_name: string | null; store_site_id: string | null
  job_number: string | null; status?: string
}

type ViewKey = 'table' | 'kanban' | 'projects' | 'queue'
type KpiFilter = 'all' | 'internal' | 'customer' | 'revision' | 'over7' | 'over14' | 'approved_not_billed' | 'overdue'

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-800'

export function ChangeOrdersClient({
  cos, members, coProjects, eligibleProjects, currentUserId, isManager,
}: {
  cos: ChangeOrderRow[]
  members: Member[]
  coProjects: CoProject[]
  eligibleProjects: EligibleProject[]
  currentUserId: string
  isManager: boolean
}) {
  const router = useRouter()
  const [view, setView] = useState<ViewKey>('table')
  const [q, setQ] = useState('')
  const [kpi, setKpi] = useState<KpiFilter>('all')
  const [stageFilter, setStageFilter] = useState<string>('')
  const [customerFilter, setCustomerFilter] = useState<string>('')
  const [ownerFilter, setOwnerFilter] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [addingProjects, setAddingProjects] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const memberName = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m.full_name])), [members])
  const projectById = useMemo(() => Object.fromEntries(coProjects.map((p) => [p.id, p])), [coProjects])

  const open = useMemo(() => cos.filter((c) => coStage(c.stage).category !== 'terminal'), [cos])

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const now = new Date()
    const pending = open.filter((c) => CO_PENDING_STAGES.includes(c.stage as CoStageKey))
    const sum = (rows: ChangeOrderRow[]) => rows.reduce((a, c) => a + (coDisplayAmount(c) ?? 0), 0)
    const internal = open.filter((c) => CO_INTERNAL_ACTION_STAGES.includes(c.stage as CoStageKey))
    const customer = open.filter((c) => coStage(c.stage).external)
    const revision = open.filter((c) => c.stage === 'internal_revision' || c.stage === 'customer_revision')
    const over7 = open.filter((c) => daysBetween(c.stage_entered_at, now) >= 7)
    const over14 = open.filter((c) => daysBetween(c.stage_entered_at, now) >= 14)
    const anb = cos.filter((c) => c.approved_amount != null && !['billed', 'paid'].includes(c.billing_status) && coStage(c.stage).category !== 'terminal' && ['approved', 'work_complete', 'ready_to_bill'].includes(c.stage))
    const overdue = open.filter((c) => (c.due_date && c.due_date < now.toISOString().slice(0, 10)) || (c.follow_up_date && c.follow_up_date < now.toISOString().slice(0, 10)))
    return {
      openCount: open.length, pendingValue: sum(pending),
      internal, customer, revision, over7, over14, anb, overdue,
      customerValue: sum(customer), anbValue: anb.reduce((a, c) => a + (c.approved_amount ?? 0), 0),
      over14Value: sum(over14),
    }
  }, [cos, open])

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = view === 'queue'
      ? open.filter((c) => c.owner_id === currentUserId)
      : open
    if (kpi === 'internal') rows = rows.filter((c) => CO_INTERNAL_ACTION_STAGES.includes(c.stage as CoStageKey))
    if (kpi === 'customer') rows = rows.filter((c) => coStage(c.stage).external)
    if (kpi === 'revision') rows = rows.filter((c) => c.stage === 'internal_revision' || c.stage === 'customer_revision')
    if (kpi === 'over7') rows = rows.filter((c) => daysBetween(c.stage_entered_at) >= 7)
    if (kpi === 'over14') rows = rows.filter((c) => daysBetween(c.stage_entered_at) >= 14)
    if (kpi === 'approved_not_billed') rows = rows.filter((c) => c.approved_amount != null && ['approved', 'work_complete', 'ready_to_bill'].includes(c.stage))
    if (kpi === 'overdue') {
      const today = new Date().toISOString().slice(0, 10)
      rows = rows.filter((c) => (c.due_date && c.due_date < today) || (c.follow_up_date && c.follow_up_date < today))
    }
    if (stageFilter) rows = rows.filter((c) => c.stage === stageFilter)
    if (customerFilter) rows = rows.filter((c) => (c.customer_name ?? '') === customerFilter)
    if (ownerFilter) rows = rows.filter((c) => c.owner_id === ownerFilter)
    const needle = q.trim().toLowerCase()
    if (needle) {
      rows = rows.filter((c) => [
        c.co_label, c.title, c.description, c.customer_name, c.store_number,
        c.tracking_number, c.confirmation_number, c.invoice_number,
        projectById[c.project_id]?.name, projectById[c.project_id]?.job_number,
        c.owner_id ? memberName[c.owner_id] : '',
      ].some((v) => v && String(v).toLowerCase().includes(needle)))
    }
    return rows
  }, [open, view, kpi, stageFilter, customerFilter, ownerFilter, q, currentUserId, memberName, projectById])

  const customers = useMemo(() => [...new Set(open.map((c) => c.customer_name).filter(Boolean))] as string[], [open])

  const myCount = open.filter((c) => c.owner_id === currentUserId).length

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Change Orders</h1>
          <p className="text-xs text-slate-500">Every CO, who has it, and what happens next</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isManager && (
            <button onClick={() => setAddingProjects(true)}
              className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
              <Building2 size={15} /> Add Project
            </button>
          )}
          {isManager && (
            <button data-help="co-new" onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
              <Plus size={16} /> New Change Order
            </button>
          )}
        </div>
      </div>

      {/* KPI cards (clickable filters) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
        <Kpi label="Open COs" value={String(kpis.openCount)} active={kpi === 'all'} onClick={() => setKpi('all')} />
        <Kpi label="Pending Value" value={fmtMoney(kpis.pendingValue, { compact: true })} active={kpi === 'all'} onClick={() => setKpi('all')} tone="indigo" />
        <Kpi label="Need Internal Action" value={String(kpis.internal.length)} active={kpi === 'internal'} onClick={() => setKpi(kpi === 'internal' ? 'all' : 'internal')} tone="amber" />
        <Kpi label="Waiting on Customer" value={fmtMoney(kpis.customerValue, { compact: true })} sub={`${kpis.customer.length} COs`} active={kpi === 'customer'} onClick={() => setKpi(kpi === 'customer' ? 'all' : 'customer')} tone="sky" />
        <Kpi label="Revision Required" value={String(kpis.revision.length)} active={kpi === 'revision'} onClick={() => setKpi(kpi === 'revision' ? 'all' : 'revision')} tone="pink" />
        <Kpi label="Over 14 Days" value={fmtMoney(kpis.over14Value, { compact: true })} sub={`${kpis.over14.length} COs`} active={kpi === 'over14'} onClick={() => setKpi(kpi === 'over14' ? 'all' : 'over14')} tone="rose" />
        <Kpi label="Overdue / Follow-up" value={String(kpis.overdue.length)} active={kpi === 'overdue'} onClick={() => setKpi(kpi === 'overdue' ? 'all' : 'overdue')} tone="rose" />
        <Kpi label="Approved Not Billed" value={fmtMoney(kpis.anbValue, { compact: true })} sub={`${kpis.anb.length} COs`} active={kpi === 'approved_not_billed'} onClick={() => setKpi(kpi === 'approved_not_billed' ? 'all' : 'approved_not_billed')} tone="emerald" />
      </div>

      {/* Toolbar: search / filters / views */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-44 max-w-md">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search CO#, project, store, tracking#, invoice…"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-3 py-2 text-sm outline-none focus:border-indigo-400" />
        </div>
        <FilterSelect helpKey="co-filter" value={stageFilter} onChange={setStageFilter} label="All stages"
          options={CO_STAGES.map((s) => ({ value: s.key, label: s.label }))} />
        <FilterSelect value={customerFilter} onChange={setCustomerFilter} label="All customers"
          options={customers.map((c) => ({ value: c, label: c }))} />
        <FilterSelect value={ownerFilter} onChange={setOwnerFilter} label="All owners"
          options={members.map((m) => ({ value: m.id, label: m.full_name }))} />
        {(kpi !== 'all' || stageFilter || customerFilter || ownerFilter || q) && (
          <button onClick={() => { setKpi('all'); setStageFilter(''); setCustomerFilter(''); setOwnerFilter(''); setQ('') }}
            className="text-xs font-medium text-indigo-600 hover:underline">Clear all</button>
        )}
        <div className="ml-auto flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <ViewBtn active={view === 'table'} onClick={() => setView('table')} icon={<Table2 size={14} />} label="Table" />
          <ViewBtn active={view === 'kanban'} onClick={() => setView('kanban')} icon={<LayoutGrid size={14} />} label="Kanban" />
          <ViewBtn active={view === 'projects'} onClick={() => setView('projects')} icon={<FolderKanban size={14} />} label="Projects" />
          <ViewBtn active={view === 'queue'} onClick={() => setView('queue')} icon={<UserRound size={14} />} label={`My Queue${myCount ? ` (${myCount})` : ''}`} />
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && isManager && (
        <BulkBar selected={selected} members={members} onDone={() => { setSelected(new Set()); router.refresh() }} />
      )}

      {/* Views */}
      {view === 'kanban' ? (
        <KanbanView rows={filtered} memberName={memberName} projectById={projectById} isManager={isManager} onChanged={() => router.refresh()} />
      ) : view === 'projects' ? (
        <ProjectsView projects={coProjects} cos={cos} isManager={isManager} onAdd={() => setAddingProjects(true)} />
      ) : (
        <TableView rows={filtered} memberName={memberName} projectById={projectById}
          selected={selected} onToggle={(id) => setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })}
          selectable={isManager}
          emptyLabel={view === 'queue' ? 'Nothing needs your attention — your queue is clear.' : 'No change orders match these filters.'} />
      )}

      {creating && (
        <CreateCoModal projects={[...coProjects, ...eligibleProjects]} members={members}
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); router.push(`/app/change-orders/${id}`) }} />
      )}
      {addingProjects && (
        <AddProjectsModal projects={eligibleProjects} onClose={() => setAddingProjects(false)}
          onDone={() => { setAddingProjects(false); router.refresh() }} />
      )}
    </div>
  )
}

// ── Small building blocks ─────────────────────────────────────────────────────

function Kpi({ label, value, sub, onClick, active, tone = 'slate' }: {
  label: string; value: string; sub?: string; onClick: () => void; active?: boolean
  tone?: 'slate' | 'indigo' | 'amber' | 'sky' | 'pink' | 'rose' | 'emerald'
}) {
  const tones: Record<string, string> = {
    slate: 'text-slate-900 dark:text-white', indigo: 'text-indigo-600', amber: 'text-amber-600',
    sky: 'text-sky-600', pink: 'text-pink-600', rose: 'text-rose-600', emerald: 'text-emerald-600',
  }
  return (
    <button onClick={onClick}
      className={cn('rounded-xl border bg-white dark:bg-slate-900 px-3 py-2.5 text-left transition-all hover:border-indigo-300',
        active ? 'border-indigo-400 ring-1 ring-indigo-200 dark:ring-indigo-900' : 'border-slate-200 dark:border-slate-800')}>
      <p className={cn('text-lg font-bold leading-tight', tones[tone])}>{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 truncate">{label}</p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </button>
  )
}

function ViewBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className={cn('flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium',
        active ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800')}>
      {icon}<span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function FilterSelect({ value, onChange, label, options, helpKey }: {
  value: string; onChange: (v: string) => void; label: string
  options: { value: string; label: string }[]
  /** data-help anchor, see src/lib/help/pageHelp.ts */
  helpKey?: string
}) {
  return (
    <div className="relative">
      <select data-help={helpKey} value={value} onChange={(e) => onChange(e.target.value)}
        className={cn('appearance-none rounded-lg border px-2.5 py-2 pr-7 text-xs font-medium bg-white dark:bg-slate-900',
          value ? 'border-indigo-300 text-indigo-700 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300')}>
        <option value="">{label}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-2 top-2.5 text-slate-400" />
    </div>
  )
}

function StageChip({ stage }: { stage: string }) {
  const s = coStage(stage)
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap"
      style={{ backgroundColor: `${s.color}1d`, color: s.color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
      {s.label.toUpperCase()}
    </span>
  )
}

// ── Table view (desktop table + mobile cards) ────────────────────────────────

function TableView({ rows, memberName, projectById, selected, onToggle, selectable, emptyLabel }: {
  rows: ChangeOrderRow[]
  memberName: Record<string, string>
  projectById: Record<string, CoProject>
  selected: Set<string>
  onToggle: (id: string) => void
  selectable: boolean
  emptyLabel: string
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-6 py-14 text-center">
        <p className="text-sm text-slate-500">{emptyLabel}</p>
      </div>
    )
  }
  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 text-left text-[10px] uppercase tracking-wide text-slate-400">
              {selectable && <th className="px-3 py-2 w-8"></th>}
              <th className="px-3 py-2">CO #</th>
              <th className="px-3 py-2">Title / Project</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Waiting on</th>
              <th className="px-3 py-2">Next action</th>
              <th className="px-3 py-2">In stage</th>
              <th className="px-3 py-2">Follow-up</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {rows.map((c) => {
              const days = daysBetween(c.stage_entered_at)
              const aging = agingLevel(days)
              const proj = projectById[c.project_id]
              return (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  {selectable && (
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => onToggle(c.id)}
                        className="h-3.5 w-3.5 accent-indigo-600" />
                    </td>
                  )}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <Link href={`/app/change-orders/${c.id}`} className="font-mono text-xs font-bold text-indigo-600 hover:underline">{c.co_label}</Link>
                    {c.revision_number > 1 && <span className="ml-1 text-[10px] text-slate-400">R{c.revision_number}</span>}
                  </td>
                  <td className="px-3 py-2.5 max-w-64">
                    <Link href={`/app/change-orders/${c.id}`} className="block">
                      <p className="truncate font-medium text-slate-800 dark:text-slate-100">{c.title}</p>
                      <p className="truncate text-[11px] text-slate-400">
                        {proj?.name ?? '—'}{c.store_number ? ` · #${c.store_number}` : ''}{c.customer_name ? ` · ${c.customer_name}` : ''}
                      </p>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap text-slate-900 dark:text-white">{fmtMoney(coDisplayAmount(c))}</td>
                  <td className="px-3 py-2.5"><StageChip stage={c.stage} /></td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs">{c.owner_id ? memberName[c.owner_id] ?? '—' : <span className="text-rose-500 font-semibold">Unassigned</span>}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-sky-600">{c.waiting_on ?? ''}</td>
                  <td className="px-3 py-2.5 max-w-52"><p className="truncate text-xs text-slate-600 dark:text-slate-300">{c.next_action ?? '—'}</p></td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', aging.className)}>{aging.label}</span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-500">{c.follow_up_date ?? c.due_date ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.map((c) => {
          const days = daysBetween(c.stage_entered_at)
          const aging = agingLevel(days)
          const proj = projectById[c.project_id]
          return (
            <Link key={c.id} href={`/app/change-orders/${c.id}`}
              className="block rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-indigo-600">{c.co_label}</span>
                <StageChip stage={c.stage} />
                <span className="ml-auto font-bold text-slate-900 dark:text-white">{fmtMoney(coDisplayAmount(c), { compact: true })}</span>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-1">{c.title}</p>
              <p className="text-[11px] text-slate-400 truncate">{proj?.name}{c.store_number ? ` · #${c.store_number}` : ''}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="text-slate-500">{c.owner_id ? memberName[c.owner_id] : 'Unassigned'}</span>
                {c.waiting_on && <span className="text-sky-600">waiting: {c.waiting_on}</span>}
                <span className={cn('rounded-full px-1.5 py-0.5 font-semibold', aging.className)}>{aging.label}</span>
              </div>
              {c.next_action && <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300 truncate">→ {c.next_action}</p>}
            </Link>
          )
        })}
      </div>
    </>
  )
}

// ── Kanban ───────────────────────────────────────────────────────────────────

function KanbanView({ rows, memberName, projectById, isManager, onChanged }: {
  rows: ChangeOrderRow[]
  memberName: Record<string, string>
  projectById: Record<string, CoProject>
  isManager: boolean
  onChanged: () => void
}) {
  const [moving, setMoving] = useState<ChangeOrderRow | null>(null)
  const [targetStage, setTargetStage] = useState<string>('')
  const byStage = useMemo(() => {
    const m = new Map<string, ChangeOrderRow[]>()
    for (const s of CO_KANBAN_STAGES) m.set(s.key, [])
    for (const c of rows) { if (m.has(c.stage)) m.get(c.stage)!.push(c) }
    return m
  }, [rows])

  return (
    <div className="overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
      <div data-help="co-stage" className="flex gap-3 min-w-max">
        {CO_KANBAN_STAGES.map((s) => {
          const list = byStage.get(s.key) ?? []
          const total = list.reduce((a, c) => a + (coDisplayAmount(c) ?? 0), 0)
          return (
            <div key={s.key} className="w-64 shrink-0">
              <div className="mb-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2"
                style={{ borderTop: `3px solid ${s.color}` }}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{s.label}</p>
                <p className="text-xs text-slate-400">{list.length} · <span className="font-semibold text-slate-600 dark:text-slate-300">{fmtMoney(total, { compact: true })}</span></p>
              </div>
              <div className="space-y-2 max-h-[calc(100vh-380px)] overflow-y-auto pr-0.5">
                {list.map((c) => {
                  const days = daysBetween(c.stage_entered_at)
                  const aging = agingLevel(days)
                  return (
                    <div key={c.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5">
                      <Link href={`/app/change-orders/${c.id}`} className="block">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] font-bold text-indigo-600">{c.co_label}</span>
                          {(c.priority === 'high' || c.priority === 'critical') && <AlertTriangle size={11} className="text-rose-500" />}
                          <span className="ml-auto text-xs font-bold text-slate-900 dark:text-white">{fmtMoney(coDisplayAmount(c), { compact: true })}</span>
                        </div>
                        <p className="mt-0.5 text-xs font-medium text-slate-800 dark:text-slate-100 line-clamp-2">{c.title}</p>
                        <p className="text-[10px] text-slate-400 truncate">{projectById[c.project_id]?.name}{c.store_number ? ` · #${c.store_number}` : ''}</p>
                      </Link>
                      <div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
                        <span className="text-slate-500 truncate">{c.owner_id ? memberName[c.owner_id] : 'Unassigned'}</span>
                        <span className={cn('ml-auto rounded-full px-1.5 py-0.5 font-semibold shrink-0', aging.className)}>{aging.label}</span>
                      </div>
                      {c.next_action && <p className="mt-1 text-[10px] text-slate-500 truncate">→ {c.next_action}</p>}
                      {isManager && (
                        <button onClick={() => { setMoving(c); setTargetStage('') }}
                          className="mt-1.5 w-full rounded-md border border-dashed border-slate-200 dark:border-slate-700 py-1 text-[10px] font-medium text-slate-400 hover:border-indigo-300 hover:text-indigo-600">
                          Move stage
                        </button>
                      )}
                    </div>
                  )
                })}
                {list.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 py-4 text-center text-[10px] text-slate-300 dark:text-slate-600">Empty</p>}
              </div>
            </div>
          )
        })}
      </div>
      {moving && (
        <MoveStageModal co={moving} targetStage={targetStage} setTargetStage={setTargetStage}
          onClose={() => setMoving(null)} onDone={() => { setMoving(null); onChanged() }} />
      )}
    </div>
  )
}

/** Guarded stage transition: collects required fields for gated stages. */
export function MoveStageModal({ co, targetStage, setTargetStage, onClose, onDone }: {
  co: ChangeOrderRow; targetStage: string; setTargetStage: (s: string) => void
  onClose: () => void; onDone: () => void
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [portal, setPortal] = useState(co.portal ?? '')
  const [tracking, setTracking] = useState('')
  const [noConf, setNoConf] = useState(false)
  const [approvedAmount, setApprovedAmount] = useState(co.current_amount != null ? String(co.current_amount) : '')
  const [approvedBy, setApprovedBy] = useState('')
  const [invoice, setInvoice] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [note, setNote] = useState('')

  const target = targetStage ? coStage(targetStage) : null
  const needsSubmit = target?.requires?.includes('tracking') || target?.requires?.includes('submitted_date')
  const needsApproval = target?.requires?.includes('approved_amount')
  const needsInvoice = target?.requires?.includes('invoice_number')

  const go = () => start(async () => {
    setError('')
    const res = await changeStage(co.id, targetStage, {
      note: note.trim() || undefined,
      portal: portal.trim() || undefined,
      trackingNumber: tracking.trim() || undefined,
      noConfirmation: noConf || undefined,
      approvedAmount: approvedAmount || undefined,
      approvedByName: approvedBy.trim() || undefined,
      invoiceNumber: invoice.trim() || undefined,
      nextAction: nextAction.trim() || undefined,
    })
    if (!res.success) { setError(res.error); return }
    onDone()
  })

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Move {co.co_label}</h2>
            <p className="text-[11px] text-slate-400">from {coStage(co.stage).label}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">New stage</label>
            <select value={targetStage} onChange={(e) => setTargetStage(e.target.value)} className={inputCls}>
              <option value="">Choose stage…</option>
              {CO_STAGES.filter((s) => s.key !== co.stage).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          {needsSubmit && (
            <div className="rounded-xl border border-indigo-100 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/40 p-3 space-y-2">
              <p className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">Customer submission details</p>
              <input value={portal} onChange={(e) => setPortal(e.target.value)} placeholder="Portal (ServiceChannel, Verisae…)" className={inputCls} />
              <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Customer tracking / confirmation #" className={inputCls} disabled={noConf} />
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={noConf} onChange={(e) => setNoConf(e.target.checked)} className="h-3.5 w-3.5 accent-indigo-600" />
                Portal did not provide a confirmation number
              </label>
            </div>
          )}
          {needsApproval && (
            <div className="rounded-xl border border-emerald-100 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/40 p-3 space-y-2">
              <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Approval details</p>
              <input value={approvedAmount} onChange={(e) => setApprovedAmount(e.target.value)} placeholder="Approved amount" className={inputCls} inputMode="decimal" />
              <input value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} placeholder="Approved by (customer contact)" className={inputCls} />
            </div>
          )}
          {needsInvoice && (
            <div className="rounded-xl border border-lime-200 dark:border-lime-900 bg-lime-50/50 dark:bg-lime-950/40 p-3 space-y-2">
              <p className="text-[11px] font-semibold text-lime-700 dark:text-lime-300">Billing details</p>
              <input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="Invoice number" className={inputCls} />
            </div>
          )}
          <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Next action (what happens next?)" className={inputCls} />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note for the timeline (optional)" className={inputCls} />
          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
        </div>
        <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">Cancel</button>
          <button onClick={go} disabled={!targetStage || pending}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            {pending && <Loader2 size={14} className="animate-spin" />} Move
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Projects view ────────────────────────────────────────────────────────────

function ProjectsView({ projects, cos, isManager, onAdd }: {
  projects: CoProject[]; cos: ChangeOrderRow[]; isManager: boolean; onAdd: () => void
}) {
  const byProject = useMemo(() => {
    const m = new Map<string, ChangeOrderRow[]>()
    for (const c of cos) { if (!m.has(c.project_id)) m.set(c.project_id, []); m.get(c.project_id)!.push(c) }
    return m
  }, [cos])

  return (
    <div className="space-y-3">
      {projects.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-6 py-14 text-center">
          <p className="text-sm font-medium text-slate-500">No projects in the CO process yet</p>
          {isManager && (
            <button onClick={onAdd} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Add Project to CO Process</button>
          )}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => {
          const list = (byProject.get(p.id) ?? []).filter((c) => coStage(c.stage).category !== 'terminal')
          const pending = list.filter((c) => CO_PENDING_STAGES.includes(c.stage as CoStageKey)).reduce((a, c) => a + (coDisplayAmount(c) ?? 0), 0)
          const approved = (byProject.get(p.id) ?? []).reduce((a, c) => a + (c.approved_amount ?? 0), 0)
          const oldest = list.reduce<number>((mx, c) => Math.max(mx, daysBetween(c.created_at)), 0)
          return (
            <Link key={p.id} href={`/app/projects/${p.id}/change-orders`}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-indigo-300 transition-colors">
              <p className="font-semibold text-slate-900 dark:text-white truncate">{p.name}</p>
              <p className="text-[11px] text-slate-400 truncate">
                {p.job_number ? `Job# ${p.job_number} · ` : ''}{p.customer_name ?? ''}{p.store_site_id ? ` · #${p.store_site_id}` : ''}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div><p className="text-sm font-bold text-slate-900 dark:text-white">{list.length}</p><p className="text-[9px] uppercase text-slate-400">Open</p></div>
                <div><p className="text-sm font-bold text-indigo-600">{fmtMoney(pending, { compact: true })}</p><p className="text-[9px] uppercase text-slate-400">Pending</p></div>
                <div><p className="text-sm font-bold text-emerald-600">{fmtMoney(approved, { compact: true })}</p><p className="text-[9px] uppercase text-slate-400">Approved</p></div>
              </div>
              {oldest > 0 && <p className="mt-2 text-[10px] text-slate-400">Oldest open CO: {oldest} days</p>}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ── Bulk bar ─────────────────────────────────────────────────────────────────

function BulkBar({ selected, members, onDone }: { selected: Set<string>; members: Member[]; onDone: () => void }) {
  const [pending, start] = useTransition()
  const [owner, setOwner] = useState('')
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/40 px-3 py-2">
      <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">{selected.size} selected</span>
      <select value={owner} onChange={(e) => setOwner(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-600 px-2 py-1.5 text-xs dark:bg-slate-800">
        <option value="">Assign owner…</option>
        {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
      </select>
      <button disabled={!owner || pending}
        onClick={() => start(async () => { const r = await bulkAssignOwner([...selected], owner); if (r.success) onDone() })}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
        {pending ? 'Assigning…' : 'Assign'}
      </button>
      <button onClick={onDone} className="ml-auto text-xs text-slate-500 hover:underline">Clear</button>
    </div>
  )
}

// ── Create CO modal ──────────────────────────────────────────────────────────

function CreateCoModal({ projects, members, onClose, onCreated }: {
  projects: (CoProject | EligibleProject)[]
  members: Member[]
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [projectQ, setProjectQ] = useState('')
  const [projectId, setProjectId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [priority, setPriority] = useState('medium')
  const [ownerId, setOwnerId] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [dueDate, setDueDate] = useState('')

  const matches = useMemo(() => {
    const n = projectQ.trim().toLowerCase()
    const list = !n ? projects : projects.filter((p) =>
      [p.name, p.customer_name, p.store_site_id, p.job_number].some((v) => v && String(v).toLowerCase().includes(n)))
    return list.slice(0, 8)
  }, [projects, projectQ])
  const chosen = projects.find((p) => p.id === projectId)

  const create = () => start(async () => {
    setError('')
    if (!projectId) { setError('Pick the project this change belongs to'); return }
    const res = await createChangeOrder({
      projectId, title, description, requestedAmount: amount || null,
      priority, ownerId: ownerId || null, nextAction: nextAction || null, dueDate: dueDate || null,
    })
    if (!res.success) { setError(res.error); return }
    onCreated(res.data!.id)
  })

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">New Change Order</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* Project picker */}
          {chosen ? (
            <div className="flex items-center gap-2 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/40 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{chosen.name}</p>
                <p className="text-[11px] text-slate-500 truncate">{chosen.customer_name ?? ''}{chosen.store_site_id ? ` · Store #${chosen.store_site_id}` : ''}{chosen.job_number ? ` · Job# ${chosen.job_number}` : ''}</p>
              </div>
              <button onClick={() => setProjectId('')} className="text-xs text-indigo-600 hover:underline shrink-0">Change</button>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Project</label>
              <input value={projectQ} onChange={(e) => setProjectQ(e.target.value)} placeholder="Search projects by name, store #, job #, customer…" className={inputCls} />
              <div className="mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                {matches.map((p) => (
                  <button key={p.id} onClick={() => setProjectId(p.id)}
                    className="block w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{p.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{p.customer_name ?? ''}{p.store_site_id ? ` · #${p.store_site_id}` : ''}{p.job_number ? ` · Job ${p.job_number}` : ''}</p>
                  </button>
                ))}
                {matches.length === 0 && <p className="px-3 py-3 text-xs text-slate-400">No projects match.</p>}
              </div>
            </div>
          )}
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Change order title (what changed?)" className={inputCls} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Description / scope (optional)" className={inputCls} />
          <div className="grid grid-cols-2 gap-2">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Requested amount ($)" inputMode="decimal" className={inputCls} />
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
              {CO_PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)} priority</option>)}
            </select>
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={inputCls}>
              <option value="">Owner: me</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
          </div>
          <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Next action (default: review and price)" className={inputCls} />
          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
        </div>
        <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">Cancel</button>
          <button onClick={create} disabled={pending || !title.trim() || !projectId}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            {pending && <Loader2 size={14} className="animate-spin" />} Create CO
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add projects to CO process ───────────────────────────────────────────────

function AddProjectsModal({ projects, onClose, onDone }: {
  projects: EligibleProject[]; onClose: () => void; onDone: () => void
}) {
  const [pending, start] = useTransition()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const matches = useMemo(() => {
    const n = q.trim().toLowerCase()
    return !n ? projects : projects.filter((p) =>
      [p.name, p.customer_name, p.store_site_id, p.job_number, p.status].some((v) => v && String(v).toLowerCase().includes(n)))
  }, [projects, q])

  const enable = () => start(async () => {
    setError('')
    const res = await setCoTracking([...picked], true)
    if (!res.success) { setError(res.error); return }
    onDone()
  })

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Add Projects to CO Process</h2>
            <p className="text-[11px] text-slate-400">Enables Change Order tracking on the EXISTING project — nothing is copied.</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
        </div>
        <div className="px-5 pt-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, customer, store #, job #, status…" className={inputCls} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
          {matches.map((p) => (
            <label key={p.id} className="flex items-center gap-2.5 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 cursor-pointer hover:border-indigo-300">
              <input type="checkbox" checked={picked.has(p.id)}
                onChange={() => setPicked((prev) => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n })}
                className="h-4 w-4 accent-indigo-600" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{p.name}</p>
                <p className="text-[10px] text-slate-400 truncate">{p.customer_name ?? ''}{p.store_site_id ? ` · #${p.store_site_id}` : ''}{p.job_number ? ` · Job ${p.job_number}` : ''}</p>
              </div>
            </label>
          ))}
          {matches.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Every project already participates, or nothing matches.</p>}
        </div>
        <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">Cancel</button>
            <button onClick={enable} disabled={picked.size === 0 || pending}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {pending && <Loader2 size={14} className="animate-spin" />} Enable CO Tracking ({picked.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
