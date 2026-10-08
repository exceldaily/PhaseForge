import 'server-only'

// Server side of the Preventative Maintenance module: who the caller is, the
// loaders the pages share, and the two things only the server may write: the
// calculated progress on a PM, and notifications.
//
// Permissions are enforced by row level security and the triggers in the
// migration. The role worked out here only decides what the UI offers.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAdminOrg, canEditCompanyData } from '@/lib/permissions'
import { logger } from '@/lib/logger'
import { computeProgress, pct, type Progress } from './progress'
import { buildLayout } from './template'
import {
  mergeNotify, mergeRules,
  type CompletionRules, type NotifyRules, type PmActivity, type PmAttachment, type PmCycle, type PmDeficiency, type PmEquipment,
  type PmExclusion, type PmMaterial, type PmReading, type PmResponse, type PmRole, type PmStore, type PmTech, type SystemType,
  type TemplateItem, type TemplateVersion,
} from './types'

export const PM_BUCKET = 'project-attachments'
export const PM_MODULE_KEY = 'pm'

type Db = Awaited<ReturnType<typeof createClient>>
type Admin = ReturnType<typeof createAdminClient>

export interface PmContext {
  supabase: Db
  userId: string
  userName: string
  companyId: string
  role: PmRole
  isAdmin: boolean
  isCoordinator: boolean
  /** The pm_techs rows linked to this login. */
  techIds: string[]
}

async function resolve(): Promise<PmContext | 'signed-out' | 'no-company' | 'module-off'> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'signed-out'
  const { data: profile } = await supabase.from('profiles').select('company_id, role, ops_role, full_name').eq('id', user.id).single()
  if (!profile?.company_id) return 'no-company'
  const [{ data: mod }, { data: techs }] = await Promise.all([
    supabase.from('organization_modules').select('enabled').eq('company_id', profile.company_id).eq('module_key', PM_MODULE_KEY).maybeSingle(),
    supabase.from('pm_techs').select('id').eq('company_id', profile.company_id).eq('profile_id', user.id).eq('is_active', true),
  ])
  if (!mod?.enabled) return 'module-off'
  const isAdmin = canAdminOrg(profile)
  const isCoordinator = isAdmin || canEditCompanyData(profile)
  const techIds = (techs ?? []).map((t) => t.id as string)
  return {
    supabase, userId: user.id, userName: (profile.full_name as string | null)?.trim() || 'Someone', companyId: profile.company_id as string,
    role: isAdmin ? 'admin' : isCoordinator ? 'coordinator' : techIds.length ? 'technician' : 'read_only',
    isAdmin, isCoordinator, techIds,
  }
}

/** Page guard. A disabled module or a signed-out visitor never reaches the page, direct links included. */
export async function requirePm(): Promise<PmContext> {
  const ctx = await resolve()
  if (ctx === 'signed-out') redirect('/login')
  if (ctx === 'no-company' || ctx === 'module-off') redirect('/app/dashboard')
  return ctx
}

/** Action guard. Throws instead of redirecting. */
export async function pmCtx(need: 'any' | 'coordinator' | 'admin' = 'any'): Promise<PmContext> {
  const ctx = await resolve()
  if (ctx === 'signed-out') throw new Error('You are signed out.')
  if (ctx === 'no-company') throw new Error('No organization.')
  if (ctx === 'module-off') throw new Error('Preventative Maintenance is not switched on for your organization.')
  if (need === 'admin' && !ctx.isAdmin) throw new Error('Only an administrator can do that.')
  if (need === 'coordinator' && !ctx.isCoordinator) throw new Error('Only a coordinator can do that.')
  return ctx
}

export const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'Something went wrong.' })

/* ── Row mapping ─────────────────────────────────────────────────────────── */

const camel = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
/** snake_case columns to camelCase fields, one level deep (JSON columns keep their own shape). */
export function mapRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) out[camel(k)] = v
  return out as T
}
export const mapRows = <T>(rows: Record<string, unknown>[] | null | undefined): T[] => (rows ?? []).map((r) => mapRow<T>(r))

export const mapStore = (r: Record<string, unknown>) => mapRow<PmStore>(r)
export const mapCycle = (r: Record<string, unknown>) => mapRow<PmCycle>(r)
export function mapMaterial(r: Record<string, unknown>): PmMaterial { return { ...mapRow<PmMaterial>(r), quantity: Number(r.quantity ?? 1) } }
export function mapTemplate(r: Record<string, unknown>): TemplateVersion { return mapRow<TemplateVersion>(r) }

/* ── Shared loaders ──────────────────────────────────────────────────────── */

