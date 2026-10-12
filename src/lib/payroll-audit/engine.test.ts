import { describe, expect, it } from 'vitest'
import { auditEmployee, type AuditEmployee, type AuditEntry, type Place, type RouteFn } from './engine'
import { zonedToEpoch } from './time'

const TZ = 'America/New_York'
const H: Place = { lat: 28.0, lng: -81.0 }
const A: Place = { lat: 28.5, lng: -81.5 }
const B: Place = { lat: 29.0, lng: -82.0 }
const places = new Map<string, Place>([['100', A], ['200', B]])
const settings = { toleranceMinutes: 45, includePolicyDeduction: false }
const emp = (over: Partial<AuditEmployee> = {}): AuditEmployee => ({ kalosId: '1', name: 'Test Tech', excluded: false, home: H, ...over })

/** t('2026-10-06', 8, 30) -> epoch ms for 8:30 AM ET. */
const t = (date: string, h: number, m = 0) => {
  const [y, mo, d] = date.split('-').map(Number)
  return zonedToEpoch(y, mo, d, h, m, TZ)
}
let n = 0
const entry = (over: Partial<AuditEntry> & { startMs: number; endMs: number }): AuditEntry => ({
  key: `e${++n}`, workDate: '2026-10-06', jobNumber: '100', isTravel: false, hours: null, policyDeductionMinutes: 0, classCode: '17', ...over,
})
const travel = (over: Partial<AuditEntry> & { startMs: number; endMs: number }) => entry({ isTravel: true, classCode: '37', ...over })

/** Route stub: fixed minutes, or null to simulate the router failing. */
const fixed = (minutes: number | null): RouteFn => async () => (minutes === null ? null : { minutes, miles: 10, provider: 'test' })
const byPair = (m: Record<string, number>): RouteFn => async (a, b) => {
  const k = `${a.lat}>${b.lat}`
  return k in m ? { minutes: m[k], miles: null, provider: 'test' } : null
}
const run = (entries: AuditEntry[], route: RouteFn, employee = emp(), jobPlaces = places) =>
  auditEmployee({ employee, entries, jobPlaces, route, settings, timezone: TZ })

// Home-to-job: travel 8:00-?, work starts right after.
const homeTrip = (minutes: number) => {
  const s = t('2026-10-06', 6, 0)
  const e = s + minutes * 60_000
  return [travel({ startMs: s, endMs: e }), entry({ startMs: e, endMs: e + 8 * 3_600_000 })]
}

describe('45 minute allowance on top of the drive estimate', () => {
  const cases: [string, number, number, boolean][] = [
    ['30m drive, 50m recorded', 30, 50, false],
    ['2h drive, 2h40m recorded', 120, 160, false],
    ['4h drive, 4h50m recorded', 240, 290, true],
    ['6h drive, 6h30m recorded', 360, 390, false],
    ['8h drive, 9h10m recorded', 480, 550, true],
    ['exactly 45 over passes', 60, 105, false],
    ['46 over flags', 60, 106, true],
  ]
  for (const [name, est, rec, flag] of cases) {
    it(name, async () => {
      const r = await run(homeTrip(rec), fixed(est))
      expect(r.findings.filter((f) => f.category === 'excessive_travel')).toHaveLength(flag ? 1 : 0)
      expect(r.stats.flagged).toBe(flag ? 1 : 0)
    })
  }

  it('reports recorded, estimate, allowed, and excess on a flag', async () => {
    const [f] = (await run(homeTrip(290), fixed(240))).findings
    expect(f).toMatchObject({
      category: 'excessive_travel', travelType: 'home_to_job', recordedMinutes: 290, estimatedMinutes: 240,
      allowedMinutes: 285, excessMinutes: 50, originLabel: 'Home', destLabel: 'Job 100', routeProvider: 'test',
    })
    expect(f.assumptions.join(' ')).toMatch(/traffic/i)
  })

  it('never stores a home address or coordinate on a finding', async () => {
    const [f] = (await run(homeTrip(290), fixed(240))).findings
    expect(JSON.stringify(f)).not.toMatch(/"lat"|"lng"|28\.0|-81\.0/)
  })
})

