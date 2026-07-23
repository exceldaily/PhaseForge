'use client'

// Quote detail: editable parsed fields, vendor selection with select/deselect
// all, per-vendor personalized send from the user's own Gmail, reply tracking,
// and the complete & archive workflow. Ported from InboxFlow.

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Archive, ArrowLeft, Check, RefreshCw, RotateCcw, Send, Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
  checkQuoteReplies, completeQuote, deleteQuoteRequest, reopenQuote,
  sendQuoteToVendors, updateQuoteRequest,
} from '@/app/app/quotes/actions'
import type { VendorItem } from './QuotesClient'

export type QuoteDetailData = {
  id: string
  status: string
  updatedAt: string
  createdAt: string
  poNumber: string | null
  trade: string | null
  techName: string | null
  jobNumber: string | null
  storeNumber: string | null
  itemsText: string
  previewSubject: string
  previewBody: string
  sends: {
    vendorName: string; vendorEmail: string; status: string
    sentAt: string | null; repliedAt: string | null; error: string | null
  }[]
}

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

export function QuoteDetailClient({ quote, vendors, canSend }: {
  quote: QuoteDetailData
  vendors: VendorItem[]
  canSend: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [body, setBody] = useState(quote.previewBody)
  const tradeMatch = (v: VendorItem) => !quote.trade || !v.tradeType || v.tradeType.toLowerCase() === quote.trade.toLowerCase()
  const alreadySent = new Set(quote.sends.filter((s) => s.status === 'sent' || s.status === 'replied').map((s) => s.vendorEmail))
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(vendors.filter((v) => v.active && tradeMatch(v) && !alreadySent.has(v.email)).map((v) => v.id)),
  )

  const outstanding = quote.sends.filter((s) => s.status === 'sent' || s.status === 'replied')
  const repliedCount = quote.sends.filter((s) => s.status === 'replied').length
  const sentCount = outstanding.length
  const allReplied = sentCount > 0 && repliedCount === sentCount
  const isClosed = quote.status === 'closed'

  const selectableIds = vendors.filter((v) => v.active && !alreadySent.has(v.email)).map((v) => v.id)
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))

  const patchField = (field: string) => (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    start(() => void updateQuoteRequest({ id: quote.id, patch: { [field]: e.target.value || null } }))
  }

  // The editable box shows the full email; the greeting/sign-off get
  // re-personalized per vendor, so strip them before overriding.
  function extractCore(text: string): string {
    return text
      .replace(/^Hi [^,\n]{1,60},\s*/i, '')
      .replace(/\s*Thanks,\s*[\s\S]{0,80}$/i, '')
      .trim()
  }

  const send = () =>
    start(async () => {
      setError(null); setNote(null)
      const res = await sendQuoteToVendors({
        quoteId: quote.id,
        vendorIds: [...selected],
        bodyOverride: body.trim() !== quote.previewBody.trim() ? extractCore(body) : null,
      })
      if (res.sent > 0) setNote(`Sent to ${res.sent} vendor${res.sent === 1 ? '' : 's'}.`)
      if (res.error) setError(res.error)
      router.refresh()
    })

  const checkReplies = () =>
    start(async () => {
      setError(null)
      const res = await checkQuoteReplies({ quoteId: quote.id })
      if (!res.ok) setError(res.error ?? 'Could not check replies.')
      else setNote(res.updated > 0 ? `${res.updated} new repl${res.updated === 1 ? 'y' : 'ies'} found.` : 'No new replies yet.')
      router.refresh()
    })

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <div>
        <Link href="/app/quotes" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Quotes
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold text-slate-900">
            {[quote.jobNumber && `Job ${quote.jobNumber}`, quote.storeNumber].filter(Boolean).join(' · ') || 'Quote request'}
          </h1>
          <Badge className={
            isClosed ? 'bg-slate-100 text-slate-500'
              : quote.status === 'quoted' ? 'bg-emerald-100 text-emerald-700'
              : quote.status === 'sent' ? 'bg-indigo-100 text-indigo-700'
              : 'bg-amber-100 text-amber-700'
          }>
            {isClosed ? 'completed' : quote.status}
          </Badge>
          <button
            className="ml-auto text-slate-400 hover:text-rose-600" aria-label="Delete quote"
            onClick={() => {
              if (!confirm('Delete this quote request?')) return
              start(async () => { await deleteQuoteRequest({ id: quote.id }); router.push('/app/quotes') })
            }}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        {quote.poNumber && <p className="mt-0.5 text-sm text-slate-500">{quote.poNumber}</p>}
      </div>

      {isClosed && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <Archive className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">
            Completed and archived {new Date(quote.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.
          </span>
          <Button size="sm" variant="outline" className="ml-auto" disabled={pending}
            onClick={() => start(async () => { await reopenQuote({ id: quote.id }); router.refresh() })}>
            <RotateCcw className="h-4 w-4" /> Reopen
          </Button>
        </div>
      )}

      {/* Request details */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Request details</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {([
            ['job_number', 'Job #', quote.jobNumber],
            ['store_number', 'Store / location', quote.storeNumber],
            ['po_number', 'PO / reference', quote.poNumber],
            ['trade', 'Trade', quote.trade],
            ['tech_name', 'Requested by', quote.techName],
          ] as const).map(([field, label, value]) => (
            <div key={field}>
              <label htmlFor={field} className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
              <input id={field} defaultValue={value ?? ''} onBlur={patchField(field)} className={inputCls} />
            </div>
          ))}
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Received</p>
            <p className="py-2 text-sm text-slate-700">{new Date(quote.createdAt).toLocaleString()}</p>
          </div>
        </div>
        <div className="mt-3">
          <label htmlFor="items_text" className="mb-1 block text-xs font-medium text-slate-500">Parts / items requested</label>
          <textarea id="items_text" rows={3} defaultValue={quote.itemsText} onBlur={patchField('items_text')} className={inputCls} />
        </div>
      </section>

      {/* Send to vendors */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Send to vendors</h2>
          {selectableIds.length > 0 && (
            <div className="ml-auto flex items-center gap-3 text-xs font-semibold">
              <button type="button" onClick={() => setSelected(new Set(selectableIds))} disabled={allSelected}
                className="text-indigo-600 hover:underline disabled:text-slate-300 disabled:no-underline">
                Select all
              </button>
              <button type="button" onClick={() => setSelected(new Set())} disabled={selected.size === 0}
                className="text-indigo-600 hover:underline disabled:text-slate-300 disabled:no-underline">
                Deselect all
              </button>
            </div>
          )}
        </div>
        {!canSend && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-slate-700">
            Connect your Gmail on the <Link href="/app/quotes" className="text-indigo-600 underline">Quotes page</Link> first —
            quotes send from your own address.
          </p>
        )}
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {vendors.filter((v) => v.active).map((v) => {
            const sent = alreadySent.has(v.email)
            return (
              <label key={v.id} className={cn(
                'flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700',
                sent ? 'opacity-60' : 'hover:bg-slate-50',
              )}>
                <input
                  type="checkbox" className="h-4 w-4 accent-indigo-600"
                  checked={selected.has(v.id)} disabled={sent}
                  onChange={(e) =>
                    setSelected((prev) => {
                      const next = new Set(prev)
                      if (e.target.checked) next.add(v.id)
                      else next.delete(v.id)
                      return next
                    })
                  }
                />
                <span className="min-w-0 flex-1 truncate">
                  {v.name} <span className="font-normal text-slate-400">· {v.email}</span>
                </span>
                {v.tradeType && <Badge className="border border-slate-200 bg-white text-slate-500">{v.tradeType}</Badge>}
                {sent && <Badge className="bg-emerald-100 text-emerald-700">sent</Badge>}
              </label>
            )
          })}
          {vendors.filter((v) => v.active).length === 0 && (
            <p className="text-sm text-slate-500">
              No active vendors. <Link href="/app/quotes" className="font-semibold text-indigo-600 hover:underline">Add vendors</Link> first.
            </p>
          )}
        </div>

        <div className="mt-4">
          <label htmlFor="emailBody" className="mb-1 block text-xs font-medium text-slate-500">
            Message (greeting and sign-off personalize per vendor)
          </label>
          <p className="mb-1.5 text-xs text-slate-400">Subject: {quote.previewSubject} · your Gmail signature is added to the bottom.</p>
          <textarea id="emailBody" rows={10} value={body} onChange={(e) => setBody(e.target.value)} className={cn(inputCls, 'font-mono text-[13px]')} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={send} disabled={pending || !canSend || selected.size === 0}>
            <Send className="h-4 w-4" /> {pending ? 'Working…' : `Send to ${selected.size} vendor${selected.size === 1 ? '' : 's'}`}
          </Button>
          {note && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600">
              <Check className="h-4 w-4" /> {note}
            </span>
          )}
          {error && <span className="text-sm font-medium text-rose-600">{error}</span>}
        </div>
      </section>

      {/* Outreach status */}
      {quote.sends.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-slate-900">Outreach status</p>
            {sentCount > 0 && (
              <Badge className={allReplied ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}>
                {repliedCount}/{sentCount} replied
              </Badge>
            )}
            <Button size="sm" variant="ghost" className="ml-auto" disabled={pending || !canSend} onClick={checkReplies}>
              <RefreshCw className="h-4 w-4" /> Check for replies
            </Button>
          </div>
          <div className="divide-y divide-slate-100">
            {quote.sends.map((s) => (
              <div key={s.vendorEmail} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                <span className="font-semibold text-slate-900">{s.vendorName}</span>
                <span className="text-xs text-slate-500">{s.vendorEmail}</span>
                <Badge className={
                  s.status === 'replied' ? 'bg-emerald-100 text-emerald-700'
                    : s.status === 'sent' ? 'bg-indigo-100 text-indigo-700'
                    : s.status === 'failed' ? 'bg-rose-100 text-rose-700'
                    : 'bg-slate-100 text-slate-500'
                }>
                  {s.status}
                </Badge>
                {s.sentAt && <span className="text-xs text-slate-400">sent {new Date(s.sentAt).toLocaleString()}</span>}
                {s.repliedAt && <span className="text-xs text-emerald-600">replied {new Date(s.repliedAt).toLocaleString()}</span>}
                {s.error && <span className="text-xs font-medium text-rose-600">{s.error}</span>}
              </div>
            ))}
          </div>

          {!isClosed && sentCount > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-3">
              {allReplied ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                  <Check className="h-4 w-4" /> All quotes are in — ready to complete.
                </span>
              ) : (
                <span className="text-sm text-slate-500">
                  Waiting on {sentCount - repliedCount} more vendor{sentCount - repliedCount === 1 ? '' : 's'}.
                </span>
              )}
              <Button
                size="sm" variant={allReplied ? 'primary' : 'outline'} className="ml-auto" disabled={pending}
                onClick={() => {
                  if (!allReplied && !confirm('Not every vendor has replied yet. Complete and archive anyway?')) return
                  start(async () => { await completeQuote({ id: quote.id }); router.push('/app/quotes') })
                }}>
                <Archive className="h-4 w-4" /> Complete &amp; archive
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
