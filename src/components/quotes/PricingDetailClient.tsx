'use client'

// One pricing sheet: vendor cost lines read off the quote PDF, plus labor,
// travel, and other expenses, marked up into a customer price.
//
// Every number is recomputed in the browser from the same pure functions the
// server uses, so the totals move the instant you type. Edits save on blur
// (debounced), never on every keystroke.

import Link from 'next/link'
import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileUp, Plus, Printer, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import {
  computeTotals, fmtMoney, lineCost, lineSell,
  PRICE_LINE_KINDS, type PriceLineKind,
} from '@/lib/quotes/vendorQuote'
import {
  addPriceLine, deletePriceLine, importLinesFromPdf, updatePriceLine, updatePricing,
} from '@/app/app/quotes/pricingActions'

export interface PricingSheet {
  id: string
  title: string
  vendorName: string | null
  quoteNumber: string | null
  jobNumber: string | null
  customerName: string | null
  notes: string | null
  status: string
  defaultMarkupPct: number
  taxPct: number
  sourceFileName: string | null
  sourceTotal: number | null
}

export interface PricingLine {
  id: string
  kind: PriceLineKind
  description: string
  qty: number
  unit: string | null
  unitCost: number
  markupPct: number | null
  taxable: boolean
}

const KIND_STYLE: Record<PriceLineKind, string> = {
  material: 'bg-slate-100 text-slate-600',
  labor:    'bg-indigo-100 text-indigo-700',
  travel:   'bg-amber-100 text-amber-700',
  other:    'bg-violet-100 text-violet-700',
}

