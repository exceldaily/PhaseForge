'use server'

// Materials and deficiencies. A technician raises them from the PM they are
// working; a coordinator carries them through ordering, proposals, and
// repair. The database guards which fields each of them may change.

import { revalidatePath } from 'next/cache'
import { isIsoDate } from '@/lib/pm/quarters'
import { fail, mapMaterial, mapRow, notifyPm, pmCtx, recalcPm, techProfileId } from '@/lib/pm/server'
import {
  MATERIAL_STATUSES, MATERIAL_STATUS_LABEL, REPAIR_STATUSES, SEVERITIES,
  type MaterialCategory, type MaterialStatus, type PmDeficiency, type ProposalStatus, type RepairStatus, type Severity,
} from '@/lib/pm/types'

const PATH = '/app/pm'
const clean = (s: string | null | undefined, max = 2000) => { const t = (s ?? '').trim(); return t ? t.slice(0, max) : null }
const dateOrNull = (s: string | null | undefined): string | null | undefined => (s === undefined ? undefined : s && isIsoDate(s) ? s : null)
const pmLink = (id: string, hash: string) => `/app/pm/jobs/${id}#${hash}`

type Db = Awaited<ReturnType<typeof pmCtx>>['supabase']

async function pmLabel(supabase: Db, pmId: string) {
  const { data } = await supabase.from('pm_cycles').select('year, quarter, tech_id, waiting_filters, waiting_parts, pm_stores(store_number)').eq('id', pmId).maybeSingle()
  const store = (data?.pm_stores as unknown as { store_number?: string } | null)?.store_number ?? 'Store'
  return { label: data ? `${store} Q${data.quarter} ${data.year}` : store, techId: (data?.tech_id as string | null) ?? null, waiting: !!(data?.waiting_filters || data?.waiting_parts) }
}

/* ── Materials ───────────────────────────────────────────────────────────── */

export interface MaterialInput {
  id?: string
  pmId: string
  category?: MaterialCategory
  name: string
  partNumber?: string | null
  quantity?: number
  unitLabel?: string | null
  equipmentId?: string | null
  itemId?: string | null
  notes?: string | null
  // Coordinator fields
  status?: MaterialStatus
  vendor?: string | null
  poNumber?: string | null
  orderedDate?: string | null
  etaDate?: string | null
  receivedDate?: string | null
  installedDate?: string | null
}

export async function saveMaterial(input: MaterialInput) {
  try {
    const { supabase, companyId, userId, userName, isCoordinator } = await pmCtx()
    const name = clean(input.name, 200)
    if (!name) return { ok: false as const, error: 'Say what is needed.' }
    const quantity = Number(input.quantity ?? 1)
    if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false as const, error: 'Quantity has to be more than zero.' }
    if (input.status && !MATERIAL_STATUSES.includes(input.status)) return { ok: false as const, error: 'That is not a material status.' }
    const before = await pmLabel(supabase, input.pmId)

    const row: Record<string, unknown> = {
      category: input.category ?? 'part', name, part_number: clean(input.partNumber, 120), quantity,
      unit_label: clean(input.unitLabel, 200), equipment_id: input.equipmentId || null, notes: clean(input.notes),
    }
    if (input.itemId !== undefined) row.item_id = input.itemId || null
    if (isCoordinator) {
      if (input.status) row.status = input.status
      if (input.vendor !== undefined) row.vendor = clean(input.vendor, 200)
      if (input.poNumber !== undefined) row.po_number = clean(input.poNumber, 120)
      for (const [k, col] of [['orderedDate', 'ordered_date'], ['etaDate', 'eta_date'], ['receivedDate', 'received_date'], ['installedDate', 'installed_date']] as const) {
        const v = dateOrNull(input[k])
        if (v !== undefined) row[col] = v
      }
    }
    let prevStatus: MaterialStatus | null = null
    if (input.id) {
      const { data: prev } = await supabase.from('pm_materials').select('status').eq('id', input.id).maybeSingle()
      prevStatus = (prev?.status as MaterialStatus | undefined) ?? null
    }
    const res = input.id
      ? await supabase.from('pm_materials').update(row).eq('id', input.id).eq('company_id', companyId).select('*').single()
      : await supabase.from('pm_materials').insert({ ...row, company_id: companyId, pm_id: input.pmId, requested_by: userId }).select('*').single()
    if (res.error || !res.data) return { ok: false as const, error: res.error?.message ?? 'Could not save the request.' }
    const material = mapMaterial(res.data)

    if (!input.id) {
      // The first open request is what puts a PM into "waiting on".
      if (!before.waiting) {
        await notifyPm({ companyId, rule: 'blocked', actorId: userId, title: `${material.category === 'filter' ? 'Waiting on filters' : 'Waiting on parts'}: ${before.label}`, body: `${userName} requested ${material.quantity} x ${material.name}.`, link: pmLink(input.pmId, 'materials') })
      }
    } else if (prevStatus !== material.status) await notifyStatus(supabase, companyId, userId, input.pmId, before, material.name, material.status)
    revalidatePath(PATH, 'layout')
    return { ok: true as const, material }
  } catch (e) { return fail(e) }
}

