import 'server-only'

// The accountability records PhaseForge owns on top of the imported work
// orders: the people directory, standalone responsibilities (tasks), customer
// recovery records, improvement projects, and root-cause investigations.
// Loaders only; writes live in the server actions. Nothing here is imported
// from ServiceChannel and nothing here contacts it.

import type { Admin, ScContext } from './server'
import { mapRow, mapRows } from './server'
import type { CauseClass, InvestigationStatus, ProjectStatus, RecoveryOutcome, RecoveryStatus, TaskKind, InternalStatus } from './types'

type Row = Record<string, unknown>

/* ── People ───────────────────────────────────────────────────────────────── */

/**
 * An owner is a PhaseForge profile (its uuid) or a directory employee with no
 * login ("emp:" + employee uuid). The database keeps the two in separate
 * columns; this key is what the selects and the views carry.
 */
export const EMP = 'emp:'
export const ownerKey = (profileId: unknown, employeeId: unknown): string | null => (profileId ? String(profileId) : employeeId ? `${EMP}${employeeId}` : null)
export function ownerCols(key: string | null | undefined, name: string | null | undefined, prefix = 'owner') {
  const k = key?.trim() || null
  return {
    [`${prefix}_profile_id`]: k && !k.startsWith(EMP) ? k : null,
    [`${prefix}_employee_id`]: k && k.startsWith(EMP) ? k.slice(EMP.length) : null,
    [`${prefix}_name`]: name?.trim() || null,
  } as Record<string, string | null>
}

export interface EmployeeView { id: string; name: string; email: string | null; phone: string | null; department: string | null; jobRole: string | null; isActive: boolean; profileId: string | null; profileName: string | null }
export async function loadEmployees(admin: Admin, companyId: string, includeInactive = false): Promise<EmployeeView[]> {
  let q = admin.from('employees').select('id, name, email, phone, department, job_role, is_active, profile_id, profiles(full_name)').eq('company_id', companyId).order('name')
  if (!includeInactive) q = q.eq('is_active', true)
  const { data } = await q
  return (data ?? []).map((r) => ({
    id: r.id as string, name: r.name as string, email: (r.email as string | null) ?? null, phone: (r.phone as string | null) ?? null, department: (r.department as string | null) ?? null,
    jobRole: (r.job_role as string | null) ?? null, isActive: !!r.is_active, profileId: (r.profile_id as string | null) ?? null,
    profileName: ((r.profiles as unknown as { full_name?: string } | null)?.full_name) ?? null,
  }))
}

/* ── Tasks (responsibilities) ─────────────────────────────────────────────── */

export type RecordType = 'work_order' | 'recovery' | 'project' | 'investigation'
export interface RecordRef { type: RecordType; id: string; label: string; href: string }

export interface TaskFull {
  id: string; title: string; description: string | null; kind: TaskKind; queue: string; status: InternalStatus
  ownerKey: string | null; ownerName: string | null; department: string | null; waitingOn: string | null
  nextAction: string | null; dueDate: string | null; blockerReason: string | null; source: string
  acceptedAt: string | null; completedAt: string | null; verifiedAt: string | null
  externalAckBy: string | null; externalAckAt: string | null; escalatedAt: string | null; escalatedTo: string | null; escalationNote: string | null
  lastUpdateAt: string; createdAt: string
  workOrderId: string | null; projectId: string | null; investigationId: string | null; recoveryId: string | null
  /** What the task belongs to, for display. Null for a free-standing responsibility. */
  record: RecordRef | null
}

const TASK_COLS = 'id, title, description, kind, queue, status, owner_profile_id, owner_employee_id, owner_name, department, waiting_on, next_action, due_date, blocker_reason, source, accepted_at, completed_at, verified_at, external_ack_by, external_ack_at, escalated_at, escalated_to, escalation_note, last_update_at, created_at, work_order_id, project_id, investigation_id, recovery_id'

