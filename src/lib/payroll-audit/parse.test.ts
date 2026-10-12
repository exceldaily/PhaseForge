import { describe, expect, it } from 'vitest'
import { parseTimesheetText } from './parse'
import { payWeekStart, zonedToEpoch } from './time'

// Same layout as the live page text, with a made up technician and jobs.
const PAGE = `Menu
Set a Period
Set a Period
Test Tech
Total: 27.25

Bill: 24.75Unbill: 2.5

APPROVE TIMESHEET
UNAPPROVE TIMESHEET
TRIP CALCULATOR
GEO LOCATION

Payroll: 0

Billable: 0

Unbillable: 0

3

Saturday

Payroll: 0

Billable: 0

Unbillable: 0

4

Sunday

Payroll: 17.75

Billable: 17.75

Unbillable: 0

5

Monday
Submitted
100001

5:00 PM - 10:45 AM
17.75

Date Submitted: 2026/10/06

Class code: 17-Commercial Refrigeration

Brief Desc.: change outs

System Notes: Kalos Field App

Payroll: 9.5

Billable: 7

Unbillable: 2.5

6

Tuesday
Submitted
100001

6:30 PM - 8:00 PM
1.5

Date Submitted: 2026/10/07

Class code: 37-Travel Time

Brief Desc.: Travel Policy Deduction Applied - 30 minutes deducted

System Notes: Kalos Field App - Auto Generated

Submitted
100001

8:30 PM - 3:30 AM
7

Date Submitted: 2026/10/07

Class code: 17-Commercial Refrigeration

System Notes: Kalos Field App - Auto Generated

Payroll: 1

Billable: 0

Unbillable: 1

7

Wednesday
Submitted
100002

7:00 AM - 8:00 AM
1

Date Submitted: 2026/10/07

Class code: 37-Travel Time

Brief Desc.: first line
second line of the same note

Payroll: 0

Billable: 0

Unbillable: 0

8

Thursday

Payroll: 0

Billable: 0

Unbillable: 0

9

Friday`

describe('parseTimesheetText', () => {
  const out = parseTimesheetText(PAGE, { weekStart: '2026-10-03', timezone: 'America/New_York', kalosEmployeeId: '1' })

  it('reads the employee, total, and every entry', () => {
    expect(out.employeeName).toBe('Test Tech')
    expect(out.totalHours).toBe(27.25)
    expect(out.entries).toHaveLength(4)
    expect(out.warnings).toEqual([])
  })

  it('assigns entries to the right day, job, class, and hours', () => {
    const [mon, tueTravel, tueWork, wed] = out.entries
    expect(mon).toMatchObject({ workDate: '2026-10-05', jobNumber: '100001', classCode: '17', isTravel: false, hours: 17.75, status: 'Submitted' })
    expect(tueTravel).toMatchObject({ workDate: '2026-10-06', isTravel: true, classCode: '37', hours: 1.5, policyDeductionMinutes: 30 })
    expect(tueWork).toMatchObject({ workDate: '2026-10-06', jobNumber: '100001', hours: 7 })
    expect(wed).toMatchObject({ workDate: '2026-10-07', jobNumber: '100002', isTravel: true })
  })

  it('carries an entry that crosses midnight into the next day', () => {
    const mon = out.entries[0]
    const hours = (Date.parse(mon.endAt) - Date.parse(mon.startAt)) / 3_600_000
    expect(hours).toBeCloseTo(17.75, 2)
    expect(mon.startText).toBe('5:00 PM')
    expect(mon.endText).toBe('10:45 AM')
  })

  it('stores instants in the business timezone (EDT is UTC-4 in October)', () => {
    expect(out.entries[0].startAt).toBe('2026-10-05T21:00:00.000Z')
  })

  it('joins a wrapped description onto its field', () => {
    expect(out.entries[3].briefDesc).toBe('first line second line of the same note')
  })

  it('ignores an exact duplicate record and says so', () => {
    const doubled = PAGE.replace(
      'Submitted\n100002',
      'Submitted\n100002\n\n7:00 AM - 8:00 AM\n1\n\nDate Submitted: 2026/10/07\n\nClass code: 37-Travel Time\n\nSubmitted\n100002',
    )
    const r = parseTimesheetText(doubled, { weekStart: '2026-10-03', timezone: 'America/New_York', kalosEmployeeId: '1' })
    expect(r.entries).toHaveLength(4)
    expect(r.warnings.some((w) => w.startsWith('Duplicate record ignored'))).toBe(true)
  })

  it('warns when the page is not a timesheet', () => {
    const r = parseTimesheetText('Sign in\nEmail\nPassword', { weekStart: '2026-10-03', timezone: 'America/New_York', kalosEmployeeId: '1' })
    expect(r.entries).toEqual([])
    expect(r.warnings.length).toBeGreaterThan(0)
  })
})

describe('time helpers', () => {
  it('handles the EST/EDT switch', () => {
    expect(new Date(zonedToEpoch(2026, 11, 1, 12, 0, 'America/New_York')).toISOString()).toBe('2026-11-01T17:00:00.000Z')
    expect(new Date(zonedToEpoch(2026, 10, 31, 12, 0, 'America/New_York')).toISOString()).toBe('2026-10-31T16:00:00.000Z')
  })
  it('finds the Saturday that starts a pay week', () => {
    expect(payWeekStart('2026-10-07')).toBe('2026-10-03')
    expect(payWeekStart('2026-10-03')).toBe('2026-10-03')
    expect(payWeekStart('2026-10-09')).toBe('2026-10-03')
  })
})
