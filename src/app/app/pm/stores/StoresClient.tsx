'use client'

// The permanent store directory: search it, add to it, switch stores off
// without losing their history.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Download, FileUp, MapPin, Plus, Search, Store as StoreIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { exportRows } from '@/lib/pm/exporter'
import { SYSTEM_LABEL, type PmCycle, type PmStore, type PmTech } from '@/lib/pm/types'
import { BlockerChips, Empty, PmPage, StatusChip, fieldCls } from '@/components/pm/ui'
import { StoreFormModal } from '@/components/pm/StoreForm'
import { setStoreActive } from '../actions'

type Current = Pick<PmCycle, 'id' | 'storeId' | 'status' | 'jobNumber' | 'checklistDone' | 'checklistTotal' | 'waitingFilters' | 'waitingParts' | 'returnVisitNeeded' | 'blockingDeficiencies'>

export function StoresClient({ stores, techs, current, staged, year, quarter, canEdit }: {
  stores: PmStore[]; techs: PmTech[]; current: Current[]
  staged: { id: string; source: string | null; count: number }[]
  year: number; quarter: number; canEdit: boolean
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [show, setShow] = useState<'active' | 'inactive' | 'all'>('active')
  const [editing, setEditing] = useState<PmStore | 'new' | null>(null)
  const techName = useMemo(() => new Map(techs.map((t) => [t.id, t.name])), [techs])
  const byStore = useMemo(() => new Map(current.map((c) => [c.storeId, c])), [current])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return stores.filter((s) => {
      if (show === 'active' && !s.isActive) return false
      if (show === 'inactive' && s.isActive) return false
      if (!needle) return true
      return [s.storeNumber, s.address, s.city, s.county, s.state, s.region, s.facilityManager, techName.get(s.primaryTechId ?? ''), techName.get(s.secondaryTechId ?? '')]
        .some((v) => v?.toLowerCase().includes(needle))
    })
  }, [stores, q, show, techName])

  const doExport = (format: 'csv' | 'xlsx') => exportRows(`pm-stores-${new Date().toISOString().slice(0, 10)}`, rows.map((s) => ({
    'Store #': s.storeNumber, Address: s.address, City: s.city, County: s.county, State: s.state, ZIP: s.postalCode, Region: s.region,
    'ALDI FM': s.facilityManager, 'FM Phone': s.fmPhone, 'FM Email': s.fmEmail, 'Store Phone': s.storePhone,
    'Primary Tech': techName.get(s.primaryTechId ?? '') ?? '', 'Secondary Tech': techName.get(s.secondaryTechId ?? '') ?? '',
    System: s.systemType, Refrigerant: s.refrigerant, Notes: s.notes, Status: s.isActive ? 'Active' : 'Inactive',
  })), format)

  const toggle = async (s: PmStore) => {
    if (s.isActive && !confirm(`Mark store ${s.storeNumber} inactive? Its history stays, and it stops getting new quarterly PMs.`)) return
    const res = await setStoreActive({ id: s.id, isActive: !s.isActive })
    if (!res.ok) alert(res.error)
    router.refresh()
  }

  const activeCount = stores.filter((s) => s.isActive).length

  return (
    <PmPage title="Store Directory" subtitle={`${activeCount} active ${activeCount === 1 ? 'store' : 'stores'}${stores.length > activeCount ? `, ${stores.length - activeCount} inactive` : ''}. A store keeps its profile and history no matter how its job numbers change.`}
      actions={<>
        <Button variant="outline" size="sm" onClick={() => doExport('xlsx')} disabled={!rows.length}><Download size={14} /> Excel</Button>
        <Button variant="outline" size="sm" onClick={() => doExport('csv')} disabled={!rows.length}><Download size={14} /> CSV</Button>
        {canEdit && <Link href="/app/pm/import?kind=stores" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50" data-help="pm-import"><FileUp size={14} /> Import</Link>}
        {canEdit && <Button size="sm" onClick={() => setEditing('new')} data-help="pm-add-store"><Plus size={14} /> Add store</Button>}
      </>}>

      {staged.map((b) => (
        <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <FileUp size={18} className="shrink-0 text-indigo-600" />
          <p className="min-w-0 flex-1 text-sm text-indigo-900">
            <span className="font-semibold">{b.count} {b.count === 1 ? 'store is' : 'stores are'} waiting for your review</span>
            {b.source ? `, read from ${b.source}.` : '.'} Nothing is added until you check the preview and commit it.
          </p>
          <Link href={`/app/pm/import?batch=${b.id}`} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">Review the preview</Link>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search store number, address, city, FM, technician" className={cn(fieldCls, 'pl-8')} data-help="pm-store-search" />
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium">
          {(['active', 'inactive', 'all'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setShow(v)} className={cn('rounded-md px-2.5 py-1 capitalize', show === v ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100')}>{v}</button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty icon={<StoreIcon size={28} />} title={stores.length ? 'No stores match' : 'No stores yet'}>
          {stores.length ? 'Try a different search, or switch between Active and Inactive.' : canEdit ? 'Add your first store, or import the whole directory from a spreadsheet.' : 'A coordinator has not added any stores yet.'}
        </Empty>
      ) : (
        <>
          {/* Phone: cards */}
          <div className="space-y-2 md:hidden">
            {rows.map((s) => {
              const c = byStore.get(s.id)
              return (
                <Link key={s.id} href={`/app/pm/stores/${s.id}`} className={cn('block rounded-xl border border-slate-200 bg-white p-3', !s.isActive && 'opacity-60')}>
                  <div className="flex items-start gap-2">
                    <span className="text-base font-bold text-slate-900">{s.storeNumber}</span>
                    {!s.isActive && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Inactive</span>}
                    <span className="ml-auto">{c ? <StatusChip status={c.status} short /> : null}</span>
                  </div>
                  <p className="mt-0.5 flex items-start gap-1 text-sm text-slate-600"><MapPin size={13} className="mt-0.5 shrink-0 text-slate-400" />{[s.address, s.city, s.state].filter(Boolean).join(', ') || 'No address'}</p>
                  <p className="mt-1 text-xs text-slate-500">{[s.facilityManager && `FM ${s.facilityManager}`, techName.get(s.primaryTechId ?? '') && `Tech ${techName.get(s.primaryTechId ?? '')}`].filter(Boolean).join(' · ') || 'No FM or technician set'}</p>
                </Link>
              )
            })}
          </div>
          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Store #</th><th className="px-3 py-2">Address</th><th className="px-3 py-2">City</th>
                  <th className="px-3 py-2">County</th><th className="px-3 py-2">ST</th><th className="px-3 py-2">Region</th>
                  <th className="px-3 py-2">ALDI FM</th><th className="px-3 py-2">Primary tech</th><th className="px-3 py-2">System</th>
                  <th className="px-3 py-2">Q{quarter} {year}</th>{canEdit && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((s) => {
                  const c = byStore.get(s.id)
                  return (
                    <tr key={s.id} className={cn('hover:bg-slate-50', !s.isActive && 'text-slate-400')}>
                      <td className="whitespace-nowrap px-3 py-2">
                        <Link href={`/app/pm/stores/${s.id}`} className="font-bold text-indigo-700 hover:underline">{s.storeNumber}</Link>
                        {!s.isActive && <span className="ml-2 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Inactive</span>}
                      </td>
                      <td className="px-3 py-2">{s.address}</td>
                      <td className="whitespace-nowrap px-3 py-2">{s.city}</td>
                      <td className="whitespace-nowrap px-3 py-2">{s.county}</td>
                      <td className="px-3 py-2">{s.state}</td>
                      <td className="whitespace-nowrap px-3 py-2">{s.region}</td>
                      <td className="whitespace-nowrap px-3 py-2">{s.facilityManager}</td>
                      <td className="whitespace-nowrap px-3 py-2">{techName.get(s.primaryTechId ?? '') ?? <span className="text-slate-300">Not set</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2">{s.systemType ? SYSTEM_LABEL[s.systemType] : <span className="text-slate-300">Not recorded</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {c ? <Link href={`/app/pm/jobs/${c.id}`} className="inline-flex items-center gap-1.5"><StatusChip status={c.status} short /><BlockerChips cycle={c} compact /></Link> : <span className="text-xs text-slate-300">No PM record</span>}
                      </td>
                      {canEdit && (
                        <td className="whitespace-nowrap px-3 py-2 text-right text-xs">
                          <button type="button" onClick={() => setEditing(s)} className="font-medium text-indigo-600 hover:underline">Edit</button>
                          <button type="button" onClick={() => toggle(s)} className="ml-3 font-medium text-slate-500 hover:underline">{s.isActive ? 'Deactivate' : 'Reactivate'}</button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editing && (
        <StoreFormModal store={editing === 'new' ? null : editing} techs={techs} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh() }} />
      )}
    </PmPage>
  )
}
