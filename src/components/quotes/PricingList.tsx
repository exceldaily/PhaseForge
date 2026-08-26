'use client'

// The Pricing section of Quotes: vendor quotes come back, get read into cost
// lines, and get marked up into the number the customer sees.

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Calculator, ClipboardPaste, Copy, FileUp, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { fmtMoney } from '@/lib/quotes/vendorQuote'
import {
  createPricingFromPdf, createPricingFromText, createBlankPricing,
  deletePricing, duplicatePricing,
} from '@/app/app/quotes/pricingActions'

export type PricingListItem = {
  id: string
  title: string
  vendorName: string | null
  jobNumber: string | null
  customerName: string | null
  status: string
  lineCount: number
  cost: number
  total: number
  marginPct: number
  createdAt: string
}

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-700',
  sent:  'bg-indigo-100 text-indigo-700',
  won:   'bg-emerald-100 text-emerald-700',
  lost:  'bg-slate-100 text-slate-500',
}

export function PricingList({ pricings }: { pricings: PricingListItem[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pending, start] = useTransition()

  const open = (id: string, found: number) => {
    setNote(found > 0 ? null : 'No line items could be read off that one — the sheet is ready to type into.')
    router.push(`/app/quotes/pricing/${id}`)
  }

  const active = pricings.filter((p) => p.status !== 'lost')
  const lost = pricings.filter((p) => p.status === 'lost')

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Price a quote</h2>
        <p className="mt-1 text-sm text-slate-500">
          Attach the quote a vendor sent back. Every line item is read in as your cost, then you set a markup and
          add labor, travel, and anything else that belongs on the job.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label data-help="pricing-upload" className={cn(
            'inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700',
            pending && 'pointer-events-none opacity-50',
          )}>
            <FileUp className="h-4 w-4" /> {pending ? 'Reading PDF…' : 'Attach vendor quote'}
            <input
              type="file" accept="application/pdf,.pdf" className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                const fd = new FormData()
                fd.set('file', file)
                start(async () => {
                  setError(null); setNote(null)
                  const res = await createPricingFromPdf(fd)
                  if (res.ok) open(res.pricingId, res.found)
                  else setError(res.error ?? 'Could not read that PDF.')
                })
              }}
            />
          </label>
          <Button size="sm" variant="outline" onClick={() => setPasteOpen((o) => !o)}>
            <ClipboardPaste className="h-4 w-4" /> {pasteOpen ? 'Cancel paste' : 'Paste quote text'}
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() =>
            start(async () => {
              setError(null); setNote(null)
              const res = await createBlankPricing()
              if (res.ok) open(res.pricingId, 1)
              else setError(res.error ?? 'Could not start a sheet.')
            })
          }>
            <Plus className="h-4 w-4" /> Start empty
          </Button>
        </div>
        {error && <p className="mt-2 text-sm font-medium text-rose-600">{error}</p>}
        {note && <p className="mt-2 text-sm text-slate-500">{note}</p>}
        {pasteOpen && (
          <div className="mt-3 space-y-2">
            <textarea
              rows={8} value={pasteText} onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste the quote — one line item per line, with its price at the end."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <Button size="sm" disabled={pending || pasteText.trim().length < 20} onClick={() =>
              start(async () => {
                setError(null)
                const res = await createPricingFromText({ text: pasteText })
                if (res.ok) open(res.pricingId, res.found)
                else setError(res.error ?? 'Could not read that.')
              })
            }>
              {pending ? 'Reading…' : 'Read line items'}
            </Button>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Priced quotes</h2>
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {active.map((p) => <PricingRow key={p.id} p={p} />)}
          {active.length === 0 && (
            <p className="p-8 text-center text-sm text-slate-500">
              Nothing priced yet. Attach a vendor quote above and it will come in as cost lines ready to mark up.
            </p>
          )}
        </div>
      </section>

      {lost.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Lost</h2>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white opacity-80">
            {lost.map((p) => <PricingRow key={p.id} p={p} />)}
          </div>
        </section>
      )}
    </div>
  )
}

function PricingRow({ p }: { p: PricingListItem }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  return (
    <div className="flex items-center gap-3 p-4 hover:bg-slate-50">
      <Calculator className="hidden h-4 w-4 shrink-0 text-slate-300 sm:block" />
      <Link href={`/app/quotes/pricing/${p.id}`} className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">{p.title}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {[
            p.vendorName,
            p.jobNumber && `Job ${p.jobNumber}`,
            p.customerName,
            `${p.lineCount} line${p.lineCount === 1 ? '' : 's'}`,
          ].filter(Boolean).join(' · ')}
        </p>
      </Link>

      <div className="hidden text-right sm:block">
        <p className="text-sm font-semibold text-slate-900">{fmtMoney(p.total)}</p>
        <p className="text-[11px] text-slate-400">
          cost {fmtMoney(p.cost)} · {p.marginPct.toFixed(1)}% margin
        </p>
      </div>

      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize', STATUS_STYLE[p.status] ?? STATUS_STYLE.draft)}>
        {p.status}
      </span>

      <button
        title="Duplicate this sheet" aria-label={`Duplicate ${p.title}`} disabled={pending}
        onClick={() => start(async () => {
          const res = await duplicatePricing({ id: p.id })
          if (res.ok) router.push(`/app/quotes/pricing/${res.pricingId}`)
        })}
        className="rounded p-1.5 text-slate-300 hover:bg-slate-100 hover:text-indigo-600"
      >
        <Copy className="h-4 w-4" />
      </button>
      <button
        title="Delete this sheet" aria-label={`Delete ${p.title}`} disabled={pending}
        onClick={() => {
          if (!confirm(`Delete "${p.title}"? The line items go with it.`)) return
          start(async () => { await deletePricing({ id: p.id }); router.refresh() })
        }}
        className="rounded p-1.5 text-slate-300 hover:bg-slate-100 hover:text-rose-600"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
