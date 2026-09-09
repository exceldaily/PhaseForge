'use client'

// The company's people, grouped by schedule team the way a crew directory
// reads. Each row: name, the short name used on the schedule, home address
// (located on the map for the drive-time check), and whether they are on the
// schedule roster and in PhaseForge.

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarDays, CheckCircle2, ClipboardPaste, Link2, MapPin, MapPinOff, Plus, Search, Send, Trash2, UserCheck, Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { parseDirectoryPaste, type ParsedEmployeeRow } from '@/lib/travel/geo'
import {
  createEmployee, deleteEmployee, importEmployees, inviteEmployee, locateMissing, matchRosterNames,
  retryLocate, setOnSchedule, updateEmployee,
} from './actions'

export interface TeamOption { id: string; name: string; division: string | null; roster: string[] }

export interface EmployeeRow {
  id: string
  name: string
  scheduleName: string | null
  email: string | null
  phone: string | null
  address: string | null
  located: boolean
  geocodeError: string | null
  superintendentId: string | null
  profileId: string | null
  invited: boolean
  isActive: boolean
  onSchedule: boolean
}

interface Props {
  employees: EmployeeRow[]
  teams: TeamOption[]
  canEdit: boolean
  /** Addresses (people and jobs) still waiting to be put on the map. */
  toLocate: number
}