async function notifyStatus(supabase: Db, companyId: string, userId: string, pmId: string, pm: { label: string; techId: string | null }, name: string, status: MaterialStatus) {
  if (status === 'received' || status === 'partially_received') {
    const tech = await techProfileId(supabase, pm.techId)
    await notifyPm({ companyId, rule: 'materialsReceived', actorId: userId, profileIds: [tech], title: `${status === 'received' ? 'Received' : 'Partly received'}: ${name}`, body: `For ${pm.label}. Ready to be installed.`, link: pmLink(pmId, 'materials') })
  } else if (status === 'backordered') {
    await notifyPm({ companyId, rule: 'materialsDelayed', actorId: userId, title: `Backordered: ${name}`, body: `For ${pm.label}.`, link: pmLink(pmId, 'materials') })
  }
}

/** One-tap status change: Ordered, Received, Installed, and so on. The database fills in the matching date. */
export async function setMaterialStatus(input: { id: string; status: MaterialStatus }) {
  try {
    const { supabase, companyId, userId } = await pmCtx()
    if (!MATERIAL_STATUSES.includes(input.status)) return { ok: false as const, error: 'That is not a material status.' }
    const { data: prev } = await supabase.from('pm_materials').select('pm_id, name, status').eq('id', input.id).eq('company_id', companyId).maybeSingle()
    if (!prev) return { ok: false as const, error: 'That request is gone.' }
    if (prev.status === input.status) return { ok: true as const }
    const { data, error } = await supabase.from('pm_materials').update({ status: input.status }).eq('id', input.id).eq('company_id', companyId).select('*').single()
    if (error || !data) return { ok: false as const, error: error?.message ?? `Could not mark it ${MATERIAL_STATUS_LABEL[input.status]}.` }
    await notifyStatus(supabase, companyId, userId, prev.pm_id as string, await pmLabel(supabase, prev.pm_id as string), prev.name as string, input.status)
    revalidatePath(PATH, 'layout')
    return { ok: true as const, material: mapMaterial(data) }
  } catch (e) { return fail(e) }
}

