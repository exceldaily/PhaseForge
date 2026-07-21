import { describe, it, expect } from 'vitest'
import {
  buildEventTitle, buildEventDescription, buildEventPayload,
  exclusiveEnd, swapSuperintendentLabels, isPhaseForgeEvent, buildRecurrence,
  nearestGoogleColorId, parseRRuleUntil,
} from '../calendarEvent'

const base = {
  orgId: 'org1', projectId: 'p1', phaseId: 'ph1', connectionId: 'c1',
  projectName: 'Aldi 324 Madeira Beach', phaseName: 'Mobilization',
  jobNumber: '324-10482', storeSiteId: '324', client: 'ALDI',
  formattedAddress: '4000 Duhme Rd, Madeira Beach, FL 33708',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=x',
  startDate: '2026-07-10', endDate: '2026-07-14',
  phaseStatus: 'in_progress', pmName: 'Brad Harvey',
  superintendentName: 'John Smith', schLabelNames: ['SCH - John Smith'],
  quickLinks: [{ label: 'PlanGrid', url: 'https://plangrid.example/x' }],
  appBaseUrl: 'https://www.phase-forge.com', pfRevision: 3,
}

describe('buildEventTitle', () => {
  it('formats [Job Number] Project – Phase', () => {
    expect(buildEventTitle(base)).toBe('[324-10482] Aldi 324 Madeira Beach – Mobilization')
  })
  it('omits bracket prefix without a job number', () => {
    expect(buildEventTitle({ ...base, jobNumber: null }))
      .toBe('Aldi 324 Madeira Beach – Mobilization')
  })
})

describe('buildEventDescription', () => {
  const desc = buildEventDescription(base)
  it('includes job number, client, superintendent, labels, links', () => {
    expect(desc).toContain('Job #: 324-10482')
    expect(desc).toContain('Client: ALDI')
    expect(desc).toContain('Superintendent: John Smith')
    expect(desc).toContain('Labels: SCH - John Smith')
    expect(desc).toContain('PlanGrid: https://plangrid.example/x')
    expect(desc).toContain('PhaseForge project: https://www.phase-forge.com/app/projects/p1')
  })
  it('does not include a separate PhaseForge phase link', () => {
    expect(desc).not.toContain('?phase=')
    expect(desc).not.toContain('PhaseForge phase:')
  })
  it('skips empty fields entirely', () => {
    const d = buildEventDescription({ ...base, client: null, storeSiteId: '' })
    expect(d).not.toContain('Client:')
    expect(d).not.toContain('Store / Site:')
  })
})

describe('buildEventPayload', () => {
  const payload = buildEventPayload({ ...base, colorId: '6', attendeeEmails: ['sup@x.com'] })
  it('uses exclusive all-day end date (+1 day)', () => {
    expect(payload.start).toEqual({ date: '2026-07-10' })
    expect(payload.end).toEqual({ date: '2026-07-15' })
  })
  it('carries identity in private extendedProperties, not the title', () => {
    expect(payload.extendedProperties.private.pf_phase).toBe('ph1')
    expect(payload.extendedProperties.private.pf_owner).toBe('phaseforge')
    expect(payload.extendedProperties.private.pf_revision).toBe('3')
  })
  it('sets color and attendees when provided', () => {
    expect(payload.colorId).toBe('6')
    expect(payload.attendees).toEqual([{ email: 'sup@x.com' }])
  })
})

describe('exclusiveEnd', () => {
  it('handles month and year boundaries', () => {
    expect(exclusiveEnd('2026-01-31')).toBe('2026-02-01')
    expect(exclusiveEnd('2026-12-31')).toBe('2027-01-01')
  })
})

describe('swapSuperintendentLabels', () => {
  it('removes only the previous sup labels, keeps unrelated, adds new', () => {
    const result = swapSuperintendentLabels(
      ['refrig', 'john-a', 'john-b', 'westcoast'],
      ['john-a', 'john-b'],
      ['mike-a'],
    )
    expect(result.sort()).toEqual(['mike-a', 'refrig', 'westcoast'].sort())
  })
  it('never duplicates a label already present', () => {
    const result = swapSuperintendentLabels(['shared', 'mike-a'], [], ['mike-a'])
    expect(result.filter((x) => x === 'mike-a')).toHaveLength(1)
  })
  it('handles no previous superintendent', () => {
    expect(swapSuperintendentLabels([], [], ['a'])).toEqual(['a'])
  })
})

