import Link from 'next/link'
import { requireSc, loadWorkOrders, loadDepartments, loadPeople, loadSettings, contactedSinceUnsat } from '@/lib/servicechannel/server'
import { loadEmployees, loadProjects, loadRecoveries, loadTasks } from '@/lib/servicechannel/records'
import { buildActionCenter, type ActionItem } from '@/lib/servicechannel/actionCenter'
import { DirectoryClient } from './DirectoryClient'

export const dynamic = 'force-dynamic'

interface DeptStat { open: number; overdue: number; unack: number; unassigned: number; blocked: number; escalated: number; complaints: number; verify: number; waiting: number; people: Map<string, { open: number; overdue: number }> }

export default async function ScDepartmentsPage() {
  const { admin, companyId } = await requireSc()
  const today = new Date().toISOString().slice(0, 10)
  const [wos, tasks, recoveries, projects, departments, people, employees, settings] = await Promise.all([
    loadWorkOrders(admin, companyId), loadTasks(admin, companyId), loadRecoveries(admin, companyId), loadProjects(admin, companyId, today),
    loadDepartments(admin, companyId), loadPeople(admin, companyId), loadEmployees(admin, companyId, true), loadSettings(admin, companyId),
  ])
  const ac = buildActionCenter({ wos, tasks, recoveries, projects, contactedSinceUnsat: await contactedSinceUnsat(admin, companyId, wos), today, thresholds: settings.thresholds })

  const blank = (): DeptStat => ({ open: 0, overdue: 0, unack: 0, unassigned: 0, blocked: 0, escalated: 0, complaints: 0, verify: 0, waiting: 0, people: new Map() })
  const by = new Map<string, DeptStat>(departments.map((d) => [d, blank()]))
  const none = blank()
  const deptOf = (d: string | null) => (d ? (by.has(d) ? by.get(d)! : (by.set(d, blank()), by.get(d)!)) : none)
  // Open responsibilities per department: tasks, plus cases a person is following up.
  const seen = new Set<string>()
  const count = (dept: string | null, owner: string | null, overdue: boolean) => { const s = deptOf(dept); s.open++; if (owner) { const p = s.people.get(owner) ?? { open: 0, overdue: 0 }; p.open++; if (overdue) p.overdue++; s.people.set(owner, p) } }
  for (const t of tasks) { seen.add(`task:${t.id}`); count(t.department, t.ownerName, !!t.dueDate && t.dueDate < today) }
  for (const w of wos) if (w.case.internalStatus !== 'new' && w.case.internalStatus !== 'verified_resolved') count(w.case.department, w.case.ownerName, !!w.case.dueDate && w.case.dueDate < today)
  for (const r of recoveries) if (r.status !== 'closed') count(r.department, r.ownerName, !!r.followUpDeadline && r.followUpDeadline < today)
  const bump = (items: ActionItem[], k: keyof Omit<DeptStat, 'people' | 'open'>) => { for (const i of items) deptOf(i.department)[k]++ }
  for (const s of ac.needsToday) if (s.key in none) bump(s.items, s.key as keyof Omit<DeptStat, 'people' | 'open'>)
  for (const s of ac.waiting) for (const i of s.items) deptOf(i.department).waiting++

  const cards = [...by.entries()].map(([name, s]) => ({ name, s, members: employees.filter((e) => e.isActive && e.department === name) }))
  const link = (dept: string, open: string) => `/app/servicechannel/action-center?open=${open}&dept=${encodeURIComponent(dept)}`

  return (
    <div className="mx-auto max-w-none space-y-5 p-3 sm:p-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Department Accountability</h1>
        <p className="mt-0.5 text-sm text-slate-500">Open responsibilities by department, with the people who own them. Departments are configured below; people are the company directory, with or without a PhaseForge login.</p>
      </div>
      {!departments.length && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No departments configured yet. Add the suggested ones below (Refrigeration, HVAC, Estimating, Scheduling / Dispatch, Billing, Management) or type your own.</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[...cards, { name: '__none', s: none, members: employees.filter((e) => e.isActive && !e.department) }].map(({ name, s, members }) => {
          const isNone = name === '__none'
          const cells: [string, number, string, boolean][] = [['Open', s.open, 'overdue', false], ['Overdue', s.overdue, 'overdue', true], ['No owner', s.unassigned, 'unassigned', true], ['Unacknowledged', s.unack, 'unack', true], ['Complaints', s.complaints, 'complaints', true], ['Escalated', s.escalated, 'escalated', true], ['Blocked', s.blocked, 'blocked', false], ['To verify', s.verify, 'verify', false], ['Waiting', s.waiting, 'customer', false]]
          return (
            <div key={name} className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-bold text-slate-900">{isNone ? 'No department set' : name}</h2>
              <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                {cells.map(([l, n, open, bad]) => <Link key={l} href={link(isNone ? '__none' : name, open)} className="rounded-lg bg-slate-50 p-1.5 hover:bg-indigo-50"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{l}</p><p className={`text-base font-bold tabular-nums ${n && bad ? 'text-rose-700' : 'text-slate-900'}`}>{n}</p></Link>)}
              </div>
              <div className="mt-3 text-xs">
                <p className="font-semibold text-slate-500">People</p>
                {members.length === 0 && s.people.size === 0 && <p className="text-slate-400">Nobody assigned to this department yet.</p>}
                <ul className="mt-1 space-y-0.5">
                  {members.map((e) => { const p = s.people.get(e.name) ?? s.people.get(e.profileName ?? '') ?? { open: 0, overdue: 0 }; return <li key={e.id} className="flex items-center justify-between"><span className="text-slate-800">{e.name}<span className="text-slate-400">{e.jobRole ? ` · ${e.jobRole}` : ''}{e.profileId ? '' : ' · no login'}</span></span><Link href={`/app/servicechannel/action-center?owner=${encodeURIComponent(e.profileName ?? e.name)}`} className="tabular-nums text-slate-600 hover:text-indigo-700">{p.open} open{p.overdue ? <span className="text-rose-700">, {p.overdue} overdue</span> : ''}</Link></li> })}
                  {[...s.people].filter(([n]) => !members.some((e) => e.name === n || e.profileName === n)).map(([n, p]) => <li key={n} className="flex items-center justify-between"><span className="text-slate-800">{n}<span className="text-slate-400"> · not in the directory</span></span><Link href={`/app/servicechannel/action-center?owner=${encodeURIComponent(n)}`} className="tabular-nums text-slate-600 hover:text-indigo-700">{p.open} open{p.overdue ? <span className="text-rose-700">, {p.overdue} overdue</span> : ''}</Link></li>)}
                </ul>
              </div>
            </div>
          )
        })}
      </div>
      <DirectoryClient employees={employees} departments={departments} people={people.filter((p) => p.hasLogin)} />
    </div>
  )
}
