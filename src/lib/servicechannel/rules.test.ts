import { describe, expect, it } from 'vitest'
import { suggestFor } from './rules'
import { buildActionCenter } from './actionCenter'
import { buildAlerts } from './alerts'
import type { ProjectView, RecoveryView, TaskFull } from './records'
import type { ScSettings } from './server'
import type { CaseView, WorkOrderView } from './server'

const TODAY = '2026-10-13'
const caseOf = (over: Partial<CaseView> = {}): CaseView => ({
  internalStatus: 'new', ownerProfileId: null, ownerName: null, department: null, nextAction: null, dueDate: null, blockerReason: null, priorityOverride: null, priorityReason: null,
  handoffAcceptedAt: null, verifiedResolvedAt: null, lastUpdateAt: '2026-10-12T10:00:00Z', actionOwnerProfileId: null, actionOwnerName: null, ownerAssignedAt: null, waitingOn: null,
  externalAckBy: null, externalAckRecordedName: null, externalAckAt: null, appointmentOn: null, partsExpectedOn: null, partsReceivedOn: null, approvalStatus: null, equipmentCondition: null,
  conditionVerifiedAt: null, customerContactName: null, nextContactOn: null, ...over,
})
const wo = (over: Partial<WorkOrderView> = {}, c: Partial<CaseView> = {}): WorkOrderView => ({
  id: 'w1', trackingNumber: '100', woNumber: null, poNumber: null, customerName: null, customerSource: null, conflicts: [], storeLabel: '49-00699 - Winter Garden,FL', storeNumber: '49-00699', storeCity: null, storeState: null,
  region: null, district: null, trade: 'REFRIGERATION', category: 'REPAIR', priority: 'P3 (2 BUSINESS DAYS)', area: null, equipment: null, problemType: null, problemCode: null, tagId: null, problemDescription: 'Case warm', submittedBy: null,
  callDate: '2026-10-01', scheduledDate: null, originalEta: null, reassignDate: null, reassignTime: null, status: 'IN PROGRESS', statusExt: 'DISPATCH CONFIRMED', resolution: null, nte: null, currency: null, assignee: null, dateAssigned: null,
  technicians: [], timezone: null, kalosJobNumber: null, customerId: null, locationId: null, callId: null, firstSeenAt: '2026-10-13T09:00:00Z', lastSeenAt: '2026-10-13T09:00:00Z', observationState: 'observed', verifiedAt: null, verifiedNote: null,
  reopenCount: 0, unsatCount: 0, lastReopenedAt: null, lastUnsatAt: null, case: caseOf(c), openTasks: 0, ...over,
})
const keys = (w: WorkOrderView, tasks: { status: string; dueDate: string | null; title: string }[] = [], contacted = false) => suggestFor(w, tasks, TODAY, { contactedSinceUnsat: contacted }).map((s) => `${s.kind}:${s.key}`)

