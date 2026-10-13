import 'server-only'

// Server side of the ServiceChannel module: who may use it, loaders, the
// import lifecycle (draft -> preview -> commit through one SQL transaction),
// and the writes to PhaseForge's own follow-up records. ServiceChannel itself
// is never contacted; everything here works on files a person downloaded.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isOwner } from '@/lib/permissions'
import { logger } from '@/lib/logger'
import { buildPlan, type ExistingWo, type LocationMatch, type Plan } from './sync'
import { MEASURES, SC_MODULE_KEY, type Coverage, type InternalStatus, type MeasureKey, type NormalizedRow } from './types'

export type Admin = ReturnType<typeof createAdminClient>
type Row = Record<string, unknown>

export interface ScContext { userId: string; userName: string; companyId: string; admin: Admin }

async function resolve(): Promise<ScContext | 'signed-out' | 'no-company' | 'module-off' | 'not-owner'> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'signed-out'
  const { data: profile } = await supabase.from('profiles').select('company_id, role, ops_role, full_name').eq('id', user.id).single()
  if (!profile?.company_id) return 'no-company'
  const { data: mod } = await supabase.from('organization_modules').select('enabled').eq('company_id', profile.company_id).eq('module_key', SC_MODULE_KEY).maybeSingle()
  if (!mod?.enabled) return 'module-off'
  if (!isOwner(profile)) return 'not-owner'
  return { userId: user.id, userName: (profile.full_name as string | null)?.trim() || 'The owner', companyId: profile.company_id as string, admin: createAdminClient() }
}

/** Page guard: the organization owner, in a company with the module on. */
export async function requireSc(): Promise<ScContext> {
  const ctx = await resolve()
  if (ctx === 'signed-out') redirect('/login')
  if (typeof ctx === 'string') redirect('/app/dashboard')
  return ctx
}

/** Action guard: throws instead of redirecting. */
export async function scCtx(): Promise<ScContext> {
  const ctx = await resolve()
  if (ctx === 'signed-out') throw new Error('You are signed out.')
  if (ctx === 'no-company') throw new Error('No organization.')
  if (ctx === 'module-off') throw new Error('ServiceChannel is not switched on for your organization.')
  if (ctx === 'not-owner') throw new Error('Only the organization owner can use ServiceChannel.')
  return ctx
}

export const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'Something went wrong.' })

const camel = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
export function mapRow<T>(row: Row): T {
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) out[camel(k)] = v
  return out as T
}
export const mapRows = <T>(rows: Row[] | null | undefined): T[] => (rows ?? []).map((r) => mapRow<T>(r))

/* ── Views ───────────────────────────────────────────────────────────────── */

export interface CaseView {
  internalStatus: InternalStatus
  ownerProfileId: string | null
  ownerName: string | null
  department: string | null
  nextAction: string | null
  dueDate: string | null
  blockerReason: string | null
  priorityOverride: number | null
  priorityReason: string | null
  handoffAcceptedAt: string | null
  verifiedResolvedAt: string | null
  lastUpdateAt: string
}

export interface WorkOrderView {
  id: string
  trackingNumber: string
  woNumber: string | null
  poNumber: string | null
  customerName: string | null
  storeLabel: string | null
  storeNumber: string | null
  storeCity: string | null
  storeState: string | null
  region: string | null
  district: string | null
  trade: string | null
  category: string | null
  priority: string | null
  area: string | null
  equipment: string | null
  problemType: string | null
  problemCode: string | null
  tagId: string | null
  problemDescription: string | null
  submittedBy: string | null
  callDate: string | null
  scheduledDate: string | null
  originalEta: string | null
  reassignDate: string | null
  reassignTime: string | null
  status: string | null
  statusExt: string | null
  resolution: string | null
  nte: number | null
  currency: string | null
  assignee: string | null
  dateAssigned: string | null
  technicians: string[]
  timezone: string | null
  notesRaw?: string | null
  kalosJobNumber: string | null
  customerId: string | null
  locationId: string | null
  callId: string | null
  firstSeenAt: string
  lastSeenAt: string
  observationState: string
  verifiedAt: string | null
  verifiedNote: string | null
  reopenCount: number
  unsatCount: number
  lastReopenedAt: string | null
  lastUnsatAt: string | null
  case: CaseView
  openTasks: number
}

