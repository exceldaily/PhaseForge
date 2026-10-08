'use client'

// The data entry pages of the ALDI sheet: superheat, fan CFM, oil levels,
// discharge temps, the electrical chart, and the HVAC readings. Laid out one
// circuit or compressor at a time, so it works on a phone held in one hand.

import { cn } from '@/lib/utils'
import { isNotesTable, rowLabels, rowsFor } from '@/lib/pm/template'

export { rowLabels }
import type { DataTable, PmLayout } from '@/lib/pm/types'

export const readingKey = (table: string, row: string, col: string) => `${table}|${row}|${col}`

export function ReadingTable({ table, layout, values, onChange, readOnly, highlight }: {
  table: DataTable
  layout: PmLayout | null
  values: Record<string, string>
  onChange: (table: string, row: string, col: string, value: string) => void
  readOnly?: boolean
  highlight?: boolean
}) {
  const rows = rowsFor(table, layout)
  const labels = rowLabels(rows)
  const filled = rows.reduce((n, r) => n + table.columns.filter((c) => (values[readingKey(table.key, r.key, c.key)] ?? '').trim()).length, 0)
  const cells = rows.length * table.columns.length
  const input = 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-base text-slate-900 outline-none focus:border-indigo-400 disabled:bg-slate-50 sm:py-1.5 sm:text-sm'

  return (
    <section id={`pm-table-${table.key}`} className={cn('scroll-mt-28 rounded-xl border bg-white', highlight ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-slate-200')}>
      <div className="flex items-baseline gap-2 border-b border-slate-100 px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-900">{table.title}</h3>
        {!isNotesTable(table) && <span className="ml-auto text-[11px] tabular-nums text-slate-400">{filled} of {cells} filled</span>}
      </div>
      {table.hint && <p className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">{table.hint}</p>}

      {isNotesTable(table) ? (
        <div className="space-y-2 p-3">
          {rows.map((r) => (
            <label key={r.key} className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">{r.label}</span>
              <textarea rows={2} disabled={readOnly} value={values[readingKey(table.key, r.key, 'text')] ?? ''} onChange={(e) => onChange(table.key, r.key, 'text', e.target.value)} className={input} />
            </label>
          ))}
        </div>
      ) : table.columns.length > 4 ? (
        // A long form per row (the electrical chart): one compressor at a time.
        <div className="divide-y divide-slate-100">
          {rows.map((r) => {
            const done = table.columns.filter((c) => (values[readingKey(table.key, r.key, c.key)] ?? '').trim()).length
            return (
              <details key={r.key} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 text-sm font-semibold text-slate-800">
                  <span className={cn('h-2.5 w-2.5 rounded-full', done === 0 ? 'bg-slate-300' : done === table.columns.length ? 'bg-emerald-500' : 'bg-amber-400')} />
                  {labels[r.key]}
                  <span className="ml-auto text-xs font-normal tabular-nums text-slate-400">{done}/{table.columns.length}</span>
                </summary>
                <div className="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-4">
                  {table.columns.map((c) => (
                    <label key={c.key} className="block">
                      <span className="mb-0.5 block text-[11px] font-medium text-slate-500">{c.label}</span>
                      <input disabled={readOnly} value={values[readingKey(table.key, r.key, c.key)] ?? ''} onChange={(e) => onChange(table.key, r.key, c.key, e.target.value)}
                        autoCapitalize="characters" autoComplete="off" className={input} />
                    </label>
                  ))}
                </div>
              </details>
            )
          })}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((r) => (
            <div key={r.key} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="w-full text-sm font-medium text-slate-800 sm:w-40 sm:shrink-0">{labels[r.key]}</span>
              <div className="grid flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${table.columns.length}, minmax(0, 1fr))` }}>
                {table.columns.map((c) => (
                  <label key={c.key} className="block min-w-0">
                    <span className="mb-0.5 block truncate text-[11px] font-medium text-slate-500">{c.label}{c.unit ? ` (${c.unit})` : ''}</span>
                    <input disabled={readOnly} value={values[readingKey(table.key, r.key, c.key)] ?? ''} onChange={(e) => onChange(table.key, r.key, c.key, e.target.value)}
                      inputMode={c.unit ? 'decimal' : 'text'} autoComplete="off" className={input} />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
