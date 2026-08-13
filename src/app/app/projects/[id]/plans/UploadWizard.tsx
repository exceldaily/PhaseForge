'use client'

// Plan set import wizard: drop a full PDF plan set → pdfjs detects sheet
// numbers/titles from title blocks → user reviews/corrects → pdf-lib splits
// into one vector PDF per sheet → browser uploads directly to storage →
// commitPlanImport writes the rows (new sheets, or new CURRENT revisions of
// matched existing sheets). No 40-row manual data entry.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileUp, AlertTriangle, CheckCircle2, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/utils'
import { loadPdf, extractPageText, renderThumbnail, renderPageToJpeg } from '@/lib/plans/pdf'
import { detectSheetInfo, disciplineFromSheetNumber, filenameSheetNumber, filenameTitle } from '@/lib/plans/detect'
import { loadForSplitting, extractPage, pageFromJpeg } from '@/lib/plans/assembly'
import { uploadPlanFile, revisionPdfPath, revisionThumbPath } from '@/lib/plans/storage'
import { STANDARD_DISCIPLINES, SET_TYPES } from '@/lib/plans/constants'
import { commitPlanImport, type ImportSheetInput } from './actions'
import type { PlanSet, PlanSetType, SheetWithRevision } from '@/types/plans'

interface ReviewRow {
  /** Which dropped file this page came from (multi-file uploads). */
  fileIndex: number
  pageNumber: number
  include: boolean
  sheetNumber: string
  title: string
  discipline: string
  revisionLabel: string
  revisionDate: string | null
  confident: boolean
  pageWidth: number
  pageHeight: number
  extractedText: string
  thumbUrl: string
  thumbBlob: Blob
  matchesSheetId: string | null
  matchesRevisionLabel: string | null
}

type Stage =
  | { kind: 'pick' }
  | { kind: 'processing'; step: string; done: number; total: number }
  | { kind: 'review' }
  | { kind: 'uploading'; step: string; done: number; total: number }
  | { kind: 'done'; imported: number; revised: number }
  | { kind: 'error'; message: string }

