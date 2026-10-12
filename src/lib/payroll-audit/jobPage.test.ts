import { describe, expect, it } from 'vitest'
import { addressLine, addressQueries, normalizeStreet, parseJobPage } from './jobPage'

const PAGE = `Menu
Example Foods Inc.:C-100001-REF Springfield

Example Foods Inc. • Job #100001

Customer Information
Customer Name
Example Foods Inc.
Business Name
Example Foods Inc.
Primary Phone
(555) 555-0100
Property Information
Property Address
100 Main Street #0674
City, State, ZIP
Springfield, FL 32000
Project Details
Project Name
Example Foods Inc.:C-100001-REF Springfield
Job Number
100001
Job ID
C-100001-REF
Status
Incomplete`

describe('parseJobPage', () => {
  it('reads the labelled fields', () => {
    expect(parseJobPage(PAGE)).toMatchObject({
      jobNumber: '100001', street: '100 Main Street #0674', cityStateZip: 'Springfield, FL 32000',
      customer: 'Example Foods Inc.', projectName: 'Example Foods Inc.:C-100001-REF Springfield',
    })
  })
  it('treats a blank or N/A address as missing, not as the next label', () => {
    const p = parseJobPage('Property Information\nProperty Address\nCity, State, ZIP\nSpringfield, FL 32000\nJob Number\n100001')
    expect(p.street).toBeNull()
    expect(p.cityStateZip).toBe('Springfield, FL 32000')
    expect(parseJobPage('Property Address\nN/A\nCity, State, ZIP\nN/A').street).toBeNull()
  })
  it('returns nothing for a page that is not a job', () => {
    expect(parseJobPage('Page not found')).toEqual({ jobNumber: null, projectName: null, customer: null, street: null, cityStateZip: null })
  })
})

describe('normalizeStreet', () => {
  it('drops store numbers and store suffixes', () => {
    expect(normalizeStreet('100 Main Street #0674')).toBe('100 Main Street')
    expect(normalizeStreet('15200 Municipal Dr, ALDI Store #324')).toBe('15200 Municipal Dr')
    expect(normalizeStreet('1193 E. State Road 434, #165')).toBe('1193 SR 434')
  })
  it('writes Florida highways the way OpenStreetMap does', () => {
    expect(normalizeStreet('3420 S US Highway 27 #0674')).toBe('3420 US 27')
    expect(normalizeStreet('2503 S. Highway 27 #017')).toBe('2503 US 27')
    expect(normalizeStreet('924 State Road 436 #005')).toBe('924 SR 436')
    expect(normalizeStreet('4160 W State Rd 46, #001')).toBe('4160 SR 46')
  })
  it('spells out Pkwy and leaves ordinary streets alone', () => {
    expect(normalizeStreet('1768 N John Young Pkwy #164')).toBe('1768 N John Young Parkway')
    expect(normalizeStreet('4221 Mariner Blvd')).toBe('4221 Mariner Blvd')
  })
})

describe('addressQueries', () => {
  it('tries the address as written, then cleaned up, then the town', () => {
    expect(addressQueries({ street: '3420 S US Highway 27 #0674', cityStateZip: 'Clermont, FL 34711' })).toEqual([
      { query: '3420 S US Highway 27 #0674, Clermont, FL 34711', approximate: false },
      { query: '3420 US 27, Clermont, FL 34711', approximate: false },
      { query: 'Clermont, FL 34711', approximate: true },
    ])
  })
  it('does not repeat a query that is already clean', () => {
    expect(addressQueries({ street: '4221 Mariner Blvd', cityStateZip: 'Spring Hill, FL 34608' }).map((q) => q.query)).toEqual([
      '4221 Mariner Blvd, Spring Hill, FL 34608', 'Spring Hill, FL 34608',
    ])
  })
  it('falls back to the town when there is no street', () => {
    expect(addressQueries({ street: null, cityStateZip: 'Tampa, FL 33602' })).toEqual([{ query: 'Tampa, FL 33602', approximate: true }])
    expect(addressQueries({ street: null, cityStateZip: null })).toEqual([])
  })
  it('builds one display line', () => {
    expect(addressLine({ street: '100 Main St', cityStateZip: 'Tampa, FL 33602' })).toBe('100 Main St, Tampa, FL 33602')
    expect(addressLine({ street: null, cityStateZip: null })).toBeNull()
  })
})
