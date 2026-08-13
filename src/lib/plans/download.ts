'use client'

// Download / print flows. Select → download, nothing else in the way.
// Combined PDFs and packages are assembled client-side from the per-sheet
// vector PDFs (pdf-lib), ZIPs via the existing jszip dependency — drawings
// stay vector end to end, so professional printing stays crisp.

import { downloadPlanFile } from './storage'
import { mergeSheets, buildPlanPackage } from './assembly'
import type { SheetWithRevision } from '@/types/plans'

export type DownloadProgress = (label: string, done: number, total: number) => void

function sheetFileName(s: SheetWithRevision): string {
  const rev = s.current ? ` (Rev ${s.current.revision_label})` : ''
  const title = s.title ? ` - ${s.title}` : ''
  return sanitize(`${s.sheet_number}${title}${rev}.pdf`)
}

function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*]+/g, '-').slice(0, 140)
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

async function fetchAll(sheets: SheetWithRevision[], onProgress?: DownloadProgress): Promise<{ sheet: SheetWithRevision; buf: ArrayBuffer }[]> {
  const out: { sheet: SheetWithRevision; buf: ArrayBuffer }[] = []
  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i]
    if (!s.current) continue
    onProgress?.(`Fetching ${s.sheet_number}…`, i, sheets.length)
    out.push({ sheet: s, buf: await downloadPlanFile(s.current.pdf_path) })
  }
  return out
}

/** One sheet → direct PDF download. */
export async function downloadSingleSheet(sheet: SheetWithRevision) {
  if (!sheet.current) throw new Error('This sheet has no drawing file')
  const buf = await downloadPlanFile(sheet.current.pdf_path)
  saveBlob(new Blob([buf], { type: 'application/pdf' }), sheetFileName(sheet))
}

/** Many sheets → one combined vector PDF. */
export async function downloadCombinedPdf(
  sheets: SheetWithRevision[], filename: string, onProgress?: DownloadProgress,
) {
  const files = await fetchAll(sheets, onProgress)
  onProgress?.('Combining PDF…', sheets.length, sheets.length)
  const merged = await mergeSheets(files.map((f) => f.buf))
  saveBlob(new Blob([merged as BlobPart], { type: 'application/pdf' }), sanitize(`${filename}.pdf`))
}

/** Many sheets → ZIP of individual sheet PDFs. */
export async function downloadZip(
  sheets: SheetWithRevision[], filename: string, onProgress?: DownloadProgress,
) {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const files = await fetchAll(sheets, onProgress)
  for (const f of files) zip.file(sheetFileName(f.sheet), f.buf)
  onProgress?.('Zipping…', sheets.length, sheets.length)
  const blob = await zip.generateAsync({ type: 'blob' })
  saveBlob(blob, sanitize(`${filename}.zip`))
}

/** Open a combined PDF in a new tab for printing (browser dialog handles
 *  paper size / orientation / fit — the PDF itself stays vector). */
export async function printSheets(sheets: SheetWithRevision[], onProgress?: DownloadProgress) {
  const files = await fetchAll(sheets, onProgress)
  onProgress?.('Preparing print file…', sheets.length, sheets.length)
  const merged = files.length === 1
    ? new Uint8Array(files[0].buf)
    : await mergeSheets(files.map((f) => f.buf))
  const url = URL.createObjectURL(new Blob([merged as BlobPart], { type: 'application/pdf' }))
  window.open(url, '_blank')
}

/** Plan package: PhaseForge cover + drawing index + sheets, one shareable PDF. */
export async function downloadPackage(input: {
  sheets: SheetWithRevision[]
  projectName: string
  packageName: string
  onProgress?: DownloadProgress
}) {
  const files = await fetchAll(input.sheets, input.onProgress)
  input.onProgress?.('Building package…', input.sheets.length, input.sheets.length)
  const bytes = await buildPlanPackage({
    projectName: input.projectName,
    packageName: input.packageName,
    dateLabel: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    sheets: files.map((f) => ({
      info: {
        sheetNumber: f.sheet.sheet_number,
        title: f.sheet.title,
        discipline: f.sheet.discipline,
        revisionLabel: f.sheet.current?.revision_label ?? '0',
        revisionDate: f.sheet.current?.revision_date ?? null,
      },
      pdf: f.buf,
    })),
  })
  saveBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), sanitize(`${input.packageName}.pdf`))
}
