'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, X } from 'lucide-react'
import type { Customer, PriorityLevel, Store, Urgency } from '@/lib/dispatch/types'
import { titleCase } from '@/lib/dispatch/utils'
import { createCustomer, createPriorityLevel, deleteCustomer, deletePriorityLevel } from '@/app/app/dispatch/actions'

const URGENCIES: Urgency[] = ['urgent', 'high', 'normal', 'low']
const inputCls = 'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

export function PrioritiesClient({ customers, stores, priorityLevels, canEdit }: {
  customers: Customer[]
  stores: Store[]
  priorityLevels: PriorityLevel[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [cName, setCName] = useState('')
  const [lvlCustomer, setLvlCustomer] = useState('')
  const [lvlCode, setLvlCode] = useState('')
  const [lvlLabel, setLvlLabel] = useState('')
  const [lvlSeverity, setLvlSeverity] = useState<Urgency>('normal')

  const run = async (fn: () => Promise<{ error?: string } | { ok?: boolean }>) => {
    setError(null)
    const res = await fn()
    if (res && 'error' in res && res.error) setError(res.error)
    else router.refresh()
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-100 p-4 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4">
          <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">Customers &amp; Priorities</h1>
          <p className="text-xs text-slate-500">
            Customer accounts and each one&apos;s priority scale. The scale maps their P-codes (P1, P2…) to your
            internal urgency, so a P1 call lands at the top of the queue automatically. This customer list is shared
            with the <Link href="/app/customers" className="font-medium text-indigo-600 hover:underline">Customers page</Link>.
          </p>
        </div>

        {error && <p className="mb-3 text-xs text-rose-600">{error}</p>}

        {canEdit && (
          <div className="mb-4 flex gap-2">
            <input className={inputCls} placeholder="Customer / chain name (e.g. ALDI)" value={cName} onChange={(e) => setCName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && cName.trim()) { void run(() => createCustomer(cName)); setCName('') } }} />
            <button onClick={() => { if (cName.trim()) { void run(() => createCustomer(cName)); setCName('') } }}
              className="whitespace-nowrap rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">
              <Plus size={13} className="inline" /> Add customer
            </button>
          </div>
        )}

        <div className="space-y-2">
          {customers.map((c) => {
            const levels = priorityLevels.filter((l) => l.customer_id === c.id).sort((a, b) => a.sort_order - b.sort_order)
            const storeCount = stores.filter((s) => s.customer_id === c.id).length
            return (
              <div key={c.id} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <div>
                    <b className="text-sm text-slate-800 dark:text-slate-100">{c.name}</b>
                    {storeCount > 0 && <span className="ml-2 text-[11px] text-slate-400">{storeCount} {storeCount === 1 ? 'store' : 'stores'}</span>}
                  </div>
                  {canEdit && (
                    <button onClick={() => { if (confirm(`Delete customer ${c.name}? This removes the customer for the WHOLE organization (Customers page included), plus its priority scale.`)) void run(() => deleteCustomer(c.id)) }}
                      className="text-slate-300 hover:text-rose-500"><Trash2 size={14} /></button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {levels.map((l) => (
                    <span key={l.id} className="group inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <b>{l.code}</b> {l.label} <i className="text-slate-400">({l.severity})</i>
                      {canEdit && (
                        <button onClick={() => void run(() => deletePriorityLevel(l.id))}
                          className="hidden text-slate-400 hover:text-rose-500 group-hover:inline pointer-coarse:inline"><X size={10} /></button>
                      )}
                    </span>
                  ))}
                  {levels.length === 0 && <span className="text-[11px] text-slate-400">No priority scale. Calls for this customer use plain urgency.</span>}
                </div>
              </div>
            )
          })}
          {customers.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-xs text-slate-400 dark:border-slate-700">
              No customers yet. They group stores and carry priority scales (P1, P2…).
            </p>
          )}
        </div>

        {canEdit && customers.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Add a priority level</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <select className={inputCls} value={lvlCustomer} onChange={(e) => setLvlCustomer(e.target.value)}>
                <option value="">Pick customer…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input className={inputCls} placeholder="Code (P1)" value={lvlCode} onChange={(e) => setLvlCode(e.target.value)} />
              <input className={inputCls} placeholder="Label (2-4 Hours)" value={lvlLabel} onChange={(e) => setLvlLabel(e.target.value)} />
              <select className={inputCls} value={lvlSeverity} onChange={(e) => setLvlSeverity(e.target.value as Urgency)}>
                {URGENCIES.map((u) => <option key={u} value={u}>{titleCase(u)}</option>)}
              </select>
              <button
                onClick={() => {
                  if (!lvlCustomer || !lvlCode.trim() || !lvlLabel.trim()) { setError('Customer, code, and label are required for a priority level.'); return }
                  const count = priorityLevels.filter((l) => l.customer_id === lvlCustomer).length
                  void run(() => createPriorityLevel({ customer_id: lvlCustomer, code: lvlCode.trim(), label: lvlLabel.trim(), severity: lvlSeverity, sort_order: count }))
                  setLvlCode(''); setLvlLabel('')
                }}
                className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">Add level</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
