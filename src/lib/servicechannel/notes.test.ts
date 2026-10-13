import { describe, expect, it } from 'vitest'
import { noteSignals, notesHash, parseNotes } from './notes'

const NOTES = 'Oct 6, 2026 Unsatisfactory alert sent to a@kalosflorida.com;. (Diana Carrasquillo) Oct 6, 2026 Status has been changed from COMPLETED/PENDING CONFIRMATION to IN PROGRESS/UNSATISFACTORY. (Diana Carrasquillo) Dec 30, 2025 ETA Missed Alert has been sent (ETA Alert Agent) Dec 23, 2025 Accept    On Tue, Dec 23, 2025 at 11:22 AM \'ServiceChannel\' via Walmart Service <walmartservice@kalosflorida.com> (E-Mail Agent) Dec 23, 2025 Status has been changed from OPEN to IN PROGRESS/DISPATCH CONFIRMED. (stevev@kalosflorida.com)'

describe('parseNotes', () => {
  const ev = parseNotes(NOTES)
  it('splits entries on their leading date and trailing actor', () => {
    expect(ev).toHaveLength(5)
    expect(ev[0]).toEqual({ date: '2026-10-06', text: 'Unsatisfactory alert sent to a@kalosflorida.com;.', actor: 'Diana Carrasquillo' })
    expect(ev[4]).toMatchObject({ date: '2025-12-23', actor: 'stevev@kalosflorida.com' })
  })
  it('does not split on a date quoted inside an e-mail', () => {
    expect(ev[3].text).toContain("On Tue, Dec 23, 2025 at 11:22 AM")
    expect(ev[3].actor).toBe('E-Mail Agent')
  })
  it('handles empty and date-less notes', () => {
    expect(parseNotes('')).toEqual([])
    expect(parseNotes('just a note')).toEqual([{ date: '', text: 'just a note', actor: null }])
  })
})

describe('noteSignals', () => {
  it('finds unsatisfactory, reopen, and ETA-missed events', () => {
    const s = noteSignals(parseNotes(NOTES))
    expect(s.unsatCount).toBe(2)
    expect(s.lastUnsatAt).toBe('2026-10-06')
    expect(s.reopenCount).toBe(1)
    expect(s.lastReopenedAt).toBe('2026-10-06')
    expect(s.lastEtaMissedAt).toBe('2025-12-30')
    expect(s.latestStatusChange).toEqual({ date: '2026-10-06', from: 'COMPLETED/PENDING CONFIRMATION', to: 'IN PROGRESS/UNSATISFACTORY' })
  })
  it('hashes stably', () => {
    expect(notesHash('a')).toBe(notesHash('a'))
    expect(notesHash('a')).not.toBe(notesHash('b'))
    expect(notesHash(null)).toBe(notesHash(''))
  })
})
