import { describe, expect, it } from 'vitest'
import { suggestFor } from './rules'
import { buildActionCenter } from './actionCenter'
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
  const run = (wos: WorkOrderView[], tasks: Map<string, { status: string; dueDate: string | null; title: string }[]> = new Map(), contacted = new Set<string>()) => buildActionCenter({ wos, tasksByWo: tasks, contactedSinceUnsat: contacted, today: TODAY })
  it('puts a future PM in Upcoming and a passed PM date in the PM problems list', () => {
    const ac = run([wo({ id: 'a', category: 'MAINTENANCE', scheduledDate: '2026-10-20' }, { ownerProfileId: 'p' }), wo({ id: 'b', category: 'MAINTENANCE', scheduledDate: '2026-09-30' }, { ownerProfileId: 'p' })])
    const pm = ac.upcoming.find((s) => s.key === 'pm')!
    expect(pm.items.map((i) => [i.wo.id, i.reason])).toEqual([['b', 'Scheduled date 2026-09-30 passed, nothing recorded'], ['a', 'PM window within two weeks']])
    expect(ac.counts.needsToday).toBe(0)
  })
  it('sections needs-attention correctly and counts distinct work orders', () => {
    const ac = run([
      wo({ id: 'u' }),
      wo({ id: 'o' }, { ownerProfileId: 'p', dueDate: '2026-10-01' }),
      wo({ id: 'c', statusExt: 'UNSATISFACTORY' }, { ownerProfileId: 'p' }),
      wo({ id: 'k' }, { ownerProfileId: 'p', ownerName: 'Maya', ownerAssignedAt: '2026-10-11T00:00:00Z' }),
      wo({ id: 'v' }, { ownerProfileId: 'p', internalStatus: 'pending_verification' }),
    ], new Map([['o', [{ status: 'in_progress', dueDate: TODAY, title: 'Today task' }]]]))
    const by = Object.fromEntries(ac.needsToday.map((s) => [s.key, s.items.map((i) => i.wo.id)]))
    expect(by.unassigned).toEqual(['u']); expect(by.overdue).toEqual(['o']); expect(by.complaints).toEqual(['c']); expect(by.unack).toEqual(['k']); expect(by.due_today).toEqual(['o']); expect(by.verify).toEqual(['v'])
    expect(ac.counts.needsToday).toBe(5)
  })
  it('waiting-on groups by the recorded reason', () => {
    const ac = run([wo({ id: 't' }, { ownerProfileId: 'p', waitingOn: 'technician', nextAction: 'Field notes' }), wo({ id: 'b' }, { ownerProfileId: 'p', waitingOn: 'billing' })])
    expect(ac.waiting.find((s) => s.key === 'technician')!.items[0].reason).toBe('Field notes')
    expect(ac.counts.billing).toBe(1)
  })
  it('upcoming follow-ups within seven days, appointments within fourteen', () => {
    const ac = run([wo({ id: 'f' }, { ownerProfileId: 'p', dueDate: '2026-10-18' }), wo({ id: 'a', scheduledDate: '2026-10-25' }, { ownerProfileId: 'p' }), wo({ id: 'far' }, { ownerProfileId: 'p', dueDate: '2026-11-30' })])
    expect(ac.upcoming.find((s) => s.key === 'follow_ups')!.items.map((i) => i.wo.id)).toEqual(['f'])
    expect(ac.upcoming.find((s) => s.key === 'appointments')!.items.map((i) => i.wo.id)).toEqual(['a'])
  })
})
