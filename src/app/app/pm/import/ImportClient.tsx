'use client'

// Import, with the preview first. Load a CSV or Excel file, see exactly what
// each row will do, fix cells right in the table, then commit. Nothing is
// written until Commit, and the server checks every row again when it is.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { exportRows, readSheetFile } from '@/lib/pm/exporter'
import {
  columnsFor, errorReport, mapSheet, reviewPmRows, reviewStores, tally,
  type ExistingCycle, type ExistingStore, type ImportKind, type PmReview, type RawRow, type StoreReview,
} from '@/lib/pm/importers'
import { Card, ErrorNote, PmPage } from '@/components/pm/ui'
import { commitPmImport, commitStoreImport, discardImport, saveImportDraft } from '../importActions'

const KIND_LABEL: Record<ImportKind, { tab: string; blurb: string }> = {
  stores: { tab: 'Stores', blurb: 'Add stores to the directory, or update the ones already there.' },
  job_numbers: { tab: 'Job numbers', blurb: 'Match Kalos job numbers to stores by store number and quarter. A PM that already has a different number is never changed unless you approve that row.' },
  pm_records: { tab: 'PM records', blurb: 'Bring in whole PM records: job number, technician, dates, status. Good for loading past quarters.' },
}
const ACTION: Record<string, { label: string; cls: string }> = {
  create: { label: 'New', cls: 'bg-emerald-100 text-emerald-800' },
  update: { label: 'Update', cls: 'bg-sky-100 text-sky-800' },
  same: { label: 'No change', cls: 'bg-slate-100 text-slate-500' },
  conflict: { label: 'Needs approval', cls: 'bg-amber-100 text-amber-800' },
  error: { label: 'Will not import', cls: 'bg-rose-100 text-rose-800' },
}
const SHOWN = 400

