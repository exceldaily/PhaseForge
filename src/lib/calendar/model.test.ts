import { describe, expect, it } from 'vitest'
import {
  applyWorkWeek, coversDay, fitWeek, keywordDivision, layoutTimed, layoutWeek, listDivisions, passesFilter, phaseOffDays,
  resolveDivision, resolveSuper, superColor, textOn,
  type CalItem, type CalSuper,
} from './model'
import { addMonthsIso, fmtRange, fmtTime, monthWeeks, startOfWeekIso } from './dates'

const item = (id: string, start: string, end: string, extra: Partial<CalItem> = {}): CalItem => ({
  key: `phase:${id}`, kind: 'phase', id, title: id, start, end, startTime: null, endTime: null,
  projectId: null, projectName: null, jobNumber: null, superId: null, division: null, color: null, ...extra,
})

const SUPERS: CalSuper[] = [
  { id: 'bet', name: 'Betancourt', division: 'REFRIGERATION', color: '#188038' },
  { id: 'ven', name: 'Venezia', division: 'REFRIGERATION', color: null },
  { id: 'start', name: 'Startup', division: 'STARTUP', color: 'not a color' },
]

describe('dates', () => {
  it('builds a Sunday-first six week month', () => {
    const weeks = monthWeeks('2026-10-15')
    expect(weeks).toHaveLength(6)
    expect(weeks[0]).toBe('2026-09-27')
    expect(weeks[5]).toBe('2026-11-01')
    expect(startOfWeekIso('2026-10-04')).toBe('2026-10-04')
  })
  it('steps months without skipping short ones', () => {
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsIso('2026-12-15', 1)).toBe('2027-01-15')
    expect(addMonthsIso('2026-01-15', -1)).toBe('2025-12-15')
  })
  it('formats ranges and times', () => {
    expect(fmtRange('2026-10-12', '2026-10-12')).toBe('Oct 12')
    expect(fmtRange('2026-10-12', '2026-10-14')).toBe('Oct 12 to 14')
    expect(fmtRange('2026-10-30', '2026-11-02')).toBe('Oct 30 to Nov 2')
    expect(fmtTime('07:30')).toBe('7:30 AM')
    expect(fmtTime('15:00')).toBe('3 PM')
    expect(fmtTime('00:00')).toBe('12 AM')
  })
})

describe('layoutWeek', () => {
  const WEEK = '2026-10-04'
  it('gives long bars the top lanes and packs single days under them', () => {
    const { segments, lanes } = layoutWeek([
      item('short', '2026-10-06', '2026-10-06'),
      item('long', '2026-10-05', '2026-10-08'),
      item('other', '2026-10-09', '2026-10-09'),
    ], WEEK)
    const by = Object.fromEntries(segments.map((s) => [s.item.id, s]))
    expect(by.long).toMatchObject({ col: 1, span: 4, lane: 0 })
    expect(by.short).toMatchObject({ col: 2, span: 1, lane: 1 })
    expect(by.other).toMatchObject({ col: 5, span: 1, lane: 0 })
    expect(lanes).toBe(2)
  })
  it('clips bars that cross the week and marks the cut ends', () => {
    const { segments } = layoutWeek([item('span', '2026-10-01', '2026-10-20')], WEEK)
    expect(segments[0]).toMatchObject({ col: 0, span: 7, startsBefore: true, endsAfter: true })
  })
  it('leaves out anything outside the week', () => {
    expect(layoutWeek([item('gone', '2026-10-11', '2026-10-12')], WEEK).segments).toEqual([])
  })
  it('puts timed events after all-day ones', () => {
    const { segments } = layoutWeek([
      item('meeting', '2026-10-06', '2026-10-06', { kind: 'event', key: 'event:meeting', startTime: '07:00' }),
      item('work', '2026-10-06', '2026-10-06'),
    ], WEEK)
    expect(segments.map((s) => [s.item.id, s.lane])).toEqual([['work', 0], ['meeting', 1]])
  })
})

describe('fitWeek', () => {
  const WEEK = '2026-10-04'
  it('turns the last row of a crowded day into a count', () => {
    const { segments } = layoutWeek([
      item('a', '2026-10-05', '2026-10-05'), item('b', '2026-10-05', '2026-10-05'),
      item('c', '2026-10-05', '2026-10-05'), item('d', '2026-10-05', '2026-10-05'),
      item('z', '2026-10-07', '2026-10-07'),
    ], WEEK)
    const { visible, more } = fitWeek(segments, 3)
    expect(visible.map((s) => s.item.id).sort()).toEqual(['a', 'b', 'z'])
    expect(more).toEqual([0, 2, 0, 0, 0, 0, 0])
  })
  it('shows everything when it fits exactly', () => {
    const { segments } = layoutWeek([
      item('a', '2026-10-05', '2026-10-05'), item('b', '2026-10-05', '2026-10-05'), item('c', '2026-10-05', '2026-10-05'),
    ], WEEK)
    const { visible, more } = fitWeek(segments, 3)
    expect(visible).toHaveLength(3)
    expect(more.every((n) => n === 0)).toBe(true)
  })
})

