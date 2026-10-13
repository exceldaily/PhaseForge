'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Person } from '@/lib/servicechannel/server'
import type { EmployeeView } from '@/lib/servicechannel/records'
import { cx } from '@/components/servicechannel/ui'
import { DeptInput, Msg, Select, Text, box, btn, btnPrimary, btnSmall } from '@/components/servicechannel/fields'
import { addSuggestedDepartmentsAction } from '../opsActions'
import { saveEmployeeAction } from '../recordActions'

interface Props { employees: EmployeeView[]; departments: string[]; people: Person[] }
const blank = { id: null as string | null, name: '', email: '', phone: '', department: '', jobRole: '', isActive: true, profileId: '' }

/** The people directory: name, department, role, active, and the PhaseForge user they are (if any). People without a login can still own work. */
export function DirectoryClient({ employees, departments, people }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [f, setF] = useState(blank)
  const [showInactive, setShowInactive] = useState(false)
  const [q, setQ] = useState('')
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { const r = await fn(); setMsg({ ok: r.ok, text: r.ok ? ok : (r.error ?? 'Something went wrong.') }); if (r.ok) router.refresh() })
  const edit = (e: EmployeeView) => setF({ id: e.id, name: e.name, email: e.email ?? '', phone: e.phone ?? '', department: e.department ?? '', jobRole: e.jobRole ?? '', isActive: e.isActive, profileId: e.profileId ?? '' })
  const save = () => act(() => saveEmployeeAction({ ...f, profileId: f.profileId || null }).then((r) => { if (r.ok) setF(blank); return r }), f.id ? 'Person updated.' : 'Person added.')
  const rows = employees.filter((e) => (showInactive || e.isActive) && (!q.trim() || `${e.name} ${e.department ?? ''} ${e.jobRole ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())))
  const linkedProfiles = new Set(employees.filter((e) => e.profileId).map((e) => e.profileId))

  return (
    <section className={box}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="text-sm font-bold text-slate-900">People directory <span className="font-normal text-slate-400">({employees.filter((e) => e.isActive).length} active)</span></h2><p className="mt-0.5 text-xs text-slate-500">Set each person&apos;s department and role so responsibilities can be assigned to them. Linking a PhaseForge user lets them accept work themselves; otherwise acknowledgments are recorded for them.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={btnSmall} disabled={pending} onClick={() => act(() => addSuggestedDepartmentsAction().then((r) => (r.ok ? { ok: true } : r)), 'Suggested departments added where missing.')}>Add suggested departments</button>
          <span className="text-[11px] text-slate-400">{departments.length ? departments.join(' · ') : 'none yet'}</span>
        </div>
      </div>
      <Msg m={msg} />
      <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-3 lg:grid-cols-6">
        <Text label="Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
        <DeptInput value={f.department} onChange={(v) => setF({ ...f, department: v })} departments={departments} />
        <Text label="Role" value={f.jobRole} onChange={(v) => setF({ ...f, jobRole: v })} placeholder="Supervisor, technician, estimator…" />
        <Text label="Email" value={f.email} onChange={(v) => setF({ ...f, email: v })} />
        <Select label="PhaseForge user" value={f.profileId} onChange={(v) => setF({ ...f, profileId: v })} blank="No login" options={people.filter((p) => p.id === f.profileId || !linkedProfiles.has(p.id)).map((p) => [p.id, p.name])} />
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-1 pb-2 text-xs text-slate-700"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />Active</label>
          <button className={btnPrimary} disabled={pending || !f.name.trim()} onClick={save}>{f.id ? 'Save' : 'Add'}</button>
          {f.id && <button className={btn} onClick={() => setF(blank)}>Cancel</button>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <input className="rounded-md border border-slate-300 px-2 py-1 text-sm" placeholder="Find a person" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-1 text-slate-600"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />Show inactive</label>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500"><tr>{['Name', 'Department', 'Role', 'PhaseForge user', 'Active', ''].map((h) => <th key={h} className="px-2 py-1 font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((e) => (
              <tr key={e.id} className={cx(!e.isActive && 'opacity-50')}>
                <td className="whitespace-nowrap px-2 py-1.5 font-medium text-slate-900">{e.name}</td>
                <td className="px-2 py-1.5 text-slate-700">{e.department ?? <span className="text-amber-700">not set</span>}</td>
                <td className="px-2 py-1.5 text-slate-700">{e.jobRole ?? '-'}</td>
                <td className="px-2 py-1.5 text-xs text-slate-600">{e.profileId ? (e.profileName ?? 'linked') : <span className="text-slate-400">no login</span>}</td>
                <td className="px-2 py-1.5 text-xs">{e.isActive ? 'Yes' : 'No'}</td>
                <td className="px-2 py-1.5"><button className="text-xs text-indigo-700" onClick={() => edit(e)}>Edit</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="px-2 py-6 text-center text-slate-500">Nobody matches.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