export async function loadTechs(supabase: Db | Admin, companyId: string): Promise<PmTech[]> {
  const { data } = await supabase.from('pm_techs').select('id, name, profile_id, employee_id, phone, email, is_active').eq('company_id', companyId).order('name')
  return mapRows<PmTech>(data)
}

export async function loadStores(supabase: Db | Admin, companyId: string): Promise<PmStore[]> {
  const { data } = await supabase.from('pm_stores').select('*').eq('company_id', companyId).order('store_number').limit(5000)
  return mapRows<PmStore>(data)
}

export async function loadSettings(supabase: Db | Admin, companyId: string): Promise<{ rules: CompletionRules; notify: NotifyRules }> {
  const { data } = await supabase.from('pm_settings').select('completion_rules, notify').eq('company_id', companyId).maybeSingle()
  return { rules: mergeRules(data?.completion_rules as Partial<CompletionRules> | null), notify: mergeNotify(data?.notify as Partial<NotifyRules> | null) }
}

export async function loadTemplateItems(supabase: Db | Admin, versionId: string): Promise<TemplateItem[]> {
  const { data } = await supabase.from('pm_template_items').select('*').eq('version_id', versionId).order('sort_order')
  return mapRows<TemplateItem>(data).map((i) => ({ ...i, readingRefs: i.readingRefs ?? [] }))
}

/** The checklist version live for a quarter, if one has been published. */
export async function activeTemplate(supabase: Db | Admin, companyId: string, quarter: number): Promise<TemplateVersion | null> {
  const { data } = await supabase.from('pm_template_versions').select('*').eq('company_id', companyId).eq('quarter', quarter).eq('status', 'active').maybeSingle()
  return data ? mapTemplate(data) : null
}

export async function signPaths(paths: string[], companyId: string): Promise<Record<string, string>> {
  const mine = [...new Set(paths.filter((p) => p.startsWith(`pm/${companyId}/`)))]
  if (!mine.length) return {}
  try {
    const { data } = await createAdminClient().storage.from(PM_BUCKET).createSignedUrls(mine, 60 * 60)
    return Object.fromEntries((data ?? []).filter((d) => d.path && d.signedUrl).map((d) => [d.path as string, d.signedUrl as string]))
  } catch (e) { logger.error('pm signPaths', e); return {} }
}

/* ── Everything about one PM ─────────────────────────────────────────────── */

export interface PmBundle {
  cycle: PmCycle
  store: PmStore
  template: TemplateVersion | null
  items: TemplateItem[]
  responses: PmResponse[]
  readings: PmReading[]
  attachments: PmAttachment[]
  materials: PmMaterial[]
  deficiencies: PmDeficiency[]
  exclusions: PmExclusion[]
  equipment: PmEquipment[]
  rules: CompletionRules
  progress: Progress
  reportCount: number
}

function progressOf(b: Omit<PmBundle, 'progress'>): Progress {
  const photoCounts: Record<string, number> = {}
  for (const a of b.attachments) if (a.kind === 'photo' && a.itemId) photoCounts[a.itemId] = (photoCounts[a.itemId] ?? 0) + 1
  return computeProgress({
    items: b.items, system: b.store.systemType as SystemType | null, exclusions: b.exclusions, responses: b.responses,
    photoCounts, readings: b.readings, deficiencyItemIds: b.deficiencies.filter((d) => d.itemId).map((d) => d.itemId as string),
    techNotes: b.cycle.techNotes, rules: b.rules,
  })
}

