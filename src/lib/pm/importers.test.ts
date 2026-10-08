import { describe, expect, it } from 'vitest'
import {
  errorReport, mapSheet, parsePriority, parseStatus, parseSystem, reviewPmRows, reviewStores, storeKey, tally,
  type ExistingCycle, type ExistingStore, type PmReviewContext,
} from './importers'
import { describeActivity } from './activityText'

const store = (over: Partial<ExistingStore> & { id: string; storeNumber: string }): ExistingStore => ({
  address: null, city: null, county: null, state: 'FL', postalCode: null, region: null, facilityManager: null, fmPhone: null, fmEmail: null,
  storePhone: null, primaryTech: null, secondaryTech: null, systemType: null, refrigerant: null, notes: null, isActive: true, ...over,
})

describe('reading a sheet', () => {
  it('matches the headers on the ALDI store sheet', () => {
    const { rows, unmapped, matched } = mapSheet([
      ['Store #', 'Address', 'City', 'County', 'State', 'Reg', 'ALDI FM', 'Kalos Primary Tech', 'P Level'],
      ['474-004', '1636 E Semoran Blvd', 'Apopka', '', 'FL', 'Kalos', 'Angie Ryder', '', 'P1'],
      ['474-012', '14001 W. Colonial Dr', 'Winter Garden', '', 'FL', 'Kalos', 'Angie Ryder', 'Alex', ''],
      ['', '', '', '', '', '', '', '', ''],
    ], 'stores')
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ storeNumber: '474-012', city: 'Winter Garden', region: 'Kalos', facilityManager: 'Angie Ryder', primaryTech: 'Alex' })
    expect(unmapped).toEqual(['P Level'])
    expect(matched).toContain('ALDI FM')
  })
  it('skips title rows above the header and reads Excel dates', () => {
    const { rows } = mapSheet([
      ['Q4 job numbers'], [],
      ['Store', 'Quarter', 'Kalos Job #', 'Date Received'],
      ['474-026', 'Q4 2026', 260123, new Date(Date.UTC(2026, 9, 6))],
    ], 'job_numbers')
    expect(rows).toEqual([{ storeNumber: '474-026', period: 'Q4 2026', jobNumber: '260123', receivedDate: '2026-10-06' }])
  })
  it('treats 474026 and 474-026 as the same store', () => {
    expect(storeKey('474-026')).toBe(storeKey(' 474026 '))
    expect(storeKey('474-026')).not.toBe(storeKey('474-027'))
  })
  it('reads system, priority, and status the way people type them', () => {
    expect(parseSystem('co2')).toEqual({ value: 'CO2', ok: true })
    expect(parseSystem('R-290')).toEqual({ value: 'R-290', ok: true })
    expect(parseSystem('propane').value).toBe('R-290')
    expect(parseSystem('')).toEqual({ value: null, ok: true })
    expect(parseSystem('ammonia')).toEqual({ value: null, ok: false })
    expect(parsePriority('p6')).toEqual({ value: 'P6', ok: true })
    expect(parsePriority('3').value).toBe('P3')
    expect(parsePriority('P9').ok).toBe(false)
    expect(parseStatus('In Progress').value).toBe('in_progress')
    expect(parseStatus('Submitted / Pending Closeout').value).toBe('submitted')
    expect(parseStatus('done').value).toBe('completed')
    expect(parseStatus('whenever').ok).toBe(false)
  })
})

describe('store import', () => {
  const existing = [store({ id: 's1', storeNumber: '474-026', address: '5296 W. Irlo Bronson Hwy', city: 'Kissimmee', facilityManager: 'Angie Ryder' })]
  it('creates new stores and leaves blanks blank', () => {
    const [r] = reviewStores([{ storeNumber: '474-030', address: '4056 13th Street', city: 'St Cloud', state: 'fl' }], existing, { updateExisting: false })
    expect(r.action).toBe('create')
    expect(r.values).toMatchObject({ storeNumber: '474-030', state: 'FL', region: null, facilityManager: null, county: null, primaryTech: null, isActive: true })
  })
  it('catches duplicates inside the file and missing store numbers', () => {
    const out = reviewStores([{ storeNumber: '474-004' }, { storeNumber: '474004' }, { address: '1 Main St' }], [], { updateExisting: false })
    expect(out.map((r) => r.action)).toEqual(['create', 'error', 'error'])
    expect(out[1].problems).toEqual(['Same store as row 1'])
    expect(out[2].problems).toEqual(['No store number'])
  })
  it('does not touch a store that is already there unless told to', () => {
    const row = { storeNumber: '474026', city: 'Kissimmee', facilityManager: 'New Manager', county: 'Osceola' }
    const off = reviewStores([row], existing, { updateExisting: false })[0]
    expect(off.action).toBe('same')
    expect(off.warnings).toContain('Already in the directory with different details. Left as it is.')
    const on = reviewStores([row], existing, { updateExisting: true })[0]
    expect(on.action).toBe('update')
    expect(on.changes).toEqual([
      { field: 'county', label: 'County', from: '', to: 'Osceola' },
      { field: 'facilityManager', label: 'ALDI FM', from: 'Angie Ryder', to: 'New Manager' },
    ])
  })
  it('never erases a stored value with a blank cell', () => {
    const [r] = reviewStores([{ storeNumber: '474-026', address: '', facilityManager: '' }], existing, { updateExisting: true })
    expect(r.action).toBe('same')
    expect(r.changes).toEqual([])
  })
  it('warns without blocking', () => {
    const [r] = reviewStores([{ storeNumber: '474-099', systemType: 'ammonia', state: 'Florida', fmEmail: 'nope' }], [], { updateExisting: false })
    expect(r.action).toBe('create')
    expect(r.warnings).toHaveLength(4)
    expect(r.values.systemType).toBeNull()
  })
})

