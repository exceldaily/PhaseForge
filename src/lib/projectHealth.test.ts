import { describe, it, expect } from 'vitest'
import { scoreProjectHealth, smartPriority, type HealthInput } from './projectHealth'

const base: HealthInput = {
  startDate: '2026-06-01',
  endDate: '2026-10-01',
  baselineEnd: null,
  status: 'construction_initiated',
  totalPhases: 10,
  completedPhases: 4,
  blockedPhases: 0,
  overduePhases: 0,
  maxPhaseOverdueDays: 0,
  progressPercent: 42,
  scheduledCompletion: '2026-10-01',
  openCoCount: 0,
  oldestOpenCoDays: 0,
  openPunchCount: 2,
  overduePunchCount: 0,
  lastActivityAt: '2026-08-01T10:00:00Z',
  today: '2026-08-02',
}

describe('scoreProjectHealth', () => {
  it('gives a clean on-plan project a healthy score', () => {
    const r = scoreProjectHealth(base)
    expect(r.score).toBeGreaterThanOrEqual(90)
    expect(r.level).toBe('on_track')
    expect(r.attention).toHaveLength(0)
  })

  it('is deterministic', () => {
    expect(scoreProjectHealth(base)).toEqual(scoreProjectHealth(base))
  })

  it('penalizes completion slip and explains it', () => {
    const r = scoreProjectHealth({ ...base, scheduledCompletion: '2026-10-09' })
    expect(r.slipDays).toBe(8)
    expect(r.score).toBeLessThan(scoreProjectHealth(base).score)
    expect(r.reasons.join(' ')).toContain('slipped 8 days')
    expect(r.attention.some((a) => a.target === 'gantt' && a.severity === 'critical')).toBe(true)
  })

  it('measures slip against the baseline when one exists', () => {
    const r = scoreProjectHealth({
      ...base,
      baselineEnd: '2026-09-20',
      scheduledCompletion: '2026-10-01',
    })
    expect(r.slipDays).toBe(11)
    expect(r.reasons.join(' ')).toContain('baseline')
  })

  it('stacks independent problems into a lower band', () => {
    const r = scoreProjectHealth({
      ...base,
      overduePhases: 3,
      maxPhaseOverdueDays: 9,
      blockedPhases: 2,
      oldestOpenCoDays: 12,
      openCoCount: 1,
      overduePunchCount: 4,
      lastActivityAt: '2026-07-20T10:00:00Z',
      scheduledCompletion: '2026-10-07',
    })
    expect(r.level).toBe('delayed')
    // Every deduction shows up as an explainable line.
    const text = r.reasons.join(' ')
    expect(text).toContain('past their finish date')
    expect(text).toContain('blocked')
    expect(text).toContain('change order')
    expect(text).toContain('punch')
    expect(text).toContain('No project update')
  })

  it('does not punish a closed project for silence', () => {
    const r = scoreProjectHealth({ ...base, status: 'closed', lastActivityAt: null, progressPercent: 100 })
    expect(r.reasons.join(' ')).not.toContain('No project update')
  })

  it('flags work behind the calendar, not raw percent', () => {
    // 75% of the time gone, 42% done.
    const r = scoreProjectHealth({ ...base, today: '2026-09-01' })
    expect(r.reasons.some((x) => x.includes('behind the calendar'))).toBe(true)
  })

  it('sorts attention critical-first', () => {
    const r = scoreProjectHealth({
      ...base,
      blockedPhases: 1,                       // critical
      lastActivityAt: '2026-07-25T00:00:00Z', // info (8 days)
    })
    expect(r.attention[0].severity).toBe('critical')
  })
})

describe('smartPriority', () => {
  it('ranks the sicker project higher', () => {
    const healthy = scoreProjectHealth(base)
    const sick = scoreProjectHealth({ ...base, overduePhases: 4, maxPhaseOverdueDays: 10, blockedPhases: 2 })
    expect(smartPriority(sick, base.endDate, base.today))
      .toBeGreaterThan(smartPriority(healthy, base.endDate, base.today))
  })

  it('boosts a project whose completion is inside two weeks', () => {
    const h = scoreProjectHealth(base)
    const near = smartPriority(h, '2026-08-09', base.today)   // 7 days out
    const far = smartPriority(h, '2026-12-01', base.today)
    expect(near).toBeGreaterThan(far)
  })
})