describe('layoutTimed', () => {
  const ev = (id: string, s: string, e: string | null) => item(id, '2026-10-06', '2026-10-06', { kind: 'event', key: `event:${id}`, startTime: s, endTime: e })
  it('splits overlapping events into columns and leaves the rest full width', () => {
    const boxes = layoutTimed([ev('a', '07:00', '09:00'), ev('b', '08:00', '10:00'), ev('c', '13:00', '14:00')])
    const by = Object.fromEntries(boxes.map((b) => [b.item.id, b]))
    expect(by.a).toMatchObject({ col: 0, cols: 2 })
    expect(by.b).toMatchObject({ col: 1, cols: 2 })
    expect(by.c).toMatchObject({ col: 0, cols: 1 })
  })
  it('gives an event with no end an hour, and reuses a freed column', () => {
    const boxes = layoutTimed([ev('a', '07:00', null), ev('b', '07:30', '09:00'), ev('c', '08:15', '09:00')])
    const by = Object.fromEntries(boxes.map((b) => [b.item.id, b]))
    expect(by.a).toMatchObject({ startMin: 420, endMin: 480, col: 0 })
    expect(by.c).toMatchObject({ col: 0, cols: 2 })
  })
})

describe('the Monday to Thursday work week', () => {
  // Oct 5 2026 is a Monday.
  it('takes Friday through Sunday off a phase that does not list them', () => {
    expect(phaseOffDays({ start: '2026-10-05', end: '2026-10-15' }, true)).toEqual([5, 6, 0])
    expect(phaseOffDays({ start: '2026-10-05', end: '2026-10-15' }, false)).toEqual([])
  })
  it('keeps a day the phase starts or ends on', () => {
    expect(phaseOffDays({ start: '2026-10-05', end: '2026-10-09' }, true)).toEqual([6, 0])       // ends Friday
    expect(phaseOffDays({ start: '2026-10-04', end: '2026-10-08' }, true)).toEqual([5, 6])       // starts Sunday
    expect(phaseOffDays({ start: '2026-10-09', end: '2026-10-09' }, true)).toEqual([6, 0])       // a Friday only
    expect(phaseOffDays({ start: '2026-10-10', end: '2026-10-11' }, true)).toEqual([5])          // Saturday and Sunday
  })
  it('lets skip days set on the Gantt win, but never hides a phase outright', () => {
    expect(phaseOffDays({ start: '2026-10-05', end: '2026-10-09', skipDays: [3] }, true)).toEqual([3])
    expect(phaseOffDays({ start: '2026-10-05', end: '2026-10-09', skipDays: [3] }, false)).toEqual([3])
    expect(phaseOffDays({ start: '2026-10-10', end: '2026-10-11', skipDays: [6, 0] }, true)).toEqual([])
  })
  it('only touches phases', () => {
    const out = applyWorkWeek([
      item('ph', '2026-10-05', '2026-10-15'),
      item('ev', '2026-10-05', '2026-10-15', { kind: 'event', key: 'event:ev' }),
    ], true)
    expect(out[0].off).toEqual([5, 6, 0])
    expect(out[1].off).toBeUndefined()
    expect(coversDay(out[0], '2026-10-08')).toBe(true)
    expect(coversDay(out[0], '2026-10-09')).toBe(false)
    expect(coversDay(out[1], '2026-10-09')).toBe(true)
  })
  it('splits the bar around the days off and keeps it in one lane', () => {
    const [ph] = applyWorkWeek([item('ph', '2026-10-01', '2026-10-13')], true)   // Thu to Tue, two weekends inside
    const w1 = layoutWeek([ph], '2026-09-27').segments
    expect(w1.map((s) => [s.col, s.span, s.startsBefore, s.endsAfter])).toEqual([[4, 1, false, true]])
    const w2 = layoutWeek([ph], '2026-10-04').segments
    expect(w2.map((s) => [s.col, s.span, s.startsBefore, s.endsAfter])).toEqual([[1, 4, true, true]])
    const w3 = layoutWeek([ph], '2026-10-11').segments
    expect(w3.map((s) => [s.col, s.span, s.startsBefore, s.endsAfter])).toEqual([[1, 2, true, false]])
  })
  it('gives a phase with a mid-week day off two bars in the same lane', () => {
    const ph = { ...item('ph', '2026-10-05', '2026-10-08'), off: [3] }
    const { segments } = layoutWeek([ph, item('other', '2026-10-07', '2026-10-07')], '2026-10-04')
    const mine = segments.filter((s) => s.item.id === 'ph')
    expect(mine.map((s) => [s.col, s.span, s.lane])).toEqual([[1, 2, 0], [4, 1, 0]])
    expect(new Set(segments.map((s) => s.key)).size).toBe(3)
    expect(segments.find((s) => s.item.id === 'other')).toMatchObject({ col: 3, lane: 0 })
  })
})

