import { describe, expect, it } from 'vitest'
import { headerSignature, normalizeRows, parseDate, parseStore, suggestMapping } from './mapping'

const HEADERS = ['Store', 'Region', 'District', 'Trade', 'Tracking #', 'WO #', 'PO #', 'Call Date', 'Submitted by', 'Area', 'Equipment', 'Problem Type',
  'Problem Code', 'Tag ID', 'Vendor', 'Problem Description', 'Notes', 'Destination', 'Carrier', 'ShipTrack.#', 'Status', 'Status Ext.', 'Sched. Date',
  'Original ETA', 'TimeZone', 'Reass. Date', 'Reass. Time', 'Resolution', 'NTE', 'Currency', 'Category', 'Priority', 'Assignee', 'DateAssigned', 'Assigned to Technician(s)']

describe('suggestMapping', () => {
  it('maps the real export headers', () => {
    const m = suggestMapping(HEADERS)
    expect(m['Tracking #']).toBe('trackingNumber')
    expect(m['Status Ext.']).toBe('statusExt')
    expect(m['Sched. Date']).toBe('scheduledDate')
    expect(m['Assigned to Technician(s)']).toBe('technicians')
    expect(m['Store']).toBe('storeFull')
    expect(m['Notes']).toBe('notesRaw')
    expect(m['Vendor']).toBe('')
    expect(m['ShipTrack.#']).toBe('')
  })
  it('never maps two headers to one field', () => {
    const m = suggestMapping(['Status', 'WO Status', 'Tracking #'])
    expect(m['Status']).toBe('status')
    expect(m['WO Status']).toBe('')
  })
  it('signature ignores order and case', () => {
    expect(headerSignature(['B', 'a'])).toBe(headerSignature(['A', 'b']))
  })
})

describe('parseDate', () => {
  it('reads the formats ServiceChannel uses', () => {
    expect(parseDate('12/23/25')).toBe('2025-12-23')
    expect(parseDate('7/1/2026')).toBe('2026-07-01')
    expect(parseDate('Jul 23, 2026')).toBe('2026-07-23')
    expect(parseDate('2026-07-23')).toBe('2026-07-23')
    expect(parseDate(new Date(2026, 9, 5))).toBe('2026-10-05')
  })
  it('returns null rather than guessing', () => {
    expect(parseDate('')).toBeNull()
    expect(parseDate('TBD')).toBeNull()
    expect(parseDate('13/45/26')).toBeNull()
  })
})

describe('parseStore', () => {
  it('splits number, city, and state', () => {
    expect(parseStore('49-00699 - Winter Garden,FL')).toEqual({ number: '49-00699', city: 'Winter Garden', state: 'FL' })
    expect(parseStore('1996 - HALLANDALE BEACH,FL')).toEqual({ number: '1996', city: 'HALLANDALE BEACH', state: 'FL' })
    expect(parseStore('0669 - Venice,FL')).toEqual({ number: '0669', city: 'Venice', state: 'FL' })
  })
  it('keeps an unrecognised label as the number', () => {
    expect(parseStore('Warehouse')).toEqual({ number: 'Warehouse', city: null, state: null })
    expect(parseStore(null)).toEqual({ number: null, city: null, state: null })
  })
})

describe('normalizeRows', () => {
  const cells = [
    HEADERS,
    ['49-00699 - Winter Garden,FL', 'HAI', '012', 'REFRIGERATION', '336707303', '1158281   ', '336707303', '2/1/26', 'Auto-generated work order', '', '', '', '', '', 'Kalos Services',
      '.MDU Cleaning PM Service', 'Jan 28, 2026 Attachment added. (Alex Orr)', '', '', '', 'in progress', 'Dispatch Confirmed', '6/30/26', '6/30/26', 'EST', '', '', '', '1,300.00', 'USD', 'MAINTENANCE', 'P6 SCHEDULED MAINTENANCE (30 DAYS)', '', '', 'Alex Orr; Chad Minear'],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['1996 - HALLANDALE BEACH,FL', '9', '553', 'HVAC', '', '', '', '12/23/25', '', '', '', '', '', '', '', '', '', '', '', '', 'OPEN', '', '', '', '', '', '', '', '0.00', 'USD', 'REPAIR', 'P1 (24 HOURS)', '', '', ''],
    ['49-00699 - Winter Garden,FL', 'HAI', '012', 'REFRIGERATION', '336707303', '', '', '2/1/26', '', '', '', '', '', '', '', '', '', '', '', '', 'IN PROGRESS', 'PARTS ON ORDER', 'not a date', '', '', '', '', '', '', '', '', '', '', '', ''],
  ]
  const r = normalizeRows(cells, suggestMapping(HEADERS))

  it('normalizes values and keeps the raw cells', () => {
    expect(r.rows).toHaveLength(1)
    const w = r.rows[0]
    expect(w).toMatchObject({ trackingNumber: '336707303', storeNumber: '49-00699', storeCity: 'Winter Garden', storeState: 'FL', status: 'IN PROGRESS', statusExt: 'PARTS ON ORDER', callDate: '2026-02-01' })
    expect(w.raw['Tracking #']).toBe('336707303')
    expect(w.customerName).toBeNull()
  })
  it('skips rows with no tracking number and blank rows', () => {
    expect(r.skipped).toBe(1)
    expect(r.warnings.some((x) => /no tracking number/.test(x))).toBe(true)
  })
  it('keeps the last of a duplicated tracking number and says so', () => {
    expect(r.duplicates).toEqual(['336707303'])
    expect(r.rows[0].statusExt).toBe('PARTS ON ORDER')
  })
  it('warns about a date it cannot read instead of inventing one', () => {
    expect(r.rows[0].scheduledDate).toBeNull()
    expect(r.warnings.some((x) => /could not read scheduledDate/.test(x))).toBe(true)
  })
  it('parses NTE and technicians on the first row', () => {
    const one = normalizeRows(cells.slice(0, 2), suggestMapping(HEADERS)).rows[0]
    expect(one.nte).toBe(1300)
    expect(one.technicians).toEqual(['Alex Orr', 'Chad Minear'])
    expect(one.woNumber).toBe('1158281')
  })
  it('applies a file-wide customer when the export has no customer column', () => {
    const one = normalizeRows(cells.slice(0, 2), suggestMapping(HEADERS), { fileCustomer: 'ALDI' }).rows[0]
    expect(one.customerName).toBe('ALDI')
    expect(one.customerSource).toBe('coverage')
    expect(normalizeRows(cells.slice(0, 2), suggestMapping(HEADERS)).rows[0].customerSource).toBeNull()
  })
  it('refuses a mapping with no tracking column', () => {
    const m = suggestMapping(HEADERS); m['Tracking #'] = ''
    expect(normalizeRows(cells, m).warnings[0]).toMatch(/Tracking #/)
  })
})
