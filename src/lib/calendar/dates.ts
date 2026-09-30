// Calendar date math on plain yyyy-MM-dd strings. Everything goes through
// UTC so a day is always a day, no matter the browser's time zone or a
// daylight saving switch in the middle of the grid.

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`)
const toIso = (d: Date) => d.toISOString().slice(0, 10)

export function isIsoDate(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = utc(s)
  return !Number.isNaN(d.getTime()) && toIso(d) === s
}

export function makeIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return isIsoDate(iso) ? iso : null
}

export function addDaysIso(iso: string, days: number): string {
  const d = utc(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toIso(d)
}

export function addMonthsIso(iso: string, months: number): string {
  const d = utc(iso)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return toIso(d)
}

/** 0 = Sunday. */
export function dowIso(iso: string): number { return utc(iso).getUTCDay() }

export function diffDaysIso(a: string, b: string): number {
  return Math.round((utc(b).getTime() - utc(a).getTime()) / 86400000)
}

/** The Sunday on or before this day. */
export function startOfWeekIso(iso: string): string { return addDaysIso(iso, -dowIso(iso)) }
export function startOfMonthIso(iso: string): string { return `${iso.slice(0, 8)}01` }

/** The six Sunday-first weeks a month view shows, as week-start dates. */
export function monthWeeks(anchor: string): string[] {
  const first = startOfWeekIso(startOfMonthIso(anchor))
  return Array.from({ length: 6 }, (_, i) => addDaysIso(first, i * 7))
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i))
}

export const yearOf = (iso: string) => Number(iso.slice(0, 4))
export const monthOf = (iso: string) => Number(iso.slice(5, 7))
export const dayOf = (iso: string) => Number(iso.slice(8, 10))

/** "Mon, Oct 12" */
export function fmtDay(iso: string, withYear = false): string {
  return `${DAY_SHORT[dowIso(iso)]}, ${MONTH_SHORT[monthOf(iso) - 1]} ${dayOf(iso)}${withYear ? `, ${yearOf(iso)}` : ''}`
}

/** "Oct 12" or "Oct 12 to 14" or "Oct 30 to Nov 2". */
export function fmtRange(start: string, end: string): string {
  const a = `${MONTH_SHORT[monthOf(start) - 1]} ${dayOf(start)}`
  if (start === end) return a
  if (start.slice(0, 7) === end.slice(0, 7)) return `${a} to ${dayOf(end)}`
  return `${a} to ${MONTH_SHORT[monthOf(end) - 1]} ${dayOf(end)}`
}

/** "07:30" to "7:30 AM"; "15:00" to "3 PM". */
export function fmtTime(hhmm: string | null | undefined): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ap}` : `${h12} ${ap}`
}

/** "7a", "3:30p": the compact form used on small chips. */
export function fmtTimeShort(hhmm: string | null | undefined): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'p' : 'a'}`
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function hhmmOf(minutes: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