export function ImportClient({ initialKind, batch, existingStores, stores, cycles, techs, now }: {
  initialKind: ImportKind
  batch: { id: string; kind: ImportKind; source: string | null; rows: RawRow[] } | null
  existingStores: ExistingStore[]
  stores: { id: string; storeNumber: string; isActive: boolean }[]
  cycles: ExistingCycle[]
  techs: { id: string; name: string }[]
  now: { year: number; quarter: number }
}) {
  const router = useRouter()
  const [kind, setKind] = useState<ImportKind>(initialKind)
  const [rows, setRows] = useState<RawRow[]>(batch?.rows ?? [])
  const [source, setSource] = useState<string | null>(batch?.source ?? null)
  const [batchId, setBatchId] = useState<string | null>(batch?.id ?? null)
  const [unmapped, setUnmapped] = useState<string[]>([])
  const [updateExisting, setUpdateExisting] = useState(false)
  const [overwrite, setOverwrite] = useState(false)
  const [approved, setApproved] = useState<number[]>([])
  const [year, setYear] = useState(now.year)
  const [quarter, setQuarter] = useState(now.quarter)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Record<string, unknown> | null>(null)
  const [saved, setSaved] = useState(false)
  const cols = columnsFor(kind)

  const reviews: (StoreReview | PmReview)[] = useMemo(() => (
    kind === 'stores'
      ? reviewStores(rows, existingStores, { updateExisting })
      : reviewPmRows(rows, { stores, cycles, techs, defaults: { year, quarter }, overwrite, approvedJobRows: approved })
  ), [kind, rows, existingStores, updateExisting, stores, cycles, techs, year, quarter, overwrite, approved])
  const counts = tally(reviews)
  const willWrite = (counts.create ?? 0) + (counts.update ?? 0)

  const load = async (file: File) => {
    setError(null); setDone(null)
    try {
      const mapped = mapSheet(await readSheetFile(file), kind)
      if (!mapped.rows.length) { setError('No rows found. The first row needs column names like Store #.'); return }
      setRows(mapped.rows); setUnmapped(mapped.unmapped); setSource(file.name); setBatchId(null); setApproved([]); setSaved(false)
    } catch { setError('That file could not be read. Use a .csv or .xlsx file.') }
  }
  const switchKind = (k: ImportKind) => {
    if (k === kind) return
    if (rows.length && !confirm('Switch import type? The rows loaded now will be cleared.')) return
    setKind(k); setRows([]); setSource(null); setBatchId(null); setUnmapped([]); setApproved([]); setDone(null); setError(null)
  }
  const edit = (i: number, key: string, value: string) => { setSaved(false); setRows((cur) => cur.map((r, n) => (n === i ? { ...r, [key]: value } : r))) }
  const removeRow = (i: number) => { setSaved(false); setApproved((a) => a.filter((n) => n !== i).map((n) => (n > i ? n - 1 : n))); setRows((cur) => cur.filter((_, n) => n !== i)) }

  const template = () => exportRows(`pm-${kind.replace('_', '-')}-template`, [], 'csv', cols.map((c) => c.label))
  const report = () => exportRows(`pm-import-notes-${new Date().toISOString().slice(0, 10)}`, errorReport(reviews), 'csv')

  const saveDraft = async () => {
    setBusy(true); setError(null)
    const res = await saveImportDraft({ id: batchId, kind, source, rows })
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    setBatchId(res.id); setSaved(true)
  }
  const discard = async () => {
    if (!confirm('Discard these rows? Nothing has been imported.')) return
    if (batchId) await discardImport({ id: batchId })
    setRows([]); setBatchId(null); setSource(null); setApproved([])
    router.replace('/app/pm/import?kind=' + kind)
    router.refresh()
  }
  const commit = async () => {
    setBusy(true); setError(null)
    const res = kind === 'stores'
      ? await commitStoreImport({ batchId, rows, updateExisting })
      : await commitPmImport({ batchId, kind, rows, defaults: { year, quarter }, overwrite, approvedJobRows: approved })
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    setDone(res as unknown as Record<string, unknown>)
    setRows([]); setBatchId(null); setApproved([])
    router.refresh()
  }

  const notes = (r: StoreReview | PmReview) => {
    const conflict = 'jobConflict' in r ? r.jobConflict : null
    return (
      <div className="space-y-0.5 text-[11px] leading-snug">
        {r.problems.map((p, i) => <p key={`p${i}`} className="font-medium text-rose-700">{p}</p>)}
        {conflict && (
          <label className="flex items-start gap-1.5 font-medium text-amber-800">
            <input type="checkbox" className="mt-0.5" checked={approved.includes(r.index)} onChange={(e) => setApproved((a) => (e.target.checked ? [...a, r.index] : a.filter((n) => n !== r.index)))} />
            <span>This PM already has job number {conflict.from}. Tick to replace it with {conflict.to}. The old number stays in the history.</span>
          </label>
        )}
        {r.changes.filter((c) => !(conflict && c.field === 'jobNumber')).map((c, i) => (
          <p key={`c${i}`} className="text-slate-600">{c.label}: {c.from ? <><span className="text-slate-400 line-through">{c.from}</span> to </> : 'set to '}<span className="font-semibold text-slate-800">{c.to}</span></p>
        ))}
        {r.warnings.map((w, i) => <p key={`w${i}`} className="text-amber-700">{w}</p>)}
      </div>
    )
  }

  return (
    <PmPage title="Import" subtitle={<Link href="/app/pm/stores" className="inline-flex items-center gap-1 text-indigo-600 hover:underline"><ArrowLeft size={13} /> Back to Preventative Maintenance</Link>}>
      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1" data-help="pm-import-kind">
        {(Object.keys(KIND_LABEL) as ImportKind[]).map((k) => (
          <button key={k} type="button" onClick={() => switchKind(k)} className={cn('rounded-lg px-3 py-1.5 text-sm font-medium', kind === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>{KIND_LABEL[k].tab}</button>
        ))}
      </div>
      <p className="text-sm text-slate-600">{KIND_LABEL[kind].blurb}</p>

      {done && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="flex items-center gap-2 font-semibold"><CheckCircle2 size={16} /> Import committed</p>
          <p className="mt-1">
            {[`${done.created ?? 0} added`, `${done.updated ?? 0} updated`, done.jobNumbersSet !== undefined ? `${done.jobNumbersSet} job numbers set` : '',
              `${done.unchanged ?? 0} unchanged`, done.conflicts ? `${done.conflicts} left alone, would have replaced a job number` : '', done.notImported ? `${done.notImported} not imported` : ''].filter(Boolean).join(' · ')}
          </p>
          {Array.isArray(done.failed) && done.failed.length > 0 && <ul className="mt-1 list-disc pl-5 text-rose-700">{(done.failed as string[]).map((f, i) => <li key={i}>{f}</li>)}</ul>}
          <p className="mt-2"><Link href={kind === 'stores' ? '/app/pm/stores' : '/app/pm/tracker'} className="font-semibold underline">Open the {kind === 'stores' ? 'Store Directory' : 'Quarterly Tracker'}</Link></p>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700" data-help="pm-import-file">
            <FileUp size={15} /> Choose a CSV or Excel file
            <input type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void load(f) }} />
          </label>
          <button type="button" onClick={template} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline"><Download size={13} /> Blank template</button>
          {source && <span className="text-xs text-slate-500">Loaded from {source}</span>}
          {kind !== 'stores' && (
            <span className="ml-auto flex flex-wrap items-center gap-2 text-xs text-slate-600">
              Rows that do not name a quarter go to
              <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1">{[1, 2, 3, 4].map((n) => <option key={n} value={n}>Q{n}</option>)}</select>
              <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-20 rounded-lg border border-slate-300 px-2 py-1" />
            </span>
          )}
        </div>
        {unmapped.length > 0 && <p className="border-t border-slate-100 px-4 py-2 text-xs text-amber-700">These columns were not recognised and are ignored: {unmapped.join(', ')}.</p>}
      </Card>

      <ErrorNote>{error}</ErrorNote>

      {rows.length > 0 && (
        <Card
          title={`Preview: ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`}
          actions={<>
            {Object.entries(counts).map(([a, n]) => <span key={a} className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', ACTION[a]?.cls)}>{n} {ACTION[a]?.label ?? a}</span>)}
          </>}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-100 px-4 py-2.5 text-xs text-slate-700">
            {kind === 'stores' ? (
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} /> Update stores that are already in the directory (blank cells never erase anything)</label>
            ) : (
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> Replace dates, priority, technician, and status that are already filled in (job numbers are approved row by row)</label>
            )}
            <span className="text-slate-400">Click any cell to fix it. The preview updates as you type.</span>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="border-b border-slate-200 px-2 py-1.5">#</th>
                  <th className="border-b border-slate-200 px-2 py-1.5">Result</th>
                  {cols.map((c) => <th key={c.key} className="border-b border-slate-200 px-1 py-1.5" style={{ minWidth: c.width }}>{c.label}</th>)}
                  <th className="border-b border-slate-200 px-2 py-1.5" style={{ minWidth: 260 }}>What will happen</th>
                  <th className="border-b border-slate-200" />
                </tr>
              </thead>
              <tbody>
                {reviews.slice(0, SHOWN).map((r) => (
                  <tr key={r.index} className={cn('align-top', r.action === 'error' ? 'bg-rose-50/60' : r.action === 'conflict' ? 'bg-amber-50/60' : '')}>
                    <td className="border-b border-slate-100 px-2 py-1.5 tabular-nums text-slate-400">{r.index + 1}</td>
                    <td className="border-b border-slate-100 px-2 py-1.5"><span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold', ACTION[r.action].cls)}>{ACTION[r.action].label}</span></td>
                    {cols.map((c) => (
                      <td key={c.key} className="border-b border-slate-100 p-0.5">
                        <input value={rows[r.index]?.[c.key] ?? ''} onChange={(e) => edit(r.index, c.key, e.target.value)} aria-label={`${c.label}, row ${r.index + 1}`}
                          className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-xs text-slate-900 outline-none hover:border-slate-300 focus:border-indigo-400 focus:bg-white" />
                      </td>
                    ))}
                    <td className="border-b border-slate-100 px-2 py-1.5">{notes(r)}</td>
                    <td className="border-b border-slate-100 px-1 py-1.5"><button type="button" onClick={() => removeRow(r.index)} aria-label={`Remove row ${r.index + 1}`} className="p-1 text-slate-300 hover:text-rose-600"><Trash2 size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > SHOWN && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Showing the first {SHOWN} rows. All {rows.length} are checked and will be imported.</p>}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
            <button type="button" onClick={() => { setSaved(false); setRows((cur) => [...cur, {}]) }} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"><Plus size={12} /> Add a row</button>
            {(counts.error || counts.conflict || reviews.some((r) => r.warnings.length)) && (
              <button type="button" onClick={report} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"><Download size={12} /> Download the notes as a report</button>
            )}
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <button type="button" onClick={discard} className="text-xs font-medium text-slate-500 hover:text-rose-600">Discard</button>
              <Button size="sm" variant="outline" onClick={saveDraft} disabled={busy}>{saved ? 'Saved' : 'Save for later'}</Button>
              <Button size="sm" onClick={commit} loading={busy} disabled={willWrite === 0} data-help="pm-import-commit">Commit {willWrite} {willWrite === 1 ? 'row' : 'rows'}</Button>
            </span>
          </div>
          {(counts.error ?? 0) > 0 && (
            <p className="flex items-center gap-2 border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-800">
              <AlertTriangle size={13} /> {counts.error} {counts.error === 1 ? 'row has' : 'rows have'} a problem and will be skipped. Fix the cells above, or commit the rest and deal with these after.
            </p>
          )}
        </Card>
      )}

      {!rows.length && !done && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-sm text-slate-600">
          <p className="font-medium text-slate-700">Columns this import understands</p>
          <p className="mt-1 text-xs text-slate-500">{cols.map((c) => c.label).join(', ')}. Column order does not matter, extra columns are ignored, and common header spellings are matched.</p>
        </div>
      )}
    </PmPage>
  )
}
