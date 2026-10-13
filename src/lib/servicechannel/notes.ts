// The Notes column of a ServiceChannel export is the work order's activity log
// flattened into one cell, newest first:
//
//   Oct 6, 2026 Unsatisfactory alert sent to a@b.com;. (Diana Carrasquillo) Sep 30, 2026 Status has been changed from OPEN to IN PROGRESS/DISPATCH CONFIRMED. (ain.bryson@kalosflorida.com) ...
//
// Each entry starts with "Mon D, YYYY " and ends with the actor in parentheses.
// Dates also appear inside quoted e-mails ("On Tue, Dec 23, 2025 at 11:22 AM"),
// so an entry only starts at the beginning or right after an actor ")".

export interface NoteEvent { date: string; text: string; actor: string | null }

const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)'
const START = new RegExp(`${MONTH} \\d{1,2}, \\d{4} `, 'g')
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }

function iso(dateText: string): string | null {
  const m = /^([A-Za-z]{3,4}) (\d{1,2}), (\d{4})/.exec(dateText)
  if (!m) return null
  const mo = MONTHS[m[1].toLowerCase()]
  return mo ? `${m[3]}-${String(mo).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}` : null
}

export function parseNotes(notes: string | null | undefined): NoteEvent[] {
  const s = (notes ?? '').replace(/\r?\n/g, ' ').trim()
  if (!s) return []
  const starts: number[] = []
  for (const m of s.matchAll(START)) {
    const i = m.index ?? 0
    if (i === 0 || /\)\s*$/.test(s.slice(Math.max(0, i - 3), i))) starts.push(i)
  }
  if (!starts.length) return [{ date: '', text: s, actor: null }]
  const out: NoteEvent[] = []
  for (let k = 0; k < starts.length; k++) {
    const chunk = s.slice(starts[k], k + 1 < starts.length ? starts[k + 1] : undefined).trim()
    const date = iso(chunk) ?? ''
    let body = chunk.replace(/^[A-Za-z]{3,4} \d{1,2}, \d{4}\s+/, '')
    let actor: string | null = null
    const a = /\(([^()]{1,80})\)\s*$/.exec(body)
    if (a) { actor = a[1].trim(); body = body.slice(0, a.index).trim() }
    out.push({ date, text: body.replace(/\s{2,}/g, ' ').trim(), actor })
  }
  return out
}

/** What the log says happened, for sync flags and the case view. */
export interface NoteSignals {
  lastUnsatAt: string | null
  unsatCount: number
  lastReopenedAt: string | null
  reopenCount: number
  lastEtaMissedAt: string | null
  latestStatusChange: { date: string; from: string; to: string } | null
}

export function noteSignals(events: NoteEvent[]): NoteSignals {
  const sig: NoteSignals = { lastUnsatAt: null, unsatCount: 0, lastReopenedAt: null, reopenCount: 0, lastEtaMissedAt: null, latestStatusChange: null }
  for (const e of events) {
    if (/unsatisfactory/i.test(e.text)) {
      sig.unsatCount++
      if (!sig.lastUnsatAt || e.date > sig.lastUnsatAt) sig.lastUnsatAt = e.date || sig.lastUnsatAt
    }
    const sc = /Status has been changed from ([A-Z /_-]+?) to ([A-Z /_-]+?)\.?$/i.exec(e.text)
    if (sc) {
      if (!sig.latestStatusChange || e.date > sig.latestStatusChange.date) sig.latestStatusChange = { date: e.date, from: sc[1].trim(), to: sc[2].trim() }
      if (/^COMPLETED/i.test(sc[1]) && /^(OPEN|IN PROGRESS)/i.test(sc[2])) {
        sig.reopenCount++
        if (!sig.lastReopenedAt || e.date > sig.lastReopenedAt) sig.lastReopenedAt = e.date || sig.lastReopenedAt
      }
    }
    if (/ETA Missed Alert/i.test(e.text) && (!sig.lastEtaMissedAt || e.date > sig.lastEtaMissedAt)) sig.lastEtaMissedAt = e.date || sig.lastEtaMissedAt
  }
  return sig
}

/** Stable hash of the notes text, so "notes updated" is detected without storing two copies. */
export function notesHash(notes: string | null | undefined): string {
  const s = notes ?? ''
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return `${s.length}:${(h >>> 0).toString(16)}`
}
