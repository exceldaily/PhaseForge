'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FilterBar, useUrlFilters, splitMulti, type FilterDef } from '@/components/operations/FilterBar'
import { OpsPageHeader, StatusPill, EmptyState } from '@/components/operations/shared'
import { upsertStaffDetails, setOpsRole, addCertification } from './actions'
import type { StaffDetails, StaffCertification, Division, OpsRole } from '@/lib/operations/types'
import { cn } from '@/lib/utils'

interface ProfileLite {
  id: string
  full_name: string
  email: string
  ops_role: string | null
  job_title: string | null
  avatar_url: string | null
}

type CallLite = { id: string; assigned_staff_id: string | null; status: string }

const ROLE_LABELS: Record<string, string> = {
  owner: 'Organization Owner',
  admin: 'Organization Admin',
  dispatcher: 'Dispatcher',
  project_manager: 'Project Manager',
  billing: 'Billing',
  staff: 'Staff / Technician',
  read_only: 'Read Only',
}

const CLOSED = new Set(['completed', 'closed', 'cancelled'])

export function StaffClient({
  profiles, details, certs, divisions, calls, canWrite,
}: {
  profiles: ProfileLite[]
  details: StaffDetails[]
  certs: StaffCertification[]
  divisions: Division[]
  calls: CallLite[]
  canWrite: boolean
}) {
  const router = useRouter()
  const [filters, setFilters] = useUrlFilters()
  const [selected, setSelected] = useState<ProfileLite | null>(null)

  const detailByProfile = useMemo(() => new Map(details.map((d) => [d.profile_id, d])), [details])
  const certsByStaff = useMemo(() => {
    const m = new Map<string, StaffCertification[]>()
    for (const c of certs) {
      const arr = m.get(c.staff_id) ?? []
      arr.push(c)
      m.set(c.staff_id, arr)
    }
    return m
  }, [certs])
  const workload = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of calls) {
      if (c.assigned_staff_id && !CLOSED.has(c.status)) m.set(c.assigned_staff_id, (m.get(c.assigned_staff_id) ?? 0) + 1)
    }
    return m
  }, [calls])

  const q = (filters.q ?? '').toLowerCase()
  const filtered = profiles.filter((p) => {
    const d = detailByProfile.get(p.id)
    if (q && !`${p.full_name} ${p.email} ${p.job_title ?? ''}`.toLowerCase().includes(q)) return false
    const roles = splitMulti(filters.role)
    if (roles.length && !roles.includes(p.ops_role ?? 'read_only')) return false
    if (filters.division && d?.division_id !== filters.division) return false
    if (filters.employment && (d?.employment_status ?? 'active') !== filters.employment) return false
    if (filters.expiring === 'yes') {
      const soon = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)
      const staffCerts = d ? (certsByStaff.get(d.id) ?? []) : []
      if (!staffCerts.some((c) => c.expires_on && c.expires_on <= soon)) return false
    }
    return true
  })

  const defs: FilterDef[] = [
    { key: 'role', label: 'Role', type: 'multiselect', options: Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })) },
    ...(divisions.length ? [{ key: 'division', label: 'Division', type: 'select', options: divisions.map((d) => ({ value: d.id, label: d.name })) } as FilterDef] : []),
    { key: 'employment', label: 'Employment', type: 'select', options: [
      { value: 'active', label: 'Active' }, { value: 'on_leave', label: 'On Leave' },
      { value: 'inactive', label: 'Inactive' }, { value: 'terminated', label: 'Terminated' }] },
    { key: 'expiring', label: 'Certifications', type: 'select', options: [{ value: 'yes', label: 'Expiring within 60 days' }] },
  ]

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div>
      <OpsPageHeader
        title="Staff"
        subtitle="Team members, roles, divisions, skills, and certifications"
      />
      <FilterBar defs={defs} filters={filters} onChange={setFilters} searchPlaceholder="Search staff…" />

      {filtered.length === 0 ? (
        <EmptyState title="No staff match the current filters." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-700">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Division</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Status</th>
                <th className="px-4 py-2.5">Open Calls</th>
                <th className="hidden px-4 py-2.5 lg:table-cell">Certifications</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const d = detailByProfile.get(p.id)
                const staffCerts = d ? (certsByStaff.get(d.id) ?? []) : []
                const hasExpiring = staffCerts.some((c) => c.expires_on && c.expires_on <= new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10))
                return (
                  <tr
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{p.full_name || p.email}</p>
                      <p className="text-xs text-slate-400">{p.email}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{ROLE_LABELS[p.ops_role ?? 'read_only']}</td>
                    <td className="hidden px-4 py-3 text-slate-500 md:table-cell">
                      {divisions.find((dv) => dv.id === d?.division_id)?.name ?? '—'}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell"><StatusPill status={d?.employment_status ?? 'active'} /></td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{workload.get(p.id) ?? 0}</td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <span className={cn('inline-flex items-center gap-1 text-xs', hasExpiring ? 'text-amber-600' : 'text-slate-500')}>
                        {hasExpiring ? <AlertTriangle size={13} /> : <ShieldCheck size={13} />}
                        {staffCerts.length}
                        {hasExpiring && ' (expiring)'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <StaffDetailModal
          profile={selected}
          detail={detailByProfile.get(selected.id) ?? null}
          certs={detailByProfile.get(selected.id) ? (certsByStaff.get(detailByProfile.get(selected.id)!.id) ?? []) : []}
          divisions={divisions}
          canWrite={canWrite}
          today={today}
          onClose={() => { setSelected(null); router.refresh() }}
        />
      )}
    </div>
  )
}

