import { describe, it, expect } from 'vitest'
import {
  analyzeSchedule, computeMoveImpact, compareToBaseline, buildLookahead,
  phaseDuration, type SchedulePhase, type ScheduleDependency,
} from './engine'

const P = (id: string, start: string, end: string, extra: Partial<SchedulePhase> = {}): SchedulePhase =>
  ({ id, name: id, start_date: start, end_date: end, ...extra })

const FS = (succ: string, pred: string, lag = 0): ScheduleDependency =>
  ({ phase_id: succ, depends_on_id: pred, type: 'finish_to_start', lag_days: lag })

describe('phaseDuration', () => {
  it('is inclusive of both endpoints', () => {
    expect(phaseDuration({ start_date: '2026-08-01', end_date: '2026-08-01' })).toBe(1)
    expect(phaseDuration({ start_date: '2026-08-01', end_date: '2026-08-05' })).toBe(5)
  })
})

describe('analyzeSchedule', () => {
  // A -> B -> D (long chain), A -> C -> D where C is short: C has float.
  const phases = [
    P('A', '2026-08-01', '2026-08-05'),
    P('B', '2026-08-06', '2026-08-15'),
    P('C', '2026-08-06', '2026-08-08'),
    P('D', '2026-08-16', '2026-08-20'),
  ]
  const deps = [FS('B', 'A'), FS('C', 'A'), FS('D', 'B'), FS('D', 'C')]

  it('identifies the critical chain, not just overdue work', () => {
    const r = analyzeSchedule(phases, deps)
    if (!r.ok) throw new Error('unexpected cycle')
    expect(r.criticalIds).toContain('A')
    expect(r.criticalIds).toContain('B')
    expect(r.criticalIds).toContain('D')
    expect(r.criticalIds).not.toContain('C')
  })

  it('computes float for the slack branch', () => {
    const r = analyzeSchedule(phases, deps)
    if (!r.ok) throw new Error('unexpected cycle')
    // C finishes Aug 8; D starts Aug 16, so C could slip 7 days.
    expect(r.phases.get('C')?.totalFloat).toBe(7)
    expect(r.phases.get('B')?.totalFloat).toBe(0)
  })

  it('reports completion as the latest finish', () => {
    const r = analyzeSchedule(phases, deps)
    if (!r.ok) throw new Error('unexpected cycle')
    expect(r.completionDate).toBe('2026-08-20')
  })

  it('detects a circular dependency and names its members', () => {
    const r = analyzeSchedule(phases, [...deps, FS('A', 'D')])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.cycleIds).toEqual(expect.arrayContaining(['A', 'B', 'D']))
  })

  it('handles a schedule with no dependencies: critical = ends at completion', () => {
    const r = analyzeSchedule(phases, [])
    if (!r.ok) throw new Error('unexpected cycle')
    expect(r.criticalIds).toContain('D')       // ends Aug 20 = completion
    expect(r.criticalIds).not.toContain('C')   // ends Aug 8, 12 days of room
    expect(r.phases.get('C')?.totalFloat).toBe(12)
  })

  it('ignores dependency rows that point at deleted phases', () => {
    const r = analyzeSchedule(phases, [...deps, FS('B', 'GONE')])
    expect(r.ok).toBe(true)
  })

  it('handles start_to_start with lag', () => {
    const r = analyzeSchedule(
      [P('A', '2026-08-01', '2026-08-10'), P('B', '2026-08-03', '2026-08-06')],
      [{ phase_id: 'B', depends_on_id: 'A', type: 'start_to_start', lag_days: 2 }],
    )
    if (!r.ok) throw new Error('unexpected cycle')
    // B may start at A.start+2 = Aug 3, exactly where it sits.
    expect(r.phases.get('B')?.earlyStart).toBe(2)
  })

  it('is safe on an empty phase list', () => {
    const r = analyzeSchedule([], [])
    if (!r.ok) throw new Error('unexpected cycle')
    expect(r.completionDate).toBeNull()
  })
})

