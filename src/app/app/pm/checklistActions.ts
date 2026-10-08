'use server'

// The technician's checklist, server side. Answers, readings, and photos are
// written under the caller's own login, so the database decides whether this
// person may work this PM. The calculated progress is recounted here after
// every batch and stored by the server only.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import type { PmPatch, ResponsePatch, SyncOp, SyncResult } from '@/lib/pm/syncQueue'
import { buildLayout } from '@/lib/pm/template'
import { PM_BUCKET, activeTemplate, fail, logPm, mapRow, mapRows, pmCtx, recalcPm, signPaths } from '@/lib/pm/server'
import { PRE_WORK_STATUSES, type CheckResult, type PmAttachment, type PmEquipment, type PmResponse, type PmStatus } from '@/lib/pm/types'

const RESULTS: (CheckResult | null)[] = ['pass', 'fail', 'na', null]
const clip = (s: string | null | undefined, max: number) => { const t = (s ?? '').trim(); return t ? t.slice(0, max) : null }
const today = () => new Date().toISOString().slice(0, 10)

/**
 * Attach the live checklist for the PM's quarter and freeze the data table
 * rows. Done once, when work starts: from then on the PM stays on that
 * checklist version, whatever is published later.
 */
export async function startChecklist(input: { pmId: string }) {
  try {
    const { supabase, companyId, userId } = await pmCtx()
    const { data: can } = await supabase.rpc('pm_can_work', { p_pm: input.pmId })
    if (!can) return { ok: false as const, error: 'This PM is not assigned to you.' }
    const admin = createAdminClient()
    const { data: cycle } = await admin.from('pm_cycles').select('id, store_id, quarter, year, template_version_id').eq('id', input.pmId).eq('company_id', companyId).maybeSingle()
    if (!cycle) return { ok: false as const, error: 'That PM is gone.' }
    if (cycle.template_version_id) return { ok: true as const, already: true }
    const template = await activeTemplate(admin, companyId, cycle.quarter as number)
    if (!template) {
      return { ok: false as const, noTemplate: true, error: `No Q${cycle.quarter} checklist has been published yet. An administrator sets it up under Settings, Checklist Templates.` }
    }
    const { data: eq } = await admin.from('pm_equipment').select('id, kind, label, sort_order, is_active').eq('store_id', cycle.store_id)
    const layout = buildLayout(template.dataTables, mapRows<Pick<PmEquipment, 'id' | 'kind' | 'label' | 'sortOrder' | 'isActive'>>(eq))
    const { error } = await admin.from('pm_cycles').update({ template_version_id: template.id, layout, updated_by: userId }).eq('id', input.pmId).is('template_version_id', null)
    if (error) return { ok: false as const, error: error.message }
    await logPm(admin, { companyId, storeId: cycle.store_id as string, pmId: input.pmId, actorId: userId, action: 'checklist_started', detail: { template: `${template.name} Q${template.quarter}${template.revisionLabel ? `, ${template.revisionLabel}` : ''}` } })
    await recalcPm(companyId, input.pmId, userId)
    revalidatePath(`/app/pm/jobs/${input.pmId}`, 'layout')
    return { ok: true as const, already: false }
  } catch (e) { return fail(e) }
}

