import { describe, it, expect } from 'vitest'
import { deriveStays, hotelSearchLinks, roomsFor, type WeekJob } from './derive'

const job = (over: Partial<WeekJob>): WeekJob =>
  ({ id: 'j1', title: 'WM 2533 Gulf Breeze', job_number: '244621', project_id: null, days: {}, cells: {}, ...over })

describe('deriveStays', () => {
  it('spans first scheduled day through the last, checking out the morning after', () => {
    // Week starts Sunday Aug 23. Crew on Mon, Tue, Wed (days 1..3).
    const stays = deriveStays([job({ days: { 1: ['Ian'], 2: ['Ian', 'Max'], 3: ['Max'] } })], '2026-08-23')
    expect(stays).toHaveLength(1)
    expect(stays[0]).toMatchObject({ checkIn: '2026-08-24', checkOut: '2026-08-27', nights: 3 })
  })

  it('unions guests across both schedule layouts, deduped and sorted', () => {
    const stays = deriveStays([job({
      days: { 1: ['Max', 'Ian'] },
      cells: { 2: [{ name: 'Ian', shift: 'Nights' }, { name: 'Billy', shift: 'Days' }] },
    })], '2026-08-23')
    expect(stays[0].guests).toEqual(['Billy', 'Ian', 'Max'])
  })

  it('skips a job nobody is scheduled on', () => {
    expect(deriveStays([job({})], '2026-08-23')).toHaveLength(0)
  })

  it('treats a gap in the week as one continuous stay', () => {
    // Mon and Thu only: crew stays through, rather than two hotel bookings.
    const stays = deriveStays([job({ days: { 1: ['Ian'], 4: ['Ian'] } })], '2026-08-23')
    expect(stays[0]).toMatchObject({ checkIn: '2026-08-24', checkOut: '2026-08-28', nights: 4 })
  })

  it('ignores blank names', () => {
    const stays = deriveStays([job({ days: { 1: ['', '  ', 'Ian'] } })], '2026-08-23')
    expect(stays[0].guests).toEqual(['Ian'])
  })
})

describe('roomsFor', () => {
  it('puts two to a room, never zero rooms', () => {
    expect(roomsFor(1)).toBe(1)
    expect(roomsFor(2)).toBe(1)
    expect(roomsFor(3)).toBe(2)
    expect(roomsFor(0)).toBe(1)
  })
})

describe('hotelSearchLinks', () => {
  it('prefills dates, headcount, and rooms', () => {
    const l = hotelSearchLinks({ location: '123 Main St, Lady Lake FL', checkIn: '2026-08-24', checkOut: '2026-08-27', guests: 3 })
    expect(l.maps).toContain('hotels+near+123%20Main')
    expect(l.booking).toContain('checkin=2026-08-24')
    expect(l.booking).toContain('checkout=2026-08-27')
    expect(l.booking).toContain('group_adults=3')
    expect(l.booking).toContain('no_rooms=2')
  })
  it('returns nothing without a location to search near', () => {
    expect(hotelSearchLinks({ location: null, checkIn: '2026-08-24', checkOut: '2026-08-25', guests: 1 })).toEqual({ maps: null, booking: null })
  })
})
