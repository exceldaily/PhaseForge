'use client'

// Lossless PDF assembly with pdf-lib: split an uploaded set into one vector
// PDF per sheet, and merge sheet PDFs back into combined downloads/print
// packages. Drawings are never rasterized on this path.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

/** Extract a single page as a standalone PDF (vector-preserving). */
export async function extractPage(source: PDFDocument, pageIndex: number): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  const [page] = await out.copyPages(source, [pageIndex])
  out.addPage(page)
  return out.save({ useObjectStreams: true })
}

export async function loadForSplitting(data: ArrayBuffer): Promise<PDFDocument> {
  return PDFDocument.load(data, { ignoreEncryption: false })
}

/** Merge many single-sheet PDFs into one document, in the order given. */
export async function mergeSheets(
  pdfs: ArrayBuffer[],
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  for (let i = 0; i < pdfs.length; i++) {
    const src = await PDFDocument.load(pdfs[i])
    const pages = await out.copyPages(src, src.getPageIndices())
    for (const p of pages) out.addPage(p)
    onProgress?.(i + 1, pdfs.length)
  }
  return out.save({ useObjectStreams: true })
}

export interface PackageSheetInfo {
  sheetNumber: string
  title: string
  discipline: string
  revisionLabel: string
  revisionDate: string | null
}

/**
 * Build a plan package: cover sheet + drawing index + the sheets themselves.
 * Cover/index are generated pages; drawing pages are copied untouched.
 */
export async function buildPlanPackage(input: {
  projectName: string
  packageName: string
  dateLabel: string
  sheets: { info: PackageSheetInfo; pdf: ArrayBuffer }[]
  onProgress?: (done: number, total: number) => void
}): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  const helv = await out.embedFont(StandardFonts.Helvetica)
  const helvBold = await out.embedFont(StandardFonts.HelveticaBold)

  const W = 612, H = 792 // Letter portrait for cover + index
  const ink = rgb(0.06, 0.09, 0.16)
  const sub = rgb(0.42, 0.45, 0.5)
  const line = rgb(0.89, 0.91, 0.94)

  // ── Cover ──
  const cover = out.addPage([W, H])
  cover.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: rgb(0.31, 0.27, 0.9) })
  cover.drawText('PHASEFORGE', { x: 54, y: H - 90, size: 11, font: helvBold, color: sub })
  wrapText(input.projectName, helvBold, 30, W - 108).forEach((l, i) =>
    cover.drawText(l, { x: 54, y: H - 150 - i * 38, size: 30, font: helvBold, color: ink }))
  const nameLines = wrapText(input.projectName, helvBold, 30, W - 108).length
  cover.drawText(input.packageName, { x: 54, y: H - 165 - nameLines * 38, size: 18, font: helv, color: ink })
  cover.drawText(input.dateLabel, { x: 54, y: H - 192 - nameLines * 38, size: 12, font: helv, color: sub })
  cover.drawText(`${input.sheets.length} drawing${input.sheets.length === 1 ? '' : 's'}`, {
    x: 54, y: H - 212 - nameLines * 38, size: 12, font: helv, color: sub,
  })

  // ── Drawing index (grouped by discipline, in given order) ──
  let page = out.addPage([W, H])
  let y = H - 72
  page.drawText('DRAWING INDEX', { x: 54, y, size: 16, font: helvBold, color: ink })
  y -= 30
  let lastDiscipline = ''
  for (const { info } of input.sheets) {
    if (y < 72) { page = out.addPage([W, H]); y = H - 72 }
    if (info.discipline !== lastDiscipline) {
      y -= 8
      page.drawText(info.discipline.toUpperCase(), { x: 54, y, size: 10, font: helvBold, color: sub })
      y -= 6
      page.drawLine({ start: { x: 54, y }, end: { x: W - 54, y }, thickness: 0.75, color: line })
      y -= 16
      lastDiscipline = info.discipline
    }
    page.drawText(info.sheetNumber, { x: 54, y, size: 10, font: helvBold, color: ink })
    page.drawText(truncate(info.title, helv, 10, 330), { x: 140, y, size: 10, font: helv, color: ink })
    const rev = `REV ${info.revisionLabel}${info.revisionDate ? ` · ${info.revisionDate}` : ''}`
    page.drawText(rev, { x: W - 54 - helv.widthOfTextAtSize(rev, 8), y: y + 1, size: 8, font: helv, color: sub })
    y -= 16
  }

  // ── Sheets (a zero-byte buffer means index-only: skip the page copy) ──
  for (let i = 0; i < input.sheets.length; i++) {
    if (input.sheets[i].pdf.byteLength > 0) {
      const src = await PDFDocument.load(input.sheets[i].pdf)
      const pages = await out.copyPages(src, src.getPageIndices())
      for (const p of pages) out.addPage(p)
    }
    input.onProgress?.(i + 1, input.sheets.length)
  }
  return out.save({ useObjectStreams: true })

  function wrapText(text: string, font: typeof helvBold, size: number, maxWidth: number): string[] {
    const words = text.split(/\s+/)
    const lines: string[] = []
    let cur = ''
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w
      if (font.widthOfTextAtSize(t, size) > maxWidth && cur) { lines.push(cur); cur = w }
      else cur = t
    }
    if (cur) lines.push(cur)
    return lines.slice(0, 3)
  }
  function truncate(text: string, font: typeof helv, size: number, maxWidth: number): string {
    let t = text
    while (t.length > 1 && font.widthOfTextAtSize(t, size) > maxWidth) t = t.slice(0, -2) + '…'
    return t
  }
}
