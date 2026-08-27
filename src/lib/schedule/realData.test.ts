import { describe, it, expect } from 'vitest'
import { analyzeSchedule, computeMoveImpact, compareToBaseline, buildLookahead, type SchedulePhase, type ScheduleDependency } from '@/lib/schedule/engine'

// Shapes lifted verbatim from Brad's production Gulf Breeze schedule,
// including its real malformed rows where end_date < start_date.
const phases: SchedulePhase[] = [
  { id: 'p1', name: 'Mobilize', start_date: '2026-05-18', end_date: '2026-06-04', status: 'not_started' },
  { id: 'p2', name: 'Equipment order', start_date: '2026-05-18', end_date: '2026-05-21', status: 'not_started' },
  { id: 'p3', name: 'Structural Work', start_date: '2026-07-21', end_date: '2026-08-13', status: 'not_started' },
  { id: 'p4', name: 'Switchgear shutdown', start_date: '2026-07-29', end_date: '2026-07-27', status: 'not_started' },
  { id: 'p5', name: 'Install A02.1', start_date: '2026-09-05', end_date: '2026-09-02', status: 'not_started' },
  { id: 'p6', name: 'Cleanup completed installs', start_date: '2026-09-07', end_date: '2026-09-03', status: 'not_started' },
  { id: 'p7', name: 'Programming/Checkout', start_date: '2026-08-25', end_date: '2026-10-01', status: 'not_started' },
  { id: 'p8', name: 'Closeout', start_date: '2026-09-21', end_date: '2026-10-05', status: 'not_started' },
  { id: 'p9', name: 'BPR', start_date: '2026-09-22', end_date: '2026-10-05', status: 'not_started' },
]
const deps: ScheduleDependency[] = [
  { phase_id: 'p3', depends_on_id: 'p1', type: 'finish_to_start', lag_days: 0 },
  { phase_id: 'p7', depends_on_id: 'p3', type: 'finish_to_start', lag_days: 0 },
  { phase_id: 'p8', depends_on_id: 'p7', type: 'finish_to_start', lag_days: 0 },
]

describe('engine vs real production data', () => {
  it('survives end-before-start rows without NaN', () => {
    const a = analyzeSchedule(phases, [])
    expect(a.ok).toBe(true)
    if (!a.ok) return
    expect(a.completionDate).toBe('2026-10-05')
    for (const [, info] of a.phases) {
      expect(Number.isFinite(info.totalFloat)).toBe(true)
      expect(info.durationDays).toBeGreaterThanOrEqual(1)
    }
  })
  it('computes impact on the dependency chain', () => {
    const impact = computeMoveImpact(phases, deps, 'p3', 5)
    expect(impact.cycleError).toBe(false)
    expect(Number.isFinite(impact.completionDeltaDays)).toBe(true)
  })
  it('self-baseline compares to zero variance', () => {
    const cmp = compareToBaseline(phases, phases.map((p) => ({ phase_id: p.id, name: p.name!, start_date: p.start_date, end_date: p.end_date })))
    expect(cmp.phaseVariances).toHaveLength(0)
    expect(cmp.completionVarianceDays).toBe(0)
  })
  it('builds a lookahead over the window', () => {
    const rows = buildLookahead(phases, deps, '2026-08-25', 2)
    expect(rows.length).toBeGreaterThan(0)
  })
})
