'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, AlertTriangle, Phone, Mail, Star } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { FilterBar, useUrlFilters, type FilterDef } from '@/components/operations/FilterBar'
import { OpsPageHeader, StatusPill, EmptyState } from '@/components/operations/shared'
import { createVendor, updateVendor, addVendorContact } from './actions'
import type { Vendor } from '@/lib/operations/types'
import { cn } from '@/lib/utils'

interface VendorContact {
  id: string
  vendor_id: string
  name: string
  title: string | null
  email: string | null
  phone: string | null
  is_primary: boolean
}

type CallLite = { id: string; vendor_id: string | null; status: string }

const TRADES = ['hvac', 'refrigeration', 'electrical', 'plumbing', 'general', 'roofing', 'restoration']
const CLOSED = new Set(['completed', 'closed', 'cancelled'])

export function VendorsClient({
  vendors, contacts, calls, canWrite,
}: {
  vendors: Vendor[]
  contacts: VendorContact[]
  calls: CallLite[]
  canWrite: boolean
}) {
  const router = useRouter()
  const [filters, setFilters] = useUrlFilters()
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<Vendor | null>(null)

  const activeCalls = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of calls) {
      if (c.vendor_id && !CLOSED.has(c.status)) m.set(c.vendor_id, (m.get(c.vendor_id) ?? 0) + 1)
    }
    return m
  }, [calls])

  // Date snapshot for compliance highlighting — intentionally fixed per mount.
  const { today, soon } = useMemo(() => ({
    today: new Date().toISOString().slice(0, 10),
    // eslint-disable-next-line react-hooks/purity
    soon: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  }), [])
  const q = (filters.q ?? '').toLowerCase()

  const filtered = vendors.filter((v) => {
    if (q && !`${v.name} ${v.email ?? ''} ${(v.trade_categories ?? []).join(' ')}`.toLowerCase().includes(q)) return false
    if (filters.trade && !(v.trade_categories ?? []).includes(filters.trade)) return false
    if (filters.status && v.status !== filters.status) return false
    if (filters.compliance === 'insurance_expiring' && !(v.insurance_expires && v.insurance_expires <= soon)) return false
    if (filters.compliance === 'license_expiring' && !(v.license_expires && v.license_expires <= soon)) return false
    if (filters.active_calls === 'yes' && !(activeCalls.get(v.id) ?? 0)) return false
    return true
  })

  const defs: FilterDef[] = [
    { key: 'trade', label: 'Trade', type: 'select', options: TRADES.map((t) => ({ value: t, label: t.toUpperCase() === 'HVAC' ? 'HVAC' : t[0].toUpperCase() + t.slice(1) })) },
    { key: 'status', label: 'Status', type: 'select', options: [
      { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'do_not_use', label: 'Do Not Use' }] },
    { key: 'compliance', label: 'Compliance', type: 'select', options: [
      { value: 'insurance_expiring', label: 'Insurance expiring ≤30d' },
      { value: 'license_expiring', label: 'License expiring ≤30d' }] },
    { key: 'active_calls', label: 'Calls', type: 'select', options: [{ value: 'yes', label: 'Has active calls' }] },
  ]

  return (
    <div>
      <OpsPageHeader
        title="Vendors"
        subtitle="Subcontractors and service partners"
        actions={canWrite && <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={15} /> New Vendor</Button>}
      />
      <FilterBar defs={defs} filters={filters} onChange={setFilters} searchPlaceholder="Search vendors…" />

      {filtered.length === 0 ? (
        <EmptyState
          title={vendors.length ? 'No vendors match the current filters.' : 'No vendors yet.'}
          action={canWrite && !vendors.length ? <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={14} /> Add your first vendor</Button> : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => {
            const insuranceRisk = v.insurance_expires && v.insurance_expires <= soon
            const licenseRisk = v.license_expires && v.license_expires <= soon
            return (
              <button
                key={v.id}
                onClick={() => setSelected(v)}
                className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-indigo-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{v.name}</p>
                  <StatusPill status={v.status} />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {(v.trade_categories ?? []).map((t) => (
                    <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">{t}</span>
                  ))}
                </div>
                <div className="mt-2 space-y-0.5 text-xs text-slate-500">
                  {v.phone && <p className="flex items-center gap-1"><Phone size={11} />{v.phone}</p>}
                  {v.email && <p className="flex items-center gap-1"><Mail size={11} />{v.email}</p>}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-400">{activeCalls.get(v.id) ?? 0} active calls</span>
                  {(insuranceRisk || licenseRisk) && (
                    <span className={cn('flex items-center gap-1 font-medium',
                      (v.insurance_expires && v.insurance_expires < today) || (v.license_expires && v.license_expires < today)
                        ? 'text-rose-600' : 'text-amber-600')}>
                      <AlertTriangle size={12} />
                      {insuranceRisk ? 'Insurance' : 'License'}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {createOpen && <VendorFormModal onClose={() => { setCreateOpen(false); router.refresh() }} />}
      {selected && (
        <VendorDetailModal
          vendor={selected}
          contacts={contacts.filter((c) => c.vendor_id === selected.id)}
          canWrite={canWrite}
          onClose={() => { setSelected(null); router.refresh() }}
        />
      )}
    </div>
  )
}

function VendorFormModal({ onClose }: { onClose: () => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [trades, setTrades] = useState<string[]>([])

  return (
    <Modal open onClose={onClose} title="New Vendor">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          startTransition(async () => {
            const res = await createVendor({
              name: String(fd.get('name') ?? ''),
              trade_categories: trades,
              coverage_areas: String(fd.get('coverage') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
              phone: String(fd.get('phone') ?? '') || undefined,
              email: String(fd.get('email') ?? '') || undefined,
              insurance_expires: String(fd.get('insurance_expires') ?? '') || undefined,
              license_expires: String(fd.get('license_expires') ?? '') || undefined,
            })
            if (res?.error) setError(res.error)
            else onClose()
          })
        }}
      >
        <Input name="name" label="Vendor name" required autoFocus />
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Trades</p>
          <div className="flex flex-wrap gap-1.5">
            {TRADES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTrades((s) => s.includes(t) ? s.filter((x) => x !== t) : [...s, t])}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition',
                  trades.includes(t)
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input name="phone" label="Phone" />
          <Input name="email" label="Email" type="email" />
        </div>
        <Input name="coverage" label="Coverage areas (comma-separated)" placeholder="Orlando, Tampa, Jacksonville" />
        <div className="grid grid-cols-2 gap-3">
          <Input name="insurance_expires" label="Insurance expires" type="date" />
          <Input name="license_expires" label="License expires" type="date" />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={pending}>Create Vendor</Button>
        </div>
      </form>
    </Modal>
  )
}

function VendorDetailModal({
  vendor, contacts, canWrite, onClose,
}: {
  vendor: Vendor
  contacts: VendorContact[]
  canWrite: boolean
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showContactForm, setShowContactForm] = useState(false)
  const [notes, setNotes] = useState(vendor.performance_notes ?? '')
  const [notesDirty, setNotesDirty] = useState(false)

  return (
    <Modal open onClose={onClose} title={vendor.name} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
          <StatusPill status={vendor.status} />
          {vendor.phone && <span className="flex items-center gap-1"><Phone size={13} />{vendor.phone}</span>}
          {vendor.email && <span className="flex items-center gap-1"><Mail size={13} />{vendor.email}</span>}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
            <p className="text-xs text-slate-400">Insurance expires</p>
            <p className="font-medium text-slate-700 dark:text-slate-200">{vendor.insurance_expires ?? '—'}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
            <p className="text-xs text-slate-400">License expires</p>
            <p className="font-medium text-slate-700 dark:text-slate-200">{vendor.license_expires ?? '—'}</p>
          </div>
        </div>

        {canWrite && (
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Status
            <select
              defaultValue={vendor.status}
              onChange={(e) => startTransition(async () => {
                const res = await updateVendor(vendor.id, { status: e.target.value })
                if (res?.error) setError(res.error)
              })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="do_not_use">Do Not Use</option>
            </select>
          </label>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-600">Contacts</h3>
            {canWrite && <Button size="sm" variant="outline" onClick={() => setShowContactForm((s) => !s)}>Add</Button>}
          </div>
          {contacts.length === 0 ? (
            <p className="text-xs text-slate-400">No contacts recorded.</p>
          ) : (
            <div className="space-y-1.5">
              {contacts.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                  <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200">
                    {c.name}
                    {c.is_primary && <Star size={11} className="fill-amber-400 text-amber-400" />}
                  </span>
                  <span className="text-xs text-slate-400">{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
                </div>
              ))}
            </div>
          )}
          {showContactForm && (
            <form
              className="mt-3 grid grid-cols-2 gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                startTransition(async () => {
                  const res = await addVendorContact(vendor.id, {
                    name: String(fd.get('name') ?? ''),
                    phone: String(fd.get('phone') ?? '') || undefined,
                    email: String(fd.get('email') ?? '') || undefined,
                    is_primary: fd.get('is_primary') === 'on',
                  })
                  if (res?.error) setError(res.error)
                  else setShowContactForm(false)
                })
              }}
            >
              <Input name="name" label="Name" required />
              <Input name="phone" label="Phone" />
              <Input name="email" label="Email" type="email" />
              <div className="flex items-end gap-3">
                <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-600"><input type="checkbox" name="is_primary" /> Primary</label>
                <Button type="submit" size="sm" loading={pending}>Save</Button>
              </div>
            </form>
          )}
        </div>

        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-slate-600">Performance notes</h3>
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setNotesDirty(true) }}
            readOnly={!canWrite}
            rows={3}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
          {canWrite && notesDirty && (
            <Button
              size="sm"
              loading={pending}
              onClick={() => startTransition(async () => {
                await updateVendor(vendor.id, { performance_notes: notes })
                setNotesDirty(false)
              })}
            >
              Save notes
            </Button>
          )}
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>
    </Modal>
  )
}
