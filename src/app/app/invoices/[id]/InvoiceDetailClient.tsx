'use client'

// Invoice detail + print-optimized layout. "Download PDF" uses the browser's
// print-to-PDF (no payment processing, no external services).

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Printer, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { StatusPill } from '@/components/operations/shared'
import { updateInvoice, addInvoiceItem, deleteInvoiceItem } from '../actions'
import type { Invoice, InvoiceItem } from '@/lib/operations/types'

type InvoiceWithCustomer = Invoice & {
  customer?: { id: string; name: string; billing_address: string | null; email: string | null; phone: string | null } | null
}

const STATUSES = ['draft', 'ready', 'sent', 'paid', 'overdue', 'void']

export function InvoiceDetailClient({
  invoice, items, companyName, canWrite,
}: {
  invoice: InvoiceWithCustomer
  items: InvoiceItem[]
  companyName: string
  canWrite: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showItemForm, setShowItemForm] = useState(false)

  const total = items.reduce((s, it) => s + it.quantity * it.unit_price, 0)
  const invNumber = `INV-${String(invoice.invoice_number).padStart(4, '0')}`

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      {/* Screen-only toolbar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/app/invoices" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400">
          <ArrowLeft size={14} /> Invoices
        </Link>
        <div className="flex items-center gap-2">
          {canWrite && (
            <select
              defaultValue={invoice.status}
              onChange={(e) => startTransition(async () => {
                const res = await updateInvoice(invoice.id, { status: e.target.value })
                if (res?.error) setError(res.error)
                else router.refresh()
              })}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
          )}
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer size={14} /> Print / PDF
          </Button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 print:hidden">{error}</div>}

      {/* Invoice document */}
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm print:border-0 print:p-0 print:shadow-none dark:border-slate-700 dark:bg-slate-900 print:dark:bg-white">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 print:dark:text-slate-900">{companyName}</h1>
            <p className="mt-0.5 text-sm text-slate-500">Invoice</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-bold text-slate-800 dark:text-slate-100 print:dark:text-slate-900">{invNumber}</p>
            <div className="mt-1 print:hidden"><StatusPill status={invoice.status} /></div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Bill To</p>
            <p className="mt-1 font-medium text-slate-800 dark:text-slate-100 print:dark:text-slate-900">{invoice.customer?.name ?? '—'}</p>
            {invoice.customer?.billing_address && <p className="text-slate-500">{invoice.customer.billing_address}</p>}
            {invoice.customer?.email && <p className="text-slate-500">{invoice.customer.email}</p>}
          </div>
          <div className="text-right">
            <p className="text-slate-500">Issue date: <span className="font-medium text-slate-700 dark:text-slate-200 print:dark:text-slate-900">{invoice.issue_date ?? '—'}</span></p>
            <p className="text-slate-500">Due date: <span className="font-medium text-slate-700 dark:text-slate-200 print:dark:text-slate-900">{invoice.due_date ?? '—'}</span></p>
            {invoice.payment_reference && <p className="text-slate-500">Ref: {invoice.payment_reference}</p>}
          </div>
        </div>

        {/* Line items */}
        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-300 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-600">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Unit</th>
              <th className="py-2 text-right">Amount</th>
              {canWrite && <th className="w-8 print:hidden" />}
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-2.5 text-slate-700 dark:text-slate-200 print:dark:text-slate-900">{it.description}</td>
                <td className="py-2.5 text-right text-slate-600 dark:text-slate-300 print:dark:text-slate-900">{it.quantity}</td>
                <td className="py-2.5 text-right text-slate-600 dark:text-slate-300 print:dark:text-slate-900">${it.unit_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td className="py-2.5 text-right font-medium text-slate-700 dark:text-slate-200 print:dark:text-slate-900">
                  ${(it.quantity * it.unit_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                {canWrite && (
                  <td className="print:hidden">
                    <button
                      onClick={() => startTransition(async () => { await deleteInvoiceItem(it.id, invoice.id); router.refresh() })}
                      className="p-1 text-slate-300 hover:text-rose-500"
                      title="Remove line"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={4} className="py-6 text-center text-xs text-slate-400">No line items yet.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={canWrite ? 3 : 3} className="py-3 text-right font-semibold text-slate-600 dark:text-slate-300 print:dark:text-slate-900">Total</td>
              <td className="py-3 text-right text-lg font-bold text-slate-900 dark:text-slate-100 print:dark:text-slate-900">
                ${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </td>
              {canWrite && <td className="print:hidden" />}
            </tr>
          </tfoot>
        </table>

        {canWrite && (
          <div className="mt-2 print:hidden">
            {showItemForm ? (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  const fd = new FormData(e.currentTarget)
                  startTransition(async () => {
                    const res = await addInvoiceItem(invoice.id, {
                      description: String(fd.get('description') ?? ''),
                      quantity: Number(fd.get('quantity') ?? 1),
                      unit_price: Number(fd.get('unit_price') ?? 0),
                    })
                    if (res?.error) setError(res.error)
                    else { setShowItemForm(false); router.refresh() }
                  })
                }}
              >
                <div className="min-w-64 flex-1"><Input name="description" label="Description" required /></div>
                <div className="w-20"><Input name="quantity" label="Qty" type="number" step="0.01" defaultValue={1} /></div>
                <div className="w-28"><Input name="unit_price" label="Unit price" type="number" step="0.01" defaultValue={0} /></div>
                <Button type="submit" size="sm" loading={pending}>Add</Button>
              </form>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setShowItemForm(true)}><Plus size={14} /> Add line item</Button>
            )}
          </div>
        )}

        {invoice.notes && (
          <div className="mt-8 border-t border-slate-100 pt-4 text-sm text-slate-500 dark:border-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</p>
            <p className="mt-1 whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}
