// Quarter math. ALDI PMs run on calendar quarters:
//   Q1 January to March, Q2 April to June, Q3 July to September, Q4 October to December.

export const QUARTERS = [1, 2, 3, 4] as const
export type Quarter = (typeof QUARTERS)[number]

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')

export function quarterOf(iso: string): { year: number; quarter: Quarter } {
  const month = Number(iso.slice(5, 7))
  return { year: Number(iso.slice(0, 4)), quarter: (Math.floor((month - 1) / 3) + 1) as Quarter }
}

export function quarterRange(year: number, quarter: number): { start: string; end: string } {
  const first = (quarter - 1) * 3 + 1
  const last = first + 2
  const lastDay = new Date(Date.UTC(year, last, 0)).getUTCDate()
  return { start: `${year}-${pad(first)}-01`, end: `${year}-${pad(last)}-${pad(lastDay)}` }
}

export const quarterLabel = (year: number, quarter: number) => `Q${quarter} ${year}`

/** "April to June" */
export function quarterMonths(quarter: number): string {
  const first = (quarter - 1) * 3
  return `${MONTHS[first]} to ${MONTHS[first + 2]}`
}

export function isQuarter(n: unknown): n is Quarter { return n === 1 || n === 2 || n === 3 || n === 4 }

/** "Q2 2026", "2026 Q2", "2026-Q2", "Q2", "2" all read; a missing year falls back. */
export function parseQuarter(text: string, fallbackYear?: number): { year: number; quarter: Quarter } | null {
  const t = text.trim().toUpperCase()
  if (!t) return null
  const q = /Q\s*([1-4])/.exec(t)?.[1] ?? (/^[1-4]$/.test(t) ? t : null)
  const y = /(20\d{2})/.exec(t)?.[1]
  if (!q) return null
  const year = y ? Number(y) : fallbackYear
  if (!year) return null
  return { year, quarter: Number(q) as Quarter }
}

/** Add business days (Monday to Friday) to a date. */
export function addBusinessDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  let left = Math.max(0, Math.round(days))
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) left--
  }
  return d.toISOString().slice(0, 10)
}

/** A date some calendar days before or after another. */
export function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** "Oct 12" or "Oct 12, 2025" when it is not this year. */
export function fmtDate(iso: string | null | undefined, today?: string): string {
  if (!iso || !isIsoDate(iso.slice(0, 10))) return ''
  const d = iso.slice(0, 10)
  const sameYear = !today || today.slice(0, 4) === d.slice(0, 4)
  return `${SHORT[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}${sameYear ? '' : `, ${d.slice(0, 4)}`}`
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${a.slice(0, 10)}T00:00:00Z`).getTime()) / 86400000)
}

/**
 * Loose date reading for imports: 2026-04-13, 4/13/2026, 4/13/26, 04-13-2026,
 * and Excel serial numbers. Returns null for anything it is not sure about.
 */
export function parseLooseDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10)
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + raw * 86400000).toISOString().slice(0, 10)
  }
  const t = String(raw).trim()
  if (isIsoDate(t.slice(0, 10)) && /^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/.exec(t)
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    const iso = `${year}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`
    return isIsoDate(iso) ? iso : null
  }
  return null
}