export function EmployeesClient({ employees, teams, canEdit, toLocate }: Props) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [left, setLeft] = useState(toLocate)

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return employees
    return employees.filter((e) => [e.name, e.scheduleName, e.email, e.phone, e.address].some((v) => v?.toLowerCase().includes(t)))
  }, [employees, q])

  // Team groups in the directory's order, then the people with no team.
  const groups = useMemo(() => {
    const out: { key: string; label: string; sub: string | null; rows: EmployeeRow[] }[] = []
    for (const t of teams) {
      const rows = filtered.filter((e) => e.superintendentId === t.id)
      if (rows.length || !q) out.push({ key: t.id, label: t.name, sub: t.division, rows })
    }
    const none = filtered.filter((e) => !e.superintendentId || !teams.some((t) => t.id === e.superintendentId))
    if (none.length) out.push({ key: 'none', label: 'No team', sub: null, rows: none })
    return out
  }, [filtered, teams, q])

  const locate = () => start(async () => {
    setError(null); setMsg(null)
    const res = await locateMissing({ limit: 12 })
    if (!res.ok) { setError(res.error); return }
    setLeft(res.remaining)
    setMsg(res.remaining
      ? `Located ${res.found} of ${res.done}. ${res.remaining} to go, press again.`
      : `Located ${res.found} of ${res.done}. Everything with an address is on the map.`)
    router.refresh()
  })

  const matchNames = () => start(async () => {
    setError(null); setMsg(null)
    const res = await matchRosterNames()
    if (!res.ok) { setError(res.error); return }
    setMsg(`Matched ${res.matched} schedule name${res.matched === 1 ? '' : 's'} to people.${res.unmatched.length ? ` Could not place: ${res.unmatched.join(', ')}.` : ''}`)
    router.refresh()
  })

  const inPhaseForge = employees.filter((e) => e.profileId).length
  const located = employees.filter((e) => e.located).length

  return (
    <div className="mx-auto max-w-none space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Users size={22} className="text-indigo-600" /> Employees
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Everyone on the crews, whether or not they log in. {employees.length} people, {inPhaseForge} in PhaseForge, {located} with a home address on the map.
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { setShowImport((v) => !v); setShowAdd(false) }} data-help="emp-import">
              <ClipboardPaste size={14} /> Paste a directory
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setShowAdd((v) => !v); setShowImport(false) }}>
              <Plus size={14} /> Add person
            </Button>
            <Button size="sm" variant="outline" onClick={matchNames} disabled={pending} title="Pin each short name on the schedule rosters to the person it means">
              <Link2 size={14} /> Match schedule names
            </Button>
            <Button size="sm" onClick={locate} disabled={pending || left === 0} data-help="emp-locate">
              <MapPin size={14} /> {pending ? 'Working' : left ? `Locate addresses (${left})` : 'All located'}
            </Button>
          </div>
        )}
      </div>

      {msg && <p className="text-xs text-emerald-600">{msg}</p>}
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

      {showImport && canEdit && <ImportPanel teams={teams} onDone={(m) => { setShowImport(false); setMsg(m); router.refresh() }} />}
      {showAdd && canEdit && <AddPanel teams={teams} onDone={() => { setShowAdd(false); router.refresh() }} />}

      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names, addresses, phone, email"
          className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-400" />
      </div>

      {employees.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center">
          <Users size={28} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-600">No employees yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">
            Paste your directory in (names, addresses, phones), or add people one at a time.
          </p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between bg-amber-50 px-4 py-2">
            <h2 className="text-sm font-semibold text-slate-900">
              {g.label}{g.sub ? <span className="ml-2 text-xs font-normal text-slate-500">{g.sub}</span> : null}
            </h2>
            <span className="text-xs text-slate-500">{g.rows.length} {g.rows.length === 1 ? 'person' : 'people'}</span>
          </div>
          {g.rows.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-400">Nobody on this team yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {g.rows.map((e) => (
                <EmployeeLine key={e.id} emp={e} teams={teams} canEdit={canEdit}
                  onChanged={() => router.refresh()} onMsg={setMsg} onError={setError} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}

function EmployeeLine({ emp, teams, canEdit, onChanged, onMsg, onError }: {
  emp: EmployeeRow; teams: TeamOption[]; canEdit: boolean
  onChanged: () => void; onMsg: (m: string) => void; onError: (m: string | null) => void
}) {
  const [e, setE] = useState(emp)
  const [open, setOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState(emp.email ?? '')
  const [askEmail, setAskEmail] = useState(false)
  const [pending, start] = useTransition()
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const save = (key: string, local: Partial<EmployeeRow>, db: Record<string, unknown>) => {
    setE((cur) => ({ ...cur, ...local }))
    if (timers.current[key]) clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(() => {
      void updateEmployee({ id: emp.id, patch: db }).then((r) => { if (!r.ok) onError(r.error); else onChanged() })
    }, 700)
  }

  const invite = () => {
    const email = inviteEmail.trim()
    if (!email) { setAskEmail(true); return }
    start(async () => {
      onError(null)
      const res = await inviteEmployee({ id: emp.id, email })
      if (!res.ok) { onError(res.error); return }
      setAskEmail(false)
      setE((cur) => ({ ...cur, invited: true, email }))
      onMsg(res.message ?? `Invite sent to ${email}.`)
      onChanged()
    })
  }

  const toggleSchedule = () => start(async () => {
    onError(null)
    const res = await setOnSchedule({ id: emp.id, on: !e.onSchedule })
    if (!res.ok) { onError(res.error); return }
    setE((cur) => ({ ...cur, onSchedule: !cur.onSchedule }))
    onChanged()
  })

  const membership = e.profileId
    ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"><UserCheck size={10} /> In PhaseForge</span>
    : e.invited
      ? <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700"><Send size={10} /> Invited</span>
      : canEdit
        ? <button onClick={invite} disabled={pending}
            className="inline-flex items-center gap-1 rounded-full border border-indigo-200 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-50" data-help="emp-invite">
            <Plus size={10} /> Add to PhaseForge
          </button>
        : null

  return (
    <div className={cn('px-4 py-2', !e.isActive && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button onClick={() => setOpen((v) => !v)} className="min-w-[160px] text-left text-sm font-medium text-slate-900 hover:text-indigo-700">
          {e.name}
        </button>
        {e.scheduleName && e.scheduleName.toLowerCase() !== e.name.toLowerCase() && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500" title="Short name on the schedule">
            on schedule: {e.scheduleName}
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
          {e.located
            ? <MapPin size={12} className="text-emerald-500" />
            : <MapPinOff size={12} className={e.address ? 'text-amber-500' : 'text-slate-300'} />}
          <span className="max-w-[260px] truncate">{e.address ?? 'No address'}</span>
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {canEdit && e.superintendentId && (
            <button onClick={toggleSchedule} disabled={pending} data-help="emp-schedule"
              className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                e.onSchedule ? 'bg-indigo-50 text-indigo-700' : 'border border-slate-200 text-slate-500 hover:bg-slate-50')}>
              <CalendarDays size={10} /> {e.onSchedule ? 'On schedule' : 'Put on schedule'}
            </button>
          )}
          {membership}
        </span>
      </div>

      {askEmail && canEdit && !e.profileId && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={inviteEmail} onChange={(ev) => setInviteEmail(ev.target.value)} placeholder="their email"
            onKeyDown={(ev) => ev.key === 'Enter' && invite()} autoFocus
            className="w-56 rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-indigo-400" />
          <Button size="sm" onClick={invite} disabled={pending || !inviteEmail.trim()}>Send invite</Button>
          <button onClick={() => setAskEmail(false)} className="text-xs text-slate-500 hover:underline">Cancel</button>
        </div>
      )}

      {open && (
        <div className="mt-2 grid gap-2 rounded-lg bg-slate-50/70 p-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Full name" value={e.name} disabled={!canEdit} onChange={(v) => save('name', { name: v }, { name: v })} />
          <Field label="Name on the schedule" value={e.scheduleName ?? ''} disabled={!canEdit}
            onChange={(v) => save('schedule_name', { scheduleName: v || null }, { schedule_name: v || null })} />
          <label className="block">
            <span className="text-[11px] font-medium text-slate-500">Team</span>
            <select value={e.superintendentId ?? ''} disabled={!canEdit}
              onChange={(ev) => save('team', { superintendentId: ev.target.value || null }, { superintendent_id: ev.target.value || null })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-indigo-400">
              <option value="">No team</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.division ? ` (${t.division})` : ''}</option>)}
            </select>
          </label>
          <div className="sm:col-span-2">
            <Field label="Home address" value={e.address ?? ''} disabled={!canEdit}
              onChange={(v) => save('address', { address: v || null, located: false, geocodeError: null }, { address: v || null })} />
            {e.geocodeError && (
              <p className="mt-1 text-[11px] text-amber-600">
                {e.geocodeError}. Check the spelling, or{' '}
                <button className="underline" onClick={() => void retryLocate({ table: 'employees', id: emp.id }).then(onChanged)}>try again</button>.
              </p>
            )}
            {e.located && <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-600"><CheckCircle2 size={11} /> On the map, drive times will use it.</p>}
          </div>
          <Field label="Phone" value={e.phone ?? ''} disabled={!canEdit} onChange={(v) => save('phone', { phone: v || null }, { phone: v || null })} />
          <Field label="Email" value={e.email ?? ''} disabled={!canEdit}
            onChange={(v) => { setInviteEmail(v); save('email', { email: v || null }, { email: v || null }) }} />
          <label className="flex items-end gap-2 pb-1 text-xs text-slate-600">
            <input type="checkbox" checked={e.isActive} disabled={!canEdit}
              onChange={(ev) => save('active', { isActive: ev.target.checked }, { is_active: ev.target.checked })} />
            Active employee
          </label>
          {canEdit && (
            <div className="flex items-end justify-end sm:col-span-2 lg:col-span-3">
              <button onClick={() => { if (confirm(`Remove ${e.name} from the employee list?`)) void deleteEmployee({ id: emp.id }).then(onChanged) }}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                <Trash2 size={12} /> Remove
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      <input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-indigo-400 disabled:bg-slate-100" />
    </label>
  )
}

function AddPanel({ teams, onDone }: { teams: TeamOption[]; onDone: () => void }) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [team, setTeam] = useState(teams[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Full name" value={name} onChange={setName} />
      <label className="block">
        <span className="text-[11px] font-medium text-slate-500">Team</span>
        <select value={team} onChange={(e) => setTeam(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-indigo-400">
          <option value="">No team</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <Field label="Home address" value={address} onChange={setAddress} />
      <Field label="Phone" value={phone} onChange={setPhone} />
      <Field label="Email" value={email} onChange={setEmail} />
      <div className="flex items-end gap-2">
        <Button size="sm" disabled={pending || !name.trim()} onClick={() => start(async () => {
          setError(null)
          const res = await createEmployee({ name, address, phone, email, superintendentId: team || null })
          if (!res.ok) { setError(res.error); return }
          onDone()
        })}>Add</Button>
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
      </div>
    </div>
  )
}

function ImportPanel({ teams, onDone }: { teams: TeamOption[]; onDone: (msg: string) => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const teamNames = teams.map((t) => t.name)
  const rows: ParsedEmployeeRow[] = useMemo(() => parseDirectoryPaste(text, teamNames), [text, teamNames])
  const withAddress = rows.filter((r) => r.address).length

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">Paste your employee directory</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Copy the rows straight out of the spreadsheet or directory page (name, address, phone, email in any order after the name).
        A line with just a team lead&apos;s name, like <span className="font-medium">Carlos Betancourt</span>, puts everyone under it on the {teams[0] ? `${teams[0].name} ` : ''}team with that last name.
        People already on the list are updated, not duplicated.
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8}
        placeholder={'Carlos Betancourt\nJose Aviles\t123 Main St, Orlando, FL 32801\t(407) 555-0100\nDerik Diaz\t45 Oak Ave, Tampa, FL 33602'}
        className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:border-indigo-400" />
      {rows.length > 0 && (
        <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-slate-100">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
              <tr><th className="px-2 py-1">Name</th><th className="px-2 py-1">Team</th><th className="px-2 py-1">Address</th><th className="px-2 py-1">Phone</th><th className="px-2 py-1">Email</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-2 py-1 font-medium text-slate-800">{r.name}</td>
                  <td className="px-2 py-1 text-slate-500">{r.team ?? <span className="text-slate-300">none</span>}</td>
                  <td className="px-2 py-1 text-slate-600">{r.address ?? <span className="text-slate-300">none</span>}</td>
                  <td className="px-2 py-1 text-slate-600">{r.phone ?? ''}</td>
                  <td className="px-2 py-1 text-slate-600">{r.email ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" disabled={pending || rows.length === 0} onClick={() => start(async () => {
          setError(null)
          const res = await importEmployees({ rows })
          if (!res.ok) { setError(res.error); return }
          onDone(`Added ${res.added}, updated ${res.updated}.${withAddress ? ' Press Locate addresses to put them on the map.' : ''}`)
        })}>
          Import {rows.length ? `${rows.length} ${rows.length === 1 ? 'person' : 'people'}` : ''}
        </Button>
        {rows.length > 0 && <span className="text-xs text-slate-400">{withAddress} with an address</span>}
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
      </div>
    </div>
  )
}
