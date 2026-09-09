// Lodging needs derived from a crew's scheduled week. Pure, no I/O.
//
// The rule is deliberately simple and explainable: for each job in the week,
// everyone who appears on it (crew-grid techs and Startup-grid names alike)
// is a guest, and the crew needs beds from the first scheduled day through
// the last, checking out the morning after the last night. Whether a job is
// far enough from home to need lodging at all is a call the person
// generating the list makes; these are suggestions they tick, not bookings.

import { addDays, parseISO } from '@/lib/dates'

export interface WeekJob {
  id: string
  title: string
  job_number: string | null
  project_id: string | null
  /** Crew grid: day index (0 = week start) -> tech names. */
  days: Record<number, string[]>
  /** Startup grid: day index -> person+shift entries. */
  cells: Record<number, { name: string; shift: string }[]>
}

export interface StaySuggestion {
  scheduleJobId: string
  projectId: string | null
  title: string
  jobNumber: string | null
  guests: string[]
  checkIn: string    // yyyy-MM-dd
  checkOut: string   // yyyy-MM-dd, the morning after the last night
  nights: number
}

function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** Names on a given day of a job, from both layouts, trimmed and deduped. */
function namesOn(job: WeekJob, day: number): string[] {
  const out = new Set<string>()
  for (const n of job.days[day] ?? []) if (n?.trim()) out.add(n.trim())
  for (const e of job.cells[day] ?? []) if (e?.name?.trim()) out.add(e.name.trim())
  return [...out]
}

/**
 * One suggestion per job that has anyone scheduled. Jobs with nobody on
 * them all week produce nothing: no crew, no beds.
 */
export function deriveStays(jobs: WeekJob[], weekStart: string): StaySuggestion[] {
  const start = parseISO(weekStart)
  const out: StaySuggestion[] = []

  for (const job of jobs) {
    let first = -1, last = -1
    const guests = new Set<string>()
    for (let d = 0; d < 7; d++) {
      const names = namesOn(job, d)
      if (!names.length) continue
      if (first < 0) first = d
      last = d
      for (const n of names) guests.add(n)
    }
    if (first < 0) continue

    const checkIn = addDays(start, first)
    const checkOut = addDays(start, last + 1)
    out.push({
      scheduleJobId: job.id,
      projectId: job.project_id,
      title: job.title,
      jobNumber: job.job_number,
      guests: [...guests].sort((a, b) => a.localeCompare(b)),
      checkIn: iso(checkIn),
      checkOut: iso(checkOut),
      nights: last - first + 1,
    })
  }

  return out
}

/** Rooms at two to a room, which is how crews are usually put up. */
export function roomsFor(guestCount: number, perRoom = 2): number {
  return Math.max(1, Math.ceil(guestCount / perRoom))
}

/**
 * Deep links that prefill a hotel search near the job. No API keys, no
 * partner agreements: these are the public search URLs with the dates,
 * location, and headcount already filled in.
 */
export function hotelSearchLinks(input: {
  location: string | null
  checkIn: string
  checkOut: string
  guests: number
}): { maps: string | null; booking: string | null } {
  const loc = input.location?.trim()
  if (!loc) return { maps: null, booking: null }
  const q = encodeURIComponent(loc)
  const adults = Math.max(1, input.guests)
  return {
    maps: `https://www.google.com/maps/search/hotels+near+${q}`,
    booking: `https://www.booking.com/searchresults.html?ss=${q}&checkin=${input.checkIn}&checkout=${input.checkOut}&group_adults=${adults}&no_rooms=${roomsFor(adults)}`,
  }
}