export function toTask(r: Row, refs: { wo?: Map<string, string>; project?: Map<string, string>; investigation?: Map<string, string>; recovery?: Map<string, string> } = {}): TaskFull {
  const base = mapRow<Omit<TaskFull, 'ownerKey' | 'record'>>(r)
  let record: RecordRef | null = null
  if (r.work_order_id) record = { type: 'work_order', id: r.work_order_id as string, label: refs.wo?.get(r.work_order_id as string) ?? 'Work order', href: `/app/servicechannel/work-orders/${r.work_order_id}` }
  else if (r.recovery_id) record = { type: 'recovery', id: r.recovery_id as string, label: refs.recovery?.get(r.recovery_id as string) ?? 'Customer recovery', href: `/app/servicechannel/customer-recovery/${r.recovery_id}` }
  else if (r.project_id) record = { type: 'project', id: r.project_id as string, label: refs.project?.get(r.project_id as string) ?? 'Improvement project', href: `/app/servicechannel/projects/${r.project_id}` }
  else if (r.investigation_id) record = { type: 'investigation', id: r.investigation_id as string, label: refs.investigation?.get(r.investigation_id as string) ?? 'Root cause investigation', href: `/app/servicechannel/rca/${r.investigation_id}` }
  return { ...base, kind: ((r.kind as TaskKind) ?? 'follow_up'), ownerKey: ownerKey(r.owner_profile_id, r.owner_employee_id), record }
}

/** Every task, open ones by default, with the label of whatever it belongs to. */
export async function loadTasks(admin: Admin, companyId: string, opts: { includeClosed?: boolean; workOrderId?: string; projectId?: string; investigationId?: string; recoveryId?: string } = {}): Promise<TaskFull[]> {
  let q = admin.from('sc_tasks').select(TASK_COLS).eq('company_id', companyId).order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }).limit(5000)
  if (!opts.includeClosed) q = q.neq('status', 'verified_resolved')
  if (opts.workOrderId) q = q.eq('work_order_id', opts.workOrderId)
  if (opts.projectId) q = q.eq('project_id', opts.projectId)
  if (opts.investigationId) q = q.eq('investigation_id', opts.investigationId)
  if (opts.recoveryId) q = q.eq('recovery_id', opts.recoveryId)
  const rows = ((await q).data ?? []) as Row[]
  const ids = (k: string) => [...new Set(rows.map((r) => r[k] as string | null).filter((x): x is string => !!x))]
  const [wo, pr, inv, rec] = await Promise.all([
    ids('work_order_id').length ? admin.from('sc_work_orders').select('id, tracking_number, customer_name, store_number').in('id', ids('work_order_id')) : Promise.resolve({ data: [] as Row[] }),
    ids('project_id').length ? admin.from('sc_projects').select('id, name').in('id', ids('project_id')) : Promise.resolve({ data: [] as Row[] }),
    ids('investigation_id').length ? admin.from('sc_investigations').select('id, title').in('id', ids('investigation_id')) : Promise.resolve({ data: [] as Row[] }),
    ids('recovery_id').length ? admin.from('sc_recoveries').select('id, customer_name, store_label, tracking_number').in('id', ids('recovery_id')) : Promise.resolve({ data: [] as Row[] }),
  ])
  const refs = {
    wo: new Map(((wo.data ?? []) as Row[]).map((w) => [w.id as string, `${w.tracking_number}${w.customer_name ? ` · ${w.customer_name}` : ''}${w.store_number ? ` ${w.store_number}` : ''}`])),
    project: new Map(((pr.data ?? []) as Row[]).map((p) => [p.id as string, p.name as string])),
    investigation: new Map(((inv.data ?? []) as Row[]).map((i) => [i.id as string, i.title as string])),
    recovery: new Map(((rec.data ?? []) as Row[]).map((x) => [x.id as string, [x.customer_name, x.store_label, x.tracking_number].filter(Boolean).join(' · ') || 'Customer recovery'])),
  }
  return rows.map((r) => toTask(r, refs))
}

/* ── Customer recovery ────────────────────────────────────────────────────── */

export interface RecoveryView {
  id: string; workOrderId: string | null; trackingNumber: string | null; customerName: string | null; storeLabel: string | null; reportingContact: string | null
  complaint: string; approvedScope: string | null; findings: string | null
  ownerKey: string | null; ownerName: string | null; department: string | null
  contactDate: string | null; conversationNotes: string | null; agreedResolution: string | null; requiredAction: string | null; followUpDeadline: string | null
  verificationEvidence: string | null; outcome: RecoveryOutcome | null; status: RecoveryStatus
  lastUpdateAt: string; createdName: string | null; createdAt: string; updatedAt: string
  openTasks: number
}
const toRecovery = (r: Row, openTasks = 0): RecoveryView => ({ ...mapRow<Omit<RecoveryView, 'ownerKey' | 'openTasks'>>(r), ownerKey: ownerKey(r.owner_profile_id, r.owner_employee_id), openTasks })

