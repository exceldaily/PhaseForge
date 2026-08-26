'use server'

// Pricing server actions — the second half of Quotes.
//
// The request flow ends when vendors reply. This starts there: read the
// vendor's quote PDF into cost lines, add labor / travel / other expenses, and
// mark it all up to the number the customer is given. Costs are never
// overwritten by sell prices, so the margin on a bid stays auditable.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canUseTickets } from '@/lib/constants'
import { parseVendorQuote, type PriceLineKind } from '@/lib/quotes/vendorQuote'

const PATH = '/app/quotes'

async function ctx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: p } = await supabase
    .from('profiles')
    .select('company_id, companies(plan, dispatch_enabled)')
    .eq('id', user.id).single()
  if (!p?.company_id) throw new Error('No organization')
  const co = p.companies as { plan?: string; dispatch_enabled?: boolean } | null
  if (!canUseTickets(co?.plan) && !co?.dispatch_enabled) throw new Error('Quotes requires a paid plan')
  return { supabase, userId: user.id, companyId: p.company_id }
}

/** Shared PDF -> text step, with the same plain-language failures as intake. */
async function readPdf(file: unknown): Promise<{ ok: true; text: string; name: string } | { ok: false; error: string }> {
  if (!(file instanceof File)) return { ok: false, error: 'Attach a PDF file.' }
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: 'That PDF is over 10 MB.' }
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) return { ok: false, error: 'Only PDF files are supported here.' }
  try {
    const { extractPdfText } = await import('@/lib/quotes/pdfText')
    const text = await extractPdfText(Buffer.from(await file.arrayBuffer()))
    if (text.replace(/\s+/g, ' ').trim().length < 20) {
      return { ok: false, error: 'That PDF has no readable text — it looks like a scan or photo. Paste the quote text instead (or run OCR on it first).' }
    }
    return { ok: true, text, name: file.name }
  } catch (e) {
    const detail = e instanceof Error ? ` (${e.message.slice(0, 120)})` : ''
    return { ok: false, error: `Could not read that PDF${detail}. If it is a scan without text, paste the quote text instead.` }
  }
}

/** Turn parsed text into rows for quote_price_lines. */
function linesFrom(text: string, companyId: string, pricingId: string, startAt: number) {
  const parsed = parseVendorQuote(text)
  const rows = parsed.lines.map((l, i) => ({
    company_id: companyId, pricing_id: pricingId, kind: 'material' as PriceLineKind,
    description: l.description, qty: l.qty, unit: l.unit, unit_cost: l.unitCost,
    markup_pct: null as number | null, taxable: true, sort_order: startAt + i,
  }))
  // Freight is a real cost on the job, so it comes across as an expense line
  // rather than being dropped with the other summary rows.
  if (parsed.freight && parsed.freight > 0) {
    rows.push({
      company_id: companyId, pricing_id: pricingId, kind: 'other' as PriceLineKind,
      description: 'Freight / shipping', qty: 1, unit: null, unit_cost: parsed.freight,
      markup_pct: null, taxable: true, sort_order: startAt + rows.length,
    })
  }
  return { rows, parsed }
}

/* ─────────────────────────── sheets ─────────────────────────── */

/** Read a vendor's quote PDF into a new pricing sheet. */
export async function createPricingFromPdf(formData: FormData) {
  const { supabase, companyId, userId } = await ctx()
  const read = await readPdf(formData.get('file'))
  if (!read.ok) return read

  const requestId = String(formData.get('quoteRequestId') ?? '') || null
  const vendorName = String(formData.get('vendorName') ?? '').trim() || null

  const { data: sheet, error } = await supabase.from('quote_pricings').insert({
    company_id: companyId,
    created_by: userId,
    quote_request_id: requestId,
    title: read.name.replace(/\.pdf$/i, '').slice(0, 120) || 'Untitled quote',
    vendor_name: vendorName,
    source_file_name: read.name,
  }).select('id').single()
  if (error || !sheet) return { ok: false as const, error: error?.message ?? 'Could not create the pricing sheet.' }

  const { rows, parsed } = linesFrom(read.text, companyId, sheet.id, 0)
  if (rows.length) {
    const { error: lineErr } = await supabase.from('quote_price_lines').insert(rows)
    if (lineErr) return { ok: false as const, error: lineErr.message }
  }
  await supabase.from('quote_pricings')
    .update({ quote_number: parsed.quoteNumber, source_total: parsed.documentTotal })
    .eq('id', sheet.id).eq('company_id', companyId)

  revalidatePath(PATH)
  // found === 0 is not an error: the sheet opens empty and ready to type into.
  return { ok: true as const, pricingId: sheet.id as string, found: rows.length }
}

