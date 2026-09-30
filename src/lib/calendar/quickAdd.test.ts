import { describe, expect, it } from 'vitest'
import { decideQuickAdd, parseQuickAdd, projectTokens, type QaPoolItem } from './quickAdd'

// Wednesday.
const TODAY = '2026-09-30'

const PROJECTS = [
  { id: 'gulf', name: '2533-1012 Gulf Breeze Capx', jobNumber: '244621' },
  { id: 'stuart', name: '1087-278 Stuart ZE (Carlos, Gau', jobNumber: '241480' },
  { id: 'sara1', name: '2459-258 Sarasota', jobNumber: null },
  { id: 'sara2', name: '7298-1000 Sarasota (FMGI)', jobNumber: '257036' },
  { id: 'bjs', name: "BJ's 128 Sarasota", jobNumber: null },
  { id: 'tampa', name: 'Aldi 2413 Tampa', jobNumber: null },
  { id: 'lutz', name: 'Aldi 0611 Lutz', jobNumber: null },
  { id: 'avon', name: 'Aldi 609 Avon Park', jobNumber: null },
  { id: 'pinellas', name: "Sam's Club 6387-1017 Pinelles Park Capx Condensers", jobNumber: '255802' },
  { id: 'brandon', name: "Sam's 6403-1014 Brandon Capx (HVAC work, Refer work)", jobNumber: '253073' },
  { id: 'tj', name: "760 Trader Joe's Jacksonville (FMGI/AMS)", jobNumber: '257046' },
  { id: 'kiss', name: '5250-1012 Kissimmee', jobNumber: null },
]
const SUPERS = [
  { id: 's-ven', name: 'Venezia' }, { id: 's-bet', name: 'Betancourt' },
  { id: 's-start', name: 'Startup' }, { id: 's-mil', name: 'Miller' },
]
const parse = (t: string) => parseQuickAdd(t, TODAY, PROJECTS, SUPERS)
const ids = (t: string) => parse(t).projects.map((p) => p.id)

describe('dates', () => {
  it('reads month names, slashes, and ISO', () => {
    expect(parse('Oct 12 Gulf Breeze set cases').startDate).toBe('2026-10-12')
    expect(parse('October 12th, 2026 walk through').startDate).toBe('2026-10-12')
    expect(parse('12 Oct walk through').startDate).toBe('2026-10-12')
    expect(parse('10/12 walk through').startDate).toBe('2026-10-12')
    expect(parse('10/12/27 walk through').startDate).toBe('2027-10-12')
    expect(parse('2026-11-03 inspection').startDate).toBe('2026-11-03')
  })
  it('reads ranges', () => {
    expect(parse('Oct 12-14 Stuart rack set')).toMatchObject({ startDate: '2026-10-12', endDate: '2026-10-14' })
    expect(parse('Oct 30 to Nov 2 Stuart rack set')).toMatchObject({ startDate: '2026-10-30', endDate: '2026-11-02' })
    expect(parse('10/12-10/14 rack set')).toMatchObject({ startDate: '2026-10-12', endDate: '2026-10-14' })
    expect(parse('10/12-14 rack set')).toMatchObject({ startDate: '2026-10-12', endDate: '2026-10-14' })
    expect(parse('mon thru wed rack set')).toMatchObject({ startDate: '2026-10-05', endDate: '2026-10-07' })
  })
  it('reads relative days', () => {
    expect(parse('today tailgate').startDate).toBe('2026-09-30')
    expect(parse('tomorrow tailgate').startDate).toBe('2026-10-01')
    expect(parse('friday tailgate').startDate).toBe('2026-10-02')
    expect(parse('wednesday tailgate').startDate).toBe('2026-09-30')
    expect(parse('next friday tailgate').startDate).toBe('2026-10-09')
    expect(parse('in 2 weeks tailgate').startDate).toBe('2026-10-14')
    expect(parse('tailgate the 5th').startDate).toBe('2026-10-05')
  })
  it('rolls a bare date that is long past into next year, but keeps a recent one', () => {
    expect(parse('1/15 kickoff').startDate).toBe('2027-01-15')
    expect(parse('9/2 kickoff').startDate).toBe('2026-09-02')
  })
  it('does not mistake store numbers or times for dates', () => {
    expect(parse('1087-278 Stuart startup').startDate).toBeNull()
    expect(parse('Oct 12 - 7am Stuart startup')).toMatchObject({ startDate: '2026-10-12', endDate: '2026-10-12', startTime: '07:00' })
    expect(parse('Oct 12 2533 startup')).toMatchObject({ startDate: '2026-10-12' })
    expect(ids('Oct 12 2533 startup')).toEqual(['gulf'])
  })
})

