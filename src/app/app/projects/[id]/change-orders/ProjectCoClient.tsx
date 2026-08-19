'use client'

// Project-level Change Orders: contract math up top (original / approved /
// pending / potential exposure), the project's COs below, create-in-context
// (project info auto-fills), and the tracking toggle.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Loader2, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  coStage, fmtMoney, coDisplayAmount, daysBetween, agingLevel,
  CO_PENDING_STAGES, type ChangeOrderRow, type CoStageKey, CO_PRIORITIES,
} from '@/lib/changeOrders'
import { createChangeOrder, setCoTracking, setOriginalContractValue } from '../../../change-orders/actions'

interface Member { id: string; full_name: string; role: string }
interface Project {
  id: string; name: string; customer_name: string | null; store_site_id: string | null
  job_number: string | null; co_tracking_enabled: boolean; original_contract_value: number | null
}

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-800'

export function ProjectCoClient({ project, cos, members, isManager }: {
  project: Project; cos: ChangeOrderRow[]; members: Member[]; currentUserId?: string; isManager: boolean
}) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [editContract, setEditContract] = useState(false)
  const [contract, setContract] = useState(project.original_contract_value != null ? String(project.original_contract_value) : '')
  const [pending, start] = useTransition()
  const memberName = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m.full_name])), [members])

  const math = useMemo(() => {
    const openRows = cos.filter((c) => coStage(c.stage).category !== 'terminal')
    const approved = cos.reduce((a, c) => a + (c.approved_amount ?? 0), 0)
    const pendingV = openRows.filter((c) => CO_PENDING_STAGES.includes(c.stage as CoStageKey) && c.stage !== 'potential')
      .reduce((a, c) => a + (coDisplayAmount(c) ?? 0), 0)
    const potential = openRows.filter((c) => c.stage === 'potential').reduce((a, c) => a + (coDisplayAmount(c) ?? 0), 0)
    const rejected = cos.filter((c) => c.stage === 'rejected').reduce((a, c) => a + (c.requested_amount ?? c.current_amount ?? 0), 0)
    const anb = cos.filter((c) => c.approved_amount != null && !['billed', 'paid'].includes(c.billing_status) && !['closed', 'rejected', 'cancelled'].includes(c.stage))
      .reduce((a, c) => a + (c.approved_amount ?? 0), 0)
    const base = project.original_contract_value ?? 0
    return {
      approved, pending: pendingV, potential, rejected, anb,
      currentContract: base + approved,
      exposure: base + approved + pendingV + potential,
      open: openRows.length,
    }
  }, [cos, project.original_contract_value])

  return (
    <div className="space-y-4">
      {/* Header + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">Change Orders</h1>
          <p className="text-xs text-slate-500 truncate">
            {project.customer_name ?? ''}{project.store_site_id ? ` · Store #${project.store_site_id}` : ''}{project.job_number ? ` · Job# ${project.job_number}` : ''}
          </p>
        </div>
        {isManager && (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <input type="checkbox" checked={project.co_tracking_enabled}
                onChange={(e) => start(async () => { await setCoTracking([project.id], e.target.checked); router.refresh() })}
                className="h-3.5 w-3.5 accent-indigo-600" />
              CO tracking
            </label>
            <button onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
              <Plus size={15} /> New Change Order
            </button>
          </div>
        )}
      </div>

      {/* Contract math */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
          <Money label="Original contract" value={project.original_contract_value} edit={isManager ? () => setEditContract(true) : undefined} />
          <Money label="Approved COs" value={math.approved} sign tone="emerald" />
          <Money label="Pending COs" value={math.pending} sign tone="indigo" />
          <Money label="Potential COs" value={math.potential} sign tone="slate" />
          <Money label="Rejected COs" value={math.rejected} tone="rose" />
          <Money label="Current approved contract" value={math.currentContract} strong />
          <Money label="Potential final contract" value={math.exposure} strong tone="indigo" />
        </div>
        {math.anb > 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
            {fmtMoney(math.anb)} approved but not billed on this project
          </p>
        )}
        {editContract && (
          <div className="mt-3 flex items-center gap-2">
            <input value={contract} onChange={(e) => setContract(e.target.value)} inputMode="decimal"
              placeholder="Original contract value ($)" className={cn(inputCls, 'max-w-56')} />
            <button disabled={pending} onClick={() => start(async () => {
              await setOriginalContractValue(project.id, contract ? Number(contract.replace(/[$,\s]/g, '')) : null)
              setEditContract(false); router.refresh()
            })} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Save</button>
            <button onClick={() => setEditContract(false)} className="text-xs text-slate-500">Cancel</button>
          </div>
        )}
      </div>

      {/* CO list */}
      {cos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-6 py-14 text-center">
          <p className="text-sm font-medium text-slate-500">No change orders on this project yet</p>
          <p className="mt-1 text-xs text-slate-400">Create the first one — project details fill in automatically.</p>
          {isManager && (
            <button onClick={() => setCreating(true)} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">New Change Order</button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {cos.map((c) => {
            const s = coStage(c.stage)
            const days = daysBetween(c.stage_entered_at)
            const aging = agingLevel(days)
            return (
              <Link key={c.id} href={`/app/change-orders/${c.id}`}
                className="flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 hover:border-indigo-300 transition-colors">
                <span className="font-mono text-xs font-bold text-indigo-600 shrink-0">{c.co_label}</span>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0"
                  style={{ backgroundColor: `${s.color}1d`, color: s.color }}>{s.short.toUpperCase()}</span>
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{c.title}</p>
                <span className="text-xs text-slate-500 shrink-0 hidden sm:inline">{c.owner_id ? memberName[c.owner_id] : 'Unassigned'}</span>
                {c.waiting_on && <span className="text-[11px] text-sky-600 shrink-0 hidden sm:inline">⏳ {c.waiting_on}</span>}
                <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold shrink-0', aging.className)}>{aging.label}</span>
                <span className="font-bold text-slate-900 dark:text-white shrink-0">{fmtMoney(coDisplayAmount(c), { compact: true })}</span>
              </Link>
            )
          })}
        </div>
      )}

      {creating && (
        <CreateInProject project={project} members={members} onClose={() => setCreating(false)}
          onCreated={(id) => router.push(`/app/change-orders/${id}`)} />
      )}
    </div>
  )
}