/** Same, from pasted text, for scans and email bodies. */
export async function createPricingFromText(input: { text: string; title?: string }) {
  const { supabase, companyId, userId } = await ctx()
  const text = input.text ?? ''
  if (text.replace(/\s+/g, ' ').trim().length < 20) {
    return { ok: false as const, error: 'Paste a bit more of the quote — there is not enough here to read.' }
  }
  const { data: sheet, error } = await supabase.from('quote_pricings').insert({
    company_id: companyId, created_by: userId,
    title: (input.title ?? '').trim().slice(0, 120) || 'Pasted quote',
  }).select('id').single()
  if (error || !sheet) return { ok: false as const, error: error?.message ?? 'Could not create the pricing sheet.' }

  const { rows, parsed } = linesFrom(text, companyId, sheet.id, 0)
  if (rows.length) await supabase.from('quote_price_lines').insert(rows)
  await supabase.from('quote_pricings')
    .update({ quote_number: parsed.quoteNumber, source_total: parsed.documentTotal })
    .eq('id', sheet.id).eq('company_id', companyId)

  revalidatePath(PATH)
  return { ok: true as const, pricingId: sheet.id as string, found: rows.length }
}

/** An empty sheet, for a bid priced entirely by hand. */
export async function createBlankPricing(input?: { title?: string }) {
  const { supabase, companyId, userId } = await ctx()
  const { data, error } = await supabase.from('quote_pricings').insert({
    company_id: companyId, created_by: userId,
    title: (input?.title ?? '').trim().slice(0, 120) || 'New quote',
  }).select('id').single()
  if (error || !data) return { ok: false as const, error: error?.message ?? 'Could not create the pricing sheet.' }
  revalidatePath(PATH)
  return { ok: true as const, pricingId: data.id as string, found: 0 }
}

/** Append a second vendor's quote to an existing sheet. */
export async function importLinesFromPdf(formData: FormData) {
  const { supabase, companyId } = await ctx()
  const pricingId = String(formData.get('pricingId') ?? '')
  if (!pricingId) return { ok: false as const, error: 'Missing the pricing sheet.' }
  const read = await readPdf(formData.get('file'))
  if (!read.ok) return read

  const { data: last } = await supabase.from('quote_price_lines')
    .select('sort_order').eq('pricing_id', pricingId).eq('company_id', companyId)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle()

  const { rows } = linesFrom(read.text, companyId, pricingId, (last?.sort_order ?? -1) + 1)
  if (rows.length) {
    const { error } = await supabase.from('quote_price_lines').insert(rows)
    if (error) return { ok: false as const, error: error.message }
  }
  revalidatePath(`${PATH}/pricing/${pricingId}`)
  return { ok: true as const, found: rows.length }
}

export async function updatePricing(input: {
  id: string
  patch: Partial<{
    title: string; vendor_name: string | null; quote_number: string | null
    job_number: string | null; customer_name: string | null; notes: string | null
    status: string; default_markup_pct: number; tax_pct: number
    project_id: string | null; quote_request_id: string | null
  }>
}) {
  const { supabase, companyId } = await ctx()
  const allowed = [
    'title', 'vendor_name', 'quote_number', 'job_number', 'customer_name', 'notes',
    'status', 'default_markup_pct', 'tax_pct', 'project_id', 'quote_request_id',
  ] as const
  const patch: Record<string, unknown> = {}
  for (const key of allowed) if (key in input.patch) patch[key] = input.patch[key as keyof typeof input.patch]
  if ('status' in patch && !['draft', 'sent', 'won', 'lost'].includes(String(patch.status))) delete patch.status
  for (const key of ['default_markup_pct', 'tax_pct'] as const) {
    if (key in patch) {
      const n = Number(patch[key])
      // A markup below -100% would price the work at a negative number.
      patch[key] = Number.isFinite(n) ? Math.max(-100, Math.min(10000, n)) : 0
    }
  }
  if (!Object.keys(patch).length) return { ok: true as const }
  const { error } = await supabase.from('quote_pricings').update(patch).eq('id', input.id).eq('company_id', companyId)
  if (error) return { ok: false as const, error: error.message }
  revalidatePath(`${PATH}/pricing/${input.id}`)
  return { ok: true as const }
}

export async function deletePricing(input: { id: string }) {
  const { supabase, companyId } = await ctx()
  const { error } = await supabase.from('quote_pricings').delete().eq('id', input.id).eq('company_id', companyId)
  if (error) return { ok: false as const, error: error.message }
  revalidatePath(PATH)
  return { ok: true as const }
}