describe('times', () => {
  it('reads single times and ranges', () => {
    expect(parse('Oct 12 7am safety meeting')).toMatchObject({ startTime: '07:00', endTime: null })
    expect(parse('Oct 12 at 2:30 pm inspection')).toMatchObject({ startTime: '14:30' })
    expect(parse('Oct 12 7-3:30pm Stuart')).toMatchObject({ startTime: '07:00', endTime: '15:30' })
    expect(parse('Oct 12 8-10am meeting')).toMatchObject({ startTime: '08:00', endTime: '10:00' })
    expect(parse('Oct 12 7am to 5pm meeting')).toMatchObject({ startTime: '07:00', endTime: '17:00' })
    expect(parse('Oct 12 noon lunch')).toMatchObject({ startTime: '12:00' })
    expect(parse('Oct 12 at 8 walk')).toMatchObject({ startTime: '08:00' })
    expect(parse('Oct 12 at 2 walk')).toMatchObject({ startTime: '14:00' })
  })
  it('leaves store numbers alone', () => {
    const p = parse('Oct 12 meeting at 760 Trader Joes')
    expect(p.startTime).toBeNull()
    expect(p.projects.map((x) => x.id)).toEqual(['tj'])
  })
})

describe('jobs', () => {
  it('finds a job by town, store number, or job number', () => {
    expect(ids('Oct 12 Gulf Breeze set cases')).toEqual(['gulf'])
    expect(ids('Oct 12 2533 set cases')).toEqual(['gulf'])
    expect(ids('Oct 12 244621 set cases')).toEqual(['gulf'])
    expect(ids('Oct 12 1087-278 Stuart set cases')).toEqual(['stuart'])
    expect(ids('Oct 12 aldi tampa set cases')).toEqual(['tampa'])
    expect(ids('Oct 12 611 set cases')).toEqual(['lutz'])
  })
  it('offers a choice when a town has several jobs', () => {
    expect(ids('Oct 12 Sarasota startup').sort()).toEqual(['bjs', 'sara1', 'sara2'])
    expect(ids('Oct 12 BJs Sarasota startup')).toEqual(['bjs'])
    expect(ids('Oct 12 aldi walk').sort()).toEqual(['avon', 'lutz', 'tampa'])
    expect(ids('Oct 12 7298 Sarasota startup')).toEqual(['sara2'])
  })
  it('forgives a typo in a long town name and a partial one', () => {
    expect(ids('Oct 12 Pinellas Park condenser swap')).toEqual(['pinellas'])
    expect(ids('Oct 12 Kissimee startup')).toEqual(['kiss'])
    expect(ids('Oct 12 Jacksonv startup')).toEqual(['tj'])
  })
  it('does not invent a job from ordinary words', () => {
    expect(ids('Oct 12 safety meeting')).toEqual([])
    expect(ids('Oct 12 start piping')).toEqual([])
    expect(ids('Oct 12 hvac work')).toEqual([])
  })
  it('ignores the notes in brackets on a job name', () => {
    expect(projectTokens(PROJECTS[9])).not.toContain('hvac')
    expect(projectTokens(PROJECTS[1])).toEqual(['1087', '278', 'stuart', 'ze', '241480'])
  })
})

