// Date/format helpers for the Dispatch module (ported from DispatchForge).

export function formatDate(dateStr: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', opts ?? { month: 'short', day: 'numeric' })
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// ETAs are stored as the wall-clock time the intake stated (parsed on a UTC
// server), so format back in UTC — converting to the viewer's zone would
// shift the stated time. Date-only when there's no meaningful time component.
export function formatEta(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return '—'
  const dateOnly = d.getUTCHours() === 0 && d.getUTCMinutes() === 0
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
    ...(dateOnly ? {} : { hour: 'numeric', minute: '2-digit' }),
  })
}

export function dateInputToNoonUtc(value: string): string {
  return `${value}T12:00:00.000Z`
}

// ETA convention (see formatEta): wall-clock stored as UTC; midnight = no
// exact time given, so the UI shows a date only.
export function etaInputToIso(date: string, time?: string | null): string {
  return `${date}T${time ? `${time}:00` : '00:00:00'}.000Z`
}

// The HH:MM for a time input from a stored ETA — '' when it's date-only.
export function etaTimeKey(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const time = dateStr.slice(11, 16)
  return time === '00:00' ? '' : time
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function calendarDateKey(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  return dateStr.slice(0, 10)
}

export function titleCase(s: string): string {
  return s
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
