import { describe, expect, it } from 'vitest'
import { buildPlan, type ExistingWo } from './sync'
import type { Coverage, NormalizedRow } from './types'

const TODAY = '2026-10-13'
const cov = (over: Partial<Coverage> = {}): Coverage => ({ statuses: ['OPEN', 'IN PROGRESS'], subscribers: [], callDateFrom: '2025-10-13', callDateTo: '2026-10-13', note: null, ...over })

const row = (over: Partial<NormalizedRow> = {}): NormalizedRow => ({
  trackingNumber: '100', woNumber: null, poNumber: null, customerName: null, storeLabel: '49-00699 - Winter Garden,FL', storeNumber: '49-00699', storeCity: 'Winter Garden', storeState: 'FL',
  region: null, district: null, trade: 'REFRIGERATION', category: 'REPAIR', priority: 'P3 (2 BUSINESS DAYS)', area: null, equipment: null, problemType: null, problemCode: null, tagId: null,
  problemDescription: 'Case warm', submittedBy: null, callDate: '2026-10-01', scheduledDate: '2026-10-20', originalEta: '2026-10-03', reassignDate: null, reassignTime: null,
  status: 'IN PROGRESS', statusExt: 'DISPATCH CONFIRMED', resolution: null, nte: 1300, currency: 'USD', assignee: null, dateAssigned: null, technicians: ['Alex Orr'], timezone: 'EST',
  notesRaw: 'Oct 1, 2026 Status has been changed from OPEN to IN PROGRESS/DISPATCH CONFIRMED. (a@b.com)', raw: {}, ...over,
})
const existing = (over: Partial<ExistingWo> = {}): ExistingWo => ({
  trackingNumber: '100', status: 'IN PROGRESS', statusExt: 'DISPATCH CONFIRMED', scheduledDate: '2026-10-20', originalEta: '2026-10-03', technicians: ['Alex Orr'], assignee: null, nte: 1300,
  resolution: null, priority: 'P3 (2 BUSINESS DAYS)', trade: 'REFRIGERATION', category: 'REPAIR', callDate: '2026-10-01', customerName: null,
  notesRaw: 'Oct 1, 2026 Status has been changed from OPEN to IN PROGRESS/DISPATCH CONFIRMED. (a@b.com)', observationState: 'observed', ...over,
})

