'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { readSheetFile } from '@/lib/pm/exporter'
import { FIELDS, headerSignature, suggestMapping } from '@/lib/servicechannel/mapping'
import type { ImportView, MappingView, PreviewSummary } from '@/lib/servicechannel/server'
import { commitImportAction, deleteMappingAction, discardImportAction, saveMappingAction } from '../actions'
import { cx, fmtWhen } from '@/components/servicechannel/ui'

interface Props { imports: ImportView[]; mappings: MappingView[]; knownSubscribers: string[]; lastImport: { at: string; source: string | null; coverage: ImportView['coverage'] | null } | null }

const KNOWN_STATUSES = ['OPEN', 'IN PROGRESS', 'COMPLETED', 'COMPLETED/PENDING CONFIRMATION', 'INVOICED', 'CANCELLED']
const yearAgo = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10) }
const today = () => new Date().toISOString().slice(0, 10)

async function hashOf(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const h = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const FLAG_LABEL: Record<string, string> = { reopened: 'Reopened', new_unsat: 'New unsatisfactory', appointment_changed: 'Appointment changed', tech_changed: 'Technician changed', sla_risk: 'ETA passed', overdue: 'Past scheduled date' }

export function ImportClient({ imports, mappings, knownSubscribers, lastImport }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [file, setFile] = useState<{ name: string; hash: string; cells: unknown[][] } | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [mappingId, setMappingId] = useState<string | null>(null)
  const [cov, setCov] = useState({ statuses: ['OPEN', 'IN PROGRESS'] as string[], subscribersText: '', callDateFrom: yearAgo(), callDateTo: today(), note: '' })
  const [fileCustomer, setFileCustomer] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [draft, setDraft] = useState<{ importId: string; rowCount: number; skipped: number; duplicates: string[]; preview: PreviewSummary } | null>(null)
  const [saveName, setSaveName] = useState('')
  const [done, setDone] = useState<Record<string, number> | null>(null)

  const headers = useMemo(() => (file ? (file.cells[0] ?? []).map((h) => String(h ?? '').trim()).filter(Boolean) : []), [file])
  const signature = useMemo(() => headerSignature(headers), [headers])
  const sampleRow = file?.cells[1] ?? []
  const statusesInFile = useMemo(() => {
    if (!file) return [] as string[]
    const i = headers.findIndex((h) => mapping[h] === 'status')
    if (i < 0) return []
    return [...new Set(file.cells.slice(1).map((r) => String(r[i] ?? '').trim().toUpperCase()).filter(Boolean))].sort()
  }, [file, headers, mapping])
  const mappedFields = new Set(Object.values(mapping).filter(Boolean))
  const missingTracking = !!file && !mappedFields.has('trackingNumber')
  // Fields worth having that are unmapped or mostly blank, so nobody expects data the file does not carry.
  const fieldWarnings = useMemo(() => {
    if (!file) return [] as string[]
    const out: string[] = []
    const want: [string, string][] = [['status', 'Status'], ['statusExt', 'Extended status'], ['storeFull', 'Store'], ['callDate', 'Call date'], ['scheduledDate', 'Scheduled date'], ['priority', 'Priority'], ['technicians', 'Technician(s)'], ['customerName', 'Customer / subscriber'], ['notesRaw', 'Notes']]
    for (const [key, label] of want) {
      const i = headers.findIndex((h) => mapping[h] === key)
      if (i < 0) { out.push(`${label}: no column mapped${key === 'customerName' ? ' (the export has none; set it below or map stores to customers afterwards)' : ''}`); continue }
      const blank = file.cells.slice(1).filter((r) => !String(r[i] ?? '').trim()).length
      if (blank) out.push(`${label}: blank on ${blank} of ${file.cells.length - 1} rows`)
    }
    return out
  }, [file, headers, mapping])

  const load = async (f: File) => {
    setMsg(null); setDraft(null); setDone(null)
    try {
      const [cells, hash] = await Promise.all([readSheetFile(f), hashOf(f)])
      if (cells.length < 2) { setMsg({ ok: false, text: 'The file has no data rows under the header.' }); return }
      const hs = (cells[0] ?? []).map((h) => String(h ?? '').trim()).filter(Boolean)
      const sig = headerSignature(hs)
      const saved = mappings.find((m) => m.signature === sig)
      setMapping(saved ? saved.mapping : suggestMapping(hs))
      setMappingId(saved?.id ?? null)
      setFile({ name: f.name, hash, cells })
      if (saved) setMsg({ ok: true, text: `Saved mapping "${saved.name}" matches this layout and was applied.` })
    } catch { setMsg({ ok: false, text: 'That file could not be read. Use a .csv or .xlsx export.' }) }
  }

  const preview = async () => {
    if (!file) return
    setBusy(true); setMsg(null)
    try {
      const payload = JSON.stringify({
        sourceName: file.name, fileHash: file.hash, headers, mapping, mappingId,
        coverage: { statuses: cov.statuses, subscribers: cov.subscribersText.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean), callDateFrom: cov.callDateFrom || null, callDateTo: cov.callDateTo || null, note: cov.note || null },
        fileCustomer: fileCustomer || null, cells: file.cells,
      })
      if (payload.length > 4_000_000) { setMsg({ ok: false, text: 'This file is over 4 MB as JSON. Export it in smaller pieces (by status or date) and import each.' }); return }
      const res = await fetch('/api/servicechannel/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload })
      const body = await res.json()
      if (!res.ok) { setMsg({ ok: false, text: body.error ?? 'The preview failed.' }); return }
      setDraft(body)
    } catch { setMsg({ ok: false, text: 'The preview could not be reached.' }) }
    finally { setBusy(false) }
  }

  const commit = () => start(async () => {
    if (!draft) return
    const r = await commitImportAction(draft.importId)
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return }
    setDone(r.stats); setDraft(null); setFile(null)
    setMsg({ ok: true, text: 'Imported. Work orders and the dashboard are up to date.' })
    router.refresh()
  })
  const discard = () => start(async () => {
    if (!draft) return
    await discardImportAction(draft.importId); setDraft(null); setMsg({ ok: true, text: 'Draft discarded. Nothing was imported.' }); router.refresh()
  })
  const saveMapping = () => start(async () => {
    const r = await saveMappingAction({ name: saveName, signature, mapping })
    if (r.ok) { setMappingId(r.id); setMsg({ ok: true, text: `Mapping "${saveName}" saved.` }); setSaveName(''); router.refresh() } else setMsg({ ok: false, text: r.error })
  })

  const input = 'rounded-md border border-slate-300 px-2 py-1.5 text-sm'
  const box = 'rounded-xl border border-slate-200 bg-white p-4'
  const s = draft?.preview.stats ?? {}

  return (
    <div className="mx-auto max-w-none space-y-4 p-3 sm:p-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Import Center</h1>
        <p className="mt-0.5 text-sm text-slate-500">Upload a report downloaded from ServiceChannel. You will see exactly what would change before anything is written.</p>
      </div>
      {msg && <div className={cx('rounded-lg border p-3 text-sm', msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900')}>{msg.text}</div>}
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">{lastImport ? <>Last successful import <strong>{fmtWhen(lastImport.at)}</strong> ({lastImport.source ?? 'file'}){lastImport.coverage?.statuses.length ? `, statuses ${lastImport.coverage.statuses.join('/')}` : ''}{lastImport.coverage?.callDateFrom ? `, call dates ${lastImport.coverage.callDateFrom} to ${lastImport.coverage.callDateTo ?? ''}` : ''}{lastImport.coverage?.note ? ` · ${lastImport.coverage.note}` : ''}.</> : 'No successful import yet.'}</div>
      {done && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Committed: {done.new ?? 0} new, {done.changed ?? 0} changed, {done.unchanged ?? 0} unchanged, {done.reopened ?? 0} reopened, {done.newUnsat ?? 0} newly unsatisfactory, {done.missing ?? 0} marked missing{done.conflicts ? `, ${done.conflicts} customer conflict(s) to review` : ''}.{' '}
          <Link className="font-semibold underline" href="/app/servicechannel/work-orders">Open work orders</Link>
        </div>
      )}

      {/* Step 1: file */}
      <section className={box}>
        <h2 className="text-sm font-bold text-slate-900">1. Report file</h2>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Choose CSV or Excel
            <input type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void load(f) }} />
          </label>
          {file && <span className="text-sm text-slate-700">{file.name}: {file.cells.length - 1} rows, {headers.length} columns</span>}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">From ServiceChannel: Work Orders, filter as needed (statuses, subscribers, Call Date up to Past Year), then bulk download. The first row must be the column names.</p>
      </section>

      {file && (
        <>
          {/* Step 2: mapping */}
          <section className={box}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900">2. Columns</h2>
              <div className="flex items-center gap-2">
                <input className={cx(input, 'w-48')} placeholder="Save mapping as…" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
                <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50" disabled={pending || !saveName.trim() || missingTracking} onClick={saveMapping}>Save</button>
              </div>
            </div>
            {missingTracking && <p className="mt-2 text-sm text-rose-700">Pick which column holds the ServiceChannel tracking number.</p>}
            {fieldWarnings.length > 0 && <ul className="mt-2 list-disc space-y-0.5 rounded-lg bg-slate-50 p-2 pl-6 text-xs text-slate-600">{fieldWarnings.map((w) => <li key={w}>{w}</li>)}</ul>}
            <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
              {headers.map((h, i) => (
                <label key={h} className="flex items-center gap-2 text-xs">
                  <span className="w-40 truncate font-medium text-slate-700" title={h}>{h}</span>
                  <select className={cx(input, 'flex-1 py-1 text-xs')} value={mapping[h] ?? ''} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}>
                    <option value="">Ignore</option>
                    {FIELDS.map((f) => <option key={f.key} value={f.key} disabled={mappedFields.has(f.key) && mapping[h] !== f.key}>{f.label}</option>)}
                  </select>
                  <span className="w-28 truncate text-slate-400" title={String(sampleRow[i] ?? '')}>{String(sampleRow[i] ?? '').slice(0, 24)}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Step 3: coverage */}
          <section className={box}>
            <h2 className="text-sm font-bold text-slate-900">3. What this report covered</h2>
            <p className="mt-1 text-xs text-slate-500">The filters you used when downloading. A stored work order missing from this file is only marked as missing when the file should have included it.</p>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-slate-600">Statuses included</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {[...new Set([...KNOWN_STATUSES, ...statusesInFile, ...cov.statuses])].map((st) => (
                    <label key={st} className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs">
                      <input type="checkbox" checked={cov.statuses.includes(st)} onChange={(e) => setCov({ ...cov, statuses: e.target.checked ? [...cov.statuses, st] : cov.statuses.filter((x) => x !== st) })} />
                      {st}{statusesInFile.includes(st) && <span className="text-slate-400">(in file)</span>}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Leave all unticked only if the export truly had no status filter.</p>
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-semibold text-slate-600">Subscribers included (blank = all)
                  <input className={cx(input, 'mt-1 block w-full')} list="sc-subs" placeholder="ALDI, CubeSmart" value={cov.subscribersText} onChange={(e) => setCov({ ...cov, subscribersText: e.target.value })} />
                  <datalist id="sc-subs">{knownSubscribers.map((s) => <option key={s} value={s} />)}</datalist>
                </label>
                <div className="flex gap-2">
                  <label className="text-xs font-semibold text-slate-600">Call date from<input type="date" className={cx(input, 'mt-1 block')} value={cov.callDateFrom} onChange={(e) => setCov({ ...cov, callDateFrom: e.target.value })} /></label>
                  <label className="text-xs font-semibold text-slate-600">to<input type="date" className={cx(input, 'mt-1 block')} value={cov.callDateTo} onChange={(e) => setCov({ ...cov, callDateTo: e.target.value })} /></label>
                </div>
                {!mappedFields.has('customerName') && (
                  <label className="text-xs font-semibold text-slate-600">This file is one subscriber only (optional)
                    <input className={cx(input, 'mt-1 block w-full')} list="sc-subs" placeholder="Leave blank if the export mixes customers" value={fileCustomer} onChange={(e) => setFileCustomer(e.target.value)} />
                  </label>
                )}
                <label className="text-xs font-semibold text-slate-600">Note<input className={cx(input, 'mt-1 block w-full')} placeholder="e.g. Active WOs, all trades, maintenance included" value={cov.note} onChange={(e) => setCov({ ...cov, note: e.target.value })} /></label>
              </div>
            </div>
            <button className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || missingTracking} onClick={() => void preview()}>
              {busy ? 'Comparing…' : 'Preview changes'}
            </button>
          </section>
        </>
      )}

      {draft && (
        <section className="rounded-xl border border-indigo-200 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-900">4. Preview: nothing has been written yet</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            {[['Rows read', draft.rowCount], ['New', s.new], ['Changed', s.changed], ['Unchanged', s.unchanged], ['Reopened', s.reopened], ['New unsatisfactory', s.newUnsat], ['Missing from file', s.missing], ['Outside window', s.outsideWindow]].map(([l, v]) => (
              <div key={String(l)} className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{l}</p><p className="text-xl font-bold tabular-nums text-slate-900">{v ?? 0}</p></div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Also: {s.appointmentChanged ?? 0} appointment changes, {s.techChanged ?? 0} technician changes, {s.slaRisk ?? 0} with a passed ETA, {s.located ?? 0} matched to a PhaseForge location{draft.skipped ? `, ${draft.skipped} rows skipped (no tracking number)` : ''}.</p>
          {draft.preview.warnings.length > 0 && (
            <ul className="mt-3 list-disc space-y-0.5 rounded-lg bg-amber-50 p-3 pl-7 text-xs text-amber-900">{draft.preview.warnings.slice(0, 12).map((w, i) => <li key={i}>{w}</li>)}</ul>
          )}
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Changed ({draft.preview.changed.length}{draft.preview.changed.length === 200 ? '+' : ''})</h3>
              <ul className="mt-1 max-h-64 space-y-1 overflow-auto text-xs text-slate-700">
                {draft.preview.changed.map((c) => <li key={c.trackingNumber}><span className="font-mono font-semibold">{c.trackingNumber}</span> {c.summary}{c.flags.length ? <span className="ml-1 text-rose-700">[{c.flags.map((f) => FLAG_LABEL[f] ?? f).join(', ')}]</span> : null}</li>)}
                {!draft.preview.changed.length && <li className="text-slate-400">None</li>}
              </ul>
            </div>
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Missing from this file ({draft.preview.missing.length})</h3>
              <ul className="mt-1 max-h-64 space-y-1 overflow-auto text-xs text-slate-700">
                {draft.preview.missing.map((m) => <li key={m.trackingNumber}><span className="font-mono font-semibold">{m.trackingNumber}</span> {m.reason}</li>)}
                {!draft.preview.missing.length && <li className="text-slate-400">None</li>}
              </ul>
              {draft.preview.flagged.length > 0 && (
                <>
                  <h3 className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">New rows with flags ({draft.preview.flagged.length})</h3>
                  <ul className="mt-1 max-h-40 space-y-1 overflow-auto text-xs text-slate-700">{draft.preview.flagged.map((f) => <li key={f.trackingNumber}><span className="font-mono font-semibold">{f.trackingNumber}</span> {f.flags.map((x) => FLAG_LABEL[x] ?? x).join(', ')}</li>)}</ul>
                </>
              )}
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={pending} onClick={commit}>Commit import</button>
            <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50" disabled={pending} onClick={discard}>Discard</button>
          </div>
        </section>
      )}

      {/* History */}
      <section className={box}>
        <h2 className="text-sm font-bold text-slate-900">Import history</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500"><tr>{['When', 'File', 'Status', 'Rows', 'New', 'Changed', 'Missing', 'Conflicts', 'Coverage'].map((h) => <th key={h} className="px-2 py-1 font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {imports.map((i) => (
                <tr key={i.id}>
                  <td className="whitespace-nowrap px-2 py-1.5 text-slate-600">{fmtWhen(i.committedAt ?? i.createdAt)}</td>
                  <td className="max-w-[220px] truncate px-2 py-1.5">{i.sourceName ?? '-'}</td>
                  <td className="px-2 py-1.5 capitalize">{i.status}</td>
                  <td className="px-2 py-1.5 tabular-nums">{i.rowCount}</td>
                  <td className="px-2 py-1.5 tabular-nums">{i.stats.new ?? '-'}</td>
                  <td className="px-2 py-1.5 tabular-nums">{i.stats.changed ?? '-'}</td>
                  <td className="px-2 py-1.5 tabular-nums">{i.stats.missing ?? '-'}</td>
                  <td className="px-2 py-1.5 tabular-nums">{i.stats.conflicts ?? '-'}</td>
                  <td className="max-w-[320px] truncate px-2 py-1.5 text-xs text-slate-500">{[i.coverage.statuses.join('/'), i.coverage.subscribers.join(', '), i.coverage.callDateFrom && `${i.coverage.callDateFrom} to ${i.coverage.callDateTo ?? ''}`, i.coverage.note].filter(Boolean).join(' · ') || '-'}</td>
                </tr>
              ))}
              {!imports.length && <tr><td colSpan={9} className="px-2 py-6 text-center text-slate-500">No imports yet.</td></tr>}
            </tbody>
          </table>
        </div>
        {mappings.length > 0 && (
          <div className="mt-3 text-xs text-slate-600">
            Saved mappings: {mappings.map((m) => <span key={m.id} className="mr-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">{m.name} <button className="text-rose-600" title="Delete" onClick={() => start(async () => { await deleteMappingAction(m.id); router.refresh() })}>×</button></span>)}
          </div>
        )}
      </section>
    </div>
  )
}
