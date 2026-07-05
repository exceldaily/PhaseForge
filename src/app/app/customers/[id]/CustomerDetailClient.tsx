'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Mail, Phone, MapPin, Wrench, PhoneCall, Receipt, FolderOpen, Star, Gauge, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { StatusPill, EmptyState, timeAgo } from '@/components/operations/shared'
import { AssetHistoryModal } from '@/components/operations/AssetHistoryModal'
import { ConfirmDialog } from '@/components/operations/ConfirmDialog'
import { mapsUrl } from '@/lib/operations/readings'
import { createContact, createLocation, createAsset, updateCustomer, deleteCustomer } from '../actions'
import type { Customer, CustomerContact, Location, Asset, Division, OpsActivity, OrgFile } from '@/lib/operations/types'

type CallLite = { id: string; call_number: number; title: string; status: string; priority: string; location_id: string | null; created_at: string }
type InvoiceLite = { id: string; invoice_number: number; status: string; due_date: string | null; created_at: string }

export function CustomerDetailClient({
  customer, contacts, locations, assets, calls, invoices, files, activity, divisions, canWrite, canDelete = false,
}: {
  customer: Customer
  contacts: CustomerContact[]
  locations: Location[]
  assets: Asset[]
  calls: CallLite[]
  invoices: InvoiceLite[]
  files: OrgFile[]
  activity: OpsActivity[]
  divisions: Division[]
  canWrite: boolean
  canDelete?: boolean
}) {
  const router = useRouter()
  const [contactModal, setContactModal] = useState(false)
  const [locationModal, setLocationModal] = useState(false)
  const [assetModal, setAssetModal] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [historyAsset, setHistoryAsset] = useState<Asset | null>(null)
  const [pending, startTransition] = useTransition()
  const [notes, setNotes] = useState(customer.notes ?? '')
  const [notesDirty, setNotesDirty] = useState(false)

  const openCalls = calls.filter((c) => !['completed', 'closed', 'cancelled'].includes(c.status))
  const locName = new Map(locations.map((l) => [l.id, l.name]))

  return (
    <div>
      <Link href="/app/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400">
        <ArrowLeft size={14} /> Customers
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{customer.name}</h1>
            <StatusPill status={customer.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
            {customer.customer_type && <span className="capitalize">{customer.customer_type}</span>}
            {customer.phone && <span className="inline-flex items-center gap-1"><Phone size={13} />{customer.phone}</span>}
            {customer.email && <span className="inline-flex items-center gap-1"><Mail size={13} />{customer.email}</span>}
            <span>Last activity {timeAgo(customer.last_activity_at)}</span>
          </div>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditModal(true)} title="Edit customer details"><Pencil size={14} /> Edit</Button>
            <Button size="sm" variant="outline" onClick={() => setContactModal(true)}><Plus size={14} /> Contact</Button>
            <Button size="sm" variant="outline" onClick={() => setLocationModal(true)}><Plus size={14} /> Location</Button>
            <Button size="sm" onClick={() => setAssetModal(true)} disabled={locations.length === 0} title={locations.length === 0 ? 'Add a location first' : undefined}>
              <Plus size={14} /> Asset
            </Button>
            {canDelete && (
              <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(true)} title="Delete customer" className="text-rose-500 hover:bg-rose-50 hover:text-rose-600">
                <Trash2 size={14} />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Stat strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: MapPin, label: 'Locations', value: locations.length },
          { icon: Wrench, label: 'Assets', value: assets.length },
          { icon: PhoneCall, label: 'Open Calls', value: openCalls.length },
          { icon: Receipt, label: 'Invoices', value: invoices.length },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-xs text-slate-400"><Icon size={14} />{label}</div>
            <p className="mt-1 text-xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Locations */}
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Locations</h2>
            {locations.length === 0 ? (
              <EmptyState title="No locations yet." />
            ) : (
              <div className="space-y-2">
                {locations.map((l) => {
                  const locAssets = assets.filter((a) => a.location_id === l.id)
                  return (
                    <div key={l.id} className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                      <div className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                            {l.name}
                            {l.location_number && <span className="ml-2 font-mono text-xs text-slate-400">#{l.location_number}</span>}
                          </p>
                          <p className="flex items-center gap-1.5 text-xs text-slate-500">
                            {[l.address, l.city, l.state].filter(Boolean).join(', ') || 'No address'}
                            {mapsUrl(l.address, l.city, l.state) && (
                              <a
                                href={mapsUrl(l.address, l.city, l.state)!}
                                target="_blank"
                                rel="noreferrer"
                                title="Open in Google Maps"
                                className="text-indigo-500 hover:text-indigo-600"
                              >
                                <MapPin size={12} />
                              </a>
                            )}
                          </p>
                        </div>
                        <div className="text-right text-xs text-slate-400">
                          <p>{locAssets.length} asset{locAssets.length === 1 ? '' : 's'}</p>
                          <p>{openCalls.filter((c) => c.location_id === l.id).length} open calls</p>
                        </div>
                      </div>
                      {/* Equipment / assets at this location */}
                      {locAssets.length > 0 && (
                        <div className="border-t border-slate-100 px-4 py-2 dark:border-slate-800">
                          <div className="flex flex-wrap gap-1.5">
                            {locAssets.map((a) => (
                              <button
                                key={a.id}
                                onClick={() => setHistoryAsset(a)}
                                title="View equipment service history"
                                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300"
                              >
                                <Gauge size={12} className="text-slate-400" />
                                {a.name}
                                {a.trade_category && <span className="text-[10px] uppercase text-slate-400">{a.trade_category}</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Calls */}
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Recent Calls</h2>
            {calls.length === 0 ? (
              <EmptyState title="No calls for this customer yet." />
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                {calls.slice(0, 10).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => router.push(`/app/calls?call=${c.id}`)}
                    className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-2.5 text-left last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      <span className="font-mono text-xs text-slate-400">#{c.call_number}</span>
                      <span className="truncate text-slate-700 dark:text-slate-200">{c.title}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                      {c.location_id && <span className="hidden sm:inline">{locName.get(c.location_id)}</span>}
                      <StatusPill status={c.status} />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Notes */}
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Notes</h2>
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setNotesDirty(true) }}
              readOnly={!canWrite}
              rows={4}
              placeholder="Internal notes about this customer…"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
            {canWrite && notesDirty && (
              <Button
                size="sm"
                className="mt-2"
                loading={pending}
                onClick={() => startTransition(async () => {
                  await updateCustomer(customer.id, { notes })
                  setNotesDirty(false)
                  router.refresh()
                })}
              >
                Save notes
              </Button>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {/* Contacts */}
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Contacts</h2>
            {contacts.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-400 dark:border-slate-700">No contacts yet.</p>
            ) : (
              <div className="space-y-2">
                {contacts.map((ct) => (
                  <div key={ct.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">
                      {ct.name}
                      {ct.is_primary && <Star size={12} className="fill-amber-400 text-amber-400" />}
                      {ct.is_billing && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Billing</span>}
                    </p>
                    {ct.title && <p className="text-xs text-slate-400">{ct.title}</p>}
                    <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                      {ct.email && <p className="flex items-center gap-1"><Mail size={11} />{ct.email}</p>}
                      {ct.phone && <p className="flex items-center gap-1"><Phone size={11} />{ct.phone}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Files */}
          <section>
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-slate-400"><FolderOpen size={14} /> Files</h2>
            {files.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-400 dark:border-slate-700">No files linked.</p>
            ) : (
              <div className="space-y-1">
                {files.map((f) => (
                  <p key={f.id} className="truncate rounded-lg bg-white px-3 py-2 text-xs text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">{f.file_name}</p>
                ))}
              </div>
            )}
          </section>

          {/* Activity */}
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Activity</h2>
            {activity.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-400 dark:border-slate-700">No activity yet.</p>
            ) : (
              <ol className="space-y-2 border-l border-slate-200 pl-4 dark:border-slate-700">
                {activity.map((a) => (
                  <li key={a.id} className="text-xs">
                    <span className="font-medium text-slate-600 dark:text-slate-300 capitalize">{a.action.replace(/_/g, ' ')}</span>
                    <span className="ml-2 text-slate-400">{timeAgo(a.created_at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      {/* Add contact modal */}
      <Modal open={contactModal} onClose={() => setContactModal(false)} title="Add Contact">
        <ContactForm
          customerId={customer.id}
          locations={locations}
          onDone={() => { setContactModal(false); router.refresh() }}
        />
      </Modal>

      {/* Add location modal */}
      <Modal open={locationModal} onClose={() => setLocationModal(false)} title="Add Location">
        <LocationForm
          customerId={customer.id}
          divisions={divisions}
          onDone={() => { setLocationModal(false); router.refresh() }}
        />
      </Modal>

      {/* Add asset modal */}
      <Modal open={assetModal} onClose={() => setAssetModal(false)} title="Add Equipment / Asset">
        <AssetForm
          customerId={customer.id}
          locations={locations}
          onDone={() => { setAssetModal(false); router.refresh() }}
        />
      </Modal>

      {/* Equipment service history */}
      {historyAsset && <AssetHistoryModal asset={historyAsset} onClose={() => setHistoryAsset(null)} />}

      {/* Edit customer */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Edit Customer">
        <EditCustomerForm
          customer={customer}
          divisions={divisions}
          onDone={() => { setEditModal(false); router.refresh() }}
        />
      </Modal>

      {/* Delete customer */}
      <ConfirmDialog
        open={deleteConfirm}
        title="Delete customer"
        message={`Delete "${customer.name}"? Their locations, equipment, and contacts will be permanently deleted. Calls and invoices keep their history but lose the customer link.`}
        confirmLabel="Delete customer"
        onConfirm={async () => {
          const res = await deleteCustomer(customer.id)
          if (res?.error) return res
          router.push('/app/customers')
          router.refresh()
        }}
        onClose={() => setDeleteConfirm(false)}
      />
    </div>
  )
}

function EditCustomerForm({ customer, divisions, onDone }: { customer: Customer; divisions: Division[]; onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        startTransition(async () => {
          const res = await updateCustomer(customer.id, {
            name: String(fd.get('name') ?? '').trim() || customer.name,
            status: String(fd.get('status') ?? customer.status),
            customer_type: String(fd.get('customer_type') ?? '') || null,
            phone: String(fd.get('phone') ?? '') || null,
            email: String(fd.get('email') ?? '') || null,
            billing_address: String(fd.get('billing_address') ?? '') || null,
            division_id: String(fd.get('division_id') ?? '') || null,
          })
          if (res?.error) setError(res.error)
          else onDone()
        })
      }}
    >
      <Input name="name" label="Customer name" defaultValue={customer.name} required autoFocus />
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Status
          <select name="status" defaultValue={customer.status} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="prospect">Prospect</option>
            <option value="active">Active</option>
            <option value="on_hold">On Hold</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Type
          <select name="customer_type" defaultValue={customer.customer_type ?? ''} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">—</option>
            <option value="commercial">Commercial</option>
            <option value="residential">Residential</option>
            <option value="government">Government</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input name="phone" label="Phone" defaultValue={customer.phone ?? ''} />
        <Input name="email" label="Email" type="email" defaultValue={customer.email ?? ''} />
      </div>
      <Input name="billing_address" label="Billing address" defaultValue={customer.billing_address ?? ''} />
      {divisions.length > 0 && (
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Division
          <select name="division_id" defaultValue={customer.division_id ?? ''} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">—</option>
            {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end pt-2">
        <Button type="submit" loading={pending}>Save Changes</Button>
      </div>
    </form>
  )
}

function AssetForm({ customerId, locations, onDone }: { customerId: string; locations: Location[]; onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        const locId = String(fd.get('location_id') ?? '')
        startTransition(async () => {
          const res = await createAsset({
            customer_id: customerId,
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
          else onDone()
        })
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Location
          <select name="location_id" required defaultValue={locations.length === 1 ? locations[0].id : ''} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Select…</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
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
      <Input name="name" label="Equipment name" required autoFocus placeholder="e.g. Rooftop Unit 1, Water Heater, Main Panel" />
      <Input name="asset_type" label="Type" placeholder="RTU, furnace, panel…" />
      <div className="grid grid-cols-3 gap-3">
        <Input name="make" label="Make" />
        <Input name="model" label="Model" />
        <Input name="serial_number" label="Serial #" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input name="install_date" label="Install date" type="date" />
        <Input name="warranty_end" label="Warranty ends" type="date" />
      </div>
      <p className="text-xs text-slate-400">
        The trade you pick decides which readings technicians record on calls — HVAC gets pressures and superheat, plumbing gets water pressure and leak checks, and so on.
      </p>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end pt-2">
        <Button type="submit" loading={pending}>Add Asset</Button>
      </div>
    </form>
  )
}

function ContactForm({ customerId, locations, onDone }: { customerId: string; locations: Location[]; onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        startTransition(async () => {
          const res = await createContact({
            customer_id: customerId,
            location_id: String(fd.get('location_id') ?? '') || null,
            name: String(fd.get('name') ?? ''),
            title: String(fd.get('title') ?? '') || undefined,
            email: String(fd.get('email') ?? '') || undefined,
            phone: String(fd.get('phone') ?? '') || undefined,
            is_billing: fd.get('is_billing') === 'on',
            is_primary: fd.get('is_primary') === 'on',
          })
          if (res?.error) setError(res.error)
          else onDone()
        })
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Input name="name" label="Name" required autoFocus />
        <Input name="title" label="Title" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input name="email" label="Email" type="email" />
        <Input name="phone" label="Phone" />
      </div>
      {locations.length > 0 && (
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Site (optional)
          <select name="location_id" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Company-wide</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      )}
      <div className="flex gap-4 text-sm text-slate-600">
        <label className="flex items-center gap-2"><input type="checkbox" name="is_primary" /> Primary contact</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="is_billing" /> Billing contact</label>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end pt-2">
        <Button type="submit" loading={pending}>Add Contact</Button>
      </div>
    </form>
  )
}

function LocationForm({ customerId, divisions, onDone }: { customerId: string; divisions: Division[]; onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        startTransition(async () => {
          const res = await createLocation({
            customer_id: customerId,
            name: String(fd.get('name') ?? ''),
            location_number: String(fd.get('location_number') ?? '') || undefined,
            address: String(fd.get('address') ?? '') || undefined,
            city: String(fd.get('city') ?? '') || undefined,
            state: String(fd.get('state') ?? '') || undefined,
            division_id: String(fd.get('division_id') ?? '') || null,
          })
          if (res?.error) setError(res.error)
          else onDone()
        })
      }}
    >
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2"><Input name="name" label="Location name" required autoFocus /></div>
        <Input name="location_number" label="Store / site #" />
      </div>
      <Input name="address" label="Address" />
      <div className="grid grid-cols-2 gap-3">
        <Input name="city" label="City" />
        <Input name="state" label="State" />
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
      <div className="flex justify-end pt-2">
        <Button type="submit" loading={pending}>Add Location</Button>
      </div>
    </form>
  )
}