/** Copy a sheet, for the next store that needs the same scope of work. */
export async function duplicatePricing(input: { id: string }) {
  const { supabase, companyId, userId } = await ctx()
  const { data: src } = await supabase.from('quote_pricings')
    .select('*').eq('id', input.id).eq('company_id', companyId).single()
  if (!src) return { ok: false as const, error: 'That pricing sheet is gone.' }

  const { data: copy, error } = await supabase.from('quote_pricings').insert({
    company_id: companyId, created_by: userId,
    quote_request_id: src.quote_request_id, vendor_id: src.vendor_id, project_id: src.project_id,
    title: `${src.title} (copy)`.slice(0, 120),
    vendor_name: src.vendor_name, quote_number: src.quote_number,
    job_number: src.job_number, customer_name: src.customer_name,
    default_markup_pct: src.default_markup_pct, tax_pct: src.tax_pct,
    source_file_name: src.source_file_name, source_total: src.source_total, notes: src.notes,
  }).select('id').single()
  if (error || !copy) return { ok: false as const, error: error?.message ?? 'Could not copy that sheet.' }

  const { data: lines } = await supabase.from('quote_price_lines')
    .select('kind, description, qty, unit, unit_cost, markup_pct, taxable, sort_order')
    .eq('pricing_id', input.id).eq('company_id', companyId).order('sort_order')
  if (lines?.length) {
    await supabase.from('quote_price_lines')
      .insert(lines.map((l) => ({ ...l, company_id: companyId, pricing_id: copy.id })))
  }
  revalidatePath(PATH)
  return { ok: true as const, pricingId: copy.id as string }
}

/* ─────────────────────────── lines ─────────────────────────── */

export async function addPriceLine(input: { pricingId: string; kind: PriceLineKind; description?: string }) {
  const { supabase, companyId } = await ctx()
  const { data: last } = await supabase.from('quote_price_lines')
    .select('sort_order').eq('pricing_id', input.pricingId).eq('company_id', companyId)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const unit = { material: 'EA', labor: 'HR', travel: 'MI', other: null }[input.kind] ?? null
  const { data, error } = await supabase.from('quote_price_lines').insert({
    company_id: companyId, pricing_id: input.pricingId, kind: input.kind,
    description: input.description ?? '', qty: 1, unit, unit_cost: 0,
    // Labor and travel are usually not taxed as goods; the checkbox overrides.
    taxable: input.kind === 'material',
    sort_order: (last?.sort_order ?? -1) + 1,
  }).select('id').single()
  if (error || !data) return { ok: false as const, error: error?.message ?? 'Could not add that line.' }
  revalidatePath(`${PATH}/pricing/${input.pricingId}`)
  return { ok: true as const, id: data.id as string }
}

export async function updatePriceLine(input: {
  id: string
  patch: Partial<{ kind: PriceLineKind; description: string; qty: number; unit: string | null; unit_cost: number; markup_pct: number | null; taxable: boolean }>
}) {
  const { supabase, companyId } = await ctx()
  const patch: Record<string, unknown> = {}
  if ('kind' in input.patch && ['material', 'labor', 'travel', 'other'].includes(String(input.patch.kind))) patch.kind = input.patch.kind
  if ('description' in input.patch) patch.description = String(input.patch.description ?? '').slice(0, 500)
  if ('unit' in input.patch) patch.unit = input.patch.unit ? String(input.patch.unit).slice(0, 12) : null
  if ('taxable' in input.patch) patch.taxable = !!input.patch.taxable
  if ('qty' in input.patch) {
    const n = Number(input.patch.qty)
    patch.qty = Number.isFinite(n) ? Math.max(0, n) : 0
  }
  if ('unit_cost' in input.patch) {
    const n = Number(input.patch.unit_cost)
    patch.unit_cost = Number.isFinite(n) ? n : 0
  }
  if ('markup_pct' in input.patch) {
    const v = input.patch.markup_pct
    const n = Number(v)
    patch.markup_pct = v === null || v === undefined || !Number.isFinite(n) ? null : Math.max(-100, Math.min(10000, n))
  }
  if (!Object.keys(patch).length) return { ok: true as const }
  const { error } = await supabase.from('quote_price_lines').update(patch).eq('id', input.id).eq('company_id', companyId)
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}

export async function deletePriceLine(input: { id: string }) {
  const { supabase, companyId } = await ctx()
  const { error } = await supabase.from('quote_price_lines').delete().eq('id', input.id).eq('company_id', companyId)
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}

/** Persist a drag-reordered line list in one call. */
export async function reorderPriceLines(input: { ids: string[] }) {
  const { supabase, companyId } = await ctx()
  const ids = [...new Set(input.ids.filter(Boolean))]
  for (let i = 0; i < ids.length; i += 25) {
    const slice = ids.slice(i, i + 25)
    const results = await Promise.all(slice.map((id, n) =>
      supabase.from('quote_price_lines').update({ sort_order: i + n }).eq('id', id).eq('company_id', companyId)))
    const failed = results.find((r) => r.error)
    if (failed?.error) return { ok: false as const, error: failed.error.message }
  }
  return { ok: true as const }
}