describe('suggestFor', () => {
  it('flags a missing owner as an exception on an active order, and nothing on a resolved one', () => {
    expect(keys(wo())).toContain('exception:no_owner')
    expect(keys(wo({}, { internalStatus: 'verified_resolved' }))).toEqual([])
    expect(keys(wo({ observationState: 'not_in_latest' }))).toEqual([])
  })
  it('overdue follow-up and overdue task are exceptions with the dates as basis', () => {
    const s = suggestFor(wo({}, { ownerProfileId: 'p', dueDate: '2026-10-10' }), [{ status: 'in_progress', dueDate: '2026-10-11', title: 'Call site' }], TODAY, { contactedSinceUnsat: false })
    expect(s.find((x) => x.key === 'case_overdue')).toMatchObject({ kind: 'exception', title: 'Follow-up overdue by 3 day(s)' })
    expect(s.find((x) => x.key === 'task_overdue')?.basis).toContain('"Call site" due 2026-10-11')
  })
  it('suggests customer contact for an unsatisfactory report until one is recorded', () => {
    expect(keys(wo({ statusExt: 'UNSATISFACTORY' }, { ownerProfileId: 'p' }))).toContain('suggestion:unsat_contact')
    expect(keys(wo({ statusExt: 'UNSATISFACTORY' }, { ownerProfileId: 'p' }), [], true)).not.toContain('suggestion:unsat_contact')
  })
  it('unacknowledged after two days, not before, and not once acknowledged externally', () => {
    expect(keys(wo({}, { ownerProfileId: 'p', ownerAssignedAt: '2026-10-10T00:00:00Z' }))).toContain('exception:unacknowledged')
    expect(keys(wo({}, { ownerProfileId: 'p', ownerAssignedAt: '2026-10-12T00:00:00Z' }))).not.toContain('exception:unacknowledged')
    expect(keys(wo({}, { ownerProfileId: 'p', ownerAssignedAt: '2026-10-01T00:00:00Z', externalAckAt: '2026-10-02T00:00:00Z' }))).not.toContain('exception:unacknowledged')
  })
  it('only suggests scheduling from recorded facts, never from a status the export lacks', () => {
    expect(keys(wo({}, { ownerProfileId: 'p', approvalStatus: 'approved' }))).toContain('suggestion:approved_no_appt')
    expect(keys(wo({}, { ownerProfileId: 'p', approvalStatus: 'approved', appointmentOn: '2026-10-20' }))).not.toContain('suggestion:approved_no_appt')
    expect(keys(wo({}, { ownerProfileId: 'p', partsReceivedOn: '2026-10-11' }))).toContain('suggestion:parts_no_appt')
    expect(keys(wo({ statusExt: 'PARTS ON ORDER' }, { ownerProfileId: 'p' }))).toContain('suggestion:parts_no_eta')
    expect(keys(wo({ statusExt: 'PARTS ON ORDER' }, { ownerProfileId: 'p', partsExpectedOn: '2026-10-20' }))).not.toContain('suggestion:parts_no_eta')
  })
  it('names the ETA as the export field, not an SLA', () => {
    const s = suggestFor(wo({ originalEta: '2026-10-01' }, { ownerProfileId: 'p' }), [], TODAY, { contactedSinceUnsat: false }).find((x) => x.key === 'eta_passed')
    expect(s?.kind).toBe('suggestion')
    expect(s?.basis).toMatch(/no SLA deadline/)
  })
  it('a future PM is not a problem; a passed PM date is a suggestion', () => {
    expect(keys(wo({ category: 'MAINTENANCE', scheduledDate: '2026-12-29' }, { ownerProfileId: 'p' }))).toEqual([])
    expect(keys(wo({ category: 'MAINTENANCE', scheduledDate: '2026-09-30' }, { ownerProfileId: 'p' }))).toContain('suggestion:pm_date_passed')
  })
  it('pending verification and conflicts are exceptions', () => {
    expect(keys(wo({}, { ownerProfileId: 'p', internalStatus: 'pending_verification' }))).toContain('exception:verify')
    expect(keys(wo({ conflicts: [{ field: 'customer_name', imported: 'ALDI Inc', kept: 'ALDI', keptSource: 'manual', importId: 'i', at: 't' }] }, { ownerProfileId: 'p' }))).toContain('exception:conflict')
  })
})

