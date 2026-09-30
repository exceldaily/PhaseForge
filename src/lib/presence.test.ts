import { describe, expect, it } from 'vitest'
import { activityLabel, activityTime, pageName, sectionPath, whenLabel } from './presence'

// A Wednesday afternoon, local time.
const NOW = new Date(2026, 8, 30, 15, 0, 0)
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).toISOString()

describe('whenLabel', () => {
  it('reads recent activity as now, then minutes', () => {
    expect(whenLabel(at(2026, 9, 30, 14, 58), NOW)).toEqual({ text: 'Active now', tone: 'now' })
    expect(whenLabel(at(2026, 9, 30, 14, 40), NOW)).toEqual({ text: '20 min ago', tone: 'today' })
  })
  it('names today, yesterday, and the weekday', () => {
    expect(whenLabel(at(2026, 9, 30, 8, 5), NOW)).toEqual({ text: 'Today, 8:05 AM', tone: 'today' })
    expect(whenLabel(at(2026, 9, 29, 17, 30), NOW)).toEqual({ text: 'Yesterday, 5:30 PM', tone: 'week' })
    expect(whenLabel(at(2026, 9, 25, 12, 0), NOW)).toEqual({ text: 'Fri, 12:00 PM', tone: 'week' })
  })
  it('falls back to a date, with the year when it is not this one', () => {
    expect(whenLabel(at(2026, 9, 2), NOW)).toEqual({ text: 'Sep 2', tone: 'stale' })
    expect(whenLabel(at(2025, 12, 14), NOW)).toEqual({ text: 'Dec 14, 2025', tone: 'stale' })
  })
  it('calls just before midnight yesterday, not today', () => {
    expect(whenLabel(at(2026, 9, 29, 23, 50), NOW).text).toBe('Yesterday, 11:50 PM')
  })
})

describe('activityLabel', () => {
  it('prefers the heartbeat over the sign-in', () => {
    const l = activityLabel({ lastSeenAt: at(2026, 9, 30, 14, 58), lastSignInAt: at(2026, 9, 1) }, NOW)
    expect(l).toMatchObject({ text: 'Active now', tone: 'now', signInOnly: false })
  })
  it('says so when only a sign-in is known, and never claims they are here now', () => {
    expect(activityLabel({ lastSeenAt: null, lastSignInAt: at(2026, 9, 25, 10, 53) }, NOW))
      .toMatchObject({ text: 'Signed in Fri, 10:53 AM', tone: 'week', signInOnly: true })
    expect(activityLabel({ lastSeenAt: null, lastSignInAt: at(2026, 9, 30, 14, 59) }, NOW))
      .toMatchObject({ text: 'Signed in just now', tone: 'today', signInOnly: true })
    expect(activityLabel({ lastSeenAt: null, lastSignInAt: at(2026, 9, 30, 9, 0) }, NOW).text).toBe('Signed in today, 9:00 AM')
  })
  it('handles someone who has never signed in', () => {
    expect(activityLabel({ lastSeenAt: null, lastSignInAt: null }, NOW)).toEqual({ text: 'Never signed in', tone: 'never', at: null, signInOnly: false })
    expect(activityLabel(undefined, NOW).tone).toBe('never')
  })
  it('sorts newest first and never last', () => {
    const rows = [
      { id: 'never', lastSeenAt: null, lastSignInAt: null },
      { id: 'old', lastSeenAt: null, lastSignInAt: at(2026, 9, 1) },
      { id: 'fresh', lastSeenAt: at(2026, 9, 30, 14), lastSignInAt: at(2026, 8, 1) },
    ]
    expect([...rows].sort((a, b) => activityTime(b) - activityTime(a)).map((r) => r.id)).toEqual(['fresh', 'old', 'never'])
  })
})

describe('pages', () => {
  it('names the section only', () => {
    expect(pageName('/app/schedules')).toBe('Schedules')
    expect(pageName('/app/projects/9b1c/plans?sheet=3')).toBe('Projects')
    expect(pageName('/app/change-orders')).toBe('Change Orders')
    expect(pageName('/app/some-new-page')).toBe('Some New Page')
    expect(pageName('/login')).toBeNull()
    expect(pageName(null)).toBeNull()
  })
  it('stores the section without ids or queries', () => {
    expect(sectionPath('/app/projects/9b1c/plans?sheet=3')).toBe('/app/projects')
    expect(sectionPath('/app/chat?c=abc')).toBe('/app/chat')
    expect(sectionPath('/app')).toBe('/app')
    expect(sectionPath('/login')).toBeNull()
  })
})
