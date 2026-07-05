'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { FilterBar, useUrlFilters, splitMulti, type FilterDef } from '@/components/operations/FilterBar'
import { OpsPageHeader, StatusPill, EmptyState, timeAgo } from '@/components/operations/shared'
import { createCustomer, createLocation, createAsset } from './actions'
import type { Customer, Location, Asset, Division } from '@/lib/operations/types'
import { cn } from '@/lib/utils'

type CallLite = { id: string; customer_id: string | null; location_id: string | null; status: string }

const CLOSED = new Set(['completed', 'closed', 'cancelled'])
const TABS = ['customers', 'locations', 'assets'] as const

export function CustomersClient({
  customers, locations, assets, divisions, calls, canWrite,
}: {
  customers: Customer[]
  locations: Location[]
  assets: Asset[]
  divisions: Division[]
  calls: CallLite[]
  canWrite: boolean
}) {
  const router = useRouter()
  const [filters, setFilters] = useUrlFilters()
  const tab = (TABS as readonly string[]).includes(filters.tab) ? filters.tab : 'customers'
  const [modal, setModal] = useState<'customer' | 'location' | 'asset' | null>(null)

  const openCallsByCustomer = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of calls) {
      if (c.customer_id && !CLOSED.has(c.status)) m.set(c.customer_id, (m.get(c.customer_id) ?? 0) + 1)
    }
    return m
  }, [calls])

  const openCallsByLocation = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of calls) {
      if (c.location_id && !CLOSED.has(c.status)) m.set(c.location_id, (m.get(c.location_id) ?? 0) + 1)
    }
    return m
  }, [calls])

  const customerName = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers])
  const locationName = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations])
  const divisionOpts = divisions.map((d) => ({ value: d.id, label: d.name }))

  // ── filtering per tab (client-side over org dataset) ──────────────────────
  const q = (filters.q ?? '').toLowerCase()

  const filteredCustomers = customers.filter((c) => {
    if (q && !`${c.name} ${c.email ?? ''} ${c.phone ?? ''}`.toLowerCase().includes(q)) return false
    const statuses = splitMulti(filters.status)
    if (statuses.length && !statuses.includes(c.status)) return false
    if (filters.division && c.division_id !== filters.division) return false
    if (filters.type && c.customer_type !== filters.type) return false
    if (filters.active_calls === 'yes' && !(openCallsByCustomer.get(c.id) ?? 0)) return false
    return true
  })

  const filteredLocations = locations.filter((l) => {
    if (q && !`${l.name} ${l.location_number ?? ''} ${l.city ?? ''} ${l.state ?? ''} ${customerName.get(l.customer_id) ?? ''}`.toLowerCase().includes(q)) return false
    if (filters.customer && l.customer_id !== filters.customer) return false
    if (filters.division && l.division_id !== filters.division) return false
    if (filters.state && l.state !== filters.state) return false
    if (filters.active_calls === 'yes' && !(openCallsByLocation.get(l.id) ?? 0)) return false
    return true
  })

  const filteredAssets = assets.filter((a) => {
    if (q && !`${a.name} ${a.make ?? ''} ${a.model ?? ''} ${a.serial_number ?? ''}`.toLowerCase().includes(q)) return false
    if (filters.customer && a.customer_id !== filters.customer) return false
    if (filters.location && a.location_id !== filters.location) return false
    if (filters.asset_type && a.asset_type !== filters.asset_type) return false
    const statuses = splitMulti(filters.status)
    if (statuses.length && !statuses.includes(a.status)) return false
    if (filters.warranty === 'active' && !(a.warranty_end && a.warranty_end >= new Date().toISOString().slice(0, 10))) return false
    if (filters.warranty === 'expired' && !(a.warranty_end && a.warranty_end < new Date().toISOString().slice(0, 10))) return false
    return true
  })

  const customerOpts = customers.map((c) => ({ value: c.id, label: c.name }))
  const stateOpts = [...new Set(locations.map((l) => l.state).filter(Boolean))].map((s) => ({ value: s!, label: s! }))
  const assetTypeOpts = [...new Set(assets.map((a) => a.asset_type).filter(Boolean))].map((t) => ({ value: t!, label: t! }))

  const defs: Record<string, FilterDef[]> = {
    customers: [
      { key: 'status', label: 'Status', type: 'multiselect', options: [
        { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' },
        { value: 'prospect', label: 'Prospect' }, { value: 'on_hold', label: 'On Hold' }] },
      ...(divisionOpts.length ? [{ key: 'division', label: 'Division', type: 'select', options: divisionOpts } as FilterDef] : []),
      { key: 'type', label: 'Type', type: 'select', options: [
        { value: 'commercial', label: 'Commercial' }, { value: 'residential', label: 'Residential' },
        { value: 'government', label: 'Government' }, { value: 'other', label: 'Other' }] },
      { key: 'active_calls', label: 'Active calls', type: 'select', options: [{ value: 'yes', label: 'Has active calls' }] },
    ],
    locations: [
      { key: 'customer', label: 'Customer', type: 'select', options: customerOpts },
      ...(divisionOpts.length ? [{ key: 'division', label: 'Division', type: 'select', options: divisionOpts } as FilterDef] : []),
      ...(stateOpts.length ? [{ key: 'state', label: 'State', type: 'select', options: stateOpts } as FilterDef] : []),
      { key: 'active_calls', label: 'Active calls', type: 'select', options: [{ value: 'yes', label: 'Has active calls' }] },
    ],
    assets: [
      { key: 'customer', label: 'Customer', type: 'select', options: customerOpts },
      ...(assetTypeOpts.length ? [{ key: 'asset_type', label: 'Type', type: 'select', options: assetTypeOpts } as FilterDef] : []),
      { key: 'status', label: 'Status', type: 'multiselect', options: [
        { value: 'in_service', label: 'In Service' }, { value: 'needs_attention', label: 'Needs Attention' },
        { value: 'out_of_service', label: 'Out of Service' }, { value: 'retired', label: 'Retired' }] },
      { key: 'warranty', label: 'Warranty', type: 'select', options: [
        { value: 'active', label: 'Under warranty' }, { value: 'expired', label: 'Warranty expired' }] },
    ],
  }

  return (
    <div>
      <OpsPageHeader
        title="Customers"
        subtitle="Customer accounts, their locations, and equipment"
        actions={canWrite && (
          <Button size="sm" onClick={() => setModal(tab === 'locations' ? 'location' : tab === 'assets' ? 'asset' : 'customer')}>
            <Plus size={15} />
            {tab === 'locations' ? 'New Location' : tab === 'assets' ? 'New Asset' : 'New Customer'}
          </Button>
        )}
      />

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setFilters({ tab: t })}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium capitalize transition',
              tab === t
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            )}
          >
            {t} <span className="ml-1 text-xs text-slate-400">
              {t === 'customers' ? customers.length : t === 'locations' ? locations.length : assets.length}
            </span>
          </button>
        ))}
      </div>

      <FilterBar
        defs={defs[tab]}
        filters={filters}
        onChange={(next) => setFilters({ ...next, tab })}
        searchPlaceholder={`Search ${tab}…`}
      />

      {/* ── Customers tab ── */}
      {tab === 'customers' && (
        filteredCustomers.length === 0 ? (
          <EmptyState
            title={customers.length ? 'No customers match the current filters.' : 'No customers yet.'}
            hint={customers.length ? undefined : 'Customers are the top of the operations chain: customer → location → asset → call.'}
            action={canWrite && !customers.length ? <Button size="sm" onClick={() => setModal('customer')}><Plus size={14} /> Add your first customer</Button> : undefined}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-700">
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">Type</th>
                  <th className="px-4 py-2.5">Locations</th>
                  <th className="px-4 py-2.5">Open Calls</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((c) => {
                  const locCount = locations.filter((l) => l.customer_id === c.id).length
                  return (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/app/customers/${c.id}`)}
                      className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{c.name}</td>
                      <td className="px-4 py-3"><StatusPill status={c.status} /></td>
                      <td className="hidden px-4 py-3 capitalize text-slate-500 md:table-cell">{c.customer_type ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{locCount}</td>
                      <td className="px-4 py-3">
                        {(openCallsByCustomer.get(c.id) ?? 0) > 0
                          ? <span className="font-semibold text-indigo-600 dark:text-indigo-400">{openCallsByCustomer.get(c.id)}</span>
                          : <span className="text-slate-400">0</span>}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-400 md:table-cell">{timeAgo(c.last_activity_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Locations tab ── */}
      {tab === 'locations' && (
        filteredLocations.length === 0 ? (
          <EmptyState title={locations.length ? 'No locations match the current filters.' : 'No locations yet.'} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-700">
                  <th className="px-4 py-2.5">Location</th>
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">City / State</th>
                  <th className="px-4 py-2.5">Open Calls</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">Assets</th>
                </tr>
              </thead>
              <tbody>
                {filteredLocations.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => router.push(`/app/customers/${l.customer_id}?loc=${l.id}`)}
                    className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{l.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{l.location_number ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{customerName.get(l.customer_id) ?? '—'}</td>
                    <td className="hidden px-4 py-3 text-slate-500 md:table-cell">{[l.city, l.state].filter(Boolean).join(', ') || '—'}</td>
                    <td className="px-4 py-3">
                      {(openCallsByLocation.get(l.id) ?? 0) > 0
                        ? <span className="font-semibold text-indigo-600 dark:text-indigo-400">{openCallsByLocation.get(l.id)}</span>
                        : <span className="text-slate-400">0</span>}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-500 md:table-cell">{assets.filter((a) => a.location_id === l.id).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Assets tab ── */}
      {tab === 'assets' && (
        filteredAssets.length === 0 ? (
          <EmptyState
            title={assets.length ? 'No assets match the current filters.' : 'No assets yet.'}
            hint={assets.length ? undefined : 'Track equipment per location: make, model, serial, and warranty dates.'}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-700">
                  <th className="px-4 py-2.5">Asset</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">Type</th>
                  <th className="px-4 py-2.5">Location</th>
                  <th className="hidden px-4 py-2.5 lg:table-cell">Make / Model</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">Warranty Ends</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{a.name}</td>
                    <td className="hidden px-4 py-3 text-slate-500 md:table-cell">{a.asset_type ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{locationName.get(a.location_id) ?? '—'}</td>
                    <td className="hidden px-4 py-3 text-slate-500 lg:table-cell">{[a.make, a.model].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="px-4 py-3"><StatusPill status={a.status} /></td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      {a.warranty_end ? (
                        <span className={cn(
                          a.warranty_end < new Date().toISOString().slice(0, 10)
                            ? 'text-rose-500'
                            : 'text-slate-500'
                        )}>{a.warranty_end}</span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <CreateCustomerModal open={modal === 'customer'} onClose={() => setModal(null)} divisions={divisions} />
      <CreateLocationModal open={modal === 'location'} onClose={() => setModal(null)} customers={customers} divisions={divisions} />
      <CreateAssetModal open={modal === 'asset'} onClose={() => setModal(null)} customers={customers} locations={locations} />
    </div>
  )
}

// ── Create modals ────────────────────────────────────────────────────────────

function CreateCustomerModal({ open, onClose, divisions }: { open: boolean; onClose: () => void; divisions: Division[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <Modal open={open} onClose={onClose} title="New Customer">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          startTransition(async () => {
            const res = await createCustomer({
              name: String(fd.get('name') ?? ''),
              customer_type: String(fd.get('customer_type') ?? '') || undefined,
              status: String(fd.get('status') ?? 'active'),
              phone: String(fd.get('phone') ?? '') || undefined,
              email: String(fd.get('email') ?? '') || undefined,
              division_id: String(fd.get('division_id') ?? '') || null,
            })
            if (res?.error) setError(res.error)
            else { setError(null); onClose(); router.refresh() }
          })
        }}
      >
        <Input name="name" label="Customer name" required autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Type
            <select name="customer_type" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">—</option>
              <option value="commercial">Commercial</option>
              <option value="residential">Residential</option>
              <option value="government">Government</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Status
            <select name="status" defaultValue="active" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="active">Active</option>
              <option value="prospect">Prospect</option>
              <option value="on_hold">On Hold</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input name="phone" label="Phone" />
          <Input name="email" label="Email" type="email" />
        </div>
        {divisions.length > 0 && (
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Division
            <select name="division_id" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">—</option>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        )}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={pending}>Create Customer</Button>
        </div>
      </form>
    </Modal>
  )
}

function CreateLocationModal({ open, onClose, customers, divisions }: {
  open: boolean; onClose: () => void; customers: Customer[]; divisions: Division[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <Modal open={open} onClose={onClose} title="New Location">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          startTransition(async () => {
            const res = await createLocation({
              customer_id: String(fd.get('customer_id') ?? ''),
              name: String(fd.get('name') ?? ''),
              location_number: String(fd.get('location_number') ?? '') || undefined,
              address: String(fd.get('address') ?? '') || undefined,
              city: String(fd.get('city') ?? '') || undefined,
              state: String(fd.get('state') ?? '') || undefined,
              postal_code: String(fd.get('postal_code') ?? '') || undefined,
              division_id: String(fd.get('division_id') ?? '') || null,
            })
            if (res?.error) setError(res.error)
            else { setError(null); onClose(); router.refresh() }
          })
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Customer
          <select name="customer_id" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Select customer…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><Input name="name" label="Location name" required /></div>
          <Input name="location_number" label="Store / site #" />
        </div>
        <Input name="address" label="Address" />
        <div className="grid grid-cols-3 gap-3">
          <Input name="city" label="City" />
          <Input name="state" label="State" />
          <Input name="postal_code" label="Postal code" />
        </div>
        {divisions.length > 0 && (
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Division
            <select name="division_id" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">—</option>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        )}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={pending}>Create Location</Button>
        </div>
      </form>
    </Modal>
  )
}

function CreateAssetModal({ open, onClose, customers, locations }: {
  open: boolean; onClose: () => void; customers: Customer[]; locations: Location[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [customerId, setCustomerId] = useState('')
  const locs = customerId ? locations.filter((l) => l.customer_id === customerId) : locations

  return (
    <Modal open={open} onClose={onClose} title="New Asset">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          const locId = String(fd.get('location_id') ?? '')
          const loc = locations.find((l) => l.id === locId)
          startTransition(async () => {
            const res = await createAsset({
              customer_id: loc?.customer_id ?? customerId,
              location_id: locId,
              name: String(fd.get('name') ?? ''),
              asset_type: String(fd.get('asset_type') ?? '') || undefined,
              trade_category: String(fd.get('trade_category') ?? '') || undefined,
              make: String(fd.get('make') ?? '') || undefined,
              model: String(fd.get('model') ?? '') || undefined,
              serial_number: String(fd.get('serial_number') ?? '') || undefined,
              install_date: String(fd.get('install_date') ?? '') || undefined,
              warranty_end: String(fd.get('warranty_end') ?? '') || undefined,
            })
            if (res?.error) setError(res.error)
            else { setError(null); onClose(); router.refresh() }
          })
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Customer
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">All customers</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Location
            <select name="location_id" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Select location…</option>
              {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        </div>
        <Input name="name" label="Asset name" required placeholder="e.g. Rooftop Unit 2, Rack A, Main Panel" />
        <div className="grid grid-cols-2 gap-3">
          <Input name="asset_type" label="Asset type" placeholder="RTU, rack, panel…" />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Trade
            <select name="trade_category" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">—</option>
              <option value="hvac">HVAC</option>
              <option value="refrigeration">Refrigeration</option>
              <option value="electrical">Electrical</option>
              <option value="plumbing">Plumbing</option>
              <option value="general">General</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input name="make" label="Make" />
          <Input name="model" label="Model" />
          <Input name="serial_number" label="Serial #" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input name="install_date" label="Install date" type="date" />
          <Input name="warranty_end" label="Warranty ends" type="date" />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={pending}>Create Asset</Button>
        </div>
      </form>
    </Modal>
  )
}
