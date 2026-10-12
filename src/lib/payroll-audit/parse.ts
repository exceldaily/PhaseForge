// Turns the visible text of one Kalos timesheet page (one employee, one pay
// week) into structured entries. The local worker only ships page text; all
// interpretation lives here so it is tested and versioned with the app.
//
// Layout of the page text, as observed on live.kalosflorida.com/timesheet:
//
//   <employee name>
//   Total: 43.5
//   ...buttons...
//   Payroll: 0 / Billable: 0 / Unbillable: 0      <- totals come BEFORE the
//   3                                                day header they belong to
//   Saturday
//   ...
//   5
//   Monday
//   Submitted                                     <- entry status
//   241480                                        <- job number
//   5:00 PM - 10:45 AM                            <- may cross midnight
//   17.75                                         <- hours
//   Date Submitted: 2026/10/06
//   Class code: 17-Commercial Refrigeration
//   Brief Desc.: change outs
//   System Notes: Kalos Field App

import { addDays, parseClock, weekday, zonedToEpoch } from './time'

export interface ParsedEntry {
  /** Stable within an employee: same record seen twice collapses to one. */
  entryKey: string
  workDate: string
  jobNumber: string | null
  status: string | null
  classCode: string | null
  className: string | null
  isTravel: boolean
  startAt: string
  endAt: string
  startText: string
  endText: string
  hours: number | null
  policyDeductionMinutes: number
  briefDesc: string | null
  systemNotes: string | null
  dateSubmitted: string | null
}