describe('buildActionCenter', () => {
  const task = (over: Partial<TaskFull> = {}): TaskFull => ({
    id: 't1', title: 'Call the site', description: null, kind: 'follow_up', queue: 'general', status: 'assigned', ownerKey: 'p', ownerName: 'Maya', department: 'Refrigeration', waitingOn: null,
    nextAction: null, dueDate: null, blockerReason: null, source: 'manual', acceptedAt: '2026-10-12T00:00:00Z', completedAt: null, verifiedAt: null, externalAckBy: null, externalAckAt: null,
    escalatedAt: null, escalatedTo: null, escalationNote: null, lastUpdateAt: '2026-10-12T10:00:00Z', createdAt: '2026-10-12T10:00:00Z', workOrderId: null, projectId: null, investigationId: null, recoveryId: null, record: null, ...over,
  })
  const recovery = (over: Partial<RecoveryView> = {}): RecoveryView => ({
    id: 'r1', workOrderId: null, trackingNumber: '200', customerName: 'ALDI', storeLabel: '49-00699', reportingContact: null, complaint: 'Case still warm', approvedScope: null, findings: null, ownerKey: 'p', ownerName: 'Maya', department: 'Refrigeration',
    contactDate: null, conversationNotes: null, agreedResolution: null, requiredAction: null, followUpDeadline: null, verificationEvidence: null, outcome: null, status: 'open', lastUpdateAt: '2026-10-12T10:00:00Z', createdName: null, createdAt: '2026-10-12T10:00:00Z', updatedAt: '2026-10-12T10:00:00Z', openTasks: 0, ...over,
  })
  const project = (over: Partial<ProjectView> = {}): ProjectView => ({
    id: 'pj1', name: 'Project A', scopeCustomer: 'Cumberland Farms', department: null, scoreCategory: 'quality', kpi: 'Quality', baselineValue: 56, baselinePeriod: null, targetValue: 80, ownerKey: 'p', ownerName: 'Maya', startDate: null, targetDate: null, reviewDate: null,
    rootProblem: null, actionPlan: null, verificationMethod: null, managementNotes: null, blockers: null, status: 'active', lastUpdateAt: '2026-10-12T10:00:00Z', createdName: null, createdAt: '2026-10-12T10:00:00Z', tasksTotal: 0, tasksDone: 0, tasksOverdue: 0, milestonesTotal: 0, milestonesDone: 0, latestKpi: null, ...over,
  })
  const run = (wos: WorkOrderView[], tasks: TaskFull[] = [], extra: { recoveries?: RecoveryView[]; projects?: ProjectView[]; contacted?: Set<string> } = {}) =>
    buildActionCenter({ wos, tasks, recoveries: extra.recoveries, projects: extra.projects, contactedSinceUnsat: extra.contacted ?? new Set(), today: TODAY })
  const ids = (ac: ReturnType<typeof run>, group: 'needsToday' | 'upcoming' | 'waiting', key: string) => ac[group].find((s) => s.key === key)!.items.map((i) => i.id)

  it('an imported work order with nothing recorded is not a task', () => {
    const ac = run([wo({ id: 'plain' })])
    expect(ac.counts.needsToday).toBe(0)
    expect(ids(ac, 'needsToday', 'unassigned')).toEqual([])
  })
  it('a case someone started following up without an owner, and an ownerless task, land in no-owner', () => {
    const ac = run([wo({ id: 'c' }, { internalStatus: 'in_progress' })], [task({ id: 't', ownerKey: null, ownerName: null, status: 'new' })])
    expect(ids(ac, 'needsToday', 'unassigned')).toEqual(['c', 't'])
  })
  it('puts a future PM in Upcoming and a passed PM date in the PM problems list', () => {
    const ac = run([wo({ id: 'a', category: 'MAINTENANCE', scheduledDate: '2026-10-20' }, { ownerProfileId: 'p' }), wo({ id: 'b', category: 'MAINTENANCE', scheduledDate: '2026-09-30' }, { ownerProfileId: 'p' })])
    const pm = ac.upcoming.find((s) => s.key === 'pm')!
    expect(pm.items.map((i) => [i.id, i.reason])).toEqual([['b', 'Scheduled date 2026-09-30 passed, nothing recorded'], ['a', 'PM window within two weeks']])
    expect(ac.counts.needsToday).toBe(0)
  })
  it('sections needs-action correctly across work orders, tasks, recoveries, and projects', () => {
    const ac = run([
      wo({ id: 'o' }, { ownerProfileId: 'p', dueDate: '2026-10-01' }),
      wo({ id: 'c', statusExt: 'UNSATISFACTORY' }, { ownerProfileId: 'p' }),
      wo({ id: 'k' }, { ownerProfileId: 'p', ownerName: 'Maya', ownerAssignedAt: '2026-10-11T00:00:00Z' }),
      wo({ id: 'v' }, { ownerProfileId: 'p', internalStatus: 'pending_verification' }),
      wo({ id: 'e' }, { ownerProfileId: 'p', escalatedAt: '2026-10-12T00:00:00Z', escalatedTo: 'Bryan' }),
    ], [
      task({ id: 'td', dueDate: TODAY }), task({ id: 'to', dueDate: '2026-10-10', workOrderId: 'o', record: { type: 'work_order', id: 'o', label: '100', href: '/x' } }),
      task({ id: 'tb', status: 'blocked', lastUpdateAt: '2026-10-01T00:00:00Z', blockerReason: 'No parts' }), task({ id: 'tu', acceptedAt: null, createdAt: '2026-10-10T00:00:00Z' }),
    ], {
      recoveries: [recovery({ id: 'rn' }), recovery({ id: 'rl', contactDate: '2026-10-12', status: 'in_progress', followUpDeadline: '2026-10-11' })],
      projects: [project({ id: 'pr', reviewDate: '2026-10-01' })],
    })
    expect(ids(ac, 'needsToday', 'overdue')).toEqual(['o', 'pr', 'to', 'rl'])
    expect(ids(ac, 'needsToday', 'complaints')).toEqual(['c', 'rn'])
    expect(ids(ac, 'needsToday', 'unack')).toEqual(['k', 'tu'])
    expect(ids(ac, 'needsToday', 'due_today')).toEqual(['td'])
    expect(ids(ac, 'needsToday', 'blocked')).toEqual(['tb'])
    expect(ids(ac, 'needsToday', 'escalated')).toEqual(['e'])
    expect(ids(ac, 'needsToday', 'verify')).toEqual(['v'])
    expect(ac.needsToday.find((s) => s.key === 'escalated')!.items[0].reason).toContain('Escalated to Bryan')
    expect(ac.counts.needsToday).toBe(12)
  })
  it('thresholds move the unacknowledged and blocked rules', () => {
    const wos = [wo({ id: 'k' }, { ownerProfileId: 'p', ownerAssignedAt: '2026-10-11T00:00:00Z' })]
    const tasks = [task({ id: 'tb', status: 'blocked', lastUpdateAt: '2026-10-10T00:00:00Z' })]
    const strict = buildActionCenter({ wos, tasks, contactedSinceUnsat: new Set(), today: TODAY, thresholds: { unackDays: 1, staleDays: 1, reviewDays: 7 } })
    const lax = buildActionCenter({ wos, tasks, contactedSinceUnsat: new Set(), today: TODAY, thresholds: { unackDays: 5, staleDays: 10, reviewDays: 7 } })
    expect(strict.counts.unack).toBe(1); expect(strict.counts.blocked).toBe(1)
    expect(lax.counts.unack).toBe(0); expect(lax.counts.blocked).toBe(0)
  })
  it('waiting-on groups cases and tasks by the recorded reason, including the new reasons', () => {
    const ac = run([wo({ id: 't' }, { ownerProfileId: 'p', waitingOn: 'technician', nextAction: 'Field notes' })], [task({ id: 'ds', waitingOn: 'department_supervisor' }), task({ id: 'ca', waitingOn: 'customer_approval' }), task({ id: 'sc', waitingOn: 'scheduling' })])
    expect(ac.waiting.find((s) => s.key === 'technician')!.items[0].reason).toBe('Field notes')
    expect(ac.counts.department_supervisor).toBe(1); expect(ac.counts.customer_approval).toBe(1); expect(ac.counts.scheduling).toBe(1); expect(ac.counts.waiting).toBe(4)
  })
  it('upcoming: follow-ups within seven days, appointments within fourteen, reviews and corrective actions', () => {
    const ac = run([wo({ id: 'f' }, { ownerProfileId: 'p', dueDate: '2026-10-18' }), wo({ id: 'a', scheduledDate: '2026-10-25' }, { ownerProfileId: 'p' }), wo({ id: 'far' }, { ownerProfileId: 'p', dueDate: '2026-11-30' })],
      [task({ id: 'ca', kind: 'corrective_action', dueDate: '2026-10-22' }), task({ id: 'rv', kind: 'review', dueDate: '2026-10-20' })], { projects: [project({ id: 'pr', reviewDate: '2026-10-24' })] })
    expect(ids(ac, 'upcoming', 'follow_ups')).toEqual(['f'])
    expect(ids(ac, 'upcoming', 'appointments')).toEqual(['a'])
    expect(ids(ac, 'upcoming', 'corrective')).toEqual(['ca'])
    expect(ids(ac, 'upcoming', 'reviews')).toEqual(['rv', 'pr'])
  })
  it('verified work drops out everywhere', () => {
    const ac = run([wo({ id: 'v' }, { ownerProfileId: 'p', internalStatus: 'verified_resolved', dueDate: '2026-10-01', escalatedAt: 'x' })], [task({ id: 't', status: 'verified_resolved', dueDate: '2026-10-01' })], { recoveries: [recovery({ id: 'r', status: 'closed', followUpDeadline: '2026-10-01' })] })
    expect(ac.counts.needsToday).toBe(0)
  })

  describe('buildAlerts', () => {
    const settings: ScSettings = { targetOverall: 80, targetDate: '2027-10-13', lastImportId: null, lastImportAt: null, lastImportSource: null, lastCoverage: null, thresholds: { unackDays: 2, staleDays: 3, reviewDays: 7 }, lastScoreReviewAt: null }
    const metric = (measure: string, snapshotDate: string) => ({ id: 'm', measure: measure as 'overall', value: 68, previousValue: null, unit: 'score', snapshotDate, periodLabel: null, scorecardView: null, filters: 'Company-wide', eligibleCount: null, source: null, isSample: false, note: null, createdAt: '' })
    it('one row per condition, high first, with counts; missing scores are an alert of their own', () => {
      const wos = [wo({ id: 'o' }, { ownerProfileId: 'p', dueDate: '2026-10-01' }), wo({ id: 'q' }, { ownerProfileId: 'p', dueDate: '2026-10-02' })]
      const ac = run(wos)
      const alerts = buildAlerts({ ac, wos, tasks: [], projects: [project({ id: 'late', targetDate: '2026-10-01' })], investigations: [], metrics: [], settings, today: TODAY })
      expect(alerts.map((a) => a.key)).toEqual(['overdue', 'project_target', 'score_missing'])
      expect(alerts[0]).toMatchObject({ severity: 'high', count: 2 })
    })
    it('silent work: assigned, no due date, no update for the stale threshold; stale score reading after 35 days', () => {
      const tasks = [task({ id: 's', lastUpdateAt: '2026-10-01T00:00:00Z' }), task({ id: 'fresh' }), task({ id: 'dated', dueDate: '2026-12-01', lastUpdateAt: '2026-09-01T00:00:00Z' })]
      const ac = run([], tasks)
      const alerts = buildAlerts({ ac, wos: [], tasks, projects: [], investigations: [], metrics: [metric('overall', '2026-08-01')], settings, today: TODAY })
      expect(alerts.find((a) => a.key === 'silent')?.count).toBe(1)
      expect(alerts.find((a) => a.key === 'score_stale')).toBeTruthy()
      expect(alerts.find((a) => a.key === 'score_missing')).toBeUndefined()
    })
    it('nothing to report gives no alerts when scores are fresh', () => {
      const ac = run([])
      expect(buildAlerts({ ac, wos: [], tasks: [], projects: [], investigations: [], metrics: [metric('overall', TODAY)], settings, today: TODAY })).toEqual([])
    })
  })
})