describe('job number and PM import', () => {
  const stores = [{ id: 's1', storeNumber: '474-026', isActive: true }, { id: 's2', storeNumber: '474-012', isActive: true }, { id: 's3', storeNumber: '474-088', isActive: false }]
  const cycle = (over: Partial<ExistingCycle> & { id: string; storeId: string }): ExistingCycle => ({
    year: 2026, quarter: 4, jobNumber: null, scWorkOrder: null, jobReceivedDate: null, priority: null, dueDate: null, techId: null,
    scheduledDate: null, actualStart: null, actualEnd: null, status: 'awaiting_job_number', coordinatorNotes: null, ...over,
  })
  const ctx = (over: Partial<PmReviewContext> = {}): PmReviewContext => ({
    stores, cycles: [cycle({ id: 'c1', storeId: 's1' }), cycle({ id: 'c2', storeId: 's2', jobNumber: '260500', status: 'job_received' })],
    techs: [{ id: 't1', name: 'Alex' }], defaults: { year: 2026, quarter: 4 }, overwrite: false, approvedJobRows: [], ...over,
  })

  it('adds a job number to a PM that was waiting for one', () => {
    const [r] = reviewPmRows([{ storeNumber: '474-026', jobNumber: '260123', receivedDate: '10/6/2026', priority: 'P6' }], ctx())
    expect(r).toMatchObject({ action: 'update', pmId: 'c1', year: 2026, quarter: 4, jobConflict: null })
    expect(r.changes.map((c) => c.label)).toEqual(['Job Number', 'Date Received', 'Priority'])
    expect(r.values.jobReceivedDate).toBe('2026-10-06')
  })
  it('creates the PM when a number arrives for a quarter with no record', () => {
    const [r] = reviewPmRows([{ storeNumber: '474026', period: 'Q1 2027', jobNumber: '270001' }], ctx())
    expect(r).toMatchObject({ action: 'create', storeId: 's1', pmId: null, year: 2027, quarter: 1 })
  })
  it('will not overwrite an existing job number unless that row is approved', () => {
    const rows = [{ storeNumber: '474-012', jobNumber: '260999' }]
    const blocked = reviewPmRows(rows, ctx())[0]
    expect(blocked.action).toBe('conflict')
    expect(blocked.jobConflict).toEqual({ from: '260500', to: '260999' })
    expect(reviewPmRows(rows, ctx({ approvedJobRows: [0] }))[0].action).toBe('update')
    // The general overwrite switch is not enough on its own.
    expect(reviewPmRows(rows, ctx({ overwrite: true }))[0].action).toBe('conflict')
  })
  it('does nothing when the number is already there', () => {
    expect(reviewPmRows([{ storeNumber: '474-012', jobNumber: '260500' }], ctx())[0].action).toBe('same')
  })
  it('refuses a job number that belongs to another PM', () => {
    const out = reviewPmRows([{ storeNumber: '474-026', jobNumber: '260500' }, { storeNumber: '474-026', period: 'Q1 2027', jobNumber: '270001' }, { storeNumber: '474-012', period: 'Q1 2027', jobNumber: '270001' }], ctx())
    expect(out[0].problems).toEqual(['Job number 260500 is already on 474-012 Q4 2026'])
    expect(out[1].action).toBe('create')
    expect(out[2].problems).toEqual(['Job number 270001 is also on row 2'])
  })
  it('catches unknown stores, bad quarters, bad dates, and repeats', () => {
    const out = reviewPmRows([
      { storeNumber: '474-777', jobNumber: '1' },
      { storeNumber: '474-026', period: 'Q7', jobNumber: '2' },
      { storeNumber: '474-026', jobNumber: '3', dueDate: 'soon' },
      { storeNumber: '474-012', jobNumber: '260500' },
      { storeNumber: '474012', jobNumber: '260500' },
      { jobNumber: '4' },
    ], ctx())
    expect(out.map((r) => r.action)).toEqual(['error', 'error', 'error', 'same', 'error', 'error'])
    expect(out[0].problems).toEqual(['Store 474-777 is not in the directory'])
    expect(out[1].problems).toEqual(['"Q7" is not a quarter'])
    expect(out[2].problems).toEqual(['Due date "soon" is not a date'])
    expect(out[4].problems).toEqual(['Same store and quarter as row 4'])
    expect(out[5].problems).toEqual(['No store number'])
  })
  it('keeps what is already recorded unless overwrite is on', () => {
    const cycles = [cycle({ id: 'c1', storeId: 's1', jobNumber: '260123', dueDate: '2026-11-15', techId: 't1', status: 'scheduled', scheduledDate: '2026-10-20' })]
    const row = { storeNumber: '474-026', jobNumber: '260123', dueDate: '2026-12-01', technician: 'Chad', status: 'Not Scheduled', scWorkOrder: 'WO-1' }
    const keep = reviewPmRows([row], ctx({ cycles }))[0]
    expect(keep.changes.map((c) => c.label)).toEqual(['SC Work Order'])
    expect(keep.warnings).toEqual(['Chad is not a technician yet and will be added', 'Due Date is already 2026-11-15. Kept.', 'Status is already Scheduled. Kept.', 'Technician is already Alex. Kept.'])
    const replace = reviewPmRows([row], ctx({ cycles, overwrite: true }))[0]
    expect(replace.changes.map((c) => c.label)).toEqual(['SC Work Order', 'Due Date', 'Status', 'Technician'])
  })
  it('imports full PM records with history', () => {
    const [r] = reviewPmRows([{ storeNumber: '474-026', period: '2026 Q2', jobNumber: '250777', technician: 'Alex', scheduledDate: '4/13/2026', actualEnd: '4/16/2026', status: 'Completed' }], ctx())
    expect(r).toMatchObject({ action: 'create', year: 2026, quarter: 2 })
    expect(r.values).toMatchObject({ scheduledDate: '2026-04-13', actualEnd: '2026-04-16', status: 'completed', technician: 'Alex' })
  })
  it('flags inactive stores without blocking', () => {
    const [r] = reviewPmRows([{ storeNumber: '474-088', jobNumber: '260700' }], ctx())
    expect(r.action).toBe('create')
    expect(r.warnings).toEqual(['This store is inactive'])
  })
  it('summarises and reports', () => {
    const out = reviewPmRows([{ storeNumber: '474-026', jobNumber: '260123' }, { storeNumber: '474-012', jobNumber: '260999' }, { storeNumber: 'nope', jobNumber: '9' }], ctx())
    expect(tally(out)).toEqual({ update: 1, conflict: 1, error: 1 })
    const report = errorReport(out)
    expect(report).toHaveLength(2)
    expect(report[0]).toMatchObject({ Row: '2', Result: 'Skipped, would replace a job number', Notes: 'Existing job number 260500 would become 260999' })
    expect(report[1]).toMatchObject({ Row: '3', Result: 'Not imported' })
  })
})

describe('the trail in words', () => {
  it('describes the events coordinators care about', () => {
    expect(describeActivity('job_number_entered', { to: '260123' })).toEqual({ text: 'entered job number 260123', tone: 'good' })
    expect(describeActivity('job_number_changed', { from: '260123', to: '260124' }).text).toBe('changed the job number from 260123 to 260124')
    expect(describeActivity('status_changed', { from: 'scheduled', to: 'on_hold', note: 'Store remodel' }).text).toBe('changed the status from Scheduled to On Hold: Store remodel')
    expect(describeActivity('material_status', { name: 'Merv 8 20x25x2', from: 'ordered', to: 'received' })).toEqual({ text: 'Merv 8 20x25x2: Ordered to Received', tone: 'good' })
    expect(describeActivity('rescheduled', { from: '2026-10-12', to: '2026-10-14' }).text).toBe('moved the visit from Oct 12 to Oct 14')
    expect(describeActivity('check_corrected', { item: 'COND3', from: 'pass', to: 'fail' }).text).toBe('changed COND3 from pass to fail')
    expect(describeActivity('closed', { override: 'FM waived photos' }).tone).toBe('warn')
    expect(describeActivity('something_new', {}).text).toBe('something new')
  })
})
