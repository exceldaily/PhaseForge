import { describe, expect, it } from 'vitest'
import {
  estimateDriveMinutes, formatDrive, haversineMiles, inferState, matchEmployee,
  needsLodging, parseDirectoryPaste, placeFromJobTitle,
} from './geo'

describe('distance math', () => {
  it('haversine: Orlando to Tampa is about 77 miles straight line', () => {
    const d = haversineMiles(28.5383, -81.3792, 27.9506, -82.4572)
    expect(d).toBeGreaterThan(75)
    expect(d).toBeLessThan(80)
  })
  it('estimate: 77 straight miles reads as just under 2 hours', () => {
    expect(estimateDriveMinutes(77)).toBe(116)
  })
  it('needsLodging follows the 2 hour line', () => {
    expect(needsLodging({ name: 'a', employeeId: null, minutes: 119, miles: 0, source: 'estimate' })).toBe(false)
    expect(needsLodging({ name: 'a', employeeId: null, minutes: 120, miles: 0, source: 'estimate' })).toBe(true)
    expect(needsLodging({ name: 'a', employeeId: null, minutes: null, miles: null, source: 'unknown' })).toBeNull()
  })
  it('formats drive time', () => {
    expect(formatDrive(45)).toBe('45m')
    expect(formatDrive(120)).toBe('2h')
    expect(formatDrive(160)).toBe('2h 40m')
  })
})

const team = 't1'
const emps = [
  { id: '1', name: 'Jose Aviles', schedule_name: null, superintendent_id: team },
  { id: '2', name: 'John Mitchell', schedule_name: null, superintendent_id: team },
  { id: '3', name: 'John Oakes', schedule_name: null, superintendent_id: team },
  { id: '4', name: 'Christopher Bruzon', schedule_name: null, superintendent_id: team },
  { id: '5', name: 'Matthew Treyton-Dees', schedule_name: 'Matthew', superintendent_id: team },
  { id: '6', name: 'Matt Dees', schedule_name: 'Matt', superintendent_id: team },
  { id: '7', name: 'Jose Martinez', schedule_name: null, superintendent_id: 't2' },
]

describe('matchEmployee', () => {
  it('matches a bare first name when unique on the team', () => {
    expect(matchEmployee('Jose', emps, team)?.id).toBe('1')
  })
  it('uses the last initial to split Johns', () => {
    expect(matchEmployee('John M', emps, team)?.id).toBe('2')
    expect(matchEmployee('John O', emps, team)?.id).toBe('3')
    expect(matchEmployee('John', emps, team)).toBeNull()
  })
  it('knows common nicknames', () => {
    expect(matchEmployee('Chris', emps, team)?.id).toBe('4')
  })
  it('prefers an explicit schedule name', () => {
    expect(matchEmployee('Matt', emps, team)?.id).toBe('6')
    expect(matchEmployee('Matthew', emps, team)?.id).toBe('5')
  })
  it('falls back to the whole company, and refuses to guess when ambiguous', () => {
    expect(matchEmployee('Jose', emps, 't2')?.id).toBe('7')
    expect(matchEmployee('Jose', emps, null)).toBeNull()
  })
})

describe('placeFromJobTitle', () => {
  it('drops chain codes and store numbers', () => {
    expect(placeFromJobTitle('WM 3029 Spring Hill')).toBe('Spring Hill')
    expect(placeFromJobTitle("BJ's 260 Ocala")).toBe('Ocala')
    expect(placeFromJobTitle('ALDI 0658 Madeira Beach')).toBe('Madeira Beach')
    expect(placeFromJobTitle('Restaurant Depot Orlando')).toBe('Orlando')
    expect(placeFromJobTitle('Sams 6387 Pinellas Park')).toBe('Pinellas Park')
  })
  it('returns null when nothing is left', () => {
    expect(placeFromJobTitle('WM 3029')).toBeNull()
  })
})

describe('inferState', () => {
  it('picks the most common state', () => {
    expect(inferState(['1 Main St, Orlando, FL 32801', '2 Oak Ave, Tampa, FL 33602', '9 Peach, Atlanta, GA 30303', null])).toBe('FL')
    expect(inferState(['no state here'])).toBeNull()
  })
})

describe('parseDirectoryPaste', () => {
  it('reads tab separated rows and team headers', () => {
    const text = [
      'Name\tAddress\tPhone',
      'Carlos Betancourt',
      'Jose Aviles\t123 Main St, Orlando, FL 32801\t(407) 555-0100',
      'Derik Diaz\tderik@x.com\t45 Oak Ave, Tampa, FL 33602',
      'Greg Darrow',
      'Blake Nolan',
    ].join('\n')
    const rows = parseDirectoryPaste(text, ['Betancourt', 'Darrow', 'Startup'])
    expect(rows).toEqual([
      { name: 'Jose Aviles', address: '123 Main St, Orlando, FL 32801', phone: '(407) 555-0100', email: null, team: 'Betancourt' },
      { name: 'Derik Diaz', address: '45 Oak Ave, Tampa, FL 33602', phone: null, email: 'derik@x.com', team: 'Betancourt' },
      { name: 'Blake Nolan', address: null, phone: null, email: null, team: 'Darrow' },
    ])
  })
})
