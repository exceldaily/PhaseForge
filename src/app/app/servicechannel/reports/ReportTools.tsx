'use client'

interface Row { section: string; tracking: string; customer: string; store: string; owner: string; detail: string }

export function ReportTools({ rows, filename }: { rows: Row[]; filename: string }) {
  const csv = () => {
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
    const text = ['section,tracking,customer,store,owner,detail', ...rows.map((r) => [r.section, r.tracking, r.customer, r.store, r.owner, r.detail].map(esc).join(','))].join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }
  return (
    <div className="flex gap-2">
      <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700" onClick={() => window.print()}>Print / PDF</button>
      <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700" onClick={csv}>Download CSV</button>
    </div>
  )
}