const num = (v: string): number => {
  const n = Number(String(v).replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function PricingDetailClient({ sheet, lines: initial }: { sheet: PricingSheet; lines: PricingLine[] }) {
  const router = useRouter()
  const [lines, setLines] = useState<PricingLine[]>(initial)
  const [head, setHead] = useState(sheet)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // Saves are debounced per field so typing a price does not fire a request a
  // character at a time.
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const debounced = (key: string, fn: () => void) => {
    if (timers.current[key]) clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(fn, 600)
  }

  const settings = { defaultMarkupPct: head.defaultMarkupPct, taxPct: head.taxPct }
  const totals = useMemo(() => computeTotals(lines, settings), [lines, settings.defaultMarkupPct, settings.taxPct]) // eslint-disable-line react-hooks/exhaustive-deps

  const patchHead = (patch: Partial<PricingSheet>, dbPatch: Record<string, unknown>) => {
    setHead((h) => ({ ...h, ...patch }))
    debounced(Object.keys(dbPatch).join('|'), () => { void updatePricing({ id: sheet.id, patch: dbPatch }) })
  }

  const patchLine = (id: string, patch: Partial<PricingLine>, dbPatch: Record<string, unknown>) => {
    setLines((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)))
    debounced(`${id}:${Object.keys(dbPatch).join('|')}`, () => { void updatePriceLine({ id, patch: dbPatch }) })
  }

  const add = (kind: PriceLineKind) => start(async () => {
    const res = await addPriceLine({ pricingId: sheet.id, kind })
    if (!res.ok) { setError(res.error ?? 'Could not add that line.'); return }
    setLines((cur) => [...cur, {
      id: res.id, kind, description: '', qty: 1, unitCost: 0, markupPct: null,
      taxable: kind === 'material',
      unit: { material: 'EA', labor: 'HR', travel: 'MI', other: null }[kind],
    }])
  })

  const remove = (id: string) => {
    setLines((cur) => cur.filter((l) => l.id !== id))
    void deletePriceLine({ id })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6 print:p-0">
      <div className="print:hidden">
        <Link href="/app/quotes?tab=pricing" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600">
          <ArrowLeft className="h-4 w-4" /> Back to quotes
        </Link>
      </div>

      {/* ── Header ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-3">
          <input
            value={head.title}
            onChange={(e) => patchHead({ title: e.target.value }, { title: e.target.value })}
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-xl font-bold text-slate-900 outline-none hover:border-slate-200 focus:border-indigo-400"
          />
          <select
            data-help="pricing-status"
            value={head.status}
            onChange={(e) => patchHead({ status: e.target.value }, { status: e.target.value })}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-medium capitalize text-slate-600 outline-none focus:border-indigo-400 print:hidden"
          >
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>
          <Button size="sm" variant="outline" onClick={() => window.print()} className="print:hidden">
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Vendor" value={head.vendorName ?? ''}
            onChange={(v) => patchHead({ vendorName: v }, { vendor_name: v || null })} />
          <Field label="Vendor quote #" value={head.quoteNumber ?? ''}
            onChange={(v) => patchHead({ quoteNumber: v }, { quote_number: v || null })} />
          <Field label="Job #" value={head.jobNumber ?? ''}
            onChange={(v) => patchHead({ jobNumber: v }, { job_number: v || null })} />
          <Field label="Customer" value={head.customerName ?? ''}
            onChange={(v) => patchHead({ customerName: v }, { customer_name: v || null })} />
        </div>

        {/* Sanity check against the vendor's own printed total. */}
        {head.sourceTotal != null && (
          <p className="mt-2 text-xs text-slate-500">
            {head.sourceFileName ? `${head.sourceFileName} — ` : ''}
            the vendor&apos;s quote totalled <span className="font-semibold">{fmtMoney(head.sourceTotal)}</span>.
            Your material cost here is <span className={cn('font-semibold', Math.abs(totals.byKind.material.cost + totals.byKind.other.cost - head.sourceTotal) > 0.5 && 'text-amber-600')}>
              {fmtMoney(totals.byKind.material.cost + totals.byKind.other.cost)}
            </span>.
          </p>
        )}
      </section>

      {/* ── Markup + tax ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 print:hidden">
        <div className="flex flex-wrap items-end gap-4">
          <label className="block" data-help="pricing-markup">
            <span className="text-xs font-medium text-slate-500">Markup on everything</span>
            <div className="mt-1 flex items-center gap-1">
              <input
                type="number" step="0.5" value={head.defaultMarkupPct}
                onChange={(e) => patchHead({ defaultMarkupPct: num(e.target.value) }, { default_markup_pct: num(e.target.value) })}
                className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
              />
              <span className="text-sm text-slate-500">%</span>
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Sales tax</span>
            <div className="mt-1 flex items-center gap-1">
              <input
                type="number" step="0.125" value={head.taxPct}
                onChange={(e) => patchHead({ taxPct: num(e.target.value) }, { tax_pct: num(e.target.value) })}
                className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
              />
              <span className="text-sm text-slate-500">%</span>
            </div>
          </label>
          <p className="max-w-sm text-xs text-slate-500">
            This applies to every line that has no markup of its own. Override a single line in its own % box, and
            that line stops following this number.
          </p>
        </div>
      </section>

      {/* ── Lines ── */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-semibold">Type</th>
                <th className="px-3 py-2 font-semibold">Description</th>
                <th className="w-20 px-2 py-2 text-right font-semibold">Qty</th>
                <th className="w-16 px-2 py-2 font-semibold">Unit</th>
                <th className="w-28 px-2 py-2 text-right font-semibold">Unit cost</th>
                <th className="w-24 px-2 py-2 text-right font-semibold">Cost</th>
                <th className="w-24 px-2 py-2 text-right font-semibold">Markup</th>
                <th className="w-28 px-2 py-2 text-right font-semibold">Price</th>
                <th className="w-14 px-2 py-2 text-center font-semibold print:hidden">Tax</th>
                <th className="w-10 px-2 py-2 print:hidden" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-3 py-1.5">
                    <select
                      value={l.kind}
                      onChange={(e) => patchLine(l.id, { kind: e.target.value as PriceLineKind }, { kind: e.target.value })}
                      className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium capitalize outline-none', KIND_STYLE[l.kind])}
                    >
                      {PRICE_LINE_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      value={l.description} placeholder="Describe this line"
                      onChange={(e) => patchLine(l.id, { description: e.target.value }, { description: e.target.value })}
                      className="w-full min-w-[180px] rounded border border-transparent bg-transparent px-1 py-0.5 outline-none hover:border-slate-200 focus:border-indigo-400"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={l.qty} inputMode="decimal"
                      onChange={(e) => patchLine(l.id, { qty: num(e.target.value) }, { qty: num(e.target.value) })}
                      className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-right outline-none hover:border-slate-200 focus:border-indigo-400"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={l.unit ?? ''} placeholder="—"
                      onChange={(e) => patchLine(l.id, { unit: e.target.value }, { unit: e.target.value })}
                      className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs uppercase outline-none hover:border-slate-200 focus:border-indigo-400"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={l.unitCost} inputMode="decimal"
                      onChange={(e) => patchLine(l.id, { unitCost: num(e.target.value) }, { unit_cost: num(e.target.value) })}
                      className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-right outline-none hover:border-slate-200 focus:border-indigo-400"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-500">{fmtMoney(lineCost(l))}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center justify-end gap-0.5">
                      <input
                        value={l.markupPct ?? ''} inputMode="decimal"
                        placeholder={String(head.defaultMarkupPct)}
                        title={l.markupPct === null ? `Following the sheet default (${head.defaultMarkupPct}%)` : 'This line has its own markup — clear it to follow the default'}
                        onChange={(e) => {
                          const raw = e.target.value.trim()
                          const v = raw === '' ? null : num(raw)
                          patchLine(l.id, { markupPct: v }, { markup_pct: v })
                        }}
                        className={cn(
                          'w-14 rounded border border-transparent bg-transparent px-1 py-0.5 text-right outline-none hover:border-slate-200 focus:border-indigo-400',
                          l.markupPct === null ? 'text-slate-400' : 'font-semibold text-indigo-600',
                        )}
                      />
                      <span className="text-xs text-slate-400">%</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold text-slate-900">{fmtMoney(lineSell(l, settings))}</td>
                  <td className="px-2 py-1.5 text-center print:hidden">
                    <input
                      type="checkbox" checked={l.taxable}
                      aria-label={`Tax ${l.description || 'this line'}`}
                      onChange={(e) => patchLine(l.id, { taxable: e.target.checked }, { taxable: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </td>
                  <td className="px-2 py-1.5 print:hidden">
                    <button
                      onClick={() => remove(l.id)} aria-label={`Delete ${l.description || 'line'}`}
                      className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr><td colSpan={10} className="p-8 text-center text-sm text-slate-500">
                  Nothing on this sheet yet. Add a line below, or attach another vendor quote to read one in.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 p-3 print:hidden" data-help="pricing-add">
          {PRICE_LINE_KINDS.map((k) => (
            <Button key={k.key} size="sm" variant="outline" disabled={pending} onClick={() => add(k.key)}>
              <Plus className="h-3.5 w-3.5" /> {k.label}
            </Button>
          ))}
          <label className={cn(
            'ml-auto inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-300',
            pending && 'pointer-events-none opacity-50',
          )}>
            <FileUp className="h-3.5 w-3.5" /> {pending ? 'Reading…' : 'Add another vendor quote'}
            <input
              type="file" accept="application/pdf,.pdf" className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                const fd = new FormData()
                fd.set('file', file); fd.set('pricingId', sheet.id)
                start(async () => {
                  setError(null); setNote(null)
                  const res = await importLinesFromPdf(fd)
                  if (!res.ok) { setError(res.error ?? 'Could not read that PDF.'); return }
                  setNote(res.found > 0 ? `Added ${res.found} line${res.found === 1 ? '' : 's'}.` : 'No line items could be read off that one.')
                  router.refresh()
                })
              }}
            />
          </label>
        </div>
        {error && <p className="border-t border-slate-200 px-3 py-2 text-sm font-medium text-rose-600 print:hidden">{error}</p>}
        {note && <p className="border-t border-slate-200 px-3 py-2 text-sm text-slate-500 print:hidden">{note}</p>}
      </section>

      {/* ── Totals ── */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Where the cost sits</h2>
          <table className="w-full text-sm">
            <tbody>
              {PRICE_LINE_KINDS.map((k) => {
                const t = totals.byKind[k.key]
                if (t.cost === 0 && t.sell === 0) return null
                return (
                  <tr key={k.key} className="border-b border-slate-100 last:border-b-0">
                    <td className="py-1.5">
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', KIND_STYLE[k.key])}>{k.label}</span>
                    </td>
                    <td className="py-1.5 text-right text-slate-500">{fmtMoney(t.cost)}</td>
                    <td className="py-1.5 text-right font-semibold text-slate-900">{fmtMoney(t.sell)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <textarea
            rows={3} value={head.notes ?? ''} placeholder="Notes for this quote (exclusions, lead time, assumptions)…"
            onChange={(e) => patchHead({ notes: e.target.value }, { notes: e.target.value || null })}
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4" data-help="pricing-totals">
          <Row label="Cost" value={fmtMoney(totals.cost)} muted />
          <Row label="Markup" value={fmtMoney(totals.markup)} muted />
          <Row label="Subtotal" value={fmtMoney(totals.subtotal)} />
          <Row label={`Tax (${head.taxPct}%)`} value={fmtMoney(totals.tax)} muted />
          <div className="mt-2 border-t border-slate-200 pt-2">
            <Row label="Quote total" value={fmtMoney(totals.total)} big />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {totals.marginPct.toFixed(1)}% gross margin
            {totals.cost > 0 && <> · {fmtMoney(totals.markup)} over cost</>}
          </p>
        </div>
      </section>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <input
        value={value} onChange={(e) => onChange(e.target.value)} placeholder="—"
        className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
      />
    </label>
  )
}

function Row({ label, value, muted, big }: { label: string; value: string; muted?: boolean; big?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span className={cn('text-sm', muted ? 'text-slate-500' : 'font-medium text-slate-700')}>{label}</span>
      <span className={cn(big ? 'text-xl font-bold text-slate-900' : muted ? 'text-sm text-slate-500' : 'text-sm font-semibold text-slate-900')}>
        {value}
      </span>
    </div>
  )
}
