'use client'

import { normaliseDate } from './importParser'

export interface PdfRow {
  name: string
  start_date: string
  end_date: string
  indent: number
}

export interface PdfDebugInfo {
  pageCount: number
  totalItems: number
  sampleText: string
  linesFound: number
  rowsFound: number
}

const DATE_RE = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g

const SKIP = new Set([
  'name', 'begin date', 'end date', 'start date', 'notes', 'tasks', 'task',
  'n...', 'beg...', 'http://', 'gantt chart', 'resources chart',
])

export async function extractScheduleFromPdf(
  buffer: ArrayBuffer
): Promise<{ rows: PdfRow[]; debug: PdfDebugInfo }> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs'

  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise

  let totalItems = 0
  let sampleText = ''
  const allRows: PdfRow[] = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()

    totalItems += content.items.length

    // Approach 1: Use hasEOL to build lines (pdfjs native line detection)
    const lines: string[] = []
    let currentLine = ''

    for (const item of content.items) {
      if (!('str' in item)) continue
      currentLine += item.str
      if ((item as { hasEOL?: boolean }).hasEOL) {
        if (currentLine.trim()) lines.push(currentLine.trim())
        currentLine = ''
      }
    }
    if (currentLine.trim()) lines.push(currentLine.trim())

    if (p === 2) {
      sampleText = lines.slice(0, 15).join('\n')
    }

    // Parse each line for name + 2 dates
    for (const line of lines) {
      if (!line || SKIP.has(line.toLowerCase())) continue

      DATE_RE.lastIndex = 0
      const dates: string[] = []
      let m: RegExpExecArray | null
      while ((m = DATE_RE.exec(line)) !== null) dates.push(m[0])
      if (dates.length < 2) continue

      DATE_RE.lastIndex = 0
      const firstDatePos = line.search(DATE_RE)
      DATE_RE.lastIndex = 0
      if (firstDatePos <= 0) continue

      const rawName = line.slice(0, firstDatePos).trim().replace(/\s{2,}/g, ' ')
      if (!rawName || rawName.length < 2 || SKIP.has(rawName.toLowerCase())) continue

      const start = normaliseDate(dates[0])
      const end   = normaliseDate(dates[1])
      if (!start || !end) continue

      allRows.push({ name: rawName, start_date: start, end_date: end, indent: 0 })
    }

    // Approach 2 (fallback): If hasEOL gave nothing, try Y-sort grouping
    if (allRows.length === 0 && p === 2) {
      const items = content.items
        .filter((i): i is typeof i & { str: string; transform: number[] } =>
          'str' in i && !!i.str.trim())
        .map(i => ({ text: i.str, x: i.transform[4], y: i.transform[5] }))

      // Add the raw items to sampleText for debugging
      sampleText += '\n\n--- RAW ITEMS (first 20) ---\n'
      sampleText += items.slice(0, 20).map(i =>
        `y=${i.y.toFixed(1)} x=${i.x.toFixed(1)} "${i.text}"`
      ).join('\n')
    }
  }

  return {
    rows: allRows,
    debug: {
      pageCount: pdf.numPages,
      totalItems,
      sampleText,
      linesFound: 0,
      rowsFound: allRows.length,
    },
  }
}