describe('buildPlan', () => {
  it('new versus existing', () => {
    const p = buildPlan({ rows: [row(), row({ trackingNumber: '200' })], existing: [existing()], coverage: cov(), today: TODAY })
    expect(p.rows.map((r) => [r.trackingNumber, r.kind])).toEqual([['100', 'unchanged'], ['200', 'new']])
    expect(p.stats).toMatchObject({ new: 1, unchanged: 1, changed: 0 })
  })
  it('the same file twice changes nothing', () => {
    const p = buildPlan({ rows: [row()], existing: [existing()], coverage: cov(), today: TODAY })
    expect(p.rows[0].kind).toBe('unchanged')
    expect(p.rows[0].changes).toEqual([])
    expect(p.missing).toEqual([])
  })
  it('detects a changed status with from and to', () => {
    const p = buildPlan({ rows: [row({ statusExt: 'PARTS ON ORDER' })], existing: [existing()], coverage: cov(), today: TODAY })
    expect(p.rows[0].kind).toBe('changed')
    expect(p.rows[0].changes).toContainEqual({ field: 'statusExt', label: 'Extended status', from: 'DISPATCH CONFIRMED', to: 'PARTS ON ORDER' })
    expect(p.rows[0].summary).toContain('Extended status: DISPATCH CONFIRMED → PARTS ON ORDER')
  })
  it('flags appointment and technician changes', () => {
    const p = buildPlan({ rows: [row({ scheduledDate: '2026-10-22', technicians: ['Chad Minear'] })], existing: [existing()], coverage: cov(), today: TODAY })
    expect(p.rows[0].flags).toEqual(expect.arrayContaining(['appointment_changed', 'tech_changed']))
    expect(p.stats.techChanged).toBe(1)
  })
  it('a reopened work order: completed before, open now', () => {
    const p = buildPlan({ rows: [row({ status: 'IN PROGRESS', statusExt: 'UNSATISFACTORY' })], existing: [existing({ status: 'COMPLETED', statusExt: 'PENDING CONFIRMATION' })], coverage: cov(), today: TODAY })
    expect(p.rows[0].reopened).toBe(true)
    expect(p.rows[0].newUnsat).toBe(true)
    expect(p.stats).toMatchObject({ reopened: 1, newUnsat: 1 })
  })
  it('a reopen seen only in the activity log counts once', () => {
    const notes = 'Oct 6, 2026 Status has been changed from COMPLETED/PENDING CONFIRMATION to IN PROGRESS/UNSATISFACTORY. (x) Oct 1, 2026 Status has been changed from OPEN to IN PROGRESS/DISPATCH CONFIRMED. (a@b.com)'
    const first = buildPlan({ rows: [row({ statusExt: 'UNSATISFACTORY', notesRaw: notes })], existing: [existing()], coverage: cov(), today: TODAY })
    expect(first.rows[0].reopened).toBe(true)
    const again = buildPlan({ rows: [row({ statusExt: 'UNSATISFACTORY', notesRaw: notes })], existing: [existing({ statusExt: 'UNSATISFACTORY', notesRaw: notes })], coverage: cov(), today: TODAY })
    expect(again.rows[0].reopened).toBe(false)
    expect(again.rows[0].newUnsat).toBe(false)
  })
  it('new unsatisfactory on a brand new row is flagged', () => {
    const p = buildPlan({ rows: [row({ trackingNumber: '300', statusExt: 'UNSATISFACTORY' })], existing: [], coverage: cov(), today: TODAY })
    expect(p.rows[0].flags).toContain('new_unsat')
  })
  it('SLA risk when the ETA has passed and the order is open; not when on site', () => {
    expect(buildPlan({ rows: [row({ originalEta: '2026-10-01' })], existing: [], coverage: cov(), today: TODAY }).rows[0].flags).toContain('sla_risk')
    expect(buildPlan({ rows: [row({ originalEta: '2026-10-01', statusExt: 'ON SITE' })], existing: [], coverage: cov(), today: TODAY }).rows[0].flags).not.toContain('sla_risk')
    expect(buildPlan({ rows: [row({ originalEta: '2026-12-01' })], existing: [], coverage: cov(), today: TODAY }).rows[0].flags).not.toContain('sla_risk')
  })
  it('a future maintenance window is not overdue', () => {
    const p = buildPlan({ rows: [row({ category: 'MAINTENANCE', scheduledDate: '2026-12-29', originalEta: '2026-12-29' })], existing: [], coverage: cov(), today: TODAY })
    expect(p.rows[0].flags).toEqual([])
    const past = buildPlan({ rows: [row({ category: 'MAINTENANCE', scheduledDate: '2026-09-30', originalEta: '2026-09-30' })], existing: [], coverage: cov(), today: TODAY })
    expect(past.rows[0].flags).not.toContain('overdue')
  })

  describe('missing from the file', () => {
    it('is marked not-in-latest only when coverage says it should be there', () => {
      const p = buildPlan({ rows: [], existing: [existing()], coverage: cov(), today: TODAY })
      expect(p.missing).toEqual([{ trackingNumber: '100', state: 'not_in_latest', reason: expect.stringContaining('latest comparable export') }])
    })
    it('is left alone when its status was outside the export filter', () => {
      const p = buildPlan({ rows: [], existing: [existing({ status: 'COMPLETED' })], coverage: cov(), today: TODAY })
      expect(p.missing).toEqual([])
    })
    it('is left alone when the export was filtered to another subscriber', () => {
      const p = buildPlan({ rows: [], existing: [existing({ customerName: 'ALDI' })], coverage: cov({ subscribers: ['CubeSmart'] }), today: TODAY })
      expect(p.missing).toEqual([])
    })
    it('is outside-window when its call date is older than the export covers', () => {
      const p = buildPlan({ rows: [], existing: [existing({ callDate: '2025-06-01' })], coverage: cov(), today: TODAY })
      expect(p.missing[0]).toMatchObject({ trackingNumber: '100', state: 'outside_window' })
    })
    it('does not re-mark a state it already has, and never touches verified ones', () => {
      expect(buildPlan({ rows: [], existing: [existing({ observationState: 'not_in_latest' })], coverage: cov(), today: TODAY }).missing).toEqual([])
      expect(buildPlan({ rows: [], existing: [existing({ observationState: 'manually_verified' })], coverage: cov(), today: TODAY }).missing).toEqual([])
    })
    it('warns when no status filter was declared', () => {
      expect(buildPlan({ rows: [], existing: [], coverage: cov({ statuses: [] }), today: TODAY }).warnings[0]).toMatch(/No status filter/)
    })
  })

  it('links a store to an existing PhaseForge location without overriding a customer in the file', () => {
    const locations = new Map([['49-00699', { locationId: 'loc1', customerId: 'cust1', customerName: 'ALDI' }]])
    const p = buildPlan({ rows: [row(), row({ trackingNumber: '2', customerName: 'Aldi Inc' })], existing: [], coverage: cov(), today: TODAY, locations })
    expect(p.rows[0].cols).toMatchObject({ location_id: 'loc1', customer_id: 'cust1', customer_name: 'ALDI' })
    expect(p.rows[1].cols.customer_name).toBe('Aldi Inc')
    expect(p.stats.located).toBe(2)
  })
})
