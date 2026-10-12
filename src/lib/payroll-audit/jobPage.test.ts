import { describe, expect, it } from 'vitest'
import { addressLine, addressQueries, parseJobPage } from './jobPage'

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

describe('addressQueries', () => {
  it('tries the full address, then without the store number, then the town', () => {
    expect(addressQueries({ street: '100 Main Street #0674', cityStateZip: 'Springfield, FL 32000' })).toEqual([
      { query: '100 Main Street #0674, Springfield, FL 32000', approximate: false },
      { query: '100 Main Street, Springfield, FL 32000', approximate: false },
      { query: 'Springfield, FL 32000', approximate: true },
    ])
  })
  it('drops suite markers', () => {
    const q = addressQueries({ street: '5 Oak Ave Ste 200', cityStateZip: 'Tampa, FL 33602' })
    expect(q[1].query).toBe('5 Oak Ave, Tampa, FL 33602')
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
