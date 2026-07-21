// Pure rotation math for the on-call schedule (ported from DispatchForge).
// Nothing here is stored — every view derives from (roster order, anchor date,
// interval), which is what makes roster edits re-map the whole year instantly.

export type OnCallInterval = 'week' | 'biweek' | 'month'

export interface OnCallParticipant {
  id: string
  company_id: string
  name: string
  sort_order: number
  created_at: string
}

export interface OnCallSettings {
  company_id: string
  anchor_date: string
  rotation_interval: OnCallInterval
}

export interface OnCallPeriod {
  index: number // periods since the anchor (can be negative for past)
  start: Date // inclusive
  end: Date // exclusive
  participant: OnCallParticipant | null
}

const DAY_MS = 24 * 60 * 60 * 1000

// Parse a YYYY-MM-DD date string as local midnight (new Date("YYYY-MM-DD")
// would be UTC midnight, which shifts the day in western timezones).
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, d.getDate())
}

// Whole periods elapsed between the anchor and `date` (negative if before the anchor).
export function periodIndexForDate(anchor: Date, interval: OnCallInterval, date: Date): number {
  const day = startOfDay(date)
  const base = startOfDay(anchor)
  if (interval === 'month') {
    let months = (day.getFullYear() - base.getFullYear()) * 12 + (day.getMonth() - base.getMonth())
    // Not yet reached the anchor's day-of-month → still in the previous period.
    if (day.getDate() < base.getDate()) months -= 1
    return months
  }
  const days = Math.floor((day.getTime() - base.getTime()) / DAY_MS)
  const len = interval === 'week' ? 7 : 14
  return Math.floor(days / len)
}

export function periodRange(anchor: Date, interval: OnCallInterval, index: number): { start: Date; end: Date } {
  const base = startOfDay(anchor)
  if (interval === 'month') {
    return { start: addMonths(base, index), end: addMonths(base, index + 1) }
  }
  const len = interval === 'week' ? 7 : 14
  return {
    start: new Date(base.getTime() + index * len * DAY_MS),
    end: new Date(base.getTime() + (index + 1) * len * DAY_MS),
  }
}

export function participantForIndex(participants: OnCallParticipant[], index: number): OnCallParticipant | null {
  if (participants.length === 0) return null
  const n = participants.length
  return participants[((index % n) + n) % n]
}

export function buildPeriods(
  participants: OnCallParticipant[],
  anchor: Date,
  interval: OnCallInterval,
  fromIndex: number,
  count: number,
): OnCallPeriod[] {
  return Array.from({ length: count }, (_, i) => {
    const index = fromIndex + i
    const { start, end } = periodRange(anchor, interval, index)
    return { index, start, end, participant: participantForIndex(participants, index) }
  })
}

// All periods that overlap [rangeStart, rangeEnd) — used by the month and year views.
export function periodsOverlappingRange(
  participants: OnCallParticipant[],
  anchor: Date,
  interval: OnCallInterval,
  rangeStart: Date,
  rangeEnd: Date,
): OnCallPeriod[] {
  const first = periodIndexForDate(anchor, interval, rangeStart)
  const out: OnCallPeriod[] = []
  for (let index = first; ; index++) {
    const { start, end } = periodRange(anchor, interval, index)
    if (start.getTime() >= rangeEnd.getTime()) break
    if (end.getTime() > rangeStart.getTime()) {
      out.push({ index, start, end, participant: participantForIndex(participants, index) })
    }
    if (out.length > 400) break // safety valve — nothing renders more than a year of weeks
  }
  return out
}