describe('jobsite to jobsite', () => {
  // Job A ends 11:00, Job B starts 2:30 PM, 3.5h travel recorded, 2h drive.
  const day = '2026-10-06'
  const pair = (recordedMin: number) => [
    entry({ jobNumber: '100', startMs: t(day, 7), endMs: t(day, 11) }),
    travel({ jobNumber: '200', startMs: t(day, 11), endMs: t(day, 11) + recordedMin * 60_000 }),
    entry({ jobNumber: '200', startMs: t(day, 11) + recordedMin * 60_000, endMs: t(day, 18) }),
  ]
  it('flags 3h30 recorded against a 2h drive', async () => {
    const r = await run(pair(210), fixed(120))
    const f = r.findings.find((x) => x.category === 'jobsite_transition')
    expect(f).toMatchObject({ travelType: 'job_to_job', originLabel: 'Job 100', destLabel: 'Job 200', recordedMinutes: 210, estimatedMinutes: 120, excessMinutes: 90 })
  })
  it('passes when within the allowance', async () => {
    const r = await run(pair(150), fixed(120))
    expect(r.findings.filter((x) => x.category === 'jobsite_transition')).toHaveLength(0)
    expect(r.stats.withinAllowance).toBe(1)
  })
  it('routes through a documented stop as separate legs when each is recorded', async () => {
    // A -> supply house trip, then supply house -> B is not modelled as one
    // route; each recorded leg is compared on its own and nothing is invented.
    const r = await run([
      entry({ jobNumber: '100', startMs: t(day, 7), endMs: t(day, 11) }),
      travel({ jobNumber: '100', startMs: t(day, 11), endMs: t(day, 11, 30) }),
      travel({ jobNumber: '200', startMs: t(day, 12), endMs: t(day, 12, 40) }),
      entry({ jobNumber: '200', startMs: t(day, 12, 40), endMs: t(day, 17) }),
    ], fixed(90))
    expect(r.stats.trips).toBe(2)
    expect(r.findings.filter((x) => x.category === 'jobsite_transition')).toHaveLength(0)
  })
})

describe('chronology', () => {
  it('handles an overnight shift followed by travel home', async () => {
    const mon = '2026-10-05', tue = '2026-10-06'
    const r = await run([
      entry({ workDate: mon, jobNumber: '100', startMs: t(mon, 20), endMs: t(tue, 3) }),
      travel({ workDate: tue, jobNumber: '100', startMs: t(tue, 3), endMs: t(tue, 4, 30) }),
    ], fixed(60))
    expect(r.stats.trips).toBe(1)
    expect(r.findings).toHaveLength(0)
    expect(r.stats.withinAllowance).toBe(1)
  })

  it('treats a long gap since the last job as a trip from home', async () => {
    const r = await run([
      entry({ workDate: '2026-10-05', jobNumber: '200', startMs: t('2026-10-05', 8), endMs: t('2026-10-05', 12) }),
      travel({ jobNumber: '100', startMs: t('2026-10-06', 6), endMs: t('2026-10-06', 8) }),
      entry({ jobNumber: '100', startMs: t('2026-10-06', 8), endMs: t('2026-10-06', 16) }),
    ], fixed(60))
    const f = r.findings.find((x) => x.category === 'excessive_travel')
    expect(f?.originLabel).toBe('Home')
  })

  it('counts doubled travel entries once', async () => {
    const s = t('2026-10-06', 6)
    const r = await run([
      travel({ startMs: s, endMs: s + 90 * 60_000 }),
      travel({ startMs: s, endMs: s + 90 * 60_000 }), // overlapping copy with a different key
      entry({ startMs: s + 90 * 60_000, endMs: s + 8 * 3_600_000 }),
    ], fixed(60))
    expect(r.stats.trips).toBe(1)
    expect(r.findings.some((x) => x.category === 'excessive_travel')).toBe(false) // 90 <= 60 + 45
  })

  it('collapses an identical duplicate record', async () => {
    const s = t('2026-10-06', 6)
    const dup = travel({ key: 'same', startMs: s, endMs: s + 60 * 60_000 })
    const r = await run([dup, { ...dup }, entry({ startMs: s + 60 * 60_000, endMs: s + 9 * 3_600_000 })], fixed(60))
    expect(r.stats.travelEntries).toBe(1)
    expect(r.findings).toHaveLength(0)
  })

  it('flags overlapping entries', async () => {
    const r = await run([
      entry({ jobNumber: '100', startMs: t('2026-10-06', 8), endMs: t('2026-10-06', 12) }),
      entry({ jobNumber: '200', startMs: t('2026-10-06', 11), endMs: t('2026-10-06', 15) }),
    ], fixed(30))
    const o = r.findings.find((x) => x.category === 'overlap')
    expect(o?.recordedMinutes).toBe(60)
  })
})

describe('gaps between jobs are their own categories', () => {
  const day = '2026-10-06'
  it('missing travel entry', async () => {
    const r = await run([
      entry({ jobNumber: '100', startMs: t(day, 7), endMs: t(day, 11) }),
      entry({ jobNumber: '200', startMs: t(day, 12), endMs: t(day, 17) }),
    ], fixed(40))
    expect(r.findings.map((f) => f.category)).toEqual(['missing_travel'])
  })
  it('impossible transition: 20 minute gap for a 3h drive', async () => {
    const r = await run([
      entry({ jobNumber: '100', startMs: t(day, 7), endMs: t(day, 11) }),
      entry({ jobNumber: '200', startMs: t(day, 11, 20), endMs: t(day, 17) }),
    ], fixed(180))
    expect(r.findings.map((f) => f.category).sort()).toEqual(['impossible_transition'])
  })
  it('unexplained time not covered by travel', async () => {
    const r = await run([
      entry({ jobNumber: '100', startMs: t(day, 7), endMs: t(day, 11) }),
      travel({ jobNumber: '200', startMs: t(day, 11), endMs: t(day, 12) }),
      entry({ jobNumber: '200', startMs: t(day, 14), endMs: t(day, 18) }),
    ], fixed(60))
    expect(r.findings.map((f) => f.category)).toEqual(['unexplained_gap'])
    expect(r.findings[0].excessMinutes).toBe(120) // 3h gap, 1h of it travel
  })
})

