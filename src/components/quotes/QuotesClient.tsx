'use client'

// Quotes list: PDF/paste intake, open + completed quote lists, the shared
// vendor list, and the per-user Gmail connection card. Ported from InboxFlow.

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Check, ClipboardPaste, FileUp, Mail, Pencil, Plus, RefreshCw, Trash2, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
  addVendor, createQuoteFromPdf, createQuoteFromText, deleteVendor, updateVendor,
  disconnectGmail, refreshSignature,
} from '@/app/app/quotes/actions'

export type QuoteListItem = {
  id: string
  status: string
  poNumber: string | null
  jobNumber: string | null
  storeNumber: string | null
  trade: string | null
  techName: string | null
  itemsText: string
  createdAt: string
  sentCount: number
  repliedCount: number
  readyToComplete: boolean
}

export type VendorItem = { id: string; name: string; email: string; tradeType: string; active: boolean }

const STATUS_STYLE: Record<string, string> = {
  intake: 'bg-amber-100 text-amber-700',
  ready: 'bg-indigo-100 text-indigo-700',
  sent: 'bg-indigo-100 text-indigo-700',
  quoted: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-slate-100 text-slate-500',
}

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

export function QuotesClient({ quotes, vendors, gmailEmail, hasSignature }: {
  quotes: QuoteListItem[]
  vendors: VendorItem[]
  gmailEmail: string | null
  hasSignature: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const oauthError = params.get('error')
  const justConnected = params.get('connected') === '1'

  const intakeText = () =>
    start(async () => {
      setError(null)
      const res = await createQuoteFromText({ text: pasteText })
      if (res.ok && 'quoteId' in res && res.quoteId) router.push(`/app/quotes/${res.quoteId}`)
      else setError(('error' in res ? res.error : null) ?? 'Could not read that form.')
    })

  const active = quotes.filter((q) => q.status !== 'closed')
  const completed = quotes.filter((q) => q.status === 'closed')

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Quotes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Tech form submissions in, vendor inquiries out, replies tracked. Nothing sends until you press Send.
        </p>
      </div>

      <GmailCard gmailEmail={gmailEmail} hasSignature={hasSignature} oauthError={oauthError} justConnected={justConnected} />

      {/* Intake */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Intake</h2>
        <p className="mt-1 text-sm text-slate-500">Attach a tech&apos;s form PDF and it becomes a quote request, parsed and ready to send.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className={cn(
            'inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700',
            pending && 'pointer-events-none opacity-50',
          )}>
            <FileUp className="h-4 w-4" /> {pending ? 'Reading PDF…' : 'Attach form PDF'}
            <input
              type="file" accept="application/pdf,.pdf" className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                const fd = new FormData()
                fd.set('file', file)
                start(async () => {
                  setError(null)
                  const res = await createQuoteFromPdf(fd)
                  if (res.ok && 'quoteId' in res && res.quoteId) router.push(`/app/quotes/${res.quoteId}`)
                  else setError(('error' in res ? res.error : null) ?? 'Could not read that PDF.')
                })
              }}
            />
          </label>
          <Button size="sm" variant="outline" onClick={() => setPasteOpen((o) => !o)}>
            <ClipboardPaste className="h-4 w-4" /> {pasteOpen ? 'Cancel paste' : 'Paste text instead'}
          </Button>
        </div>
        {error && !pasteOpen && <p className="mt-2 text-sm font-medium text-rose-600">{error}</p>}
        {pasteOpen && (
          <div className="mt-3 space-y-2">
            <textarea
              rows={8} value={pasteText} onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste the whole form text — PO number, trade, job number, items…"
              className={inputCls}
            />
            {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
            <Button size="sm" onClick={intakeText} disabled={pending || pasteText.trim().length < 20}>
              {pending ? 'Reading…' : 'Create quote request'}
            </Button>
          </div>
        )}
      </section>

      {/* Open quotes */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Quote requests</h2>
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {active.map((q) => <QuoteRow key={q.id} q={q} />)}
          {active.length === 0 && (
            <p className="p-8 text-center text-sm text-slate-500">No open quote requests. Attach a form PDF above to start one.</p>
          )}
        </div>
      </section>

      {completed.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Completed &amp; archived</h2>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white opacity-80">
            {completed.map((q) => <QuoteRow key={q.id} q={q} />)}
          </div>
        </section>
      )}

      <VendorManager vendors={vendors} />
    </div>
  )
}

