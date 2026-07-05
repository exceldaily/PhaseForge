'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { FilterBar, useUrlFilters, splitMulti, type FilterDef } from '@/components/operations/FilterBar'
import { OpsPageHeader, StatusPill, EmptyState } from '@/components/operations/shared'
import { createInvoice } from './actions'
import type { Invoice } from '@/lib/operations/types'

interface Option { id: string; name: string }
interface ItemLite { invoice_id: string; quantity: number; unit_price: number }
interface ReadyCall { id: string; call_number: number; title: string; customer_id: string | null }

const STATUSES = ['draft', 'ready', 'sent', 'paid', 'overdue', 'void']

export function InvoicesClient({
  invoices, items, customers, readyCalls, canWrite,
}: {
  invoices: Invoice[]
  items: ItemLite[]
  customers: Option[]
  readyCalls: ReadyCall[]
  canWrite: boolean
}) {
  const router = useRouter()
  const [filters, setFilters] = useUrlFilters()
  const [createOpen, setCreateOpen] = useState(false)

  const totals = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) {
      m.set(it.invoice_id, (m.get(it.invoice_id) ?? 0) + it.quantity * it.unit_price)
    }
    return m
  }, [items])

  const today = new Date().toISOString().slice(0, 10)
  const q = (filters.q ?? '').toLowerCase()
  const filtered = invoices.filter((inv) => {
    if (q && !`#${inv.invoice_number} ${inv.customer?.name ?? ''}`.toLowerCase().includes(q)) return false
    const statuses = splitMulti(filters.status)
    if (statuses.length && !statuses.includes(inv.status)) return false
    if (filters.customer && inv.customer_id !== filters.customer) return false
    if (filters.overdue === 'yes' && !(inv.due_date && inv.due_date < today && inv.status !== 'paid' && inv.status !== 'void')) return false
    if (filters.due_from && (inv.due_date ?? '') < filters.due_from) return false
    if (filters.due_to && (inv.due_date ?? '9999') > filters.due_to) return false
    return true
  })

  const defs: FilterDef[] = [
    { key: 'status', label: 'Status', type: 'multiselect', options: STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })) },
    { key: 'customer', label: 'Customer', type: 'select', options: customers.map((c) => ({ value: c.id, label: c.name })) },
    { key: 'overdue', label: 'Overdue', type: 'select', options: [{ value: 'yes', label: 'Past due' }] },
    { key: 'due', label: 'Due', type: 'daterange' },
  ]

  return (
    <div>
      <OpsPageHeader
        title="Invoices"
        subtitle={`Invoice-ready workflow — drafts, PDF generation, and status tracking${readyCalls.length ? ` · ${readyCalls.length} calls ready to invoice` : ''}`}
        actions={canWrite && <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={15} /> New Invoice</Button>}
      />
      <FilterBar defs={defs} filters={filters} onChange={setFilters} searchPlaceholder="Search invoices…" />

      {filtered.length === 0 ? (
        <EmptyState
          title={invoices.length ? 'No invoices match the current filters.' : 'No invoices yet.'}
          hint={invoices.length ? undefined : 'Flag calls as "Invoice ready", then pull them into a draft invoice here.'}
          action={canWrite && !invoices.length ? <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={14} /> Create first invoice</Button> : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-700">
                <th className="px-4 py-2.5">Invoice</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Issued</th>
                <th className="px-4 py-2.5">Due</th>
                <th className="px-4 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const overdue = inv.due_date && inv.due_date < today && !['paid', 'void'].includes(inv.status)
                return (
                  <tr
                    key={inv.id}
                    onClick={() => router.push(`/app/invoices/${inv.id}`)}
                    className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-4 py-3 font-mono text-sm font-semibold text-slate-700 dark:text-slate-200">INV-{String(inv.invoice_number).padStart(4, '0')}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{inv.customer?.name ?? '—'}</td>
                    <td className="px-4 py-3"><StatusPill status={overdue ? 'overdue' : inv.status} /></td>
                    <td className="hidden px-4 py-3 text-slate-500 md:table-cell">{inv.issue_date ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{inv.due_date ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700 dark:text-slate-200">
                      ${(totals.get(inv.id) ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <CreateInvoiceModal
          customers={customers}
          readyCalls={readyCalls}
          onClose={() => { setCreateOpen(false); router.refresh() }}
        />
      )}
    </div>
  )
}

function CreateInvoiceModal({
  customers, readyCalls, onClose,
}: {
  customers: Option[]
  readyCalls: ReadyCall[]
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [customerId, setCustomerId] = useState('')
  const [selectedCalls, setSelectedCalls] = useState<string[]>([])

  const candidateCalls = customerId ? readyCalls.filter((c) => c.customer_id === customerId) : readyCalls

  return (
    <Modal open onClose={onClose} title="New Invoice">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          startTransition(async () => {
            const res = await createInvoice({
              customer_id: customerId || null,
              due_date: String(fd.get('due_date') ?? '') || null,
              notes: String(fd.get('notes') ?? '') || null,
              call_ids: selectedCalls,
            })
            if (res?.error) setError(res.error)
            else {
              onClose()
              if (res.id) router.push(`/app/invoices/${res.id}`)
            }
          })
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Customer
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">—</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <Input name="due_date" label="Due date" type="date" />
        {candidateCalls.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Include invoice-ready calls</p>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {candidateCalls.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm text-slate-600 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selectedCalls.includes(c.id)}
                    onChange={() => setSelectedCalls((s) => s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id])}
                  />
                  <span className="font-mono text-xs text-slate-400">#{c.call_number}</span>
                  <span className="truncate">{c.title}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Notes
          <textarea name="notes" rows={2} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={pending}>Create Draft</Button>
        </div>
      </form>
    </Modal>
  )
}
