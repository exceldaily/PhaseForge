// Client-side export of a table to CSV or XLSX. The spreadsheet library is
// only loaded when someone actually presses Export.

export type ExportRow = Record<string, string | number | null | undefined>

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function toCsv(rows: ExportRow[], headers?: string[]): string {
  const cols = headers ?? (rows[0] ? Object.keys(rows[0]) : [])
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.map(cell).join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n')
}

export async function exportRows(name: string, rows: ExportRow[], format: 'csv' | 'xlsx', headers?: string[]) {
  const cols = headers ?? (rows[0] ? Object.keys(rows[0]) : [])
  if (format === 'csv') {
    // The BOM is what makes Excel read accented characters correctly.
    download(new Blob(['﻿', toCsv(rows, cols)], { type: 'text/csv;charset=utf-8' }), `${name}.csv`)
    return
  }
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.json_to_sheet(rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? '']))), { header: cols })
  sheet['!cols'] = cols.map((c) => ({ wch: Math.min(48, Math.max(c.length + 2, ...rows.slice(0, 200).map((r) => String(r[c] ?? '').length + 2))) }))
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Export')
  const out = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${name}.xlsx`)
}

/** Read a CSV or XLSX file into rows of cells, first sheet only. */
export async function readSheetFile(file: File): Promise<unknown[][]> {
  const XLSX = await import('xlsx')
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const sheet = book.Sheets[book.SheetNames[0]]
  if (!sheet) return []
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' })
}
