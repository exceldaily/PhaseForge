'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { StoreCustomerView } from '@/lib/servicechannel/server'
import type { ConflictEntry } from '@/lib/servicechannel/types'
import { cx, fmtWhen } from '@/components/servicechannel/ui'
import { mapStoresAction, resolveConflictAction, unmapStoreAction } from '../opsActions'

interface StoreRow { storeNumber: string; label: string | null; city: string | null; state: string | null; region: string | null; total: number; unknown: number; customers: string[]; sample: string | null }
interface Props { stores: StoreRow[]; directory: StoreCustomerView[]; knownCustomers: string[]; conflicts: { id: string; trackingNumber: string; storeLabel: string | null; customerName: string | null; conflicts: ConflictEntry[] }[] }

export function CustomersClient({ stores, directory, knownCustomers, conflicts }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState({ q: '', region: '', onlyUnknown: true })
  // Typing in the search box shows every matching store, mapped or not, so a wrong mapping can be found and fixed.
  const onlyUnknown = filter.onlyUnknown && !filter.q.trim()
  const [customer, setCustomer] = useState('')
  const [preview, setPreview] = useState(false)
  const mapped = useMemo(() => new Map(directory.map((d) => [d.storeNumber, d])), [directory])
  const regions = useMemo(() => [...new Set(stores.map((s) => s.region).filter((x): x is string => !!x))].sort(), [stores])

  const rows = stores.filter((s) => {
    if (onlyUnknown && s.unknown === 0) return false
    if (filter.region && s.region !== filter.region) return false
    const q = filter.q.trim().toLowerCase()
    if (q && !(s.storeNumber.toLowerCase().includes(q) || (s.label ?? '').toLowerCase().includes(q) || (s.city ?? '').toLowerCase().includes(q) || s.customers.some((c) => c.toLowerCase().includes(q)))) return false
    return true
  })
  const selectedRows = stores.filter((s) => sel.has(s.storeNumber))
  const willFill = selectedRows.reduce((n, s) => n + s.unknown, 0)
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: (r: Record<string, unknown>) => string) => start(async () => { const r = await fn(); setMsg({ ok: r.ok, text: r.ok ? ok(r as Record<string, unknown>) : (r.error ?? 'Something went wrong.') }); if (r.ok) router.refresh() })
  const apply = () => { setPreview(false); act(() => mapStoresAction({ storeNumbers: [...sel], customerName: customer }), (r) => `Mapped ${r.stores} store(s) to ${customer}; ${r.filled} work order(s) now show the customer.`); setSel(new Set()) }
  const input = 'rounded-md border border-slate-300 px-2 py-1.5 text-sm'

  return (
    <div className="mx-auto max-w-none space-y-4 p-3 sm:p-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Customers and stores</h1>
        <p className="mt-0.5 text-sm text-slate-500">The ServiceChannel export carries no customer name, only a store number. Map stores to customers here; the mapping is kept and applied to future imports. Nothing is guessed from a number pattern.</p>
      </div>
      {msg && <div className={cx('rounded-lg border p-3 text-sm', msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900')}>{msg.text}</div>}

      {conflicts.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-bold text-amber-900">Import disagrees with a value a person set ({conflicts.length})</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {conflicts.map((w) => w.conflicts.map((c, i) => !c.resolved && (
              <li key={`${w.id}-${i}`} className="flex flex-wrap items-center gap-2">
                <Link className="font-mono font-semibold text-indigo-700" href={`/app/servicechannel/work-orders/${w.id}`}>{w.trackingNumber}</Link>
                <span className="text-slate-700">{w.storeLabel}: kept <strong>{c.kept}</strong> ({c.keptSource ?? 'manual'}), import says <strong>{c.imported}</strong> on {fmtWhen(c.at)}</span>
                <button className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs" disabled={pending} onClick={() => act(() => resolveConflictAction({ workOrderId: w.id, index: i, choice: 'keep' }), () => 'Kept the manual value.')}>Keep</button>
                <button className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs" disabled={pending} onClick={() => act(() => resolveConflictAction({ workOrderId: w.id, index: i, choice: 'take' }), () => 'Took the imported value.')}>Take import</button>
              </li>
            )))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input className={cx(input, 'w-48')} placeholder="Store # or town" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
          <select className={input} value={filter.region} onChange={(e) => setFilter({ ...filter, region: e.target.value })}><option value="">Any region</option>{regions.map((r) => <option key={r}>{r}</option>)}</select>
          <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={filter.onlyUnknown} onChange={(e) => setFilter({ ...filter, onlyUnknown: e.target.checked })} /> Only stores with unknown customer</label>
          <button className="text-xs text-indigo-700 underline" onClick={() => setSel(new Set(rows.map((r) => r.storeNumber)))}>Select all shown ({rows.length})</button>
          <button className="text-xs text-slate-500 underline" onClick={() => setSel(new Set())}>Clear</button>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">Region and the store number prefix come from the export and are hints only. Walmart and CubeSmart both use four-digit store numbers, so check before bulk mapping.</p>

        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
          <span className="text-sm font-semibold text-slate-800">{sel.size} store(s) selected</span>
          <label className="text-xs font-semibold text-slate-600">Customer<input className={cx(input, 'mt-1 block w-56')} list="sc-known-customers" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="ALDI, CubeSmart, Sprouts…" /><datalist id="sc-known-customers">{knownCustomers.map((c) => <option key={c} value={c} />)}</datalist></label>
          <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={pending || !sel.size || !customer.trim()} onClick={() => setPreview(true)}>Preview mapping</button>
        </div>
        {preview && (
          <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm">
            <p className="font-semibold text-indigo-900">Map {sel.size} store(s) to {customer}?</p>
            <p className="mt-1 text-xs text-indigo-900">{willFill} work order(s) with no customer will show {customer}, and any that got a different customer from an earlier mapping are corrected. Customers typed on a work order by hand are not changed. The mapping is used for every future import of these stores.</p>
            <ul className="mt-2 max-h-40 overflow-auto text-xs text-slate-700">{selectedRows.map((s) => <li key={s.storeNumber}>{s.label ?? s.storeNumber}{mapped.has(s.storeNumber) ? ` (currently ${mapped.get(s.storeNumber)!.customerName}, will be replaced)` : ''}{s.customers.length ? ` (${s.customers.join(', ')} on some work orders already)` : ''}</li>)}</ul>
            <div className="mt-2 flex gap-2"><button className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white" disabled={pending} onClick={apply}>Apply</button><button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs" onClick={() => setPreview(false)}>Cancel</button></div>
          </div>
        )}

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-2 py-1"></th>{['Store', 'Town', 'Region', 'Work orders', 'Unknown customer', 'Mapped to', 'Sample problem'].map((h) => <th key={h} className="px-2 py-1 font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.storeNumber} className={cx(sel.has(s.storeNumber) && 'bg-indigo-50/50')}>
                  <td className="px-2 py-1.5"><input type="checkbox" checked={sel.has(s.storeNumber)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(s.storeNumber); else n.delete(s.storeNumber); setSel(n) }} aria-label={`Select ${s.storeNumber}`} /></td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs font-semibold text-slate-900">{s.storeNumber}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-slate-700">{[s.city, s.state].filter(Boolean).join(', ') || '-'}</td>
                  <td className="px-2 py-1.5 text-xs text-slate-500">{s.region ?? '-'}</td>
                  <td className="px-2 py-1.5 tabular-nums"><Link className="text-indigo-700 hover:underline" href={`/app/servicechannel/work-orders?view=all&q=${encodeURIComponent(s.storeNumber)}`}>{s.total}</Link></td>
                  <td className={cx('px-2 py-1.5 tabular-nums', s.unknown ? 'font-semibold text-amber-700' : 'text-slate-400')}>{s.unknown}</td>
                  <td className="px-2 py-1.5 text-xs">{mapped.has(s.storeNumber) ? <span>{mapped.get(s.storeNumber)!.customerName} <button className="ml-1 text-rose-600" disabled={pending} onClick={() => act(() => unmapStoreAction(s.storeNumber), (r) => `Mapping removed; ${r.cleared ?? 0} work order(s) show an unknown customer again.`)}>×</button></span> : s.customers.length ? <span className="text-slate-500">{s.customers.join(', ')} (on work orders)</span> : <span className="text-slate-400">-</span>}</td>
                  <td className="max-w-[280px] truncate px-2 py-1.5 text-xs text-slate-500" title={s.sample ?? ''}>{s.sample ?? '-'}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8} className="px-2 py-6 text-center text-slate-500">No stores match.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold text-slate-900">Store directory ({directory.length})</h2>
        <p className="mt-0.5 text-xs text-slate-500">Confirmed mappings. Removing one clears the customer on work orders that got it from the mapping; customers typed on a work order by hand are kept. Mapping a store again corrects them.</p>
        <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2 xl:grid-cols-4">
          {directory.map((d) => <li key={d.id} className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1"><span><span className="font-mono font-semibold">{d.storeNumber}</span> → {d.customerName}<span className="ml-1 text-slate-400">by {d.createdName ?? '?'}</span></span><button className="text-rose-600" disabled={pending} onClick={() => act(() => unmapStoreAction(d.storeNumber), (r) => `Mapping removed; ${r.cleared ?? 0} work order(s) show an unknown customer again.`)}>×</button></li>)}
          {!directory.length && <li className="text-slate-400">Nothing mapped yet.</li>}
        </ul>
      </section>
    </div>
  )
}