export async function loadRecoveries(admin: Admin, companyId: string): Promise<RecoveryView[]> {
  const [{ data }, { data: tasks }] = await Promise.all([
    admin.from('sc_recoveries').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(2000),
    admin.from('sc_tasks').select('recovery_id').eq('company_id', companyId).not('recovery_id', 'is', null).neq('status', 'verified_resolved'),
  ])
  const open = new Map<string, number>()
  for (const t of tasks ?? []) open.set(t.recovery_id as string, (open.get(t.recovery_id as string) ?? 0) + 1)
  return ((data ?? []) as Row[]).map((r) => toRecovery(r, open.get(r.id as string) ?? 0))
}
export async function loadRecovery(admin: Admin, companyId: string, id: string): Promise<{ recovery: RecoveryView; tasks: TaskFull[]; events: RecordEvent[] } | null> {
  const { data } = await admin.from('sc_recoveries').select('*').eq('company_id', companyId).eq('id', id).maybeSingle()
  if (!data) return null
  const [tasks, events] = await Promise.all([loadTasks(admin, companyId, { recoveryId: id, includeClosed: true }), loadRecordEvents(admin, companyId, 'recovery', id)])
  return { recovery: toRecovery(data as Row, tasks.filter((t) => t.status !== 'verified_resolved').length), tasks, events }
}

/* ── Improvement projects ─────────────────────────────────────────────────── */

export interface ProjectView {
  id: string; name: string; scopeCustomer: string | null; department: string | null; scoreCategory: string | null; kpi: string | null
  baselineValue: number | null; baselinePeriod: string | null; targetValue: number | null
  ownerKey: string | null; ownerName: string | null; startDate: string | null; targetDate: string | null; reviewDate: string | null
  rootProblem: string | null; actionPlan: string | null; verificationMethod: string | null; managementNotes: string | null; blockers: string | null
  status: ProjectStatus; lastUpdateAt: string; createdName: string | null; createdAt: string
  /** Tasks on the project: verified complete over all, for the percent complete. */
  tasksTotal: number; tasksDone: number; tasksOverdue: number; milestonesTotal: number; milestonesDone: number; latestKpi: KpiView | null
}
export interface MilestoneView { id: string; projectId: string; title: string; dueDate: string | null; completedAt: string | null; note: string | null; sortOrder: number }
export interface KpiView { id: string; projectId: string; kind: 'baseline' | 'progress' | 'result'; label: string; value: number | null; snapshotDate: string; periodLabel: string | null; source: string | null; note: string | null; createdAt: string }
export interface UpdateView { id: string; projectId: string; body: string; authorName: string | null; createdAt: string }
export interface ProjectLinkView { id: string; projectId: string; workOrderId: string; note: string | null; trackingNumber: string; customerName: string | null; storeLabel: string | null; status: string | null; statusExt: string | null }

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
const toKpi = (r: Row): KpiView => ({ ...mapRow<KpiView>(r), value: num(r.value) })
function toProject(r: Row, agg: Partial<Pick<ProjectView, 'tasksTotal' | 'tasksDone' | 'tasksOverdue' | 'milestonesTotal' | 'milestonesDone' | 'latestKpi'>> = {}): ProjectView {
  return {
    ...mapRow<Omit<ProjectView, 'ownerKey' | 'tasksTotal' | 'tasksDone' | 'tasksOverdue' | 'milestonesTotal' | 'milestonesDone' | 'latestKpi'>>(r),
    baselineValue: num(r.baseline_value), targetValue: num(r.target_value), ownerKey: ownerKey(r.owner_profile_id, r.owner_employee_id),
    tasksTotal: agg.tasksTotal ?? 0, tasksDone: agg.tasksDone ?? 0, tasksOverdue: agg.tasksOverdue ?? 0, milestonesTotal: agg.milestonesTotal ?? 0, milestonesDone: agg.milestonesDone ?? 0, latestKpi: agg.latestKpi ?? null,
  }
}