export interface ParsedTimesheet {
  employeeName: string | null
  totalHours: number | null
  entries: ParsedEntry[]
  warnings: string[]
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const RANGE = /^(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)$/i
const STATUS_WORDS = /^(submitted|approved|pending|unapproved|rejected|draft|open|paid|timesheet pending)$/i

export function parseTimesheetText(
  text: string,
  opts: { weekStart: string; timezone: string; kalosEmployeeId: string },
): ParsedTimesheet {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const warnings: string[] = []

  const totalIdx = lines.findIndex((l) => /^Total:\s*[\d.]+/i.test(l))
  const employeeName = totalIdx > 0 ? lines[totalIdx - 1] : null
  const totalHours = totalIdx >= 0 ? Number(/([\d.]+)/.exec(lines[totalIdx])?.[1] ?? NaN) : null
  if (totalIdx < 0) warnings.push('No "Total:" line found; the page may not be a timesheet.')

  // Day headers: a day-of-month number immediately followed by a weekday name.
  const headers: { line: number; date: string }[] = []
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/^\d{1,2}$/.test(lines[i])) continue
    const wd = WEEKDAYS.indexOf(lines[i + 1].toLowerCase())
    if (wd < 0) continue
    let date: string | null = null
    for (let k = 0; k < 7; k++) {
      const cand = addDays(opts.weekStart, k)
      if (weekday(cand) === wd && Number(cand.slice(8)) === Number(lines[i])) { date = cand; break }
    }
    if (date) headers.push({ line: i, date })
    else warnings.push(`Day header "${lines[i]} ${lines[i + 1]}" does not fall in the week starting ${opts.weekStart}.`)
  }
  if (!headers.length) warnings.push('No day headers found in the expected week.')

  const entries: ParsedEntry[] = []
  const seen = new Set<string>()

  headers.forEach((h, hi) => {
    const end = hi + 1 < headers.length ? headers[hi + 1].line : lines.length
    for (let i = h.line + 2; i < end; i++) {
      const m = RANGE.exec(lines[i])
      if (!m) continue

      // Look back for job number then status.
      let job: string | null = null
      let status: string | null = null
      let back = i - 1
      if (back > h.line + 1 && /^\d{4,8}$/.test(lines[back])) { job = lines[back]; back-- }
      if (back > h.line + 1 && STATUS_WORDS.test(lines[back])) status = lines[back]

      // Look forward for hours and labelled fields, stopping at the next entry.
      let hours: number | null = null
      let dateSubmitted: string | null = null
      let classCode: string | null = null
      let className: string | null = null
      let briefDesc: string | null = null
      let systemNotes: string | null = null
      let lastLabel: 'brief' | 'notes' | null = null
      for (let j = i + 1; j < end; j++) {
        const l = lines[j]
        if (RANGE.test(l)) break
        if (/^Payroll:/i.test(l) || /^Billable:/i.test(l) || /^Unbillable:/i.test(l)) break
        if (/^\d{4,8}$/.test(l) && j + 1 < end && RANGE.test(lines[j + 1])) break
        if (STATUS_WORDS.test(l) && j + 2 < end && (RANGE.test(lines[j + 1]) || RANGE.test(lines[j + 2]))) break
        let mm: RegExpExecArray | null
        if (hours === null && /^-?\d+(\.\d+)?$/.test(l)) { hours = Number(l); continue }
        if ((mm = /^Date Submitted:\s*(\d{4})\/(\d{2})\/(\d{2})/i.exec(l))) { dateSubmitted = `${mm[1]}-${mm[2]}-${mm[3]}`; lastLabel = null; continue }
        if ((mm = /^Class code:\s*(\d+)\s*-\s*(.+)$/i.exec(l))) { classCode = mm[1]; className = mm[2].trim(); lastLabel = null; continue }
        if ((mm = /^Class code:\s*(.+)$/i.exec(l))) { className = mm[1].trim(); lastLabel = null; continue }
        if ((mm = /^Brief Desc\.?:\s*(.*)$/i.exec(l))) { briefDesc = mm[1]; lastLabel = 'brief'; continue }
        if ((mm = /^System Notes:\s*(.*)$/i.exec(l))) { systemNotes = mm[1]; lastLabel = 'notes'; continue }
        // A wrapped description continues the previous labelled field.
        if (lastLabel === 'brief') briefDesc = `${briefDesc ?? ''} ${l}`.trim()
        else if (lastLabel === 'notes') systemNotes = `${systemNotes ?? ''} ${l}`.trim()
      }

      const a = parseClock(m[1])
      const b = parseClock(m[2])
      if (!a || !b) { warnings.push(`Could not read the time range "${lines[i]}" on ${h.date}.`); continue }
      const [y, mo, d] = h.date.split('-').map(Number)
      const startMs = zonedToEpoch(y, mo, d, a.h, a.m, opts.timezone)
      let endMs = zonedToEpoch(y, mo, d, b.h, b.m, opts.timezone)
      const sameClock = a.h === b.h && a.m === b.m
      if (endMs < startMs || (sameClock && (hours ?? 0) >= 23)) endMs = zonedToEpoch(y, mo, d + 1, b.h, b.m, opts.timezone)
      const spanHours = (endMs - startMs) / 3_600_000
      if (hours !== null && Math.abs(spanHours - hours) > 0.06) {
        warnings.push(`Entry on ${h.date} ${lines[i]}: time range is ${spanHours.toFixed(2)}h but the page shows ${hours}h.`)
      }

      const isTravel = classCode === '37' || /travel/i.test(className ?? '')
      const ded = /(\d+)\s*minutes?\s*deducted/i.exec(briefDesc ?? '')
      const startText = m[1].toUpperCase().replace(/\s+/g, ' ')
      const endText = m[2].toUpperCase().replace(/\s+/g, ' ')
      const entryKey = [opts.kalosEmployeeId, h.date, job ?? '-', classCode ?? '-', startText, endText].join('|')
      if (seen.has(entryKey)) { warnings.push(`Duplicate record ignored: ${entryKey}`); continue }
      seen.add(entryKey)

      entries.push({
        entryKey, workDate: h.date, jobNumber: job, status, classCode, className, isTravel,
        startAt: new Date(startMs).toISOString(), endAt: new Date(endMs).toISOString(), startText, endText,
        hours, policyDeductionMinutes: ded ? Number(ded[1]) : 0, briefDesc, systemNotes, dateSubmitted,
      })
    }
  })

  if (totalHours !== null && Number.isFinite(totalHours)) {
    const sum = entries.reduce((s, e) => s + (e.hours ?? 0), 0)
    // Entries are the whole story only when they add up to the page total.
    if (Math.abs(sum - totalHours) > 0.1) warnings.push(`Entries add up to ${sum.toFixed(2)}h but the page total is ${totalHours}h.`)
  }
  return { employeeName, totalHours: Number.isFinite(totalHours as number) ? totalHours : null, entries, warnings }
}