describe('titles and supers', () => {
  it('leaves what is being done as the title', () => {
    expect(parse('Oct 12 Gulf Breeze set cases').title).toBe('Set cases')
    expect(parse('set cases at Gulf Breeze on Oct 12').title).toBe('Set cases')
    expect(parse('Gulf Breeze - rack set - 10/14').title).toBe('Rack set')
    expect(parse('Oct 12 1087-278 Stuart pressure test').title).toBe('Pressure test')
    expect(parse('Oct 12 safety meeting at 7am').title).toBe('Safety meeting')
  })
  it('picks up the super', () => {
    expect(parse('Oct 12 Gulf Breeze set cases Venezia')).toMatchObject({ superId: 's-ven', title: 'Set cases' })
    expect(parse("Oct 12 Betancourt's team Stuart rack set")).toMatchObject({ superId: 's-bet', title: 'Rack set' })
  })
  it('keeps a team name as the title when it is all that is left', () => {
    expect(parse('Oct 12 Gulf Breeze startup')).toMatchObject({ superId: 's-start', title: 'Startup' })
    expect(parse('Oct 12 Gulf Breeze startup walk')).toMatchObject({ superId: 's-start', title: 'Walk' })
  })
})

describe('decideQuickAdd', () => {
  const pool: QaPoolItem[] = [
    { kind: 'phase', id: 'p-start', projectId: 'gulf', title: 'Startup', start: '2026-10-05', end: '2026-10-07' },
    { kind: 'phase', id: 'p-cases', projectId: 'gulf', title: 'Set cases', start: '2026-10-01', end: '2026-10-02' },
    { kind: 'phase', id: 'p-old', projectId: 'gulf', title: 'Startup', start: '2026-03-01', end: '2026-03-02', done: true },
    { kind: 'phase', id: 'p-only', projectId: 'stuart', title: 'Rack set', start: '2026-10-08', end: '2026-10-08' },
    { kind: 'event', id: 'e-safety', projectId: null, title: 'Safety meeting', start: '2026-10-06', end: '2026-10-06' },
  ]
  const decide = (t: string, chosen?: string | null) => decideQuickAdd(parse(t), pool, chosen)

  it('asks for what is missing', () => {
    expect(decide('Gulf Breeze set cases')).toEqual({ type: 'need-date' })
    expect(decide('Oct 12 Tampa')).toEqual({ type: 'need-title' })
    expect(decide('Oct 12 Sarasota startup')).toEqual({ type: 'need-project' })
  })
  it('adds a phase on a job and an event otherwise', () => {
    expect(decide('Oct 12 Gulf Breeze pressure test')).toEqual({ type: 'add', as: 'phase', nothingToMove: false })
    expect(decide('Oct 12 toolbox talk')).toEqual({ type: 'add', as: 'event', nothingToMove: false })
    expect(decide('Oct 12 2pm Gulf Breeze inspection')).toEqual({ type: 'add', as: 'event', nothingToMove: false })
    expect(decide('Oct 12 Sarasota startup', 'sara2')).toEqual({ type: 'add', as: 'phase', nothingToMove: false })
  })
  it('moves the phase with the same name instead of making a twin, keeping its length', () => {
    expect(decide('Oct 12 Gulf Breeze startup')).toEqual({ type: 'move', target: pool[0], start: '2026-10-12', end: '2026-10-14' })
    expect(decide('Oct 12-13 Gulf Breeze startup')).toEqual({ type: 'move', target: pool[0], start: '2026-10-12', end: '2026-10-13' })
    expect(decide('Oct 9 safety meeting')).toEqual({ type: 'move', target: pool[4], start: '2026-10-09', end: '2026-10-09' })
  })
  it('says so when it is already there', () => {
    expect(decide('Oct 5 Gulf Breeze startup')).toEqual({ type: 'same', target: pool[0] })
  })
  it('follows a move word to the closest match', () => {
    expect(decide('move Gulf Breeze cases to Friday')).toEqual({ type: 'move', target: pool[1], start: '2026-10-02', end: '2026-10-03' })
    expect(decide('push Stuart to Oct 12')).toEqual({ type: 'move', target: pool[3], start: '2026-10-12', end: '2026-10-12' })
    expect(decide('move Gulf Breeze from Oct 5 to Oct 9')).toEqual({ type: 'move', target: pool[0], start: '2026-10-09', end: '2026-10-11' })
    expect(decide('move Gulf Breeze startup Oct 5 to Oct 9')).toEqual({ type: 'move', target: pool[0], start: '2026-10-09', end: '2026-10-11' })
  })
  it('adds when a move word finds nothing to move', () => {
    expect(decide('move Gulf Breeze punch walk to Oct 12')).toEqual({ type: 'add', as: 'phase', nothingToMove: true })
  })
})