export async function loadProjects(admin: Admin, companyId: string, today: string): Promise<ProjectView[]> {
  const [{ data }, { data: tasks }, { data: ms }, { data: kpis }] = await Promise.all([
    admin.from('sc_projects').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(500),
    admin.from('sc_tasks').select('project_id, status, due_date').eq('company_id', companyId).not('project_id', 'is', null),
    admin.from('sc_project_milestones').select('project_id, completed_at').eq('company_id', companyId),
    admin.from('sc_project_kpis').select('*').eq('company_id', companyId).order('snapshot_date', { ascending: false }).order('created_at', { ascending: false }),
  ])
  const agg = new Map<string, { tasksTotal: number; tasksDone: number; tasksOverdue: number; milestonesTotal: number; milestonesDone: number; latestKpi: KpiView | null }>()
  const get = (id: string) => { if (!agg.has(id)) agg.set(id, { tasksTotal: 0, tasksDone: 0, tasksOverdue: 0, milestonesTotal: 0, milestonesDone: 0, latestKpi: null }); return agg.get(id)! }
  for (const t of tasks ?? []) { const a = get(t.project_id as string); a.tasksTotal++; if (t.status === 'verified_resolved') a.tasksDone++; else if (t.due_date && (t.due_date as string) < today) a.tasksOverdue++ }
  for (const m of ms ?? []) { const a = get(m.project_id as string); a.milestonesTotal++; if (m.completed_at) a.milestonesDone++ }
  for (const k of (kpis ?? []) as Row[]) { const a = get(k.project_id as string); if (!a.latestKpi && k.kind !== 'baseline') a.latestKpi = toKpi(k) }
  return ((data ?? []) as Row[]).map((r) => toProject(r, agg.get(r.id as string)))
}

export interface ProjectBundle { project: ProjectView; milestones: MilestoneView[]; kpis: KpiView[]; updates: UpdateView[]; links: ProjectLinkView[]; tasks: TaskFull[]; investigations: { id: string; title: string; status: string }[]; events: RecordEvent[] }
export async function loadProject(admin: Admin, companyId: string, id: string, today: string): Promise<ProjectBundle | null> {
  const { data } = await admin.from('sc_projects').select('*').eq('company_id', companyId).eq('id', id).maybeSingle()
  if (!data) return null
  const [ms, kpis, updates, links, tasks, inv, events] = await Promise.all([
    admin.from('sc_project_milestones').select('*').eq('project_id', id).order('sort_order').order('due_date', { nullsFirst: false }),
    admin.from('sc_project_kpis').select('*').eq('project_id', id).order('snapshot_date', { ascending: false }).order('created_at', { ascending: false }),
    admin.from('sc_project_updates').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(200),
    admin.from('sc_project_links').select('id, project_id, work_order_id, note, sc_work_orders(tracking_number, customer_name, store_label, status, status_ext)').eq('project_id', id),
    loadTasks(admin, companyId, { projectId: id, includeClosed: true }),
    admin.from('sc_investigations').select('id, title, status').eq('project_id', id),
    loadRecordEvents(admin, companyId, 'project', id),
  ])
  const milestones = mapRows<MilestoneView>(ms.data as Row[])
  const kpiList = ((kpis.data ?? []) as Row[]).map(toKpi)
  const project = toProject(data as Row, {
    tasksTotal: tasks.length, tasksDone: tasks.filter((t) => t.status === 'verified_resolved').length, tasksOverdue: tasks.filter((t) => t.status !== 'verified_resolved' && t.dueDate && t.dueDate < today).length,
    milestonesTotal: milestones.length, milestonesDone: milestones.filter((m) => m.completedAt).length, latestKpi: kpiList.find((k) => k.kind !== 'baseline') ?? null,
  })
  return {
    project, milestones, kpis: kpiList, updates: mapRows<UpdateView>(updates.data as Row[]), tasks, events,
    links: ((links.data ?? []) as Row[]).map((l) => { const w = (l.sc_work_orders as unknown as Row | null) ?? {}; return { id: l.id as string, projectId: l.project_id as string, workOrderId: l.work_order_id as string, note: (l.note as string | null) ?? null, trackingNumber: (w.tracking_number as string) ?? '?', customerName: (w.customer_name as string | null) ?? null, storeLabel: (w.store_label as string | null) ?? null, status: (w.status as string | null) ?? null, statusExt: (w.status_ext as string | null) ?? null } }),
    investigations: ((inv.data ?? []) as Row[]).map((i) => ({ id: i.id as string, title: i.title as string, status: i.status as string })),
  }
}

/* ── Root cause investigations ────────────────────────────────────────────── */

