import Link from 'next/link'
import { requireSc, loadWorkOrders, loadOpenTasksLite, loadDepartments } from '@/lib/servicechannel/server'
import { isActionable } from '@/lib/servicechannel/rules'
import { WAITING_LABELS, type WaitingOn } from '@/lib/servicechannel/actionCenter'
import { AddDepartmentsButton } from './AddDepartmentsButton'

export const dynamic = 'force-dynamic'

type DeptStat = { open: number; unassigned: number; overdue: number; blocked: number; waiting: Partial<Record<WaitingOn, number>>; pending: number; tasks: number; accountable: Map<string, number>; actionOwners: Map<string, number> }
const link = (dept: string, view: string) => `/app/servicechannel/work-orders?view=${view}&dept=${encodeURIComponent(dept)}`

function Card({ name, s, isNone }: { name: string; s: DeptStat; isNone?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-bold text-slate-900">{isNone ? 'No department set' : name}</h2>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        {([['Open', s.open, 'all'], ['Tasks', s.tasks, 'all'], ['Unassigned', s.unassigned, 'unassigned'], ['Overdue', s.overdue, 'overdue_actions'], ['Blocked', s.blocked, 'all'], ['To verify', s.pending, 'all']] as [string, number, string][]).map(([l, n, v]) => (
          <Link key={l} href={link(isNone ? '__none' : name, v)} className="rounded-lg bg-slate-50 p-2 hover:bg-indigo-50"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{l}</p><p className={`text-lg font-bold tabular-nums ${n && (l === 'Overdue' || l === 'Unassigned') ? 'text-rose-700' : 'text-slate-900'}`}>{n}</p></Link>
        ))}
      </div>
      {Object.keys(s.waiting).length > 0 && <p className="mt-2 text-xs text-slate-600">Waiting: {Object.entries(s.waiting).map(([k, n]) => `${WAITING_LABELS[k as WaitingOn].replace('Waiting on ', '')} ${n}`).join(' · ')}</p>}
      {(s.accountable.size > 0 || s.actionOwners.size > 0) && (
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div><p className="font-semibold text-slate-500">Accountable</p>{[...s.accountable].sort((a, b) => b[1] - a[1]).map(([p, n]) => <p key={p} className="text-slate-700">{p} <span className="text-slate-400">{n}</span></p>)}</div>
          <div><p className="font-semibold text-slate-500">Next action</p>{[...s.actionOwners].sort((a, b) => b[1] - a[1]).map(([p, n]) => <p key={p} className="text-slate-700">{p} <span className="text-slate-400">{n}</span></p>)}{!s.actionOwners.size && <p className="text-slate-400">same as accountable</p>}</div>
        </div>
      )}
    </div>
  )
}

export default async function ScDepartmentsPage() {
  const { admin, companyId } = await requireSc()
  const today = new Date().toISOString().slice(0, 10)
  const [wos, tasksByWo, departments] = await Promise.all([loadWorkOrders(admin, companyId), loadOpenTasksLite(admin, companyId), loadDepartments(admin, companyId)])

  type Stat = DeptStat
  const blank = (): Stat => ({ open: 0, unassigned: 0, overdue: 0, blocked: 0, waiting: {}, pending: 0, tasks: 0, accountable: new Map(), actionOwners: new Map() })
  const by = new Map<string, Stat>(departments.map((d) => [d, blank()]))
  const none = blank()
  for (const w of wos) {
    if (!isActionable(w)) continue
    const c = w.case
    const s = c.department && by.has(c.department) ? by.get(c.department)! : c.department ? (by.set(c.department, by.get(c.department) ?? blank()), by.get(c.department)!) : none
    s.open++
    if (!c.ownerProfileId) s.unassigned++
    const ot = tasksByWo.get(w.id) ?? []
    s.tasks += ot.length
    if ((c.dueDate && c.dueDate < today) || ot.some((t) => t.dueDate && t.dueDate < today)) s.overdue++
    if (c.internalStatus === 'blocked') s.blocked++
    if (c.waitingOn) s.waiting[c.waitingOn as WaitingOn] = (s.waiting[c.waitingOn as WaitingOn] ?? 0) + 1
    if (c.internalStatus === 'pending_verification' || ot.some((t) => t.status === 'pending_verification')) s.pending++
    if (c.ownerName) s.accountable.set(c.ownerName, (s.accountable.get(c.ownerName) ?? 0) + 1)
    if (c.actionOwnerName) s.actionOwners.set(c.actionOwnerName, (s.actionOwners.get(c.actionOwnerName) ?? 0) + 1)
  }
  const cards = [...by.entries()].map(([name, s]) => ({ name, s }))

  return (
    <div className="mx-auto max-w-none space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Departments</h1>
          <p className="mt-0.5 text-sm text-slate-500">Active work by department. Departments are your company divisions (Organization settings). The accountable owner and the next-action owner are shown separately.</p>
        </div>
        {!departments.length && <AddDepartmentsButton />}
      </div>
      {!departments.length && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No departments are configured yet. Add the suggested ones (Refrigeration, HVAC, Estimating, Scheduling, Billing, Management) or create your own under Organization settings, then set a department on each case.</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ name, s }) => <Card key={name} name={name} s={s} />)}
        <Card name="none" s={none} isNone />
      </div>
    </div>
  )
}
