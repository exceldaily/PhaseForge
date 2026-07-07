import { NextRequest, NextResponse } from 'next/server'
import { parseTextToRows, parseTableRows, detectProjects } from '@/lib/importParser'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

// Simple in-memory rate limiter: max 10 imports per IP per minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 })
    return true
  }

  if (entry.count >= 10) return false

  entry.count++
  return true
}

export async function POST(req: NextRequest) {
  // Parse-only endpoint, but there is no reason to serve anonymous traffic.
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment and try again.' }, { status: 429 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10 MB.' }, { status: 413 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase()
    const buffer = Buffer.from(await file.arrayBuffer())
    let rows: ReturnType<typeof parseTextToRows> = []

    // ── Excel / CSV ───────────────────────────────────────────────────────────
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
      const sheetNames = workbook.SheetNames

      const readSheet = (name: string) =>
        parseTableRows(
          XLSX.utils.sheet_to_json(workbook.Sheets[name], {
            header: 1,
            raw: true,
            defval: null,
          }) as (string | number | null)[][]
        )

      // Multi-tab workbook → one (or more) project(s) per tab, named after the
      // tab. Tabs with no usable schedule rows (e.g. a "Summary" tab) are skipped.
      if (sheetNames.length > 1) {
        const collected = []
        let totalTasks = 0

        for (const name of sheetNames) {
          const sheetRows = readSheet(name)
          if (sheetRows.length === 0) continue
          totalTasks += sheetRows.length
          // A tab with a Project column splits into multiple projects; otherwise
          // it becomes a single project named after the tab.
          collected.push(...detectProjects(sheetRows, name))
        }

        if (collected.length === 0) {
          return NextResponse.json({
            error: 'No schedule data found in any tab. Each tab needs task names with Start Date and End Date columns.',
          }, { status: 422 })
        }

        // De-duplicate: a workbook may describe the same project both in a master
        // "All Tasks" tab and in its own per-project tab. Collapse by a normalized
        // name (tolerant of Excel's 31-char tab-name truncation), keeping the
        // version with the most phases.
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24)
        const byKey = new Map<string, (typeof collected)[number]>()
        for (const proj of collected) {
          const key = norm(proj.name)
          const existing = byKey.get(key)
          if (!existing || proj.phases.length > existing.phases.length) {
            byKey.set(key, proj)
          }
        }

        const projects = [...byKey.values()]
        return NextResponse.json({ projects, totalTasks })
      }

      // Single sheet (or CSV) → unchanged behavior; falls through to the
      // shared detectProjects(file.name) path below.
      rows = readSheet(sheetNames[0])
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

    const projects = detectProjects(rows, file.name)

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
