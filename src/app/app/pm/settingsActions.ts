'use server'

// Preventative Maintenance settings: the completion rules, which alerts go
// out, and the checklist templates. Administrators only, and the database
// says so too: these writes go out under the caller's own login.
//
// A checklist is versioned. A published version is frozen (the database
// refuses edits), so a PM that was worked on it always shows what the
// technician actually saw. Changing a checklist, or making one for another
// quarter, means cloning to a draft, editing the draft, and publishing it.

import { revalidatePath } from 'next/cache'
import { isQuarter } from '@/lib/pm/quarters'
import { attachChecklists, fail, pmCtx } from '@/lib/pm/server'
import { ALDI_Q2_TEMPLATE, SECTIONS, sectionLabel, seedItemRows } from '@/lib/pm/template'
import { mergeNotify, mergeRules, type CompletionRules, type DataTable, type NotifyRules } from '@/lib/pm/types'

const PATH = '/app/pm'
const clean = (s: string | null | undefined, max = 2000) => { const t = (s ?? '').trim().slice(0, max); return t ? t : null }
const APPLICABILITY = ['ALL', 'HFC', 'CO2', 'R-290', 'HFC/CO2', 'HFC/R-290', 'CO2/R-290']

export async function saveCompletionRules(input: { rules: Partial<CompletionRules> }) {
  try {
    const { supabase, companyId, userId } = await pmCtx('admin')
    const { error } = await supabase.from('pm_settings').upsert({ company_id: companyId, completion_rules: mergeRules(input.rules), updated_by: userId }, { onConflict: 'company_id' })
    if (error) return { ok: false as const, error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function saveNotifyRules(input: { notify: Partial<NotifyRules> }) {
  try {
    const { supabase, companyId, userId } = await pmCtx('admin')
    const { error } = await supabase.from('pm_settings').upsert({ company_id: companyId, notify: mergeNotify(input.notify), updated_by: userId }, { onConflict: 'company_id' })
    if (error) return { ok: false as const, error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/* ── Checklist templates ─────────────────────────────────────────────────── */

async function nextVersion(supabase: Awaited<ReturnType<typeof pmCtx>>['supabase'], companyId: string, quarter: number): Promise<number> {
  const { data } = await supabase.from('pm_template_versions').select('version').eq('company_id', companyId).eq('quarter', quarter).order('version', { ascending: false }).limit(1)
  return ((data?.[0]?.version as number | undefined) ?? 0) + 1
}

/**
 * Load the ALDI Quarter 2 checklist (Rev 01_01_25) that ships with
 * PhaseForge, as a draft. It is only the Q2 sheet: nothing is assumed about
 * the other quarters.
 */
export async function installAldiQ2() {
  try {
    const { supabase, companyId, userId } = await pmCtx('admin')
    const t = ALDI_Q2_TEMPLATE
    const version = await nextVersion(supabase, companyId, t.quarter)
    const { data, error } = await supabase.from('pm_template_versions').insert({
      company_id: companyId, name: t.name, quarter: t.quarter, version, revision_label: t.revisionLabel, status: 'draft',
      notes: 'Transcribed from the ALDI Quarter 2 sheet, Rev 01_01_25.', data_tables: t.dataTables, created_by: userId,
    }).select('id').single()
    if (error || !data) return { ok: false as const, error: error?.message ?? 'Could not create the checklist.' }
    const items = await supabase.from('pm_template_items').insert(seedItemRows(t.items).map((r) => ({ ...r, company_id: companyId, version_id: data.id })))
    if (items.error) {
      await supabase.from('pm_template_versions').delete().eq('id', data.id)
      return { ok: false as const, error: items.error.message }
    }
    revalidatePath(PATH, 'layout')
    return { ok: true as const, id: data.id as string }
  } catch (e) { return fail(e) }
}

/** Copy a checklist into a new draft, for a revision or for another quarter. */
export async function cloneTemplate(input: { fromId: string; quarter: number }) {
  try {
    const { supabase, companyId, userId } = await pmCtx('admin')
    if (!isQuarter(input.quarter)) return { ok: false as const, error: 'Pick a quarter.' }
    const [{ data: src }, { data: items }] = await Promise.all([
      supabase.from('pm_template_versions').select('*').eq('id', input.fromId).eq('company_id', companyId).maybeSingle(),
      supabase.from('pm_template_items').select('*').eq('version_id', input.fromId).eq('company_id', companyId).order('sort_order'),
    ])
    if (!src) return { ok: false as const, error: 'That checklist is gone.' }
    const version = await nextVersion(supabase, companyId, input.quarter)
    const sameQuarter = src.quarter === input.quarter
    const { data, error } = await supabase.from('pm_template_versions').insert({
      company_id: companyId, name: src.name, quarter: input.quarter, version, status: 'draft', data_tables: src.data_tables, cloned_from: src.id, created_by: userId,
      // A different quarter is a different ALDI sheet: its revision label has to be read off that sheet, not carried over.
      revision_label: sameQuarter ? src.revision_label : null,
      notes: sameQuarter ? `Revision of version ${src.version}.` : `Started as a copy of the Q${src.quarter} checklist (version ${src.version}). Check every line against the Q${input.quarter} sheet before publishing.`,
    }).select('id').single()
    if (error || !data) return { ok: false as const, error: error?.message ?? 'Could not copy the checklist.' }
    if (items?.length) {
      const copy = await supabase.from('pm_template_items').insert(items.map((it) => {
        const { id: _id, version_id: _v, ...rest } = it as Record<string, unknown>
        void _id; void _v
        return { ...rest, version_id: data.id }
      }))
      if (copy.error) {
        await supabase.from('pm_template_versions').delete().eq('id', data.id)
        return { ok: false as const, error: copy.error.message }
      }
    }
    revalidatePath(PATH, 'layout')
    return { ok: true as const, id: data.id as string }
  } catch (e) { return fail(e) }
}

export async function updateTemplate(input: { id: string; name: string; revisionLabel?: string | null; notes?: string | null }) {
  try {
    const { supabase, companyId } = await pmCtx('admin')
    const name = clean(input.name, 200)
    if (!name) return { ok: false as const, error: 'The checklist needs a name.' }
    const { error } = await supabase.from('pm_template_versions').update({ name, revision_label: clean(input.revisionLabel, 80), notes: clean(input.notes) }).eq('id', input.id).eq('company_id', companyId)
    if (error) return { ok: false as const, error: error.message }
    revalidatePath(PATH, 'layout')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export interface TemplateItemInput {
  id?: string
  versionId: string
  sectionKey: string
  code: string
  applicability: string
  description: string
  requiresPhoto: boolean
  requiresNote: boolean
  measureLabel?: string | null
  measureUnit?: string | null
  requiresMeasure: boolean
  /** Keys of the data tables this check needs readings in. */
  readingTables: string[]
  fopmOnFail: boolean
  hint?: string | null
}

export async function saveTemplateItem(input: TemplateItemInput) {
  try {
    const { supabase, companyId } = await pmCtx('admin')
    const code = (input.code ?? '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 20)
    const description = clean(input.description, 3000)
    if (!code) return { ok: false as const, error: 'Give the check its PM ID, as printed on the sheet (COND1, HVAC4).' }
    if (!description) return { ok: false as const, error: 'The check needs its wording.' }
    if (!APPLICABILITY.includes(input.applicability)) return { ok: false as const, error: 'Pick which systems it applies to.' }
    const { data: version } = await supabase.from('pm_template_versions').select('id, status, data_tables').eq('id', input.versionId).eq('company_id', companyId).maybeSingle()
    if (!version) return { ok: false as const, error: 'That checklist is gone.' }
    if (version.status !== 'draft') return { ok: false as const, error: 'A published checklist cannot be edited. Start a new revision from it instead.' }
    const tables = new Set(((version.data_tables as DataTable[] | null) ?? []).map((t) => t.key))
    const measureLabel = clean(input.measureLabel, 80)
    const row: Record<string, unknown> = {
      section_key: input.sectionKey, section_label: sectionLabel(input.sectionKey), code, applicability: input.applicability, description,
      requires_photo: !!input.requiresPhoto, requires_note: !!input.requiresNote, measure_label: measureLabel, measure_unit: measureLabel ? clean(input.measureUnit, 20) : null,
      requires_measure: !!measureLabel && !!input.requiresMeasure, reading_refs: (input.readingTables ?? []).filter((k) => tables.has(k)).map((k) => ({ table: k })),
      fopm_on_fail: !!input.fopmOnFail, hint: clean(input.hint, 500),
    }
    if (!SECTIONS.some((s) => s.key === input.sectionKey)) return { ok: false as const, error: 'Pick a section.' }
    let res
    if (input.id) {
      res = await supabase.from('pm_template_items').update(row).eq('id', input.id).eq('version_id', input.versionId).eq('company_id', companyId).select('id').single()
    } else {
      // A new check goes to the end of its section.
      const { data: all } = await supabase.from('pm_template_items').select('section_key, sort_order').eq('version_id', input.versionId).order('sort_order')
      const mine = (all ?? []).filter((r) => r.section_key === input.sectionKey)
      const order = SECTIONS.map((s) => s.key)
      const before = (all ?? []).filter((r) => order.indexOf(r.section_key as string) <= order.indexOf(input.sectionKey))
      const anchor = (mine.length ? mine[mine.length - 1].sort_order : before.length ? before[before.length - 1].sort_order : 0) as number
      res = await supabase.from('pm_template_items').insert({ ...row, company_id: companyId, version_id: input.versionId, sort_order: anchor + 1 }).select('id').single()
    }
    if (res.error) return { ok: false as const, error: res.error.code === '23505' ? `This checklist already has a check with the PM ID ${code}.` : res.error.message }
    await renumber(supabase, input.versionId)
    revalidatePath(`${PATH}/settings`, 'layout')
    return { ok: true as const, id: res.data.id as string }
  } catch (e) { return fail(e) }
}

/** Keep sort_order spaced out and grouped by section, in the order the sections print. */
async function renumber(supabase: Awaited<ReturnType<typeof pmCtx>>['supabase'], versionId: string) {
  const { data } = await supabase.from('pm_template_items').select('id, section_key, sort_order').eq('version_id', versionId).order('sort_order')
  const order = SECTIONS.map((s) => s.key)
  const sorted = [...(data ?? [])].sort((a, b) => order.indexOf(a.section_key as string) - order.indexOf(b.section_key as string) || (a.sort_order as number) - (b.sort_order as number))
  let n = 0
  for (const r of sorted) {
    n += 10
    if (r.sort_order !== n) await supabase.from('pm_template_items').update({ sort_order: n }).eq('id', r.id)
  }
}

export async function moveTemplateItem(input: { id: string; versionId: string; direction: 'up' | 'down' }) {
  try {
    const { supabase, companyId } = await pmCtx('admin')
    const { data } = await supabase.from('pm_template_items').select('id, section_key, sort_order').eq('version_id', input.versionId).eq('company_id', companyId).order('sort_order')
    const list = data ?? []
    const me = list.find((r) => r.id === input.id)
    if (!me) return { ok: false as const, error: 'That check is gone.' }
    const peers = list.filter((r) => r.section_key === me.section_key)
    const at = peers.findIndex((r) => r.id === me.id)
    const other = peers[at + (input.direction === 'up' ? -1 : 1)]
    if (!other) return { ok: true as const }
    const a = await supabase.from('pm_template_items').update({ sort_order: other.sort_order }).eq('id', me.id)
    if (a.error) return { ok: false as const, error: a.error.message }
    await supabase.from('pm_template_items').update({ sort_order: me.sort_order }).eq('id', other.id)
    revalidatePath(`${PATH}/settings`, 'layout')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

export async function deleteTemplateItem(input: { id: string; versionId: string }) {
  try {
    const { supabase, companyId } = await pmCtx('admin')
    const { error } = await supabase.from('pm_template_items').delete().eq('id', input.id).eq('version_id', input.versionId).eq('company_id', companyId)
    if (error) return { ok: false as const, error: error.message }
    revalidatePath(`${PATH}/settings`, 'layout')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}

/**
 * Make a draft the live checklist for its quarter. Whatever was live before
 * is retired, not deleted: PMs already started on it stay on it.
 */
export async function publishTemplate(input: { id: string }) {
  try {
    const { supabase, companyId, userId } = await pmCtx('admin')
    const { data: version } = await supabase.from('pm_template_versions').select('id, status, quarter').eq('id', input.id).eq('company_id', companyId).maybeSingle()
    if (!version) return { ok: false as const, error: 'That checklist is gone.' }
    if (version.status !== 'draft') return { ok: false as const, error: 'Only a draft can be published.' }
    const { count } = await supabase.from('pm_template_items').select('id', { count: 'exact', head: true }).eq('version_id', input.id)
    if (!count) return { ok: false as const, error: 'Add at least one check before publishing.' }
    const { error } = await supabase.from('pm_template_versions').update({ status: 'active' }).eq('id', input.id).eq('company_id', companyId)
    if (error) return { ok: false as const, error: error.message }
    // Open PMs for this quarter that had no checklist yet get this one, blank.
    const { attached } = await attachChecklists(companyId, userId, { quarter: version.quarter as number })
    revalidatePath(PATH, 'layout')
    return { ok: true as const, quarter: version.quarter as number, attached }
  } catch (e) { return fail(e) }
}

export async function deleteTemplateDraft(input: { id: string }) {
  try {
    const { supabase, companyId } = await pmCtx('admin')
    const { data, error } = await supabase.from('pm_template_versions').delete().eq('id', input.id).eq('company_id', companyId).eq('status', 'draft').select('id')
    if (error) return { ok: false as const, error: error.message }
    if (!data?.length) return { ok: false as const, error: 'Only a draft can be deleted. Published checklists are kept for the PMs that used them.' }
    revalidatePath(PATH, 'layout')
    return { ok: true as const }
  } catch (e) { return fail(e) }
}
