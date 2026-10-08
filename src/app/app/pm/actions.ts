'use server'

// Preventative Maintenance: the store directory, technicians, equipment, and
// the quarterly PM records. Every write here goes out under the caller's own
// login, so the database's row level security and guard triggers are what
// actually decide whether it is allowed. The role checks up front only make
// the error messages friendlier.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { completionGaps, fieldCompleteGaps } from '@/lib/pm/progress'
import { isIsoDate, isQuarter } from '@/lib/pm/quarters'
import { fail, loadPmBundle, logPm, notifyPm, pmCtx, recalcPm, techProfileId } from '@/lib/pm/server'
import {
  MANUAL_STATUSES, PRIORITIES, STATUS_LABEL, SYSTEM_TYPES,
  type EquipmentKind, type PmStatus, type SystemType,
} from '@/lib/pm/types'

const PATH = '/app/pm'
const clean = (s: string | null | undefined) => { const t = (s ?? '').trim(); return t ? t : null }
const pmLink = (id: string) => `/app/pm/jobs/${id}`

/* ── Technicians ─────────────────────────────────────────────────────────── */

export async function saveTech(input: { id?: string; name: string; profileId?: string | null; employeeId?: string | null; phone?: string | null; email?: string | null; isActive?: boolean }) {
  try {
    const { supabase, companyId } = await pmCtx('coordinator')
    const name = clean(input.name)
    if (!name) return { ok: false as const, error: 'A technician needs a name.' }
    const row = {
      company_id: companyId, name, profile_id: input.profileId || null, ...(input.employeeId !== undefined ? { employee_id: input.employeeId || null } : {}),
      phone: clean(input.phone), email: clean(input.email), is_active: input.isActive ?? true,
    }
    const res = input.id
      ? await supabase.from('pm_techs').update(row).eq('id', input.id).eq('company_id', companyId).select('id').single()
      : await supabase.from('pm_techs').insert(row).select('id').single()
    if (res.error) return { ok: false as const, error: res.error.code === '23505' ? `There is already a technician named ${name}.` : res.error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true as const, id: res.data.id as string }
  } catch (e) { return fail(e) }
}

/* ── Stores ──────────────────────────────────────────────────────────────── */

export interface StoreInput {
  id?: string
  storeNumber: string
  address?: string | null; city?: string | null; county?: string | null; state?: string | null; postalCode?: string | null
  region?: string | null; facilityManager?: string | null; fmPhone?: string | null; fmEmail?: string | null
  storePhone?: string | null; contactNotes?: string | null
  primaryTechId?: string | null; secondaryTechId?: string | null
  systemType?: string | null; refrigerant?: string | null; notes?: string | null; isActive?: boolean
}

export async function saveStore(input: StoreInput) {
  try {
    const { supabase, companyId, userId } = await pmCtx('coordinator')
    const storeNumber = clean(input.storeNumber)
    if (!storeNumber) return { ok: false as const, error: 'A store needs its store number.' }
    const system = input.systemType && (SYSTEM_TYPES as string[]).includes(input.systemType) ? (input.systemType as SystemType) : null
    const row = {
      company_id: companyId, store_number: storeNumber,
      address: clean(input.address), city: clean(input.city), county: clean(input.county), state: clean(input.state), postal_code: clean(input.postalCode),
      region: clean(input.region), facility_manager: clean(input.facilityManager), fm_phone: clean(input.fmPhone), fm_email: clean(input.fmEmail),
      store_phone: clean(input.storePhone), contact_notes: clean(input.contactNotes),
      primary_tech_id: input.primaryTechId || null, secondary_tech_id: input.secondaryTechId || null,
      system_type: system, refrigerant: clean(input.refrigerant), notes: clean(input.notes), is_active: input.isActive ?? true, updated_by: userId,
    }
    const res = input.id
      ? await supabase.from('pm_stores').update(row).eq('id', input.id).eq('company_id', companyId).select('id').single()
      : await supabase.from('pm_stores').insert({ ...row, created_by: userId }).select('id').single()
    if (res.error) return { ok: false as const, error: res.error.code === '23505' ? `Store ${storeNumber} is already in the directory.` : res.error.message }
    // A store's refrigerant decides which checks apply, so open PMs recount.
    if (input.id) {
      const { data: open } = await supabase.from('pm_cycles').select('id').eq('store_id', input.id).not('status', 'in', '(completed,cancelled)').not('template_version_id', 'is', null)
      for (const c of open ?? []) await recalcPm(companyId, c.id as string, userId)
    }
    revalidatePath(PATH, 'layout')
    return { ok: true as const, id: res.data.id as string }
  } catch (e) { return fail(e) }
}