describe('unable to verify', () => {
  it('missing job address', async () => {
    const r = await run(homeTrip(60), fixed(30), emp(), new Map())
    expect(r.findings[0]).toMatchObject({ category: 'unable_to_verify' })
    expect(r.unmatchedJobs).toEqual(['100'])
    expect(r.findings[0].summary).toMatch(/UNABLE TO VERIFY/)
  })
  it('no home address is not invented', async () => {
    const r = await run(homeTrip(60), fixed(30), emp({ home: null }))
    expect(r.findings[0]).toMatchObject({ category: 'unable_to_verify', estimatedMinutes: null })
    expect(r.findings[0].summary).toMatch(/no address on file for technician home/)
  })
  it('unknown origin and destination', async () => {
    const s = t('2026-10-06', 6)
    const r = await run([travel({ jobNumber: null, startMs: s, endMs: s + 3_600_000 })], fixed(30))
    expect(r.findings[0].category).toBe('unable_to_verify')
  })
  it('routing service failure never produces a made up estimate', async () => {
    const r = await run(homeTrip(600), fixed(null))
    expect(r.findings).toHaveLength(1)
    expect(r.findings[0]).toMatchObject({ category: 'unable_to_verify', estimatedMinutes: null, allowedMinutes: null })
    expect(r.stats.flagged).toBe(0)
  })
  it('same job at both ends has no drive to compare', async () => {
    const day = '2026-10-06'
    const r = await run([
      entry({ jobNumber: '100', startMs: t(day, 7), endMs: t(day, 10) }),
      travel({ jobNumber: '100', startMs: t(day, 10), endMs: t(day, 11) }),
      entry({ jobNumber: '100', startMs: t(day, 11), endMs: t(day, 15) }),
    ], fixed(30))
    expect(r.findings[0].category).toBe('unable_to_verify')
  })
})

describe('exclusions', () => {
  it('an excluded technician produces no findings and counts nothing', async () => {
    const r = await run(homeTrip(600), fixed(60), emp({ excluded: true }))
    expect(r.findings).toEqual([])
    expect(r.stats).toMatchObject({ entries: 0, trips: 0, flagged: 0, unverifiable: 0 })
  })
  it('skips every category for them, including overlaps', async () => {
    const r = await run([
      entry({ jobNumber: '100', startMs: t('2026-10-06', 8), endMs: t('2026-10-06', 12) }),
      entry({ jobNumber: '200', startMs: t('2026-10-06', 10), endMs: t('2026-10-06', 14) }),
    ], fixed(30), emp({ excluded: true }))
    expect(r.findings).toEqual([])
    expect(r.unmatchedJobs).toEqual([])
  })
  it('works with no Kalos employee id', async () => {
    const r = await run(homeTrip(290), fixed(240), emp({ kalosId: null }))
    expect(r.findings[0].key).toContain('name:test tech')
  })
})

describe('policy deduction setting', () => {
  it('adds the deducted time back when asked', async () => {
    const e = homeTrip(100)
    e[0].policyDeductionMinutes = 30
    const off = await auditEmployee({ employee: emp(), entries: e, jobPlaces: places, route: fixed(60), settings, timezone: TZ })
    const on = await auditEmployee({ employee: emp(), entries: e, jobPlaces: places, route: fixed(60), settings: { ...settings, includePolicyDeduction: true }, timezone: TZ })
    expect(off.findings).toHaveLength(0) // 100 <= 105
    expect(on.findings[0]).toMatchObject({ category: 'excessive_travel', recordedMinutes: 130 }) // 130 > 105
  })
})

describe('repeat runs', () => {
  it('produce identical finding keys so upserts never duplicate', async () => {
    const e = homeTrip(290)
    const a = await run(e, fixed(240))
    const b = await run(e, fixed(240))
    expect(a.findings.map((f) => f.key)).toEqual(b.findings.map((f) => f.key))
  })
  it('uses job-to-job pair routing', async () => {
    const day = '2026-10-06'
    const r = await run([
      entry({ jobNumber: '100', startMs: t(day, 7), endMs: t(day, 11) }),
      travel({ jobNumber: '200', startMs: t(day, 11), endMs: t(day, 14) }),
      entry({ jobNumber: '200', startMs: t(day, 14), endMs: t(day, 18) }),
    ], byPair({ '28.5>29': 100 }))
    expect(r.findings[0]).toMatchObject({ category: 'jobsite_transition', estimatedMinutes: 100, recordedMinutes: 180 })
  })
})