export function UploadWizard({
  projectId, existingSheets, existingSets, onClose, onComplete,
}: {
  projectId: string
  existingSheets: SheetWithRevision[]
  existingSets: PlanSet[]
  onClose: () => void
  onComplete: () => void
}) {
  const [stage, setStage] = useState<Stage>({ kind: 'pick' })
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [fileName, setFileName] = useState('')
  const [skippedFiles, setSkippedFiles] = useState<string[]>([])
  const filesRef = useRef<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Drawing set target
  const [setChoice, setSetChoice] = useState<string>(existingSets[0]?.id ?? 'new')
  const [newSetName, setNewSetName] = useState('')
  const [newSetType, setNewSetType] = useState<PlanSetType>('construction')
  const [newSetDate, setNewSetDate] = useState('')

  const sheetByNumber = useMemo(() => {
    const m = new Map<string, SheetWithRevision>()
    for (const s of existingSheets) m.set(s.sheet_number.toUpperCase(), s)
    return m
  }, [existingSheets])

  const bumpRevision = useCallback((match: SheetWithRevision): string => {
    const cur = match.current?.revision_label ?? '0'
    const n = parseInt(cur)
    return isNaN(n) ? cur : String(n + 1)
  }, [])

  const processFiles = useCallback(async (fileList: File[]) => {
    const files = fileList.filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf')
    if (files.length === 0) {
      setStage({ kind: 'error', message: 'Only PDF files are supported. Drop a PDF plan set or individual sheet PDFs.' })
      return
    }
    if (!newSetName) {
      setNewSetName(files.length === 1
        ? files[0].name.replace(/\.pdf$/i, '')
        : `Plan Set ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`)
    }
    setStage({ kind: 'processing', step: 'Reading PDFs…', done: 0, total: files.length })
    try {
      // Read every file up front, SKIPPING the ones that fail instead of
      // aborting the whole batch. The classic failure: files dragged straight
      // out of a ZIP window — Windows hands the browser stale references
      // ("could not be read … permission problems"). Those need extracting.
      const readable: File[] = []
      const docs: Awaited<ReturnType<typeof loadPdf>>[] = []
      const failures: string[] = []
      let totalPages = 0
      for (let fi = 0; fi < files.length; fi++) {
        setStage({ kind: 'processing', step: `Reading ${files[fi].name}…`, done: fi, total: files.length })
        try {
          const pdf = await loadPdf(await files[fi].arrayBuffer())
          readable.push(files[fi])
          docs.push(pdf)
          totalPages += pdf.numPages
        } catch (e) {
          const msg = e instanceof Error ? e.message : ''
          const reason = /could not be read|NotReadable|permission/i.test(msg)
            ? 'could not be read — if it came from a ZIP, extract the ZIP first'
            : /password/i.test(msg)
              ? 'password-protected'
              : 'unreadable or corrupted'
          failures.push(`${files[fi].name} (${reason})`)
        }
      }
      if (readable.length === 0) {
        setStage({
          kind: 'error',
          message: failures.length && /ZIP/i.test(failures[0])
            ? 'None of the files could be read. They look like they were dragged straight out of a ZIP — right-click the ZIP, choose Extract All, then drop the extracted PDFs.'
            : `None of the files could be read:\n${failures.join(', ')}`,
        })
        return
      }
      filesRef.current = readable
      const skippedNote = [
        fileList.length - files.length > 0 ? `${fileList.length - files.length} non-PDF skipped` : '',
        failures.length > 0 ? `${failures.length} unreadable skipped` : '',
      ].filter(Boolean).join(', ')
      setFileName(readable.length === 1 ? readable[0].name : `${readable.length} PDF files${skippedNote ? ` (${skippedNote})` : ''}`)
      setSkippedFiles(failures)

      // Count pages across all files first so progress is honest
      const next: ReviewRow[] = []
      const seen = new Map<string, number>()
      let pagesDone = 0
      const filesArr = readable
      for (let fi = 0; fi < filesArr.length; fi++) {
        const pdf = docs[fi]
        for (let p = 1; p <= pdf.numPages; p++) {
          pagesDone++
          setStage({ kind: 'processing', step: filesArr.length > 1 ? `Detecting sheets… (${filesArr[fi].name})` : 'Detecting sheets…', done: pagesDone, total: totalPages })
          const page = await pdf.getPage(p)
          const text = await extractPageText(page)
          const det = detectSheetInfo(text)
          setStage({ kind: 'processing', step: 'Generating previews…', done: pagesDone, total: totalPages })
          const thumbBlob = await renderThumbnail(page, 360)
          // Single-page files with no detectable number fall back to the
          // FILENAME (people name sheet PDFs "A1.01 First Floor.pdf")
          let sheetNumber = det.sheetNumber
            ?? (pdf.numPages === 1 ? filenameSheetNumber(filesArr[fi].name) : null)
            ?? (filesArr.length > 1 ? `SHEET-${String(fi + 1).padStart(2, '0')}` : `SHEET-${String(p).padStart(2, '0')}`)
          // Duplicate numbers inside one import get suffixed rather than colliding
          const dupCount = seen.get(sheetNumber.toUpperCase()) ?? 0
          seen.set(sheetNumber.toUpperCase(), dupCount + 1)
          if (dupCount > 0) sheetNumber = `${sheetNumber} (${dupCount + 1})`
          const match = sheetByNumber.get(sheetNumber.toUpperCase()) ?? null
          const vp = page.getViewport({ scale: 1 })
          next.push({
            fileIndex: fi,
            pageNumber: p,
            include: true,
            sheetNumber,
            title: det.title ?? (pdf.numPages === 1 ? filenameTitle(filesArr[fi].name) : ''),
            discipline: det.discipline ?? disciplineFromSheetNumber(sheetNumber) ?? 'Other',
            revisionLabel: det.revisionLabel ?? (match ? bumpRevision(match) : '0'),
            revisionDate: det.revisionDate,
            confident: det.confident,
            pageWidth: vp.width,
            pageHeight: vp.height,
            extractedText: text.full,
            thumbUrl: URL.createObjectURL(thumbBlob),
            thumbBlob,
            matchesSheetId: match?.id ?? null,
            matchesRevisionLabel: match?.current?.revision_label ?? null,
          })
          page.cleanup()
        }
        await pdf.loadingTask.destroy()
      }
      setRows(next)
      setStage({ kind: 'review' })
    } catch (e) {
      setStage({ kind: 'error', message: e instanceof Error ? e.message : 'Processing failed' })
    }
  }, [sheetByNumber, newSetName, bumpRevision])

  const startUpload = useCallback(async () => {
    const files = filesRef.current
    if (files.length === 0) return
    const included = rows.filter((r) => r.include)
    if (included.length === 0) {
      setStage({ kind: 'error', message: 'No sheets selected to import.' })
      return
    }
    // Duplicate sheet numbers among included rows must be resolved first
    const nums = new Set<string>()
    for (const r of included) {
      const key = r.sheetNumber.trim().toUpperCase()
      if (!key) { setStage({ kind: 'error', message: `Page ${r.pageNumber} is missing a sheet number.` }); return }
      if (nums.has(key)) { setStage({ kind: 'error', message: `Sheet number "${r.sheetNumber}" appears twice. Give each sheet a unique number.` }); return }
      nums.add(key)
    }

    try {
      setStage({ kind: 'uploading', step: 'Preparing sheets…', done: 0, total: included.length })
      // Per-file document handles, opened lazily and cached (multi-file drops
      // can be 20+ separate sheet PDFs).
      const buffers = new Map<number, ArrayBuffer>()
      const splitDocs = new Map<number, Awaited<ReturnType<typeof loadForSplitting>>>()
      const renderDocs = new Map<number, Awaited<ReturnType<typeof loadPdf>>>()
      const bufferFor = async (fi: number) => {
        let b = buffers.get(fi)
        if (!b) { b = await files[fi].arrayBuffer(); buffers.set(fi, b) }
        return b
      }
      const splitDocFor = async (fi: number) => {
        let d = splitDocs.get(fi)
        if (!d) { d = await loadForSplitting(await bufferFor(fi)); splitDocs.set(fi, d) }
        return d
      }

      // Storage enforces a per-file limit (50MB on the current plan). Scanned
      // sets and PDFs with shared resource trees can make ONE losslessly
      // extracted page nearly as large as the whole document, so oversized
      // pages fall back to a high-resolution (~200 DPI) raster PDF — for a
      // scanned sheet that is what the source page is anyway.
      const SIZE_LIMIT = 45 * 1024 * 1024
      const rasterFallback = async (r: ReviewRow): Promise<Uint8Array> => {
        let rd = renderDocs.get(r.fileIndex)
        if (!rd) { rd = await loadPdf(await bufferFor(r.fileIndex)); renderDocs.set(r.fileIndex, rd) }
        const page = await rd.getPage(r.pageNumber)
        const jpeg = await renderPageToJpeg(page)
        page.cleanup()
        return pageFromJpeg(await jpeg.arrayBuffer(), r.pageWidth, r.pageHeight)
      }
      const isSizeError = (e: unknown) =>
        e instanceof Error && /exceed|too large|payload|413|maximum allowed size/i.test(e.message)

      const inputs: ImportSheetInput[] = []
      for (let i = 0; i < included.length; i++) {
        const r = included[i]
        setStage({ kind: 'uploading', step: `Uploading ${r.sheetNumber}…`, done: i, total: included.length })
        const doc = await splitDocFor(r.fileIndex)
        let pageBytes = await extractPage(doc, r.pageNumber - 1)
        if (pageBytes.byteLength > SIZE_LIMIT) {
          setStage({ kind: 'uploading', step: `Optimizing ${r.sheetNumber} (large page)…`, done: i, total: included.length })
          pageBytes = await rasterFallback(r)
        }
        const sheetId = r.matchesSheetId ?? crypto.randomUUID()
        const revisionId = crypto.randomUUID()
        const pdfPath = revisionPdfPath(projectId, sheetId, revisionId)
        const thumbPath = revisionThumbPath(projectId, sheetId, revisionId)
        try {
          await uploadPlanFile(pdfPath, pageBytes, 'application/pdf')
        } catch (e) {
          // Storage said the file is too big even though it was under our own
          // threshold (lower configured limit): rasterize and retry once.
          if (!isSizeError(e)) throw e
          setStage({ kind: 'uploading', step: `Optimizing ${r.sheetNumber} (large page)…`, done: i, total: included.length })
          pageBytes = await rasterFallback(r)
          await uploadPlanFile(pdfPath, pageBytes, 'application/pdf')
        }
        await uploadPlanFile(thumbPath, r.thumbBlob, 'image/webp')
        inputs.push({
          sheetNumber: r.sheetNumber.trim().toUpperCase(),
          title: r.title.trim(),
          discipline: r.discipline,
          revisionLabel: r.revisionLabel.trim() || '0',
          revisionDate: r.revisionDate,
          pdfPath,
          thumbPath,
          pageWidth: r.pageWidth,
          pageHeight: r.pageHeight,
          fileSize: pageBytes.byteLength,
          extractedText: r.extractedText,
          sourceFileName: files[r.fileIndex]?.name ?? files[0].name,
          sourcePageNumber: r.pageNumber,
          sheetId,
          revisionId,
          existingSheetId: r.matchesSheetId,
        })
      }

      for (const rd of renderDocs.values()) await rd.loadingTask.destroy()

      setStage({ kind: 'uploading', step: 'Organizing drawings…', done: included.length, total: included.length })
      const chosenSet = existingSets.find((s) => s.id === setChoice)
      const result = await commitPlanImport(projectId, {
        existingSetId: chosenSet?.id ?? null,
        name: chosenSet?.name ?? (newSetName.trim() || files[0].name.replace(/\.pdf$/i, '')),
        setType: chosenSet?.set_type ?? newSetType,
        issueDate: chosenSet ? chosenSet.issue_date : (newSetDate || null),
      }, inputs)
      if (!result.success) { setStage({ kind: 'error', message: result.error }); return }
      setStage({ kind: 'done', imported: result.data!.imported, revised: result.data!.revised })
    } catch (e) {
      setStage({ kind: 'error', message: e instanceof Error ? e.message : 'Upload failed. Check your connection and try again — nothing was partially saved without its file.' })
    }
  }, [rows, projectId, setChoice, newSetName, newSetType, newSetDate, existingSets])

  useEffect(() => () => { rows.forEach((r) => URL.revokeObjectURL(r.thumbUrl)) }, [rows])

  const revisions = rows.filter((r) => r.include && r.matchesSheetId).length
  const additions = rows.filter((r) => r.include && !r.matchesSheetId).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget && stage.kind !== 'uploading' && stage.kind !== 'processing') onClose() }}>
      <div className="w-full max-w-4xl max-h-[94vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Upload plans</h2>
            {fileName && <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[60vw]">{fileName}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
            disabled={stage.kind === 'uploading'}>
            <X size={18} />
          </button>
        </div>

        {stage.kind === 'pick' && (
          <div className="p-6">
            <div
              className={cn(
                'rounded-xl border-2 border-dashed p-10 sm:p-14 text-center transition-colors cursor-pointer',
                dragOver ? 'border-indigo-500 bg-indigo-50/60' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50',
              )}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault(); setDragOver(false)
                const fs = Array.from(e.dataTransfer.files ?? [])
                if (fs.length) processFiles(fs)
              }}
              onClick={() => inputRef.current?.click()}
            >
              <FileUp className="mx-auto text-indigo-500" size={36} />
              <p className="mt-4 text-sm font-medium text-slate-900">Drag PDF plans here — one big set or many individual sheets</p>
              <p className="mt-1 text-xs text-slate-500">
                Multi-sheet sets are split into individual drawings automatically, and you can
                drop any number of separate sheet PDFs at once. Sheet numbers, titles and
                disciplines are detected from the title blocks (or the file name) —
                you review everything before it saves.
              </p>
              <Button variant="primary" size="sm" className="mt-5">Choose PDFs</Button>
              <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="hidden"
                onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) processFiles(fs) }} />
            </div>
          </div>
        )}

        {(stage.kind === 'processing' || stage.kind === 'uploading') && (
          <div className="p-10 text-center">
            <RefreshCw className="mx-auto animate-spin text-indigo-500" size={28} />
            <p className="mt-4 text-sm font-medium text-slate-900">{stage.step}</p>
            <div className="mt-4 mx-auto max-w-xs h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full transition-all duration-200"
                style={{ width: `${stage.total ? Math.round((stage.done / stage.total) * 100) : 0}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-500">{stage.done} / {stage.total}</p>
            {stage.kind === 'uploading' && (
              <p className="mt-4 text-xs text-amber-600">Keep this tab open until the upload finishes.</p>
            )}
          </div>
        )}

        {stage.kind === 'review' && (
          <>
            <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-end gap-3 shrink-0 bg-slate-50/60">
              <div className="min-w-44">
                <Select label="Drawing set" value={setChoice} onChange={(e) => setSetChoice(e.target.value)}>
                  <option value="new">New set…</option>
                  {existingSets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </div>
              {setChoice === 'new' && (
                <>
                  <div className="min-w-48 flex-1"><Input label="Set name" value={newSetName} onChange={(e) => setNewSetName(e.target.value)} placeholder="Construction Set" /></div>
                  <div className="min-w-36">
                    <Select label="Type" value={newSetType} onChange={(e) => setNewSetType(e.target.value as PlanSetType)}>
                      {SET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </Select>
                  </div>
                  <div><Input label="Issue date" type="date" value={newSetDate} onChange={(e) => setNewSetDate(e.target.value)} /></div>
                </>
              )}
            </div>
            {skippedFiles.length > 0 && (
              <div className="mx-5 mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                Skipped {skippedFiles.length} file{skippedFiles.length === 1 ? '' : 's'}: {skippedFiles.join(' · ')}
              </div>
            )}
            <div className="overflow-y-auto flex-1 px-5 py-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="py-2 pr-2 w-8">
                      <input type="checkbox" className="accent-indigo-600"
                        checked={rows.every((r) => r.include)}
                        onChange={(e) => setRows((rs) => rs.map((r) => ({ ...r, include: e.target.checked })))} />
                    </th>
                    <th className="py-2 pr-3 w-16">Page</th>
                    <th className="py-2 pr-3 w-32">Sheet #</th>
                    <th className="py-2 pr-3">Title</th>
                    <th className="py-2 pr-3 w-40">Discipline</th>
                    <th className="py-2 pr-3 w-16">Rev</th>
                    <th className="py-2 w-32">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.pageNumber} className={cn('border-b border-slate-50', !r.include && 'opacity-40')}>
                      <td className="py-1.5 pr-2">
                        <input type="checkbox" className="accent-indigo-600" checked={r.include}
                          onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, include: e.target.checked } : x))} />
                      </td>
                      <td className="py-1.5 pr-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.thumbUrl} alt="" className="w-12 h-9 object-cover rounded border border-slate-200 bg-white" />
                      </td>
                      <td className="py-1.5 pr-3">
                        <input value={r.sheetNumber}
                          onChange={(e) => {
                            const v = e.target.value
                            setRows((rs) => rs.map((x, j) => {
                              if (j !== i) return x
                              const match = sheetByNumber.get(v.trim().toUpperCase()) ?? null
                              return { ...x, sheetNumber: v, matchesSheetId: match?.id ?? null, matchesRevisionLabel: match?.current?.revision_label ?? null }
                            }))
                          }}
                          className={cn('w-full rounded-md border px-2 py-1 text-xs font-mono',
                            r.confident ? 'border-slate-200' : 'border-amber-300 bg-amber-50')} />
                      </td>
                      <td className="py-1.5 pr-3">
                        <input value={r.title} placeholder="Sheet title"
                          onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                          className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs" />
                      </td>
                      <td className="py-1.5 pr-3">
                        <select value={r.discipline}
                          onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, discipline: e.target.value } : x))}
                          className="w-full rounded-md border border-slate-200 px-1.5 py-1 text-xs bg-white">
                          {[...new Set([...STANDARD_DISCIPLINES, r.discipline])].map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </td>
                      <td className="py-1.5 pr-3">
                        <input value={r.revisionLabel}
                          onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, revisionLabel: e.target.value } : x))}
                          className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs font-mono text-center" />
                      </td>
                      <td className="py-1.5">
                        {r.matchesSheetId ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                            <RefreshCw size={10} /> Revises Rev {r.matchesRevisionLabel ?? '?'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                            New sheet
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
              <p className="text-xs text-slate-500">
                {additions > 0 && <span className="text-emerald-700 font-medium">{additions} new</span>}
                {additions > 0 && revisions > 0 && ' · '}
                {revisions > 0 && <span className="text-amber-700 font-medium">{revisions} revision{revisions === 1 ? '' : 's'}</span>}
                {additions + revisions === 0 && 'Nothing selected'}
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => { setRows([]); filesRef.current = []; setFileName(''); setStage({ kind: 'pick' }) }}>Back</Button>
                <Button variant="primary" size="sm" onClick={startUpload} disabled={additions + revisions === 0}>
                  Import {additions + revisions} sheet{additions + revisions === 1 ? '' : 's'}
                </Button>
              </div>
            </div>
          </>
        )}

        {stage.kind === 'done' && (
          <div className="p-10 text-center">
            <CheckCircle2 className="mx-auto text-emerald-500" size={32} />
            <p className="mt-4 text-sm font-semibold text-slate-900">Import complete</p>
            <p className="mt-1 text-xs text-slate-500">
              {stage.imported > 0 && `${stage.imported} sheet${stage.imported === 1 ? '' : 's'} added`}
              {stage.imported > 0 && stage.revised > 0 && ' · '}
              {stage.revised > 0 && `${stage.revised} sheet${stage.revised === 1 ? '' : 's'} revised`}
            </p>
            <Button variant="primary" size="sm" className="mt-5" onClick={onComplete}>View plans</Button>
          </div>
        )}

        {stage.kind === 'error' && (
          <div className="p-10 text-center">
            <AlertTriangle className="mx-auto text-rose-500" size={30} />
            <p className="mt-4 text-sm font-medium text-slate-900">Import problem</p>
            <p className="mt-1 text-xs text-slate-600 max-w-md mx-auto">{stage.message}</p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setStage(rows.length ? { kind: 'review' } : { kind: 'pick' })}>Back</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