function StaffDetailModal({
  profile, detail, certs, divisions, canWrite, today, onClose,
}: {
  profile: ProfileLite
  detail: StaffDetails | null
  certs: StaffCertification[]
  divisions: Division[]
  canWrite: boolean
  today: string
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showCertForm, setShowCertForm] = useState(false)

  return (
    <Modal open onClose={onClose} title={profile.full_name || profile.email} size="lg">
      <div className="space-y-4">
        {canWrite && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              Operations role
              <select
                defaultValue={profile.ops_role ?? 'read_only'}
                onChange={(e) => startTransition(async () => {
                  const res = await setOpsRole(profile.id, e.target.value)
                  if (res?.error) setError(res.error)
                })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              Division
              <select
                defaultValue={detail?.division_id ?? ''}
                onChange={(e) => startTransition(async () => {
                  const res = await upsertStaffDetails(profile.id, { division_id: e.target.value || null })
                  if (res?.error) setError(res.error)
                })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              Employment status
              <select
                defaultValue={detail?.employment_status ?? 'active'}
                onChange={(e) => startTransition(async () => {
                  const res = await upsertStaffDetails(profile.id, { employment_status: e.target.value })
                  if (res?.error) setError(res.error)
                })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="active">Active</option>
                <option value="on_leave">On Leave</option>
                <option value="inactive">Inactive</option>
                <option value="terminated">Terminated</option>
              </select>
            </label>
            <Input
              label="Phone"
              defaultValue={detail?.phone ?? ''}
              onBlur={(e) => startTransition(async () => {
                await upsertStaffDetails(profile.id, { phone: e.target.value || null })
              })}
            />
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-600">Certifications</h3>
            {canWrite && detail && (
              <Button size="sm" variant="outline" onClick={() => setShowCertForm((s) => !s)}>Add</Button>
            )}
          </div>
          {certs.length === 0 ? (
            <p className="text-xs text-slate-400">No certifications recorded.</p>
          ) : (
            <div className="space-y-1.5">
              {certs.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{c.name}</span>
                  {c.expires_on && (
                    <span className={cn('text-xs', c.expires_on < today ? 'text-rose-600 font-semibold' : 'text-slate-400')}>
                      {c.expires_on < today ? 'Expired ' : 'Expires '}{c.expires_on}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {!detail && canWrite && (
            <p className="mt-2 text-xs text-slate-400">Set a division or status first to create this person&apos;s staff record, then add certifications.</p>
          )}
          {showCertForm && detail && (
            <form
              className="mt-3 grid grid-cols-2 gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                startTransition(async () => {
                  const res = await addCertification(detail.id, {
                    name: String(fd.get('name') ?? ''),
                    issuer: String(fd.get('issuer') ?? '') || undefined,
                    expires_on: String(fd.get('expires_on') ?? '') || undefined,
                  })
                  if (res?.error) setError(res.error)
                  else setShowCertForm(false)
                })
              }}
            >
              <Input name="name" label="Certification" required />
              <Input name="issuer" label="Issuer" />
              <Input name="expires_on" label="Expires" type="date" />
              <div className="flex items-end">
                <Button type="submit" size="sm" loading={pending}>Save</Button>
              </div>
            </form>
          )}
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>
    </Modal>
  )
}
