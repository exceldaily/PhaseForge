import Link from 'next/link'
import { requireModule, getCallSettings } from '@/lib/operations/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const CLOSED = new Set(['completed', 'closed', 'cancelled'])

function bucketAge(days: number): string {
  if (days <= 2) return '0–2 days'
  if (days <= 7) return '3–7 days'
  if (days <= 14) return '8–14 days'
  if (days <= 30) return '15–30 days'
  return '30+ days'
}

export default async function OperationsReportsPage() {
  const ctx = await requireModule('reports')
  const supabase = await createClient()
  const settings = await getCallSettings(ctx.companyId)

  const [{ data: calls }, { data: invoices }, { data: invoiceItems }, { data: assets },
    { data: customers }, { data: vendors }, { data: staff }, { data: divisions }] = await Promise.all([
    supabase.from('calls').select('id, status, priority, division_id, customer_id, vendor_id, assigned_staff_id, created_at, sla_at, due_date, invoice_ready, invoice_id').eq('company_id', ctx.companyId),
    supabase.from('invoices').select('id, status, due_date, created_at').eq('company_id', ctx.companyId),
    supabase.from('invoice_items').select('invoice_id, quantity, unit_price').eq('company_id', ctx.companyId),
    supabase.from('assets').select('id, name, warranty_end, location_id').eq('company_id', ctx.companyId).not('warranty_end', 'is', null),
    supabase.from('customers').select('id, name').eq('company_id', ctx.companyId),
    supabase.from('vendors').select('id, name').eq('company_id', ctx.companyId),
    supabase.from('profiles').select('id, full_name').eq('company_id', ctx.companyId),
    supabase.from('divisions').select('id, name').eq('company_id', ctx.companyId),
  ])

  const now = Date.now()
  const today = new Date().toISOString().slice(0, 10)
  const in90 = new Date(now + 90 * 86400000).toISOString().slice(0, 10)

  const open = (calls ?? []).filter((c) => !CLOSED.has(c.status))
  const nameOf = (rows: { id: string; name?: string; full_name?: string }[] | null) =>
    new Map((rows ?? []).map((r) => [r.id, r.name ?? r.full_name ?? '—']))
  const customerName = nameOf(customers)
  const vendorName = nameOf(vendors)
  const staffName = nameOf(staff)
  const divisionName = nameOf(divisions)

  const countBy = (rows: typeof open, key: (c: (typeof open)[number]) => string | null, labels: Map<string, string>) => {
    const m = new Map<string, number>()
    for (const r of rows) {
      const k = key(r)
      const label = k ? (labels.get(k) ?? '—') : 'Unassigned'
      m.set(label, (m.get(label) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }

  const statusLabels = new Map(settings.statuses.map((s) => [s.key, s.label]))
  const priorityLabels = new Map(settings.priorities.map((p) => [p.key, p.label]))

  const aging = new Map<string, number>()
  for (const c of open) {
    const days = Math.floor((now - new Date(c.created_at).getTime()) / 86400000)
    const b = bucketAge(days)
    aging.set(b, (aging.get(b) ?? 0) + 1)
  }
  const agingRows = ['0–2 days', '3–7 days', '8–14 days', '15–30 days', '30+ days']
    .map((b) => [b, aging.get(b) ?? 0] as const)

  const slaOverdue = open.filter((c) => {
    const target = c.sla_at ?? (c.due_date ? `${c.due_date}T23:59:59` : null)
    return target && new Date(target).getTime() < now
  }).length

  const invoiceReady = (calls ?? []).filter((c) => c.invoice_ready && !c.invoice_id).length

  const invoiceTotals = new Map<string, number>()
  for (const it of invoiceItems ?? []) {
    invoiceTotals.set(it.invoice_id, (invoiceTotals.get(it.invoice_id) ?? 0) + it.quantity * it.unit_price)
  }
  const invoicesOverdue = (invoices ?? []).filter((i) => i.due_date && i.due_date < today && !['paid', 'void'].includes(i.status))
  const overdueAmount = invoicesOverdue.reduce((s, i) => s + (invoiceTotals.get(i.id) ?? 0), 0)

  const warrantyExpiring = (assets ?? [])
    .filter((a) => a.warranty_end! >= today && a.warranty_end! <= in90)
    .sort((a, b) => a.warranty_end!.localeCompare(b.warranty_end!))

  const sections: { title: string; rows: (readonly [string, number])[] }[] = [
    { title: 'Open calls by status', rows: countBy(open, (c) => c.status, statusLabels) },
    { title: 'Open calls by priority', rows: countBy(open, (c) => c.priority, priorityLabels) },
    { title: 'Open call aging', rows: agingRows },
    ...(divisionName.size ? [{ title: 'Open calls by division', rows: countBy(open, (c) => c.division_id, divisionName) }] : []),
    { title: 'Open calls by customer', rows: countBy(open, (c) => c.customer_id, customerName).slice(0, 10) },
    { title: 'Open calls by vendor', rows: countBy(open.filter((c) => c.vendor_id), (c) => c.vendor_id, vendorName).slice(0, 10) },
    { title: 'Open calls by staff', rows: countBy(open.filter((c) => c.assigned_staff_id), (c) => c.assigned_staff_id, staffName).slice(0, 10) },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Operations Reports</h1>
          <p className="mt-0.5 text-sm text-slate-500">Live rollups across calls, invoices, and warranties</p>
        </div>
        <Link href="/app/reports" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">Project reports →</Link>
      </div>

      {/* Headline stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: `Open ${settings.terminology.toLowerCase()}`, value: open.length, href: '/app/calls' },
          { label: 'SLA overdue', value: slaOverdue, href: '/app/calls?sla=overdue', alert: slaOverdue > 0 },
          { label: 'Invoice-ready work', value: invoiceReady, href: '/app/calls?invoice_ready=yes' },
          { label: 'Overdue invoice $', value: `$${overdueAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, href: '/app/invoices?overdue=yes', alert: overdueAmount > 0 },
        ].map((s) => (
          <Link key={s.label} href={s.href} className="rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold ${s.alert ? 'text-rose-600' : 'text-slate-800 dark:text-slate-100'}`}>{s.value}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.filter((s) => s.rows.length > 0).map((section) => (
          <div key={section.title} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{section.title}</h2>
            <div className="space-y-1.5">
              {section.rows.map(([label, count]) => {
                const max = Math.max(...section.rows.map(([, n]) => n), 1)
                return (
                  <div key={label} className="flex items-center gap-2 text-xs">
                    <span className="w-32 truncate text-slate-500 dark:text-slate-400">{label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(count / max) * 100}%` }} />
                    </div>
                    <span className="w-8 text-right font-semibold text-slate-700 dark:text-slate-200">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Warranty expirations */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Warranties expiring within 90 days</h2>
          {warrantyExpiring.length === 0 ? (
            <p className="text-xs text-slate-400">None in the next 90 days.</p>
          ) : (
            <div className="space-y-1.5">
              {warrantyExpiring.slice(0, 12).map((a) => (
                <div key={a.id} className="flex items-center justify-between text-xs">
                  <span className="truncate text-slate-600 dark:text-slate-300">{a.name}</span>
                  <span className="font-mono text-amber-600">{a.warranty_end}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