describe('EMS is Electrical', () => {
  it('reads the word, not the letters', () => {
    expect(keywordDivision('EMS Checkout')).toBe('ELECTRICAL')
    expect(keywordDivision('ems work')).toBe('ELECTRICAL')
    expect(keywordDivision('EMS/ELE Prep')).toBe('ELECTRICAL')
    expect(keywordDivision('Reinstall all ELE, EMS, Refrigeration')).toBe('ELECTRICAL')
    expect(keywordDivision('Punch list items')).toBeNull()
    expect(keywordDivision('Systems check')).toBeNull()
    expect(keywordDivision(null)).toBeNull()
  })
  it('beats the super and the job trade', () => {
    expect(resolveDivision('bet', 'Refrigeration', SUPERS, 'EMS Programming')).toBe('ELECTRICAL')
    expect(resolveDivision('bet', 'Refrigeration', SUPERS, 'Set cases')).toBe('REFRIGERATION')
  })
  it('shows up as a division to filter by once something carries it', () => {
    expect(listDivisions(SUPERS, [{ division: 'ELECTRICAL' }, { division: 'refrigeration' }, { division: null }]))
      .toEqual(['ELECTRICAL', 'REFRIGERATION', 'STARTUP'])
  })
})

describe('supers and divisions', () => {
  it('matches a typed name to a team', () => {
    expect(resolveSuper({ superintendentId: null, superintendentText: 'Carlos Betancourt' }, SUPERS)).toBe('bet')
    expect(resolveSuper({ superintendentId: null, superintendentText: 'venezia' }, SUPERS)).toBe('ven')
    expect(resolveSuper({ superintendentId: 'start', superintendentText: 'Carlos Betancourt' }, SUPERS)).toBe('start')
    expect(resolveSuper({ superintendentId: 'gone', superintendentText: '' }, SUPERS)).toBeNull()
    expect(resolveSuper({ superintendentId: null, superintendentText: 'Greg Darrow' }, SUPERS)).toBeNull()
  })
  it('works out a division from the super, then the trade', () => {
    expect(resolveDivision('start', 'Refrigeration', SUPERS)).toBe('STARTUP')
    expect(resolveDivision(null, 'Refrigeration', SUPERS)).toBe('REFRIGERATION')
    expect(resolveDivision(null, 'Electrical', SUPERS)).toBeNull()
    expect(listDivisions(SUPERS)).toEqual(['REFRIGERATION', 'STARTUP'])
  })
  it('gives every super a color and readable text on it', () => {
    expect(superColor(SUPERS[0], 0)).toBe('#188038')
    expect(superColor(SUPERS[2], 2)).toMatch(/^#[0-9a-f]{6}$/)
    expect(textOn('#188038')).toBe('#ffffff')
    expect(textOn('#fef08a')).toBe('#0f172a')
  })
  it('filters by division, super, kind, and project', () => {
    const it1 = item('x', '2026-10-05', '2026-10-05', { superId: 'bet', division: 'REFRIGERATION', projectId: 'p1' })
    const base = { division: '', hiddenSupers: new Set<string>(), hiddenKinds: new Set<CalItem['kind']>(), projectId: null }
    expect(passesFilter(it1, base)).toBe(true)
    expect(passesFilter(it1, { ...base, division: 'refrigeration' })).toBe(true)
    expect(passesFilter(it1, { ...base, division: 'STARTUP' })).toBe(false)
    expect(passesFilter(it1, { ...base, hiddenSupers: new Set(['bet']) })).toBe(false)
    expect(passesFilter({ ...it1, superId: null }, { ...base, hiddenSupers: new Set(['none']) })).toBe(false)
    expect(passesFilter(it1, { ...base, hiddenKinds: new Set<CalItem['kind']>(['phase']) })).toBe(false)
    expect(passesFilter(it1, { ...base, projectId: 'p2' })).toBe(false)
  })
})
