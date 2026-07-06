import { describe, it, expect } from 'vitest'
import {
  buildEventTitle, buildEventDescription, buildEventPayload,
  exclusiveEnd, swapSuperintendentLabels, isPhaseForgeEvent,
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
  it('includes job number, client, superintendent, SCH, links', () => {
    expect(desc).toContain('Job #: 324-10482')
    expect(desc).toContain('Client: ALDI')
    expect(desc).toContain('Superintendent: John Smith')
    expect(desc).toContain('SCH: SCH - John Smith')
    expect(desc).toContain('PlanGrid: https://plangrid.example/x')
    expect(desc).toContain('/app/projects/p1')
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

describe('isPhaseForgeEvent', () => {
  it('accepts only events we own', () => {
    expect(isPhaseForgeEvent({ extendedProperties: { private: { pf_owner: 'phaseforge' } } })).toBe(true)
    expect(isPhaseForgeEvent({ extendedProperties: { private: {} } })).toBe(false)
    expect(isPhaseForgeEvent({})).toBe(false)
  })
})