const LIST_COLS = 'id, tracking_number, wo_number, po_number, customer_name, store_label, store_number, store_city, store_state, region, district, trade, category, priority, area, equipment, problem_type, problem_code, tag_id, problem_description, submitted_by, call_date, scheduled_date, original_eta, reassign_date, reassign_time, status, status_ext, resolution, nte, currency, assignee, date_assigned, technicians, timezone, kalos_job_number, customer_id, location_id, call_id, first_seen_at, last_seen_at, observation_state, verified_at, verified_note, reopen_count, unsat_count, last_reopened_at, last_unsat_at'

const emptyCase = (): CaseView => ({
  internalStatus: 'new', ownerProfileId: null, ownerName: null, department: null, nextAction: null, dueDate: null, blockerReason: null,
  priorityOverride: null, priorityReason: null, handoffAcceptedAt: null, verifiedResolvedAt: null, lastUpdateAt: new Date(0).toISOString(),
})

function toView(r: Row, caseRow: Row | null, openTasks: number): WorkOrderView {
  const base = mapRow<Omit<WorkOrderView, 'case' | 'openTasks'>>(r)
  return {
    ...base,
    nte: r.nte === null || r.nte === undefined ? null : Number(r.nte),
    technicians: (r.technicians as string[]) ?? [],
    reopenCount: Number(r.reopen_count ?? 0), unsatCount: Number(r.unsat_count ?? 0),
    case: caseRow ? mapRow<CaseView>(caseRow) : emptyCase(),
    openTasks,
  }
}