export async function deleteMaterial(input: { id: string }) {
  try {
    const { supabase, companyId } = await pmCtx('coordinator')
    const { error } = await supabase.from('pm_materials').delete().eq('id', input.id).eq('company_id', companyId)
    if (error) return { ok: false as const, error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/* ── Deficiencies ────────────────────────────────────────────────────────── */

export interface DeficiencyInput {
  id?: string
  pmId?: string | null
  storeId?: string | null
  itemId?: string | null
  itemCode?: string | null
  equipmentId?: string | null
  equipmentLabel?: string | null
  description: string
  severity?: Severity
  recommendedRepair?: string | null
  proposalRequired?: boolean
  returnVisitRequired?: boolean
  affectsPm?: boolean
  // Coordinator fields
  proposalStatus?: ProposalStatus
  proposalSubmittedDate?: string | null
  followupJobNumber?: string | null
  repairStatus?: RepairStatus
  resolutionNote?: string | null
}

export async function saveDeficiency(input: DeficiencyInput) {
  try {
    const { supabase, companyId, userId, userName, isCoordinator } = await pmCtx()
    const description = clean(input.description, 4000)
    if (!description) return { ok: false as const, error: 'Describe the problem.' }
    if (input.severity && !SEVERITIES.includes(input.severity)) return { ok: false as const, error: 'Pick a severity.' }
    if (input.repairStatus && !REPAIR_STATUSES.includes(input.repairStatus)) return { ok: false as const, error: 'That is not a repair status.' }
    if (!input.id && !input.pmId && !input.storeId) return { ok: false as const, error: 'A deficiency belongs to a store.' }

    const row: Record<string, unknown> = {
      description, severity: input.severity ?? 'medium', recommended_repair: clean(input.recommendedRepair),
      proposal_required: !!input.proposalRequired, return_visit_required: !!input.returnVisitRequired, affects_pm: !!input.affectsPm,
      equipment_id: input.equipmentId || null, equipment_label: clean(input.equipmentLabel, 200),
    }
    if (isCoordinator) {
      if (input.proposalStatus) row.proposal_status = input.proposalStatus
      const submitted = dateOrNull(input.proposalSubmittedDate)
      if (submitted !== undefined) row.proposal_submitted_date = submitted
      if (input.followupJobNumber !== undefined) row.followup_job_number = clean(input.followupJobNumber, 120)
      if (input.repairStatus) row.repair_status = input.repairStatus
      if (input.resolutionNote !== undefined) row.resolution_note = clean(input.resolutionNote)
    }
    const res = input.id
      ? await supabase.from('pm_deficiencies').update(row).eq('id', input.id).eq('company_id', companyId).select('*').single()
      : await supabase.from('pm_deficiencies').insert({
        ...row, company_id: companyId, pm_id: input.pmId || null, store_id: input.storeId || undefined,
        item_id: input.itemId || null, item_code: clean(input.itemCode, 40), created_by: userId,
      }).select('*').single()
    if (res.error || !res.data) return { ok: false as const, error: res.error?.message ?? 'Could not save the deficiency.' }
    const deficiency = mapRow<PmDeficiency>(res.data)
    // A written-up failure is documentation: the PM's numbers move with it.
    if (deficiency.pmId) await recalcPm(companyId, deficiency.pmId, userId)

    if (!input.id) {
      const pm = deficiency.pmId ? await pmLabel(supabase, deficiency.pmId) : null
      const link = deficiency.pmId ? pmLink(deficiency.pmId, 'deficiencies') : `/app/pm/stores/${deficiency.storeId}#issues`
      if (deficiency.severity === 'high' || deficiency.severity === 'critical') {
        await notifyPm({ companyId, rule: 'deficiency', actorId: userId, title: `${deficiency.severity === 'critical' ? 'Critical' : 'High'} deficiency${pm ? `: ${pm.label}` : ''}`, body: `${userName}: ${deficiency.description}`, link })
      }
      if (deficiency.affectsPm && pm) {
        await notifyPm({ companyId, rule: 'blocked', actorId: userId, title: `PM held up by a deficiency: ${pm.label}`, body: deficiency.description, link })
      }
    }
    revalidatePath(PATH, 'layout')
    return { ok: true as const, deficiency }
  } catch (e) { return fail(e) }
}

export async function deleteDeficiency(input: { id: string }) {
  try {
    const { supabase, companyId, userId } = await pmCtx('coordinator')
    const { data: row } = await supabase.from('pm_deficiencies').select('pm_id').eq('id', input.id).maybeSingle()
    const { error } = await supabase.from('pm_deficiencies').delete().eq('id', input.id).eq('company_id', companyId)
    if (error) return { ok: false as const, error: error.message }
    if (row?.pm_id) await recalcPm(companyId, row.pm_id as string, userId)
    revalidatePath(PATH, 'layout')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}