describe('buildRecurrence (skip days)', () => {
  // 2026-07-10 is a Friday; 2026-08-10 is a Monday.
  it('returns null when nothing is skipped (plain spanning event)', () => {
    expect(buildRecurrence('2026-07-10', '2026-08-10', [])).toBeNull()
  })
  it('skips Fri-Sun for a month-long phase: weekly Mon-Thu recurrence', () => {
    const r = buildRecurrence('2026-07-10', '2026-08-10', ['FR', 'SA', 'SU'])
    // Start was a Friday → first occurrence moves to Monday July 13
    expect(r?.firstDate).toBe('2026-07-13')
    expect(r?.rrule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH;UNTIL=20260810')
  })
  it('keeps the start date when it is not a skipped day', () => {
    const r = buildRecurrence('2026-07-13', '2026-08-10', ['SA', 'SU'])
    expect(r?.firstDate).toBe('2026-07-13')
    expect(r?.rrule).toContain('BYDAY=MO,TU,WE,TH,FR')
  })
  it('throws when every weekday is skipped', () => {
    expect(() => buildRecurrence('2026-07-10', '2026-08-10', ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'])).toThrow()
  })
  it('throws when the whole range falls on skipped days', () => {
    // Jul 10-12 2026 is Fri-Sun exactly
    expect(() => buildRecurrence('2026-07-10', '2026-07-12', ['FR', 'SA', 'SU'])).toThrow()
  })
  it('payload uses one-day recurring start and carries the RRULE', () => {
    const p = buildEventPayload({ ...base, endDate: '2026-08-10', skipDays: ['FR', 'SA', 'SU'] })
    expect(p.start).toEqual({ date: '2026-07-13' })
    expect(p.end).toEqual({ date: '2026-07-14' })
    expect(p.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH;UNTIL=20260810'])
  })
  it('payload recurrence is null (clears on patch) when no skips', () => {
    expect(buildEventPayload(base).recurrence).toBeNull()
  })
})

describe('parseRRuleUntil', () => {
  it('parses date-only and datetime UNTIL', () => {
    expect(parseRRuleUntil(['RRULE:FREQ=WEEKLY;BYDAY=MO,TU;UNTIL=20260915'])).toBe('2026-09-15')
    expect(parseRRuleUntil(['RRULE:FREQ=WEEKLY;UNTIL=20261231T000000Z;BYDAY=FR'])).toBe('2026-12-31')
  })
  it('returns null when absent', () => {
    expect(parseRRuleUntil(['RRULE:FREQ=WEEKLY;COUNT=5'])).toBeNull()
    expect(parseRRuleUntil(null)).toBeNull()
  })
})

describe('nearestGoogleColorId', () => {
  it('maps distinct chip colors to the expected Google colors', () => {
    expect(nearestGoogleColorId('#f9fb79')).toBe('5')  // yellow → Banana
    expect(nearestGoogleColorId('#5ace81')).toBe('2')  // green → Sage
    expect(nearestGoogleColorId('#ec5555')).toBe('4')  // red → Flamingo
    expect(nearestGoogleColorId('#b4b5f9')).toBe('1')  // lavender → Lavender
  })
  it('exact Google hex maps to itself', () => {
    expect(nearestGoogleColorId('#D50000')).toBe('11')
    expect(nearestGoogleColorId('#039BE5')).toBe('7')
  })
  it('returns null for empty/invalid input', () => {
    expect(nearestGoogleColorId(null)).toBeNull()
    expect(nearestGoogleColorId('not-a-color')).toBeNull()
  })
})

describe('isPhaseForgeEvent', () => {
  it('accepts only events we own', () => {
    expect(isPhaseForgeEvent({ extendedProperties: { private: { pf_owner: 'phaseforge' } } })).toBe(true)
    expect(isPhaseForgeEvent({ extendedProperties: { private: {} } })).toBe(false)
    expect(isPhaseForgeEvent({})).toBe(false)
  })
})