/** Rebuild the data table rows from the store's current equipment. Coordinators only, and readings already entered are kept. */
export async function refreshLayout(input: { pmId: string }) {
  try {
    const { companyId, userId } = await pmCtx('coordinator')
    const admin = createAdminClient()
    const { data: cycle } = await admin.from('pm_cycles').select('store_id, template_version_id').eq('id', input.pmId).eq('company_id', companyId).maybeSingle()
    if (!cycle?.template_version_id) return { ok: false as const, error: 'The checklist has not been started.' }
    const [{ data: t }, { data: eq }] = await Promise.all([
      admin.from('pm_template_versions').select('data_tables').eq('id', cycle.template_version_id).single(),
      admin.from('pm_equipment').select('id, kind, label, sort_order, is_active').eq('store_id', cycle.store_id),
    ])
    const layout = buildLayout((t?.data_tables ?? []) as never, mapRows<Pick<PmEquipment, 'id' | 'kind' | 'label' | 'sortOrder' | 'isActive'>>(eq))
    const { error } = await admin.from('pm_cycles').update({ layout, updated_by: userId }).eq('id', input.pmId)
    if (error) return { ok: false as const, error: error.message }
    revalidatePath(`/app/pm/jobs/${input.pmId}`, 'layout')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export interface SyncReply {
  ok: true
  results: SyncResult[]
  /** Fresh rows for the checks this batch touched. */
  responses: PmResponse[]
  status: PmStatus
  counts: { checklistTotal: number; checklistDone: number; docsTotal: number; docsDone: number } | null
}

/**
 * Save a batch of checklist changes. Each op gets its own verdict: saved,
 * in conflict with someone else's change, or refused with a reason. One bad
 * op never sinks the rest.
 */
export async function syncPm(input: { pmId: string; ops: { key: string; op: SyncOp }[] }): Promise<SyncReply | { ok: false; error: string }> {
  try {
    const { supabase, companyId, userId } = await pmCtx()
    const ops = input.ops.slice(0, 400)
    const { data: can } = await supabase.rpc('pm_can_work', { p_pm: input.pmId })
    if (!can) return { ok: false, error: 'This PM is not assigned to you, or it has been closed out.' }
    const { data: cycle } = await supabase.from('pm_cycles').select('id, store_id, status, actual_start, template_version_id').eq('id', input.pmId).eq('company_id', companyId).maybeSingle()
    if (!cycle) return { ok: false, error: 'That PM is gone.' }

    const results: SyncResult[] = []
    const touched = new Set<string>()
    const responseOps = ops.filter((o) => o.op.kind === 'response') as { key: string; op: Extract<SyncOp, { kind: 'response' }> }[]
    const itemIds = responseOps.map((o) => o.op.itemId)
    const existing = new Map<string, Record<string, unknown>>()
    if (itemIds.length) {
      const { data } = await supabase.from('pm_responses').select('*').eq('pm_id', input.pmId).in('item_id', itemIds)
      for (const r of data ?? []) existing.set(r.item_id as string, r)
    }

    for (const { key, op } of responseOps) {
      const patch: ResponsePatch = op.patch ?? {}
      if (patch.result !== undefined && !RESULTS.includes(patch.result)) { results.push({ key, status: 'error', error: 'Pick Pass, Fail, or N/A.' }); continue }
      const row = existing.get(op.itemId)
      // Someone else saved this check since the phone last saw it.
      if (row && !op.force && row.updated_by !== userId && (op.baseRev === null || row.rev !== op.baseRev)) {
        results.push({ key, status: 'conflict', server: mapRow<PmResponse>(row), error: 'Someone else changed this check.' })
        continue
      }
      const next = {
        result: patch.result !== undefined ? patch.result : ((row?.result as CheckResult | null) ?? null),
        measure_value: patch.measureValue !== undefined ? clip(patch.measureValue, 120) : ((row?.measure_value as string | null) ?? null),
        note: patch.note !== undefined ? clip(patch.note, 4000) : ((row?.note as string | null) ?? null),
        na_reason: patch.naReason !== undefined ? clip(patch.naReason, 300) : ((row?.na_reason as string | null) ?? null),
      }
      if (next.result === 'na' && !next.na_reason) { results.push({ key, status: 'error', error: 'Say why this check does not apply.' }); continue }
      const res = row
        ? await supabase.from('pm_responses').update({ ...next, updated_by: userId }).eq('id', row.id as string).select('*').single()
        : await supabase.from('pm_responses').insert({ ...next, company_id: companyId, pm_id: input.pmId, item_id: op.itemId, updated_by: userId }).select('*').single()
      if (res.error || !res.data) {
        // Two phones created the same row at once: the second one is a conflict, not a failure.
        if (res.error?.code === '23505') {
          const { data: again } = await supabase.from('pm_responses').select('*').eq('pm_id', input.pmId).eq('item_id', op.itemId).maybeSingle()
          results.push({ key, status: 'conflict', server: again ? mapRow<PmResponse>(again) : undefined, error: 'Someone else answered this check at the same time.' })
        } else results.push({ key, status: 'error', error: res.error?.message ?? 'Could not save.' })
        continue
      }
      existing.set(op.itemId, res.data)
      touched.add(op.itemId)
      results.push({ key, status: 'ok', rev: res.data.rev as number })
    }

    for (const { key, op } of ops) {
      if (op.kind !== 'reading') continue
      const value = (op.value ?? '').trim().slice(0, 500)
      const where = { pm_id: input.pmId, table_key: op.table, row_key: op.row, col_key: op.col }
      const res = value
        ? await supabase.from('pm_readings').upsert({ ...where, company_id: companyId, value, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'pm_id,table_key,row_key,col_key' })
        : await supabase.from('pm_readings').delete().match(where)
      results.push(res.error ? { key, status: 'error', error: res.error.message } : { key, status: 'ok' })
    }

    // PM-level fields a technician may set. Written by the server, which has
    // already checked the caller may work this PM.
    const admin = createAdminClient()
    for (const { key, op } of ops) {
      if (op.kind !== 'pm') continue
      const p: PmPatch = op.patch ?? {}
      const row: Record<string, unknown> = { updated_by: userId }
      if (p.techNotes !== undefined) row.tech_notes = clip(p.techNotes, 8000)
      if (p.timeIn !== undefined) row.time_in = clip(p.timeIn, 40)
      if (p.timeOut !== undefined) row.time_out = clip(p.timeOut, 40)
      if (p.serviceProvider !== undefined) row.service_provider = clip(p.serviceProvider, 120)
      if (p.returnVisitNeeded !== undefined) row.return_visit_needed = !!p.returnVisitNeeded
      if (p.returnVisitNote !== undefined) row.return_visit_note = clip(p.returnVisitNote, 1000)
      if (p.fmSpotChecked !== undefined) row.fm_spot_checked = p.fmSpotChecked
      if (p.lastItemId !== undefined) row.last_item_id = p.lastItemId
      const { error } = await admin.from('pm_cycles').update(row).eq('id', input.pmId).eq('company_id', companyId)
      results.push(error ? { key, status: 'error', error: error.message } : { key, status: 'ok' })
    }

    // The first answer is what starts a PM.
    let status = cycle.status as PmStatus
    const wrote = results.some((r) => r.status === 'ok' && (r.key.startsWith('r:') || r.key.startsWith('v:')))
    if (wrote && PRE_WORK_STATUSES.includes(status)) {
      const { error } = await admin.from('pm_cycles').update({ status: 'in_progress', actual_start: cycle.actual_start ?? today(), updated_by: userId }).eq('id', input.pmId)
      if (!error) status = 'in_progress'
    }

    const progress = await recalcPm(companyId, input.pmId, userId)
    return {
      ok: true, results, status,
      responses: [...touched].map((id) => mapRow<PmResponse>(existing.get(id)!)),
      counts: progress ? { checklistTotal: progress.checklistTotal, checklistDone: progress.checklistDone, docsTotal: progress.docsTotal, docsDone: progress.docsDone } : null,
    }
  } catch (e) {
    logger.error('pm syncPm', e)
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save.' }
  }
}

/* ── Photos and documents ────────────────────────────────────────────────── */

const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const DOC_TYPES = new Set(['application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/msword', 'text/plain'])
const PHOTO_MAX = 8 * 1024 * 1024
const DOC_MAX = 11 * 1024 * 1024

/**
 * Attach photos or documents to a PM, optionally to one check or one
 * deficiency. The browser shrinks photos first. Files go to private storage
 * under pm/<company>/<pm>/ and are only ever handed out as short-lived links.
 */
export async function uploadPmFiles(form: FormData) {
  try {
    const { supabase, companyId, userId } = await pmCtx()
    const pmId = String(form.get('pmId') ?? '')
    const itemId = String(form.get('itemId') ?? '') || null
    const deficiencyId = String(form.get('deficiencyId') ?? '') || null
    const caption = clip(String(form.get('caption') ?? ''), 300)
    const { data: can } = await supabase.rpc('pm_can_work', { p_pm: pmId })
    if (!can) return { ok: false as const, error: 'This PM is not assigned to you.' }
    const { data: cycle } = await supabase.from('pm_cycles').select('store_id').eq('id', pmId).eq('company_id', companyId).maybeSingle()
    if (!cycle) return { ok: false as const, error: 'That PM is gone.' }
    const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
    if (!files.length) return { ok: false as const, error: 'Nothing to upload.' }
    if (files.length > 12) return { ok: false as const, error: 'Twelve files at a time at most.' }

    const admin = createAdminClient()
    const out: PmAttachment[] = []
    for (const f of files) {
      const photo = PHOTO_TYPES.has(f.type)
      if (!photo && !DOC_TYPES.has(f.type)) return { ok: false as const, error: `${f.name} is not a photo or a document type that can be attached.` }
      if (f.size > (photo ? PHOTO_MAX : DOC_MAX)) return { ok: false as const, error: `${f.name} is too large (${photo ? '8' : '11'} MB limit).` }
      const ext = (f.name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || (photo ? 'jpg' : 'bin')
      const path = `pm/${companyId}/${pmId}/${crypto.randomUUID()}.${ext}`
      const up = await admin.storage.from(PM_BUCKET).upload(path, f, { contentType: f.type, upsert: false })
      if (up.error) return { ok: false as const, error: up.error.message }
      const { data, error } = await supabase.from('pm_attachments').insert({
        company_id: companyId, store_id: cycle.store_id, pm_id: pmId, item_id: itemId, deficiency_id: deficiencyId,
        kind: photo ? 'photo' : 'document', path, name: f.name.slice(0, 200), mime: f.type, size_bytes: f.size, caption, uploaded_by: userId,
      }).select('*').single()
      if (error || !data) {
        await admin.storage.from(PM_BUCKET).remove([path])
        return { ok: false as const, error: error?.message ?? 'Could not attach the file.' }
      }
      out.push(mapRow<PmAttachment>(data))
    }
    const urls = await signPaths(out.map((a) => a.path), companyId)
    const counts = itemId ? await recalcPm(companyId, pmId, userId) : null
    return {
      ok: true as const,
      attachments: out.map((a) => ({ ...a, url: urls[a.path] ?? null })),
      counts: counts ? { checklistTotal: counts.checklistTotal, checklistDone: counts.checklistDone, docsTotal: counts.docsTotal, docsDone: counts.docsDone } : null,
    }
  } catch (e) { return fail(e) }
}

export async function deletePmAttachment(input: { id: string }) {
  try {
    const { supabase, companyId, userId } = await pmCtx()
    const { data: row } = await supabase.from('pm_attachments').select('id, path, pm_id, item_id').eq('id', input.id).eq('company_id', companyId).maybeSingle()
    if (!row) return { ok: false as const, error: 'That file is already gone.' }
    const { data: gone, error } = await supabase.from('pm_attachments').delete().eq('id', input.id).select('id')
    if (error) return { ok: false as const, error: error.message }
    if (!gone?.length) return { ok: false as const, error: 'Only the person who added it, or a coordinator, can remove it.' }
    await createAdminClient().storage.from(PM_BUCKET).remove([row.path as string])
    if (row.pm_id && row.item_id) await recalcPm(companyId, row.pm_id as string, userId)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}