function GmailCard({ gmailEmail, hasSignature, oauthError, justConnected }: {
  gmailEmail: string | null
  hasSignature: boolean
  oauthError: string | null
  justConnected: boolean
}) {
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  const router = useRouter()

  if (!gmailEmail) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Mail className="h-5 w-5 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Connect your Gmail to send quotes</p>
            <p className="text-sm text-slate-600">
              Quotes send from your own email address. Each teammate connects their own account — nothing is shared.
            </p>
          </div>
          <a href="/api/quotes/gmail/start" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Connect Gmail
          </a>
        </div>
        {oauthError && <p className="mt-2 text-sm font-medium text-rose-600">Connection failed: {oauthError}</p>}
      </section>
    )
  }
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Mail className="h-4 w-4 text-emerald-600" />
        <p className="min-w-0 flex-1 text-sm text-slate-700">
          Sending as <span className="font-semibold">{gmailEmail}</span>
          {hasSignature ? ' · signature on' : ' · no signature found'}
          {justConnected && <span className="ml-2 font-medium text-emerald-600">Connected.</span>}
        </p>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() =>
          start(async () => {
            const res = await refreshSignature()
            setNote(res.ok ? 'Signature refreshed.' : (res.error ?? 'Could not refresh.'))
            router.refresh()
          })
        }>
          <RefreshCw className="h-4 w-4" /> Refresh signature
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => {
          if (!confirm('Disconnect your Gmail from Quotes?')) return
          start(async () => { await disconnectGmail(); router.refresh() })
        }}>
          Disconnect
        </Button>
      </div>
      {note && <p className="mt-1.5 text-sm text-slate-500">{note}</p>}
      {oauthError && <p className="mt-1.5 text-sm font-medium text-rose-600">Connection error: {oauthError}</p>}
    </section>
  )
}