async function pageAll<T>(fetch: (from: number, to: number) => PromiseLike<{ data: T[] | null }>, max = 20_000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < max; from += 1000) {
    const { data } = await fetch(from, from + 999)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

/** Every work order with its case and open task count, without the (large) notes. */
export async function loadWorkOrders(admin: Admin, companyId: string): Promise<WorkOrderView[]> {
  const [wos, cases, tasks] = await Promise.all([
    pageAll<Row>((a, b) => admin.from('sc_work_orders').select(LIST_COLS).eq('company_id', companyId).order('call_date', { ascending: false, nullsFirst: false }).range(a, b)),
    pageAll<Row>((a, b) => admin.from('sc_cases').select('*').eq('company_id', companyId).range(a, b)),
    pageAll<Row>((a, b) => admin.from('sc_tasks').select('work_order_id').eq('company_id', companyId).neq('status', 'verified_resolved').range(a, b)),
  ])
  const caseBy = new Map(cases.map((c) => [c.work_order_id as string, c]))
  const openBy = new Map<string, number>()
  for (const t of tasks) openBy.set(t.work_order_id as string, (openBy.get(t.work_order_id as string) ?? 0) + 1)
  return wos.map((w) => toView(w, caseBy.get(w.id as string) ?? null, openBy.get(w.id as string) ?? 0))
}

export interface TaskView {
  id: string; workOrderId: string; title: string; queue: string; status: InternalStatus; ownerProfileId: string | null; ownerName: string | null
  nextAction: string | null; dueDate: string | null; blockerReason: string | null; source: string; ruleKey: string | null
  acceptedAt: string | null; completedAt: string | null; verifiedAt: string | null; createdAt: string; updatedAt: string
}
export interface EventView { id: string; kind: string; actorName: string | null; body: string | null; detail: Record<string, unknown>; createdAt: string; importId: string | null }
export interface ObservationView { id: string; importId: string | null; observedAt: string; kind: string; status: string | null; statusExt: string | null; scheduledDate: string | null; originalEta: string | null; technicians: string[]; changes: { field: string; label: string; from: string | null; to: string | null }[]; flags: string[]; sourceName: string | null }

export interface CaseBundle { wo: WorkOrderView; tasks: TaskView[]; events: EventView[]; observations: ObservationView[] }

export async function loadCase(admin: Admin, companyId: string, id: string): Promise<CaseBundle | null> {
  const { data: w } = await admin.from('sc_work_orders').select('*').eq('company_id', companyId).eq('id', id).maybeSingle()
  if (!w) return null
  const [{ data: c }, { data: tasks }, { data: events }, { data: obs }] = await Promise.all([
    admin.from('sc_cases').select('*').eq('work_order_id', id).maybeSingle(),
    admin.from('sc_tasks').select('*').eq('work_order_id', id).order('created_at', { ascending: false }),
    admin.from('sc_events').select('*').eq('work_order_id', id).order('created_at', { ascending: false }).limit(500),
    admin.from('sc_observations').select('id, import_id, observed_at, kind, status, status_ext, scheduled_date, original_eta, technicians, changes, flags, sc_imports(source_name)').eq('work_order_id', id).order('observed_at', { ascending: false }).limit(200),
  ])
  const open = (tasks ?? []).filter((t) => t.status !== 'verified_resolved').length
  return {
    wo: toView(w as Row, (c as Row | null) ?? null, open),
    tasks: mapRows<TaskView>(tasks as Row[]),
    events: mapRows<EventView>(events as Row[]),
    observations: (obs ?? []).map((o) => ({
      ...mapRow<Omit<ObservationView, 'sourceName'>>(o as Row),
      technicians: (o.technicians as string[]) ?? [], changes: (o.changes as ObservationView['changes']) ?? [], flags: (o.flags as string[]) ?? [],
      sourceName: ((o.sc_imports as unknown as { source_name?: string } | null)?.source_name) ?? null,
    })),
  }
}

export interface ImportView {
  id: string; kind: string; status: string; sourceName: string | null; fileHash: string | null; headers: string[]; mapping: Record<string, string>
  coverage: Coverage; rowCount: number; stats: Record<string, number>; warnings: string[]; error: string | null; createdAt: string; committedAt: string | null
}
export async function loadImports(admin: Admin, companyId: string, limit = 50): Promise<ImportView[]> {
  const { data } = await admin.from('sc_imports').select('id, kind, status, source_name, file_hash, headers, mapping, coverage, row_count, stats, warnings, error, created_at, committed_at')
    .eq('company_id', companyId).order('created_at', { ascending: false }).limit(limit)
  return (data ?? []).map((r) => ({ ...mapRow<ImportView>(r as Row), coverage: coverageOf(r.coverage), warnings: (r.warnings as string[]) ?? [], stats: (r.stats as Record<string, number>) ?? {} }))
}

export interface MappingView { id: string; name: string; signature: string; mapping: Record<string, string>; lastUsedAt: string | null }
export async function loadMappings(admin: Admin, companyId: string): Promise<MappingView[]> {
  const { data } = await admin.from('sc_import_mappings').select('id, name, signature, mapping, last_used_at').eq('company_id', companyId).order('last_used_at', { ascending: false, nullsFirst: false })
  return mapRows<MappingView>(data as Row[])
}

export interface MetricEntryView {
  id: string; measure: MeasureKey; value: number | null; previousValue: number | null; unit: string | null; snapshotDate: string; periodLabel: string | null
  scorecardView: string | null; filters: string | null; eligibleCount: number | null; source: string | null; isSample: boolean; note: string | null; createdAt: string
}
export async function loadMetrics(admin: Admin, companyId: string): Promise<MetricEntryView[]> {
  const { data } = await admin.from('sc_metric_entries').select('*').eq('company_id', companyId).order('snapshot_date', { ascending: false }).limit(2000)
  return (data ?? []).map((r) => ({ ...mapRow<MetricEntryView>(r as Row), value: r.value === null ? null : Number(r.value), previousValue: r.previous_value === null ? null : Number(r.previous_value) }))
}

export interface ScSettings { targetOverall: number; targetDate: string; lastImportId: string | null; lastImportAt: string | null; lastImportSource: string | null; lastCoverage: Coverage | null }
export async function loadSettings(admin: Admin, companyId: string): Promise<ScSettings> {
  const { data } = await admin.from('sc_settings').select('target_overall, target_date, last_import_id, sc_imports(committed_at, source_name, coverage)').eq('company_id', companyId).maybeSingle()
  const imp = (data?.sc_imports as unknown as { committed_at?: string; source_name?: string; coverage?: unknown } | null) ?? null
  return {
    targetOverall: data ? Number(data.target_overall) : 80, targetDate: (data?.target_date as string) ?? '2027-10-13', lastImportId: (data?.last_import_id as string | null) ?? null,
    lastImportAt: imp?.committed_at ?? null, lastImportSource: imp?.source_name ?? null, lastCoverage: imp?.coverage ? coverageOf(imp.coverage) : null,
  }
}

export interface Person { id: string; name: string }
export async function loadPeople(admin: Admin, companyId: string): Promise<Person[]> {
  const { data } = await admin.from('profiles').select('id, full_name, email').eq('company_id', companyId).order('full_name')
  return (data ?? []).map((p) => ({ id: p.id as string, name: ((p.full_name as string | null)?.trim() || (p.email as string | null) || 'Member') }))
}
export async function loadDepartments(admin: Admin, companyId: string): Promise<string[]> {
  const { data } = await admin.from('divisions').select('name').eq('company_id', companyId).eq('is_active', true).order('sort_order')
  return (data ?? []).map((d) => d.name as string)
}

export function coverageOf(v: unknown): Coverage {
  const c = (v && typeof v === 'object' ? v : {}) as Partial<Coverage>
  return {
    statuses: Array.isArray(c.statuses) ? c.statuses.map(String) : [], subscribers: Array.isArray(c.subscribers) ? c.subscribers.map(String) : [],
    callDateFrom: typeof c.callDateFrom === 'string' && c.callDateFrom ? c.callDateFrom : null, callDateTo: typeof c.callDateTo === 'string' && c.callDateTo ? c.callDateTo : null,
    note: typeof c.note === 'string' && c.note ? c.note : null,
  }
}

/* ── Imports ─────────────────────────────────────────────────────────────── */

async function existingForPlan(admin: Admin, companyId: string): Promise<ExistingWo[]> {
  const rows = await pageAll<Row>((a, b) => admin.from('sc_work_orders')
    .select('tracking_number, status, status_ext, scheduled_date, original_eta, technicians, assignee, nte, resolution, priority, trade, category, call_date, customer_name, notes_raw, observation_state')
    .eq('company_id', companyId).range(a, b))
  return rows.map((r) => ({
    trackingNumber: r.tracking_number as string, status: (r.status as string | null) ?? null, statusExt: (r.status_ext as string | null) ?? null,
    scheduledDate: (r.scheduled_date as string | null) ?? null, originalEta: (r.original_eta as string | null) ?? null, technicians: (r.technicians as string[]) ?? [],
    assignee: (r.assignee as string | null) ?? null, nte: r.nte === null ? null : Number(r.nte), resolution: (r.resolution as string | null) ?? null,
    priority: (r.priority as string | null) ?? null, trade: (r.trade as string | null) ?? null, category: (r.category as string | null) ?? null,
    callDate: (r.call_date as string | null) ?? null, customerName: (r.customer_name as string | null) ?? null, notesRaw: (r.notes_raw as string | null) ?? null,
    observationState: r.observation_state as string,
  }))
}

/** Store number -> the one PhaseForge location with that number (ambiguous numbers are skipped). */
async function locationMatches(admin: Admin, companyId: string): Promise<Map<string, LocationMatch>> {
  const { data } = await admin.from('locations').select('id, location_number, customer_id, customers(name)').eq('company_id', companyId).not('location_number', 'is', null).limit(5000)
  const by = new Map<string, LocationMatch[]>()
  for (const l of data ?? []) {
    const n = String(l.location_number ?? '').trim()
    if (!n) continue
    const m = { locationId: l.id as string, customerId: (l.customer_id as string | null) ?? null, customerName: ((l.customers as unknown as { name?: string } | null)?.name) ?? null }
    by.set(n, [...(by.get(n) ?? []), m])
  }
  return new Map([...by].filter(([, v]) => v.length === 1).map(([k, v]) => [k, v[0]]))
}

export interface PreviewSummary {
  stats: Record<string, number>
  warnings: string[]
  changed: { trackingNumber: string; summary: string | null; flags: string[] }[]
  flagged: { trackingNumber: string; flags: string[] }[]
  missing: Plan['missing']
  sameFileAs: { id: string; committedAt: string | null; sourceName: string | null } | null
}

/** Builds and stores the plan for a draft import. Safe to call again; nothing is written to work orders. */
export async function previewImport(ctx: ScContext, importId: string): Promise<PreviewSummary> {
  const { admin, companyId } = ctx
  const { data: imp } = await admin.from('sc_imports').select('id, status, rows, coverage, file_hash, warnings').eq('id', importId).eq('company_id', companyId).single()
  if (!imp) throw new Error('Import not found.')
  if (imp.status !== 'draft') throw new Error(`This import was already ${imp.status}.`)
  const rows = (imp.rows as NormalizedRow[] | null) ?? []
  const [existing, locations] = await Promise.all([existingForPlan(admin, companyId), locationMatches(admin, companyId)])
  const today = new Date().toISOString().slice(0, 10)
  const plan = buildPlan({ rows, existing, coverage: coverageOf(imp.coverage), today, locations })
  let sameFileAs: PreviewSummary['sameFileAs'] = null
  if (imp.file_hash) {
    const { data: prior } = await admin.from('sc_imports').select('id, committed_at, source_name').eq('company_id', companyId).eq('file_hash', imp.file_hash).eq('status', 'committed').order('committed_at', { ascending: false }).limit(1).maybeSingle()
    if (prior) { sameFileAs = { id: prior.id as string, committedAt: (prior.committed_at as string | null) ?? null, sourceName: (prior.source_name as string | null) ?? null }; plan.warnings.unshift(`This exact file was already imported${prior.committed_at ? ` on ${new Date(prior.committed_at as string).toLocaleDateString()}` : ''}. Importing it again changes nothing.`) }
  }
  const warnings = [...((imp.warnings as string[]) ?? []), ...plan.warnings]
  await admin.from('sc_imports').update({ plan, stats: plan.stats, warnings }).eq('id', importId)
  return {
    stats: plan.stats, warnings,
    changed: plan.rows.filter((r) => r.kind === 'changed').slice(0, 200).map((r) => ({ trackingNumber: r.trackingNumber, summary: r.summary, flags: r.flags })),
    flagged: plan.rows.filter((r) => r.flags.length && r.kind === 'new').slice(0, 200).map((r) => ({ trackingNumber: r.trackingNumber, flags: r.flags })),
    missing: plan.missing.slice(0, 500), sameFileAs,
  }
}

export async function commitImport(ctx: ScContext, importId: string): Promise<Record<string, number>> {
  const { data, error } = await ctx.admin.rpc('sc_commit_import', { p_import: importId, p_actor: ctx.userId, p_actor_name: ctx.userName })
  if (error) {
    logger.error('sc commit', error)
    await ctx.admin.from('sc_imports').update({ error: error.message }).eq('id', importId).eq('company_id', ctx.companyId)
    throw new Error(`The import was not applied: ${error.message}`)
  }
  return (data as Record<string, number>) ?? {}
}

/* ── Events ──────────────────────────────────────────────────────────────── */

export async function logEvent(ctx: ScContext, workOrderId: string, kind: string, body: string | null, detail: Record<string, unknown> = {}): Promise<void> {
  await ctx.admin.from('sc_events').insert({ company_id: ctx.companyId, work_order_id: workOrderId, kind, actor_id: ctx.userId, actor_name: ctx.userName, body, detail })
}

/* ── Official measures ───────────────────────────────────────────────────── */

export const MEASURE_KEYS = new Set<string>(MEASURES.map((m) => m.key))

/**
 * The dated baseline from the October 10, 2026 review (CEO packet). Real
 * recorded values with their real periods; the Overall score was not captured
 * and is deliberately absent. Inserted once per company (keyed on source).
 */
export const BASELINE_SOURCE = 'October 10, 2026 review (CEO packet of October 13, 2026)'
export const BASELINE_ENTRIES: Omit<MetricEntryView, 'id' | 'createdAt'>[] = [
  { measure: 'quality', value: 46, previousValue: 68, unit: 'score', snapshotDate: '2026-10-10', periodLabel: 'September 2026 (monthly Quality, not the overall score)', scorecardView: 'Provider scorecard', filters: null, eligibleCount: null, source: BASELINE_SOURCE, isSample: false, note: 'Fell from 68 to 46 in September 2026.' },
  { measure: 'recall_rate', value: 9, previousValue: 5, unit: '%', snapshotDate: '2026-10-10', periodLabel: 'September 2026 (displayed movement)', scorecardView: 'Provider scorecard', filters: null, eligibleCount: 12, source: BASELINE_SOURCE, isSample: false, note: '12 recall orders, including 10 ALDI; the complete 12-ID export was not in the packet.' },
  { measure: 'engagement', value: 88, previousValue: null, unit: 'score', snapshotDate: '2026-10-10', periodLabel: 'As recorded in the October 10 review', scorecardView: 'Provider scorecard', filters: null, eligibleCount: null, source: BASELINE_SOURCE, isSample: false, note: null },
  { measure: 'quote_turnaround_days', value: 4.6, previousValue: null, unit: 'days', snapshotDate: '2026-10-10', periodLabel: '36 complete months through September 2026', scorecardView: 'Provider scorecard', filters: null, eligibleCount: null, source: BASELINE_SOURCE, isSample: false, note: 'Not a one-month result.' },
  { measure: 'pm_checkin_pct', value: 36, previousValue: null, unit: '%', snapshotDate: '2026-10-10', periodLabel: '36 complete months through September 2026', scorecardView: 'Maintenance', filters: 'CubeSmart', eligibleCount: null, source: BASELINE_SOURCE, isSample: false, note: 'CubeSmart maintenance check-in compliance. Not a one-month result.' },
  { measure: 'pm_schedule_pct', value: 49, previousValue: null, unit: '%', snapshotDate: '2026-10-10', periodLabel: '36 complete months through September 2026', scorecardView: 'Maintenance', filters: 'CubeSmart', eligibleCount: null, source: BASELINE_SOURCE, isSample: false, note: 'CubeSmart maintenance schedule confirmation. Not a one-month result.' },
]
