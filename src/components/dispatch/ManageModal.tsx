'use client'

import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import type { Customer, DispatchFormField, PriorityLevel, Store, Urgency, Vendor } from '@/lib/dispatch/types'
import { titleCase } from '@/lib/dispatch/utils'
import {
  addFormField, createCustomer, createPriorityLevel, createStore, createTech,
  deleteCustomer, deletePriorityLevel, deleteStore, deleteTech, removeFormField, updateStore, updateTech,
} from '@/app/app/dispatch/actions'

const inputCls = 'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
const URGENCIES: Urgency[] = ['urgent', 'high', 'normal', 'low']

type Tab = 'stores' | 'techs' | 'customers' | 'fields'

export function ManageModal({ stores, vendors, customers, priorityLevels, formFields, onClose, onChanged }: {
  stores: Store[]
  vendors: Vendor[]
  customers: Customer[]
  priorityLevels: PriorityLevel[]
  formFields: DispatchFormField[]
  onClose: () => void
  onChanged: () => void
}) {
  const [tab, setTab] = useState<Tab>('stores')
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<{ error?: string } | { ok?: boolean }>) => {
    setError(null)
    const res = await fn()
    if (res && 'error' in res && res.error) setError(res.error)
    else onChanged()
  }

  // Store form state
  const [sNum, setSNum] = useState(''); const [sName, setSName] = useState('')
  const [sCustomer, setSCustomer] = useState(''); const [sCity, setSCity] = useState('')
  const [sMap, setSMap] = useState('')
  // Tech form state
  const [tName, setTName] = useState(''); const [tCompany, setTCompany] = useState('')
  const [tTrade, setTTrade] = useState('')
  // Customer + level state
  const [cName, setCName] = useState('')
  const [lvlCustomer, setLvlCustomer] = useState('')
  const [lvlCode, setLvlCode] = useState(''); const [lvlLabel, setLvlLabel] = useState('')
  const [lvlSeverity, setLvlSeverity] = useState<Urgency>('normal')
  // Field state
  const [fLabel, setFLabel] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onClick={onClose}>
      <div className="mt-4 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Manage Dispatch</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="mb-4 flex gap-1">
          {(['stores', 'techs', 'customers', 'fields'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === t ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              {t === 'fields' ? 'Card Fields' : titleCase(t)}
            </button>
          ))}
        </div>
        {error && <p className="mb-3 text-xs text-rose-600">{error}</p>}

        {tab === 'stores' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <input className={inputCls} placeholder="Store #" value={sNum} onChange={(e) => setSNum(e.target.value)} />
              <input className={inputCls} placeholder="Store name" value={sName} onChange={(e) => setSName(e.target.value)} />
              <select className={inputCls} value={sCustomer} onChange={(e) => setSCustomer(e.target.value)}>
                <option value="">No customer</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input className={inputCls} placeholder="City (optional)" value={sCity} onChange={(e) => setSCity(e.target.value)} />
              <div className="flex gap-1.5">
                <input className={inputCls} placeholder="Maps URL" value={sMap} onChange={(e) => setSMap(e.target.value)} />
                <button onClick={() => { void run(() => createStore({ store_number: sNum, store_name: sName, customer_id: sCustomer || null, city: sCity || null, google_maps_url: sMap || null })); setSNum(''); setSName(''); setSCity(''); setSMap('') }}
                  className="rounded-md bg-indigo-600 px-2.5 text-xs font-medium text-white"><Plus size={13} /></button>
              </div>
            </div>
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {stores.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-700">
                  <b className="text-slate-700 dark:text-slate-200">#{s.store_number}</b>
                  <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{s.store_name}</span>
                  <span className="text-slate-400">{customers.find((c) => c.id === s.customer_id)?.name ?? ''}</span>
                  <select className="rounded border border-slate-200 bg-transparent px-1 py-0.5 text-[11px] text-slate-500 dark:border-slate-700"
                    value={s.customer_id ?? ''} onChange={(e) => void run(() => updateStore(s.id, { customer_id: e.target.value || null }))}>
                    <option value="">No customer</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button onClick={() => { if (confirm(`Delete store #${s.store_number} ${s.store_name}? Its calls are deleted too.`)) void run(() => deleteStore(s.id)) }}
                    className="text-slate-300 hover:text-rose-500"><Trash2 size={13} /></button>
                </div>
              ))}
              {stores.length === 0 && <p className="py-4 text-center text-xs text-slate-400">No stores yet — add your locations above.</p>}
            </div>
          </div>
        )}

        {tab === 'techs' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <input className={inputCls} placeholder="Name" value={tName} onChange={(e) => setTName(e.target.value)} />
              <input className={inputCls} placeholder="Company (optional)" value={tCompany} onChange={(e) => setTCompany(e.target.value)} />
              <input className={inputCls} placeholder="Trade (e.g. Refrigeration)" value={tTrade} onChange={(e) => setTTrade(e.target.value)} />
              <button onClick={() => { void run(() => createTech({ name: tName, company: tCompany || null, trade_type: tTrade || null })); setTName(''); setTCompany(''); setTTrade('') }}
                className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white"><Plus size={13} className="inline" /> Add tech</button>
            </div>
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {vendors.map((v) => (
                <div key={v.id} className="flex items-center gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-700">
                  <b className="text-slate-700 dark:text-slate-200">{v.name}</b>
                  <span className="text-slate-400">{[v.company, v.trade_type].filter(Boolean).join(' · ')}</span>
                  <label className="ml-auto flex items-center gap-1 text-[11px] text-slate-400">
                    <input type="checkbox" checked={v.active} className="accent-indigo-600"
                      onChange={(e) => void run(() => updateTech(v.id, { active: e.target.checked }))} />
                    Active
                  </label>
                  <button onClick={() => { if (confirm(`Delete tech ${v.name}?`)) void run(() => deleteTech(v.id)) }}
                    className="text-slate-300 hover:text-rose-500"><Trash2 size={13} /></button>
                </div>
              ))}
              {vendors.length === 0 && <p className="py-4 text-center text-xs text-slate-400">No techs yet.</p>}
            </div>
          </div>
        )}

        {tab === 'customers' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input className={inputCls} placeholder="Customer / chain name (e.g. ALDI)" value={cName} onChange={(e) => setCName(e.target.value)} />
              <button onClick={() => { void run(() => createCustomer(cName)); setCName('') }}
                className="whitespace-nowrap rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white"><Plus size={13} className="inline" /> Add</button>
            </div>
            <div className="space-y-2">
              {customers.map((c) => (
                <div key={c.id} className="rounded-md border border-slate-200 p-2.5 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <b className="text-xs text-slate-700 dark:text-slate-200">{c.name}</b>
                    <button onClick={() => { if (confirm(`Delete customer ${c.name} and its priority scale?`)) void run(() => deleteCustomer(c.id)) }}
                      className="text-slate-300 hover:text-rose-500"><Trash2 size={13} /></button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {priorityLevels.filter((l) => l.customer_id === c.id).sort((a, b) => a.sort_order - b.sort_order).map((l) => (
                      <span key={l.id} className="group inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <b>{l.code}</b> {l.label} <i className="text-slate-400">({l.severity})</i>
                        <button onClick={() => void run(() => deletePriorityLevel(l.id))}
                          className="hidden text-slate-400 hover:text-rose-500 group-hover:inline pointer-coarse:inline"><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {customers.length === 0 && <p className="py-2 text-center text-xs text-slate-400">No customers yet — they group stores and carry priority scales (P1, P2…).</p>}
            </div>
            {customers.length > 0 && (
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
                  className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white">Add level</button>
              </div>
            )}
          </div>
        )}

        {tab === 'fields' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Extra fillable blanks on the New Service Call card. Add what your workflow needs
              (PO #, Landlord contact, Asset tag…) — removing one keeps values already saved on calls.
            </p>
            <div className="flex gap-2">
              <input className={inputCls} placeholder="Field label" value={fLabel} onChange={(e) => setFLabel(e.target.value)} />
              <button onClick={() => { void run(() => addFormField(fLabel)); setFLabel('') }}
                className="whitespace-nowrap rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white"><Plus size={13} className="inline" /> Add</button>
            </div>
            <div className="space-y-1">
              {formFields.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-md border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-700">
                  <span className="text-slate-700 dark:text-slate-200">{f.label}</span>
                  <button onClick={() => { if (confirm(`Remove "${f.label}" from the call card?`)) void run(() => removeFormField(f.id)) }}
                    className="text-slate-300 hover:text-rose-500"><Trash2 size={13} /></button>
                </div>
              ))}
              {formFields.length === 0 && <p className="py-2 text-center text-xs text-slate-400">No custom fields yet.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
