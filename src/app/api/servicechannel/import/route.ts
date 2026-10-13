import { NextRequest, NextResponse } from 'next/server'
import { normalizeRows } from '@/lib/servicechannel/mapping'
import { coverageOf, previewImport, scCtx } from '@/lib/servicechannel/server'
import { logger } from '@/lib/logger'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Creates a draft import from a parsed report and previews it. A route handler
// rather than a server action because a year of work orders, notes included,
// is a few megabytes. The server does the normalization itself, so what is
// stored never depends on the browser.

const MAX_ROWS = 10_000

export async function POST(req: NextRequest) {
  let ctx
  try { ctx = await scCtx() } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'unauthorized' }, { status: 401 }) }

  let body: { sourceName?: unknown; fileHash?: unknown; headers?: unknown; mapping?: unknown; coverage?: unknown; fileCustomer?: unknown; cells?: unknown; mappingId?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const cells = Array.isArray(body.cells) ? (body.cells as unknown[][]) : null
  const mapping = body.mapping && typeof body.mapping === 'object' ? (body.mapping as Record<string, string>) : null
  if (!cells || !mapping) return NextResponse.json({ error: 'cells and mapping are required' }, { status: 400 })
  if (cells.length > MAX_ROWS + 1) return NextResponse.json({ error: `That is more than ${MAX_ROWS} rows. Split the export by status or date.` }, { status: 413 })

  const normalized = normalizeRows(cells, mapping, { fileCustomer: typeof body.fileCustomer === 'string' ? body.fileCustomer : null })
  if (!normalized.rows.length) return NextResponse.json({ error: normalized.warnings[0] ?? 'No rows could be read.' }, { status: 400 })

  const headers = (cells[0] ?? []).map((h) => String(h ?? '').trim()).filter(Boolean)
  const { data, error } = await ctx.admin.from('sc_imports').insert({
    company_id: ctx.companyId, kind: 'work_orders', status: 'draft',
    source_name: typeof body.sourceName === 'string' ? body.sourceName.slice(0, 200) : null,
    file_hash: typeof body.fileHash === 'string' ? body.fileHash.slice(0, 80) : null,
    headers, mapping, mapping_id: typeof body.mappingId === 'string' ? body.mappingId : null,
    coverage: coverageOf(body.coverage), row_count: normalized.rows.length, rows: normalized.rows,
    warnings: normalized.warnings, created_by: ctx.userId,
  }).select('id').single()
  if (error || !data) { logger.error('sc import draft', error); return NextResponse.json({ error: 'Could not save the draft.' }, { status: 500 }) }

  try {
    const preview = await previewImport(ctx, data.id as string)
    return NextResponse.json({ importId: data.id, rowCount: normalized.rows.length, skipped: normalized.skipped, duplicates: normalized.duplicates, preview })
  } catch (e) {
    logger.error('sc import preview', e)
    await ctx.admin.from('sc_imports').update({ status: 'failed', error: e instanceof Error ? e.message : 'preview failed' }).eq('id', data.id)
    return NextResponse.json({ error: 'The preview failed. Nothing was imported.' }, { status: 500 })
  }
}