function QuoteRow({ q }: { q: QuoteListItem }) {
  return (
    <Link href={`/app/quotes/${q.id}`} className="block px-4 py-3 hover:bg-slate-50">
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-900">
          {[q.jobNumber && `Job ${q.jobNumber}`, q.storeNumber, q.poNumber].filter(Boolean).join(' · ') || '(no references)'}
        </span>
        <Badge className={STATUS_STYLE[q.status] ?? 'bg-slate-100 text-slate-600'}>
          {q.status === 'closed' ? 'completed' : q.status}
        </Badge>
        {q.trade && <Badge className="border border-slate-200 bg-white text-slate-500">{q.trade}</Badge>}
        {q.readyToComplete && <Badge className="bg-emerald-100 text-emerald-700">ready to complete</Badge>}
        {q.sentCount > 0 && (
          <span className="text-xs font-medium text-slate-500">{q.repliedCount}/{q.sentCount} replied</span>
        )}
        <span className="ml-auto text-xs text-slate-400">
          {new Date(q.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </span>
      <span className="mt-0.5 block truncate text-xs text-slate-500">
        {q.techName && `${q.techName} · `}{q.itemsText || 'No items text'}
      </span>
    </Link>
  )
}

function VendorManager({ vendors }: { vendors: VendorItem[] }) {
  const sorted = (v: VendorItem[]) => [...v].sort((a, b) => a.name.localeCompare(b.name))
  const [items, setItems] = useState(() => sorted(vendors))
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [trade, setTrade] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState({ name: '', email: '', trade: '' })
  const [editError, setEditError] = useState<string | null>(null)

  const add = () =>
    start(async () => {
      setError(null)
      const res = await addVendor({ name, email, tradeType: trade })
      if (!res.ok) { setError(res.error ?? 'Could not add the vendor.'); return }
      setItems((xs) => sorted([...xs, { id: `tmp-${Date.now()}`, name, email: email.toLowerCase(), tradeType: trade, active: true }]))
      setName(''); setEmail(''); setTrade('')
    })

  const saveEdit = (id: string) =>
    start(async () => {
      setEditError(null)
      const res = await updateVendor({ id, name: edit.name, email: edit.email, tradeType: edit.trade })
      if (!res.ok) { setEditError(res.error ?? 'Could not save the vendor.'); return }
      setItems((xs) => sorted(xs.map((x) => x.id === id ? { ...x, name: edit.name, email: edit.email.toLowerCase(), tradeType: edit.trade } : x)))
      setEditingId(null)
    })

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Vendors</h2>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm text-slate-500">
          The shared list quote inquiries go out to. Trade matters: a Refrigeration quote preselects Refrigeration vendors.
        </p>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_10rem_auto]">
          <input placeholder="Vendor name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Vendor name" className={inputCls} />
          <input placeholder="quotes@vendor.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Vendor email" className={inputCls} />
          <input placeholder="Trade (Refrigeration)" value={trade} onChange={(e) => setTrade(e.target.value)} aria-label="Vendor trade" className={inputCls} />
          <Button size="sm" onClick={add} disabled={pending || !name.trim() || !email.includes('@')}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        {error && <p className="mt-2 text-sm font-medium text-rose-600">{error}</p>}
        <div className="mt-3 divide-y divide-slate-100">
          {items.map((v) =>
            editingId === v.id ? (
              <div key={v.id} className="py-2">
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_10rem_auto]">
                  <input value={edit.name} onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))} aria-label="Vendor name" className={inputCls} />
                  <input type="email" value={edit.email} onChange={(e) => setEdit((s) => ({ ...s, email: e.target.value }))} aria-label="Vendor email" className={inputCls} />
                  <input value={edit.trade} onChange={(e) => setEdit((s) => ({ ...s, trade: e.target.value }))} aria-label="Vendor trade" placeholder="Trade" className={inputCls} />
                  <div className="flex items-center gap-1">
                    <Button size="sm" onClick={() => saveEdit(v.id)} disabled={pending || !edit.name.trim() || !edit.email.includes('@')}>
                      <Check className="h-4 w-4" /> Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)} aria-label="Cancel edit">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {editError && <p className="mt-1.5 text-sm font-medium text-rose-600">{editError}</p>}
              </div>
            ) : (
              <div key={v.id} className={cn('flex flex-wrap items-center gap-2 py-2', !v.active && 'opacity-50')}>
                <span className="text-sm font-semibold text-slate-900">{v.name}</span>
                <span className="text-xs text-slate-500">{v.email}</span>
                {v.tradeType && <Badge className="border border-slate-200 bg-white text-slate-500">{v.tradeType}</Badge>}
                <label className="ml-auto flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <input
                    type="checkbox" checked={v.active} className="h-3.5 w-3.5 accent-indigo-600"
                    onChange={(e) => {
                      const active = e.target.checked
                      setItems((xs) => xs.map((x) => (x.id === v.id ? { ...x, active } : x)))
                      start(() => void updateVendor({ id: v.id, active }))
                    }}
                  />
                  Active
                </label>
                <button aria-label={`Edit ${v.name}`} className="text-slate-400 hover:text-indigo-600"
                  onClick={() => { setEditError(null); setEditingId(v.id); setEdit({ name: v.name, email: v.email, trade: v.tradeType }) }}>
                  <Pencil className="h-4 w-4" />
                </button>
                <button aria-label={`Delete ${v.name}`} className="text-slate-400 hover:text-rose-600"
                  onClick={() => {
                    if (!confirm(`Remove vendor ${v.name}?`)) return
                    setItems((xs) => xs.filter((x) => x.id !== v.id))
                    start(() => void deleteVendor({ id: v.id }))
                  }}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ),
          )}
          {items.length === 0 && <p className="py-4 text-center text-sm text-slate-500">No vendors yet — add your quoting list above.</p>}
        </div>
      </div>
    </section>
  )
}
