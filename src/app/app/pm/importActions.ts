'use server'

// Committing an import. The preview on screen is only a preview: the rows
// are reviewed again here against what is in the database right now, with
// the same functions, and only rows that pass are written.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  reviewPmRows, reviewStores, tally,
  type ImportKind, type PmReview, type RawRow,
} from '@/lib/pm/importers'
import { isQuarter } from '@/lib/pm/quarters'
import { existingStoresFor, loadExistingCycles } from '@/lib/pm/importServer'
import { attachChecklists, fail, loadStores, loadTechs, logPm, pmCtx, type PmContext } from '@/lib/pm/server'
import type { PmTech } from '@/lib/pm/types'

const PATH = '/app/pm'
const MAX_ROWS = 5000

/** Technicians named in the file that do not exist yet are added, so nothing is dropped. */
async function ensureTechs(ctx: PmContext, techs: PmTech[], names: (string | null)[]): Promise<Map<string, string>> {
  const key = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const byName = new Map(techs.map((t) => [key(t.name), t.id]))
  for (const raw of names) {
    const name = raw?.trim()
    if (!name || byName.has(key(name))) continue
    const { data, error } = await ctx.supabase.from('pm_techs').insert({ company_id: ctx.companyId, name }).select('id').single()
    if (data) byName.set(key(name), data.id as string)
    else if (error?.code === '23505') {
      const { data: again } = await ctx.supabase.from('pm_techs').select('id').eq('company_id', ctx.companyId).ilike('name', name).maybeSingle()
      if (again) byName.set(key(name), again.id as string)
    }
  }
  return new Map([...byName.entries()])
}
const techKey = (n: string | null) => (n ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/* ── Drafts ──────────────────────────────────────────────────────────────── */

export async function saveImportDraft(input: { id?: string | null; kind: ImportKind; source?: string | null; rows: RawRow[] }) {
  try {
    const { supabase, companyId, userId } = await pmCtx('coordinator')
    if (input.rows.length > MAX_ROWS) return { ok: false as const, error: `That is more than ${MAX_ROWS} rows. Split the file.` }
    if (input.id) {
      const { error } = await supabase.from('pm_import_batches').update({ rows: input.rows }).eq('id', input.id).eq('company_id', companyId).eq('status', 'draft')
      if (error) return { ok: false as const, error: error.message }
      return { ok: true as const, id: input.id }
    }
    const { data, error } = await supabase.from('pm_import_batches').insert({ company_id: companyId, kind: input.kind, source: input.source ?? null, rows: input.rows, created_by: userId }).select('id').single()
    if (error || !data) return { ok: false as const, error: error?.message ?? 'Could not save the draft.' }
    return { ok: true as const, id: data.id as string }
  } catch (e) { return fail(e) }
}

export async function discardImport(input: { id: string }) {
  try {
    const { supabase, companyId } = await pmCtx('coordinator')
    const { error } = await supabase.from('pm_import_batches').update({ status: 'discarded' }).eq('id', input.id).eq('company_id', companyId).eq('status', 'draft')
    if (error) return { ok: false as const, error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

async function closeBatch(ctx: PmContext, batchId: string | null | undefined, result: Record<string, unknown>) {
  if (!batchId) return
  await ctx.supabase.from('pm_import_batches').update({ status: 'committed', result, committed_by: ctx.userId, committed_at: new Date().toISOString() })
    .eq('id', batchId).eq('company_id', ctx.companyId)
}

/* ── Stores ──────────────────────────────────────────────────────────────── */

export async function commitStoreImport(input: { batchId?: string | null; rows: RawRow[]; updateExisting: boolean }) {
  try {
    const ctx = await pmCtx('coordinator')
    if (input.rows.length > MAX_ROWS) return { ok: false as const, error: `That is more than ${MAX_ROWS} rows. Split the file.` }
    const [stores, techs] = await Promise.all([loadStores(ctx.supabase, ctx.companyId), loadTechs(ctx.supabase, ctx.companyId)])
    const reviews = reviewStores(input.rows, existingStoresFor(stores, techs), { updateExisting: input.updateExisting })
    const live = reviews.filter((r) => r.action === 'create' || r.action === 'update')
    const techId = await ensureTechs(ctx, techs, live.flatMap((r) => [r.values.primaryTech, r.values.secondaryTech]))

    const creates = live.filter((r) => r.action === 'create').map((r) => ({
      company_id: ctx.companyId, store_number: r.values.storeNumber, address: r.values.address, city: r.values.city, county: r.values.county,
      state: r.values.state, postal_code: r.values.postalCode, region: r.values.region, facility_manager: r.values.facilityManager,
      fm_phone: r.values.fmPhone, fm_email: r.values.fmEmail, store_phone: r.values.storePhone,
      primary_tech_id: techId.get(techKey(r.values.primaryTech)) ?? null, secondary_tech_id: techId.get(techKey(r.values.secondaryTech)) ?? null,
      system_type: r.values.systemType, refrigerant: r.values.refrigerant, notes: r.values.notes, is_active: r.values.isActive,
      created_by: ctx.userId, updated_by: ctx.userId,
    }))
    const failed: string[] = []
    let created = 0
    if (creates.length) {
      const { data, error } = await ctx.supabase.from('pm_stores').insert(creates).select('id')
      if (error) return { ok: false as const, error: error.message }
      created = data?.length ?? 0
    }
    let updated = 0
    const COLUMN: Record<string, string> = {
      address: 'address', city: 'city', county: 'county', state: 'state', postalCode: 'postal_code', region: 'region', facilityManager: 'facility_manager',
      fmPhone: 'fm_phone', fmEmail: 'fm_email', storePhone: 'store_phone', systemType: 'system_type', refrigerant: 'refrigerant', notes: 'notes',
    }
    for (const r of live.filter((x) => x.action === 'update')) {
      const patch: Record<string, unknown> = { updated_by: ctx.userId }
      for (const c of r.changes) {
        if (c.field === 'primaryTech') patch.primary_tech_id = techId.get(techKey(r.values.primaryTech)) ?? null
        else if (c.field === 'secondaryTech') patch.secondary_tech_id = techId.get(techKey(r.values.secondaryTech)) ?? null
        else if (c.field === 'active') patch.is_active = r.values.isActive
        else if (COLUMN[c.field]) patch[COLUMN[c.field]] = r.values[c.field as keyof typeof r.values]
      }
      const { error } = await ctx.supabase.from('pm_stores').update(patch).eq('id', r.storeId!).eq('company_id', ctx.companyId)
      if (error) failed.push(`${r.storeNumber}: ${error.message}`)
      else updated++
    }
    const counts = tally(reviews)
    const result = { created, updated, unchanged: counts.same ?? 0, notImported: counts.error ?? 0, failed }
    await closeBatch(ctx, input.batchId, result)
    if (created + updated > 0) await logPm(ctx.supabase, { companyId: ctx.companyId, actorId: ctx.userId, action: 'import_committed', detail: { kind: 'stores', count: created + updated } })
    revalidatePath(PATH, 'layout')
    return { ok: true as const, ...result }
  } catch (e) { return fail(e) }
}

/* ── Job numbers and PM records ──────────────────────────────────────────── */

export async function commitPmImport(input: {
  batchId?: string | null; kind: Extract<ImportKind, 'job_numbers' | 'pm_records'>; rows: RawRow[]
  defaults: { year: number; quarter: number }; overwrite: boolean; approvedJobRows: number[]
}) {
  try {
    const ctx = await pmCtx('coordinator')
    if (input.rows.length > MAX_ROWS) return { ok: false as const, error: `That is more than ${MAX_ROWS} rows. Split the file.` }
    if (!isQuarter(input.defaults.quarter)) return { ok: false as const, error: 'Pick the quarter to use for rows that do not name one.' }
    const [stores, techs, cycles] = await Promise.all([loadStores(ctx.supabase, ctx.companyId), loadTechs(ctx.supabase, ctx.companyId), loadExistingCycles(ctx)])
    const reviews = reviewPmRows(input.rows, {
      stores: stores.map((s) => ({ id: s.id, storeNumber: s.storeNumber, isActive: s.isActive })), cycles, techs,
      defaults: input.defaults, overwrite: input.overwrite, approvedJobRows: input.approvedJobRows,
    })
    const live = reviews.filter((r) => r.action === 'create' || r.action === 'update')
    const techId = await ensureTechs(ctx, techs, live.map((r) => r.values.technician))
    const storeById = new Map(stores.map((s) => [s.id, s]))
    // Field Work Complete and Completed are refused from a signed-in session
    // by design. A coordinator importing history is the one authorised way in.
    const admin = createAdminClient()
    const writer = (r: PmReview) => (r.values.status === 'completed' || r.values.status === 'field_complete' ? admin : ctx.supabase)

    const failed: string[] = []
    let created = 0
    let updated = 0
    let jobNumbersSet = 0
    for (const r of live) {
      const v = r.values
      const label = `${r.storeNumber} Q${r.quarter} ${r.year}`
      if (r.action === 'create') {
        const store = storeById.get(r.storeId!)
        const row: Record<string, unknown> = {
          company_id: ctx.companyId, store_id: r.storeId, year: r.year, quarter: r.quarter, job_number: v.jobNumber, sc_work_order: v.scWorkOrder,
          job_received_date: v.jobReceivedDate, priority: v.priority, due_date: v.dueDate,
          tech_id: v.technician ? techId.get(techKey(v.technician)) ?? null : store?.primaryTechId ?? null,
          helper_tech_id: store?.secondaryTechId ?? null,
          scheduled_date: v.scheduledDate, actual_start: v.actualStart, actual_end: v.actualEnd, coordinator_notes: v.coordinatorNotes,
          created_by: ctx.userId, updated_by: ctx.userId,
        }
        if (v.status) row.status = v.status
        if (v.status === 'completed') { row.closed_at = new Date().toISOString(); row.closed_by = ctx.userId; row.completion_override_reason = 'Imported as already completed' }
        const { error } = await writer(r).from('pm_cycles').insert(row)
        if (error) failed.push(`${label}: ${error.code === '23505' ? 'a PM for that quarter was added by someone else just now' : error.message}`)
        else { created++; if (v.jobNumber) jobNumbersSet++ }
        continue
      }
      const patch: Record<string, unknown> = { updated_by: ctx.userId }
      for (const c of r.changes) {
        if (c.field === 'jobNumber') patch.job_number = v.jobNumber
        else if (c.field === 'scWorkOrder') patch.sc_work_order = v.scWorkOrder
        else if (c.field === 'jobReceivedDate') patch.job_received_date = v.jobReceivedDate
        else if (c.field === 'priority') patch.priority = v.priority
        else if (c.field === 'dueDate') patch.due_date = v.dueDate
        else if (c.field === 'scheduledDate') patch.scheduled_date = v.scheduledDate
        else if (c.field === 'actualStart') patch.actual_start = v.actualStart
        else if (c.field === 'actualEnd') patch.actual_end = v.actualEnd
        else if (c.field === 'coordinatorNotes') patch.coordinator_notes = v.coordinatorNotes
        else if (c.field === 'technician') patch.tech_id = techId.get(techKey(v.technician)) ?? null
        else if (c.field === 'status') {
          patch.status = v.status
          if (v.status === 'completed') { patch.closed_at = new Date().toISOString(); patch.closed_by = ctx.userId; patch.completion_override_reason = 'Imported as already completed' }
        }
      }
      const { error } = await writer(r).from('pm_cycles').update(patch).eq('id', r.pmId!).eq('company_id', ctx.companyId)
      if (error) failed.push(`${label}: ${error.message}`)
      else { updated++; if (patch.job_number) jobNumbersSet++ }
    }
    if (created > 0) await attachChecklists(ctx.companyId, ctx.userId)
    const counts = tally(reviews)
    const result = { created, updated, jobNumbersSet, unchanged: counts.same ?? 0, conflicts: counts.conflict ?? 0, notImported: counts.error ?? 0, failed }
    await closeBatch(ctx, input.batchId, result)
    if (created + updated > 0) await logPm(ctx.supabase, { companyId: ctx.companyId, actorId: ctx.userId, action: 'import_committed', detail: { kind: input.kind === 'job_numbers' ? 'job numbers' : 'PM records', count: created + updated } })
    revalidatePath(PATH, 'layout')
    return { ok: true as const, ...result }
  } catch (e) { return fail(e) }
}