export async function setStoreActive(input: { id: string; isActive: boolean }) {
  try {
    const { supabase, companyId, userId } = await pmCtx('coordinator')
    const { error } = await supabase.from('pm_stores').update({ is_active: input.isActive, updated_by: userId }).eq('id', input.id).eq('company_id', companyId)
    if (error) return { ok: false as const, error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/* ── Equipment and exclusions ────────────────────────────────────────────── */

const KINDS: EquipmentKind[] = ['circuit', 'compressor', 'hvac_compressor', 'condenser', 'rack', 'walk_in', 'case', 'hvac_unit', 'spot_merchandiser', 'other']

export async function saveEquipment(input: { id?: string; storeId: string; kind: string; label: string; manufacturer?: string | null; model?: string | null; serialNumber?: string | null; refrigerant?: string | null; notes?: string | null; sortOrder?: number; isActive?: boolean }) {
  try {
    const { supabase, companyId } = await pmCtx('coordinator')
    const label = clean(input.label)
    if (!label) return { ok: false as const, error: 'Give the equipment a name.' }
    if (!(KINDS as string[]).includes(input.kind)) return { ok: false as const, error: 'Pick what kind of equipment it is.' }
    const row = {
      company_id: companyId, store_id: input.storeId, kind: input.kind, label,
      manufacturer: clean(input.manufacturer), model: clean(input.model), serial_number: clean(input.serialNumber),
      refrigerant: clean(input.refrigerant), notes: clean(input.notes), sort_order: input.sortOrder ?? 0, is_active: input.isActive ?? true,
    }
    const res = input.id
      ? await supabase.from('pm_equipment').update(row).eq('id', input.id).eq('company_id', companyId)
      : await supabase.from('pm_equipment').insert(row)
    if (res.error) return { ok: false as const, error: res.error.message }
    revalidatePath(`${PATH}/stores/${input.storeId}`)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function deleteEquipment(input: { id: string; storeId: string }) {
  try {
    const { supabase, companyId } = await pmCtx('coordinator')
    const { error } = await supabase.from('pm_equipment').delete().eq('id', input.id).eq('company_id', companyId)
    if (error) return { ok: false as const, error: error.message }
    revalidatePath(`${PATH}/stores/${input.storeId}`)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/** "This check never applies at this store." Always with a reason. */
export async function saveExclusion(input: { storeId: string; itemCode: string; reason: string; equipmentId?: string | null }) {
  try {
    const { supabase, companyId, userId } = await pmCtx('coordinator')
    const code = clean(input.itemCode)?.toUpperCase()
    const reason = clean(input.reason)
    if (!code) return { ok: false as const, error: 'Pick the check to exclude.' }
    if (!reason) return { ok: false as const, error: 'Say why it does not apply at this store.' }
    const { error } = await supabase.from('pm_store_exclusions').upsert(
      { company_id: companyId, store_id: input.storeId, item_code: code, reason, equipment_id: input.equipmentId || null, created_by: userId },
      { onConflict: 'store_id,item_code' },
    )
    if (error) return { ok: false as const, error: error.message }
    await logPm(supabase, { companyId, storeId: input.storeId, actorId: userId, action: 'exclusion_added', detail: { item: code, reason } })
    await recountStore(companyId, input.storeId, userId)
    revalidatePath(`${PATH}/stores/${input.storeId}`)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function deleteExclusion(input: { id: string; storeId: string }) {
  try {
    const { supabase, companyId, userId } = await pmCtx('coordinator')
    const { data: row } = await supabase.from('pm_store_exclusions').select('item_code').eq('id', input.id).maybeSingle()
    const { error } = await supabase.from('pm_store_exclusions').delete().eq('id', input.id).eq('company_id', companyId)
    if (error) return { ok: false as const, error: error.message }
    await logPm(supabase, { companyId, storeId: input.storeId, actorId: userId, action: 'exclusion_removed', detail: { item: row?.item_code } })
    await recountStore(companyId, input.storeId, userId)
    revalidatePath(`${PATH}/stores/${input.storeId}`)
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/** Open PMs at a store recount when what applies there changes. Closed ones keep their numbers. */
async function recountStore(companyId: string, storeId: string, userId: string) {
  const { data } = await createAdminClient().from('pm_cycles').select('id').eq('store_id', storeId).eq('company_id', companyId)
    .not('status', 'in', '(completed,cancelled)').not('template_version_id', 'is', null)
  for (const c of data ?? []) await recalcPm(companyId, c.id as string, userId)
}

/* ── Quarterly PM records ────────────────────────────────────────────────── */

export async function createCycle(input: { storeId: string; year: number; quarter: number; jobNumber?: string | null }) {
  try {
    const { supabase, companyId, userId } = await pmCtx('coordinator')
    if (!isQuarter(input.quarter) || !Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) return { ok: false as const, error: 'Pick a year and a quarter.' }
    const { data: store } = await supabase.from('pm_stores').select('id, primary_tech_id, secondary_tech_id').eq('id', input.storeId).eq('company_id', companyId).maybeSingle()
    if (!store) return { ok: false as const, error: 'That store is gone.' }
    const { data, error } = await supabase.from('pm_cycles').insert({
      company_id: companyId, store_id: store.id, year: input.year, quarter: input.quarter, job_number: clean(input.jobNumber),
      tech_id: store.primary_tech_id, helper_tech_id: store.secondary_tech_id, created_by: userId, updated_by: userId,
    }).select('id').single()
    if (error?.code === '23505') {
      // Already there: hand back the existing record instead of making a twin.
      const { data: existing } = await supabase.from('pm_cycles').select('id').eq('store_id', store.id).eq('year', input.year).eq('quarter', input.quarter).single()
      return { ok: true as const, id: existing?.id as string, existed: true }
    }
    if (error || !data) return { ok: false as const, error: error?.message ?? 'Could not create the PM.' }
    revalidatePath(PATH, 'layout')
    return { ok: true as const, id: data.id as string, existed: false }
  } catch (e) { return fail(e) }
}

/**
 * Open the quarter: one PM record for every active store that does not have
 * one yet. Stores that already have a record are left alone, so running it
 * again is safe. New records start as Awaiting Job Number.
 */
export async function generateQuarter(input: { year: number; quarter: number }) {
  try {
    const { supabase, companyId, userId } = await pmCtx('coordinator')
    if (!isQuarter(input.quarter)) return { ok: false as const, error: 'Pick a quarter.' }
    const [{ data: stores }, { data: existing }] = await Promise.all([
      supabase.from('pm_stores').select('id, primary_tech_id, secondary_tech_id').eq('company_id', companyId).eq('is_active', true),
      supabase.from('pm_cycles').select('store_id').eq('company_id', companyId).eq('year', input.year).eq('quarter', input.quarter),
    ])
    const have = new Set((existing ?? []).map((c) => c.store_id as string))
    const rows = (stores ?? []).filter((s) => !have.has(s.id as string)).map((s) => ({
      company_id: companyId, store_id: s.id, year: input.year, quarter: input.quarter,
      tech_id: s.primary_tech_id, helper_tech_id: s.secondary_tech_id, created_by: userId, updated_by: userId,
    }))
    if (rows.length) {
      const { error } = await supabase.from('pm_cycles').upsert(rows, { onConflict: 'store_id,year,quarter', ignoreDuplicates: true })
      if (error) return { ok: false as const, error: error.message }
    }
    revalidatePath(PATH, 'layout')
    return { ok: true as const, created: rows.length, skipped: have.size }
  } catch (e) { return fail(e) }
}

export interface CyclePatch {
  jobNumber?: string | null
  scWorkOrder?: string | null
  jobReceivedDate?: string | null
  priority?: string | null
  dueDate?: string | null
  techId?: string | null
  helperTechId?: string | null
  scheduledDate?: string | null
  actualStart?: string | null
  actualEnd?: string | null
  status?: PmStatus
  statusNote?: string | null
  coordinatorNotes?: string | null
  techNotes?: string | null
  returnVisitNeeded?: boolean
  returnVisitNote?: string | null
  submittedOn?: string | null
  serviceProvider?: string | null
  timeIn?: string | null
  timeOut?: string | null
  fmSpotChecked?: boolean | null
}

function patchToRow(p: CyclePatch): Record<string, unknown> | string {
  const row: Record<string, unknown> = {}
  const text = (k: keyof CyclePatch, col: string) => { if (p[k] !== undefined) row[col] = clean(p[k] as string | null) }
  const date = (k: keyof CyclePatch, col: string): string | null => {
    if (p[k] === undefined) return null
    const v = p[k] as string | null
    if (v && !isIsoDate(v)) return `That ${col.replace(/_/g, ' ')} is not a date.`
    row[col] = v || null
    return null
  }
  text('jobNumber', 'job_number'); text('scWorkOrder', 'sc_work_order'); text('statusNote', 'status_note')
  text('coordinatorNotes', 'coordinator_notes'); text('techNotes', 'tech_notes'); text('returnVisitNote', 'return_visit_note')
  text('serviceProvider', 'service_provider'); text('timeIn', 'time_in'); text('timeOut', 'time_out')
  for (const [k, col] of [['jobReceivedDate', 'job_received_date'], ['dueDate', 'due_date'], ['scheduledDate', 'scheduled_date'],
    ['actualStart', 'actual_start'], ['actualEnd', 'actual_end'], ['submittedOn', 'submitted_on']] as const) {
    const bad = date(k, col)
    if (bad) return bad
  }
  if (p.priority !== undefined) {
    if (p.priority && !PRIORITIES.some((x) => x.key === p.priority)) return 'Pick a priority from P1 to P7.'
    row.priority = p.priority || null
  }
  if (p.techId !== undefined) row.tech_id = p.techId || null
  if (p.helperTechId !== undefined) row.helper_tech_id = p.helperTechId || null
  if (p.returnVisitNeeded !== undefined) row.return_visit_needed = !!p.returnVisitNeeded
  if (p.fmSpotChecked !== undefined) row.fm_spot_checked = p.fmSpotChecked
  if (p.status !== undefined) {
    if (!MANUAL_STATUSES.includes(p.status)) return `${STATUS_LABEL[p.status] ?? 'That status'} is set from the PM itself, once its checks pass.`
    row.status = p.status
  }
  return row
}

export async function updateCycle(input: { id: string; patch: CyclePatch; allowDuplicateJob?: boolean }) {
  try {
    const { supabase, companyId, userId, userName, isAdmin } = await pmCtx('coordinator')
    const row = patchToRow(input.patch)
    if (typeof row === 'string') return { ok: false as const, error: row }
    if (!Object.keys(row).length) return { ok: true as const }
    const { data: before } = await supabase.from('pm_cycles')
      .select('id, store_id, year, quarter, job_number, tech_id, status, return_visit_needed, submitted_on, pm_stores(store_number)')
      .eq('id', input.id).eq('company_id', companyId).maybeSingle()
    if (!before) return { ok: false as const, error: 'That PM is gone.' }
    const storeNumber = (before.pm_stores as unknown as { store_number?: string } | null)?.store_number ?? ''

    // The same Kalos job number on two PMs is almost always a typo.
    const job = row.job_number as string | null | undefined
    if (job && job !== before.job_number) {
      const { data: clash } = await supabase.from('pm_cycles').select('id, year, quarter, pm_stores(store_number)')
        .eq('company_id', companyId).eq('job_number', job).neq('id', input.id).limit(1)
      if (clash?.length && !(input.allowDuplicateJob && isAdmin)) {
        const other = clash[0]
        const where = `${(other.pm_stores as unknown as { store_number?: string } | null)?.store_number ?? 'another store'} Q${other.quarter} ${other.year}`
        return { ok: false as const, error: `Job number ${job} is already on ${where}.`, duplicateJob: { pmId: other.id as string, where, canOverride: isAdmin } }
      }
    }
    // Recording the submission date moves the PM along with it.
    if (row.submitted_on && !before.submitted_on && row.status === undefined && ['field_complete', 'pending_documentation'].includes(before.status as string)) {
      row.status = 'submitted'
      row.submitted_by = userId
    }
    const { error } = await supabase.from('pm_cycles').update(row).eq('id', input.id).eq('company_id', companyId)
    if (error) return { ok: false as const, error: error.message }

    const label = `${storeNumber} Q${before.quarter} ${before.year}`
    if (row.tech_id && row.tech_id !== before.tech_id) {
      const to = await techProfileId(supabase, row.tech_id as string)
      await notifyPm({ companyId, rule: 'assigned', actorId: userId, coordinators: false, profileIds: [to], title: `PM assigned to you: ${label}`, body: `${userName} assigned you the ${label} PM.`, link: pmLink(input.id) })
    }
    if (row.return_visit_needed === true && !before.return_visit_needed) {
      await notifyPm({ companyId, rule: 'blocked', actorId: userId, title: `Return visit needed: ${label}`, body: (row.return_visit_note as string | null) ?? null, link: pmLink(input.id) })
    }
    if (row.tech_notes !== undefined) await recalcPm(companyId, input.id, userId)
    revalidatePath(PATH, 'layout')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/** Bulk assign, schedule, or set due dates and priority on many PMs at once. */
export async function bulkUpdateCycles(input: { ids: string[]; patch: Pick<CyclePatch, 'techId' | 'helperTechId' | 'scheduledDate' | 'dueDate' | 'priority'> }) {
  try {
    const { supabase, companyId } = await pmCtx('coordinator')
    const ids = [...new Set(input.ids)].slice(0, 500)
    if (!ids.length) return { ok: false as const, error: 'Select at least one PM.' }
    const row = patchToRow(input.patch)
    if (typeof row === 'string') return { ok: false as const, error: row }
    if (!Object.keys(row).length) return { ok: false as const, error: 'Pick something to change.' }
    const { data, error } = await supabase.from('pm_cycles').update(row).in('id', ids).eq('company_id', companyId)
      .not('status', 'in', '(completed,cancelled)').select('id')
    if (error) return { ok: false as const, error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true as const, changed: data?.length ?? 0, skipped: ids.length - (data?.length ?? 0) }
  } catch (e) { return fail(e) }
}

/** Administrators only: move a PM to another quarter, to fix one entered against the wrong one. */
export async function moveCycle(input: { id: string; year: number; quarter: number }) {
  try {
    const { supabase, companyId } = await pmCtx('admin')
    if (!isQuarter(input.quarter)) return { ok: false as const, error: 'Pick a quarter.' }
    const { error } = await supabase.from('pm_cycles').update({ year: input.year, quarter: input.quarter }).eq('id', input.id).eq('company_id', companyId)
    if (error) return { ok: false as const, error: error.code === '23505' ? `That store already has a Q${input.quarter} ${input.year} PM.` : error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function deleteCycle(input: { id: string }) {
  try {
    const { supabase, companyId } = await pmCtx('admin')
    const { error } = await supabase.from('pm_cycles').delete().eq('id', input.id).eq('company_id', companyId)
    if (error) return { ok: false as const, error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/* ── The two statuses with rules behind them ─────────────────────────────── */

/**
 * Field Work Complete. Allowed for the assigned technician or a coordinator,
 * and only once nothing is left that has to be done at the store.
 */
export async function markFieldComplete(input: { id: string }) {
  try {
    const { supabase, companyId, userId, userName } = await pmCtx()
    const { data: can } = await supabase.rpc('pm_can_work', { p_pm: input.id })
    if (!can) return { ok: false as const, error: 'This PM is not assigned to you.' }
    await recalcPm(companyId, input.id, userId)
    const admin = createAdminClient()
    const b = await loadPmBundle(admin, companyId, input.id)
    if (!b) return { ok: false as const, error: 'That PM is gone.' }
    if (!b.cycle.templateVersionId) return { ok: false as const, error: 'The checklist has not been started.' }
    const gaps = fieldCompleteGaps(b.progress, b.cycle, b.rules)
    if (gaps.length) return { ok: false as const, error: 'Not ready to call field work complete yet.', gaps }
    const today = new Date().toISOString().slice(0, 10)
    const { error } = await admin.from('pm_cycles').update({
      status: 'field_complete', field_completed_at: new Date().toISOString(), field_completed_by: userId,
      actual_end: b.cycle.actualEnd ?? today, actual_start: b.cycle.actualStart ?? today, updated_by: userId,
    }).eq('id', input.id).eq('company_id', companyId)
    if (error) return { ok: false as const, error: error.message }
    await notifyPm({
      companyId, rule: 'readyForCloseout', actorId: userId,
      title: `Field work complete: ${b.store.storeNumber} Q${b.cycle.quarter} ${b.cycle.year}`,
      body: `${userName} finished the field work. ${b.progress.failsUnlinked ? `${b.progress.failsUnlinked} failed check(s) still need writing up.` : 'Ready for documentation.'}`,
      link: pmLink(input.id),
    })
    revalidatePath(PATH, 'layout')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/** What stands between this PM and Completed, per the completion rules. */
export async function getCompletionGaps(input: { id: string }) {
  try {
    const { supabase, companyId } = await pmCtx()
    const b = await loadPmBundle(supabase, companyId, input.id)
    if (!b) return { ok: false as const, error: 'That PM is gone.' }
    const gaps = b.cycle.templateVersionId
      ? completionGaps(b.progress, { ...b.cycle, reportCount: b.reportCount }, b.rules)
      : ['The checklist has not been started']
    return { ok: true as const, gaps }
  } catch (e) { return fail(e) }
}

/**
 * Completed. Ticking every box is not enough: the completion rules are
 * checked here, on the server, and the database will not accept this status
 * from anywhere else. An administrator can close a PM that fails the rules,
 * but only with a written reason, which goes on the trail.
 */
export async function completePm(input: { id: string; overrideReason?: string | null }) {
  try {
    const { companyId, userId, isAdmin } = await pmCtx('coordinator')
    await recalcPm(companyId, input.id, userId)
    const admin = createAdminClient()
    const b = await loadPmBundle(admin, companyId, input.id)
    if (!b) return { ok: false as const, error: 'That PM is gone.' }
    if (b.cycle.status === 'completed') return { ok: true as const }
    const gaps = b.cycle.templateVersionId
      ? completionGaps(b.progress, { ...b.cycle, reportCount: b.reportCount }, b.rules)
      : ['The checklist has not been started']
    const reason = clean(input.overrideReason)
    if (gaps.length) {
      if (!reason) return { ok: false as const, error: 'This PM does not meet the completion rules yet.', gaps, canOverride: isAdmin }
      if (!isAdmin) return { ok: false as const, error: 'Only an administrator can close a PM that does not meet the completion rules.', gaps, canOverride: false }
    }
    const { error } = await admin.from('pm_cycles').update({
      status: 'completed', closed_at: new Date().toISOString(), closed_by: userId,
      completion_override_reason: gaps.length ? `${reason} (unmet: ${gaps.join('; ')})` : null, updated_by: userId,
    }).eq('id', input.id).eq('company_id', companyId)
    if (error) return { ok: false as const, error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/** Put a closed or field-complete PM back in progress. Nothing recorded is lost. */
export async function reopenPm(input: { id: string; reason: string }) {
  try {
    const { supabase, companyId } = await pmCtx('coordinator')
    const reason = clean(input.reason)
    if (!reason) return { ok: false as const, error: 'Say why it is being reopened.' }
    const { error } = await supabase.from('pm_cycles').update({ status: 'in_progress', status_note: reason, closed_at: null, closed_by: null })
      .eq('id', input.id).eq('company_id', companyId)
    if (error) return { ok: false as const, error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}