export interface InvestigationView {
  id: string; title: string; description: string | null; customerName: string | null; equipment: string | null; impact: string | null; evidence: string | null
  suspectedCause: string | null; verifiedCause: string | null; causeClass: CauseClass | null; department: string | null
  correctiveAction: string | null; preventionPlan: string | null; ownerKey: string | null; ownerName: string | null
  status: InvestigationStatus; verificationDate: string | null; outcome: string | null; projectId: string | null; projectName: string | null
  lastUpdateAt: string; createdName: string | null; createdAt: string; linkedCount: number; openTasks: number
}
const toInvestigation = (r: Row, linkedCount = 0, openTasks = 0): InvestigationView => ({
  ...mapRow<Omit<InvestigationView, 'ownerKey' | 'linkedCount' | 'openTasks' | 'projectName'>>(r), ownerKey: ownerKey(r.owner_profile_id, r.owner_employee_id),
  projectName: ((r.sc_projects as unknown as { name?: string } | null)?.name) ?? null, linkedCount, openTasks,
})
export async function loadInvestigations(admin: Admin, companyId: string): Promise<InvestigationView[]> {
  const [{ data }, { data: links }, { data: tasks }] = await Promise.all([
    admin.from('sc_investigations').select('*, sc_projects(name)').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1000),
    admin.from('sc_investigation_links').select('investigation_id').eq('company_id', companyId),
    admin.from('sc_tasks').select('investigation_id').eq('company_id', companyId).not('investigation_id', 'is', null).neq('status', 'verified_resolved'),
  ])
  const lc = new Map<string, number>(), tc = new Map<string, number>()
  for (const l of links ?? []) lc.set(l.investigation_id as string, (lc.get(l.investigation_id as string) ?? 0) + 1)
  for (const t of tasks ?? []) tc.set(t.investigation_id as string, (tc.get(t.investigation_id as string) ?? 0) + 1)
  return ((data ?? []) as Row[]).map((r) => toInvestigation(r, lc.get(r.id as string) ?? 0, tc.get(r.id as string) ?? 0))
}
export interface InvestigationBundle { investigation: InvestigationView; links: ProjectLinkView[]; tasks: TaskFull[]; events: RecordEvent[] }
export async function loadInvestigation(admin: Admin, companyId: string, id: string): Promise<InvestigationBundle | null> {
  const { data } = await admin.from('sc_investigations').select('*, sc_projects(name)').eq('company_id', companyId).eq('id', id).maybeSingle()
  if (!data) return null
  const [links, tasks, events] = await Promise.all([
    admin.from('sc_investigation_links').select('id, investigation_id, work_order_id, note, sc_work_orders(tracking_number, customer_name, store_label, status, status_ext)').eq('investigation_id', id),
    loadTasks(admin, companyId, { investigationId: id, includeClosed: true }), loadRecordEvents(admin, companyId, 'investigation', id),
  ])
  return {
    investigation: toInvestigation(data as Row, (links.data ?? []).length, tasks.filter((t) => t.status !== 'verified_resolved').length), tasks, events,
    links: ((links.data ?? []) as Row[]).map((l) => { const w = (l.sc_work_orders as unknown as Row | null) ?? {}; return { id: l.id as string, projectId: l.investigation_id as string, workOrderId: l.work_order_id as string, note: (l.note as string | null) ?? null, trackingNumber: (w.tracking_number as string) ?? '?', customerName: (w.customer_name as string | null) ?? null, storeLabel: (w.store_label as string | null) ?? null, status: (w.status as string | null) ?? null, statusExt: (w.status_ext as string | null) ?? null } }),
  }
}

/* ── Activity on records ──────────────────────────────────────────────────── */

export interface RecordEvent { id: string; kind: string; actorName: string | null; body: string | null; detail: Record<string, unknown>; createdAt: string }
export async function loadRecordEvents(admin: Admin, companyId: string, type: RecordType, id: string): Promise<RecordEvent[]> {
  const { data } = await admin.from('sc_events').select('id, kind, actor_name, body, detail, created_at').eq('company_id', companyId).eq('record_type', type).eq('record_id', id).order('created_at', { ascending: false }).limit(300)
  return mapRows<RecordEvent>(data as Row[])
}
export async function logRecordEvent(ctx: ScContext, type: RecordType, id: string, kind: string, body: string | null, detail: Record<string, unknown> = {}): Promise<void> {
  await ctx.admin.from('sc_events').insert({ company_id: ctx.companyId, work_order_id: type === 'work_order' ? id : null, record_type: type, record_id: id, kind, actor_id: ctx.userId, actor_name: ctx.userName, body, detail })
}

/** Recent activity across everything, for the Command Center. */
export async function loadRecentActivity(admin: Admin, companyId: string, sinceIso: string): Promise<{ kind: string; count: number }[]> {
  const { data } = await admin.from('sc_events').select('kind').eq('company_id', companyId).gte('created_at', sinceIso).not('import_id', 'is', null).limit(1)
  void data
  const { data: rows } = await admin.from('sc_events').select('kind').eq('company_id', companyId).gte('created_at', sinceIso).is('import_id', null).limit(5000)
  const m = new Map<string, number>()
  for (const r of rows ?? []) m.set(r.kind as string, (m.get(r.kind as string) ?? 0) + 1)
  return [...m].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count)
}
