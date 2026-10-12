// Wall-clock to instant conversion for the Kalos business timezone. No
// dependency: Intl gives the zone's offset at a given instant, and one
// correction pass lands DST edges on the right side.

const fmtCache = new Map<string, Intl.DateTimeFormat>()

function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    fmtCache.set(tz, f)
  }
  return f
}

/** Offset in ms (local minus UTC) of the zone at the given instant. */
function offsetAt(ms: number, tz: string): number {
  const parts = Object.fromEntries(fmt(tz).formatToParts(new Date(ms)).map((p) => [p.type, p.value]))
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second)
  return asUtc - Math.floor(ms / 1000) * 1000
}

/** The instant (epoch ms) when the zone's wall clock reads y-m-d h:mi. */
export function zonedToEpoch(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const first = guess - offsetAt(guess, tz)
  return guess - offsetAt(first, tz)
}

/** "2026-10-06" plus n days, as a calendar date string. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** 0 = Sunday ... 6 = Saturday, for a calendar date string. */
export function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** "5:00 PM" to { h, m } in 24 hour time, or null. */
export function parseClock(text: string): { h: number; m: number } | null {
  const mt = /^(\d{1,2}):(\d{2})\s*([AP])M$/i.exec(text.trim())
  if (!mt) return null
  let h = Number(mt[1]) % 12
  const m = Number(mt[2])
  if (mt[3].toUpperCase() === 'P') h += 12
  if (m > 59) return null
  return { h, m }
}

/** Saturday on or before the date: Kalos pay weeks run Saturday to Friday. */
export function payWeekStart(date: string): string {
  return addDays(date, -((weekday(date) + 1) % 7))
}

/** Today's date in a zone, as YYYY-MM-DD. */
export function todayIn(tz: string, now = new Date()): string {
  const p = Object.fromEntries(fmt(tz).formatToParts(now).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}
