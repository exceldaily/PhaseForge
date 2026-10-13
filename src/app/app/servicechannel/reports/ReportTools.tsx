'use client'

import { useState } from 'react'

interface Row { section: string; tracking: string; customer: string; store: string; owner: string; detail: string }

/** Print (browser PDF), CSV of the listed items, and a plain-text copy of the summary for email or chat. */
export function ReportTools({ rows, filename, text }: { rows: Row[]; filename: string; text: string }) {
  const [copied, setCopied] = useState(false)
  const csv = () => {
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
    const body = ['section,tracking,customer,store,owner,detail', ...rows.map((r) => [r.section, r.tracking, r.customer, r.store, r.owner, r.detail].map(esc).join(','))].join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }))
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { window.prompt('Copy the summary:', text) }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <button className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white" onClick={copy}>{copied ? 'Copied' : 'Copy summary'}</button>
      <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700" onClick={() => window.print()}>Print / PDF</button>
      <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700" onClick={csv}>Download CSV</button>
    </div>
  )
}