/** One PM with its checklist, answers, and everything hanging off it. `sign` adds photo URLs. */
export async function loadPmBundle(supabase: Db | Admin, companyId: string, pmId: string, opts: { sign?: boolean } = {}): Promise<PmBundle | null> {
  const { data: c } = await supabase.from('pm_cycles').select('*').eq('id', pmId).eq('company_id', companyId).maybeSingle()
  if (!c) return null
  const cycle = mapCycle(c)
  const [{ data: s }, { data: resp }, { data: read }, { data: att }, { data: mat }, { data: def }, { data: exc }, { data: eq }, settings, { count: reportCount }] = await Promise.all([
    supabase.from('pm_stores').select('*').eq('id', cycle.storeId).single(),
    supabase.from('pm_responses').select('item_id, result, measure_value, note, na_reason, inspected_by, inspected_at, rev').eq('pm_id', pmId),
    supabase.from('pm_readings').select('table_key, row_key, col_key, value').eq('pm_id', pmId),
    supabase.from('pm_attachments').select('*').eq('pm_id', pmId).order('created_at'),
    supabase.from('pm_materials').select('*').eq('pm_id', pmId).order('created_at'),
    supabase.from('pm_deficiencies').select('*').eq('pm_id', pmId).order('created_at'),
    supabase.from('pm_store_exclusions').select('id, store_id, item_code, equipment_id, reason').eq('store_id', cycle.storeId),
    supabase.from('pm_equipment').select('*').eq('store_id', cycle.storeId).order('sort_order'),
    loadSettings(supabase, companyId),
    supabase.from('pm_reports').select('id', { count: 'exact', head: true }).eq('pm_id', pmId),
  ])
  if (!s) return null
  let template: TemplateVersion | null = null
  let items: TemplateItem[] = []
  if (cycle.templateVersionId) {
    const [{ data: t }, list] = await Promise.all([
      supabase.from('pm_template_versions').select('*').eq('id', cycle.templateVersionId).maybeSingle(),
      loadTemplateItems(supabase, cycle.templateVersionId),
    ])
    template = t ? mapTemplate(t) : null
    items = list
  }
  let attachments = mapRows<PmAttachment>(att)
  if (opts.sign && attachments.length) {
    const urls = await signPaths(attachments.map((a) => a.path), companyId)
    attachments = attachments.map((a) => ({ ...a, url: urls[a.path] ?? null }))
  }
  const partial = {
    cycle, store: mapStore(s), template, items,
    responses: mapRows<PmResponse>(resp), readings: mapRows<PmReading>(read), attachments,
    materials: (mat ?? []).map(mapMaterial), deficiencies: mapRows<PmDeficiency>(def),
    exclusions: mapRows<PmExclusion>(exc), equipment: mapRows<PmEquipment>(eq), rules: settings.rules, reportCount: reportCount ?? 0,
  }
  return { ...partial, progress: progressOf(partial) }
}

/* ── The calculated columns ──────────────────────────────────────────────── */

/**
 * Recount a PM's progress and store it. This is the only writer of the
 * progress columns: the database refuses them from anyone signed in, so they
 * cannot be typed by hand. Also records a line on the trail each time the
 * checklist crosses a quarter mark.
 */
export async function recalcPm(companyId: string, pmId: string, actorId: string): Promise<Progress | null> {
  try {
    const admin = createAdminClient()
    const b = await loadPmBundle(admin, companyId, pmId)
    if (!b) return null
    const p = b.progress
    const c = b.cycle
    if (p.checklistTotal !== c.checklistTotal || p.checklistDone !== c.checklistDone || p.docsTotal !== c.docsTotal || p.docsDone !== c.docsDone) {
      await admin.from('pm_cycles').update({
        checklist_total: p.checklistTotal, checklist_done: p.checklistDone, docs_total: p.docsTotal, docs_done: p.docsDone, updated_by: actorId,
      }).eq('id', pmId)
      const before = pct(c.checklistDone, c.checklistTotal)
      const mark = [100, 75, 50, 25].find((m) => p.checklistPct >= m && before < m)
      if (mark) await logPm(admin, { companyId, storeId: c.storeId, pmId, actorId, action: 'checklist_progress', detail: { pct: mark, done: p.checklistDone, total: p.checklistTotal } })
    }
    return p
  } catch (e) { logger.error('pm recalcPm', e); return null }
}

/**
 * Give PMs their checklist. Every PM carries the live checklist for its
 * quarter from the moment it is created, completely blank: nothing answered,
 * no readings, 0 of N. Called after PMs are created, and again when a
 * checklist is published, so PMs that were waiting for one pick it up.
 * Closed and cancelled PMs are left alone, and a PM that already has a
 * checklist never changes version.
 */
