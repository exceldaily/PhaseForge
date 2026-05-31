import { NextRequest, NextResponse } from 'next/server'
import { parseTextToRows, parseTableRows, detectProjects } from '@/lib/importParser'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase()
    const buffer = Buffer.from(await file.arrayBuffer())
    let rows: ReturnType<typeof parseTextToRows> = []

    // ── Excel / CSV ───────────────────────────────────────────────────────────
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const tableRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as (string | number | null)[][]
      rows = parseTableRows(tableRows)
    }

    // ── PDF — handled client-side, should not reach here ─────────────────────
    else if (ext === 'pdf') {
      return NextResponse.json({ error: 'PDF files are parsed in the browser. Please re-upload.' }, { status: 400 })
    }

    // ── Word ──────────────────────────────────────────────────────────────────
    else if (ext === 'docx') {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      const lines = result.value.split('\n')
      rows = parseTextToRows(lines)
    }

    // ── Plain text / TSV ─────────────────────────────────────────────────────
    else if (ext === 'txt' || ext === 'tsv') {
      const lines = buffer.toString('utf-8').split('\n')
      rows = parseTextToRows(lines)
    }

    else {
      return NextResponse.json({ error: `Unsupported file type: .${ext}` }, { status: 400 })
    }

    if (rows.length === 0) {
      return NextResponse.json({
        error: 'No schedule data found. Make sure the file has task names with Start Date and End Date columns.',
      }, { status: 422 })
    }

    const projects = detectProjects(rows)

    return NextResponse.json({
      projects,
      totalTasks: rows.length,
    })

  } catch (err: unknown) {
    console.error('Import error:', err)
    const message = err instanceof Error ? err.message : 'Parse failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