function Money({ label, value, sign, strong, tone = 'slate', edit }: {
  label: string; value: number | null; sign?: boolean; strong?: boolean
  tone?: 'slate' | 'emerald' | 'indigo' | 'rose'; edit?: () => void
}) {
  const tones = { slate: 'text-slate-800 dark:text-slate-100', emerald: 'text-emerald-600', indigo: 'text-indigo-600', rose: 'text-rose-600' }
  return (
    <div>
      <p className={cn('text-sm font-bold', tones[tone], strong && 'text-base')}>
        {value != null && sign && value > 0 ? '+' : ''}{fmtMoney(value, { compact: true })}
        {edit && <button onClick={edit} className="ml-1 align-middle text-slate-300 hover:text-indigo-500"><Pencil size={11} /></button>}
      </p>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  )
}

function CreateInProject({ project, members, onClose, onCreated }: {
  project: Project; members: Member[]; onClose: () => void; onCreated: (id: string) => void
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [priority, setPriority] = useState('medium')
  const [ownerId, setOwnerId] = useState('')
  const [nextAction, setNextAction] = useState('')

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">New Change Order</h2>
          <p className="text-[11px] text-slate-400 truncate">{project.name}{project.store_site_id ? ` · Store #${project.store_site_id}` : ''} — project info auto-fills</p>
        </div>
        <div className="px-5 py-4 space-y-2.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What changed? (title)" className={inputCls} autoFocus />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Scope / description (optional)" className={inputCls} />
          <div className="grid grid-cols-2 gap-2">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Requested amount ($)" inputMode="decimal" className={inputCls} />
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
              {CO_PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)} priority</option>)}
            </select>
          </div>
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={inputCls}>
            <option value="">Owner: me</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
          <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Next action (default: review and price)" className={inputCls} />
          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
        </div>
        <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">Cancel</button>
          <button disabled={pending || !title.trim()} onClick={() => start(async () => {
            setError('')
            const res = await createChangeOrder({
              projectId: project.id, title, description, requestedAmount: amount || null,
              priority, ownerId: ownerId || null, nextAction: nextAction || null,
            })
            if (!res.success) { setError(res.error); return }
            onCreated(res.data!.id)
          })} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {pending && <Loader2 size={14} className="animate-spin" />} Create CO
          </button>
        </div>
      </div>
    </div>
  )
}