export async function attachChecklists(companyId: string, actorId: string, only?: { pmIds?: string[]; quarter?: number }): Promise<{ attached: number; noTemplate: number[] }> {
  const out = { attached: 0, noTemplate: [] as number[] }
  try {
    const admin = createAdminClient()
    let q = admin.from('pm_cycles').select('id, store_id, quarter').eq('company_id', companyId).is('template_version_id', null).not('status', 'in', '(completed,cancelled)')
    if (only?.pmIds) { if (!only.pmIds.length) return out; q = q.in('id', only.pmIds) }
    if (only?.quarter) q = q.eq('quarter', only.quarter)
    const { data: waiting } = await q.limit(5000)
    if (!waiting?.length) return out

    const templates = new Map<number, TemplateVersion | null>()
    for (const n of new Set(waiting.map((c) => c.quarter as number))) templates.set(n, await activeTemplate(admin, companyId, n))
    out.noTemplate = [...templates].filter(([, t]) => !t).map(([n]) => n).sort()
    const storeIds = [...new Set(waiting.map((c) => c.store_id as string))]
    const { data: eq } = await admin.from('pm_equipment').select('id, store_id, kind, label, sort_order, is_active').in('store_id', storeIds)
    const equipment = mapRows<Pick<PmEquipment, 'id' | 'kind' | 'label' | 'sortOrder' | 'isActive'> & { storeId: string }>(eq)

    const one = async (c: { id: unknown; store_id: unknown; quarter: unknown }) => {
      const t = templates.get(c.quarter as number)
      if (!t) return
      const layout = buildLayout(t.dataTables, equipment.filter((e) => e.storeId === c.store_id))
      const { data, error } = await admin.from('pm_cycles').update({ template_version_id: t.id, layout }).eq('id', c.id as string).is('template_version_id', null).select('id')
      if (error || !data?.length) return
      await logPm(admin, { companyId, storeId: c.store_id as string, pmId: c.id as string, actorId, action: 'checklist_attached', detail: { template: `${t.name} Q${t.quarter}${t.revisionLabel ? `, ${t.revisionLabel}` : ''}` } })
      await recalcPm(companyId, c.id as string, actorId)
      out.attached++
    }
    for (let i = 0; i < waiting.length; i += 6) await Promise.all(waiting.slice(i, i + 6).map(one))
  } catch (e) { logger.error('pm attachChecklists', e) }
  return out
}

/* ── Trail and notifications ─────────────────────────────────────────────── */

/** For events no trigger covers (reports, imports, progress marks). Never throws. */
export async function logPm(db: Db | Admin, e: { companyId: string; storeId?: string | null; pmId?: string | null; actorId: string; action: string; detail?: Record<string, unknown> }): Promise<void> {
  try {
    await db.from('pm_activity').insert({ company_id: e.companyId, store_id: e.storeId ?? null, pm_id: e.pmId ?? null, actor_id: e.actorId, action: e.action, detail: e.detail ?? {} })
  } catch (err) { logger.error('pm logPm', err) }
}

export async function loadActivity(supabase: Db | Admin, filter: { pmId?: string; storeId?: string; companyId: string; limit?: number }): Promise<PmActivity[]> {
  let q = supabase.from('pm_activity').select('id, pm_id, store_id, actor_id, action, detail, created_at').eq('company_id', filter.companyId)
  if (filter.pmId) q = q.eq('pm_id', filter.pmId)
  if (filter.storeId) q = q.eq('store_id', filter.storeId)
  const { data } = await q.order('created_at', { ascending: false }).limit(filter.limit ?? 100)
  return mapRows<PmActivity>(data)
}

/**
 * An in-app notification, sent only when its rule is switched on. `dedupe`
 * makes a repeating alert (overdue, late material) fire once per key.
 * Recipients: every coordinator, plus any listed logins, never the person
 * who caused it. Never throws: an alert must not fail the change behind it.
 */
export async function notifyPm(input: {
  companyId: string; rule: keyof NotifyRules; actorId?: string | null
  title: string; body?: string | null; link: string
  coordinators?: boolean; profileIds?: (string | null | undefined)[]; dedupe?: string
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const { notify } = await loadSettings(admin, input.companyId)
    if (!notify[input.rule]) return
    if (input.dedupe) {
      const { error } = await admin.from('pm_alert_log').insert({ dedupe_key: input.dedupe, company_id: input.companyId })
      if (error) return   // already sent
    }
    const targets = new Set<string>()
    if (input.coordinators !== false) {
      const { data: people } = await admin.from('profiles').select('id, role, ops_role').eq('company_id', input.companyId).eq('is_active', true)
      for (const p of people ?? []) if (canEditCompanyData(p)) targets.add(p.id as string)
    }
    for (const id of input.profileIds ?? []) if (id) targets.add(id)
    if (input.actorId) targets.delete(input.actorId)
    if (!targets.size) return
    const body = input.body ? (input.body.length > 180 ? `${input.body.slice(0, 177)}...` : input.body) : null
    await admin.from('notifications').insert([...targets].map((uid) => ({
      user_id: uid, company_id: input.companyId, type: `pm_${input.rule}`, title: input.title, body, link: input.link,
    })))
  } catch (e) { logger.error('pm notifyPm', e) }
}

/** The login behind a technician row, for notifying them. */
export async function techProfileId(db: Db | Admin, techId: string | null | undefined): Promise<string | null> {
  if (!techId) return null
  const { data } = await db.from('pm_techs').select('profile_id').eq('id', techId).maybeSingle()
  return (data?.profile_id as string | null) ?? null
}