describe('computeMoveImpact', () => {
  const phases = [
    P('A', '2026-08-01', '2026-08-05'),
    P('B', '2026-08-06', '2026-08-15'),
    P('C', '2026-08-06', '2026-08-08'),
    P('D', '2026-08-16', '2026-08-20'),
  ]
  const deps = [FS('B', 'A'), FS('C', 'A'), FS('D', 'B'), FS('D', 'C')]

  it('pushes only what the constraints force', () => {
    const impact = computeMoveImpact(phases, deps, 'A', 4)
    // B must move 4 (was back-to-back). C also back-to-back, moves 4.
    // D was back-to-back with B, so moves 4 too.
    const byId = Object.fromEntries(impact.affected.map((a) => [a.id, a.deltaDays]))
    expect(byId.B).toBe(4)
    expect(byId.C).toBe(4)
    expect(byId.D).toBe(4)
    expect(impact.completionDeltaDays).toBe(4)
    expect(impact.newCompletionDate).toBe('2026-08-24')
  })

  it('lets float absorb a delay', () => {
    // Move C (7 days of float before D) by 3: nothing downstream moves.
    const impact = computeMoveImpact(phases, deps, 'C', 3)
    expect(impact.affected).toHaveLength(0)
    expect(impact.completionDeltaDays).toBe(0)
  })

  it('partially absorbs when the delay exceeds the float', () => {
    // C has 7 days of float; moving it 10 pushes D by 3.
    const impact = computeMoveImpact(phases, deps, 'C', 10)
    const d = impact.affected.find((a) => a.id === 'D')
    expect(d?.deltaDays).toBe(3)
    expect(impact.completionDeltaDays).toBe(3)
  })

  it('flags a cycle instead of looping forever', () => {
    const impact = computeMoveImpact(phases, [...deps, FS('A', 'D')], 'A', 2)
    expect(impact.cycleError).toBe(true)
  })
})

describe('compareToBaseline', () => {
  const baseline = [
    { phase_id: 'A', name: 'A', start_date: '2026-08-01', end_date: '2026-08-05' },
    { phase_id: 'B', name: 'B', start_date: '2026-08-06', end_date: '2026-08-15' },
    { phase_id: 'GONE', name: 'Old phase', start_date: '2026-08-01', end_date: '2026-08-02' },
  ]

  it('classifies moves, extensions, additions, and removals', () => {
    const current = [
      P('A', '2026-08-04', '2026-08-08'),   // moved later 3
      P('B', '2026-08-06', '2026-08-18'),   // extended 3
      P('NEW', '2026-08-20', '2026-08-22'), // added
    ]
    const c = compareToBaseline(current, baseline)
    expect(c.movedLater).toBe(1)
    expect(c.durationChanges).toBe(1)
    expect(c.added.map((a) => a.id)).toEqual(['NEW'])
    expect(c.removed.map((r) => r.phase_id)).toEqual(['GONE'])
    expect(c.baselineCompletion).toBe('2026-08-15')
    expect(c.currentCompletion).toBe('2026-08-22')
    expect(c.completionVarianceDays).toBe(7)
  })

  it('reports zero variance for an untouched schedule', () => {
    const current = [P('A', '2026-08-01', '2026-08-05'), P('B', '2026-08-06', '2026-08-15')]
    const c = compareToBaseline(current, baseline.slice(0, 2))
    expect(c.phaseVariances).toHaveLength(0)
    expect(c.completionVarianceDays).toBe(0)
  })
})

describe('buildLookahead', () => {
  const phases = [
    P('done', '2026-08-01', '2026-08-05', { status: 'completed' }),
    P('active', '2026-08-08', '2026-08-12', { status: 'in_progress' }),
    P('later', '2026-09-20', '2026-09-25', { status: 'not_started' }),
    P('blockedOne', '2026-08-14', '2026-08-18', { status: 'not_started' }),
  ]
  const deps = [FS('blockedOne', 'active')]

  it('returns only the window, skipping completed work', () => {
    const rows = buildLookahead(phases, deps, '2026-08-07', 2)
    const ids = rows.map((r) => r.phase.id)
    expect(ids).toContain('active')
    expect(ids).toContain('blockedOne')
    expect(ids).not.toContain('done')
    expect(ids).not.toContain('later')
  })

  it('flags an incomplete predecessor that overlaps the start', () => {
    const rows = buildLookahead(phases, deps, '2026-08-07', 2)
    const blocked = rows.find((r) => r.phase.id === 'blockedOne')
    // active ends Aug 12, before blockedOne starts Aug 14: not a blocker.
    expect(blocked?.blockedBy).toHaveLength(0)

    const tight = buildLookahead(
      [phases[1], P('b2', '2026-08-10', '2026-08-16', { status: 'not_started' })],
      [FS('b2', 'active')],
      '2026-08-07', 2,
    )
    expect(tight.find((r) => r.phase.id === 'b2')?.blockedBy.map((b) => b.id)).toEqual(['active'])
  })
})
