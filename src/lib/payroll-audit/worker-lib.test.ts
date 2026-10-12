import { describe, expect, it } from 'vitest'
import {
  employeeIdFromUrl, isBlockedRequest, isForbiddenControl, looksSignedOut, parseEnvFile, weekLabel, withRetry,
} from '../../../scripts/payroll-audit-worker/lib.mjs'

describe('worker helpers', () => {
  it('formats the week label Kalos shows', () => {
    expect(weekLabel('2026-10-03')).toBe('Week of October 3, 2026')
    expect(weekLabel('2025-12-27')).toBe('Week of December 27, 2025')
  })
  it('reads the employee id from the timesheet address', () => {
    expect(employeeIdFromUrl('https://live.kalosflorida.com/timesheet/115544?startOnWeek=true')).toBe('115544')
    expect(employeeIdFromUrl('https://live.kalosflorida.com/payroll')).toBeNull()
  })
  it('notices an expired session', () => {
    expect(looksSignedOut('https://live.kalosflorida.com/login', '')).toBe(true)
    expect(looksSignedOut('https://live.kalosflorida.com/payroll', 'Please sign in to continue')).toBe(true)
    expect(looksSignedOut('https://live.kalosflorida.com/timesheet/1', 'Timesheet William Total: 43.5')).toBe(false)
  })
  it('refuses controls that could change payroll', () => {
    for (const t of ['APPROVE TIMESHEET', 'UNAPPROVE TIMESHEET', 'Submit', 'Delete entry', 'Save', 'Edit']) expect(isForbiddenControl(t)).toBe(true)
    for (const t of ['Show Approved', 'GEO LOCATION', 'TRIP CALCULATOR', '', null]) expect(isForbiddenControl(t as string)).toBe(false)
  })
  it('drops write-looking requests and lets reads through', () => {
    expect(isBlockedRequest('POST', 'https://x.test/api/timesheet/approve')).toBe(true)
    expect(isBlockedRequest('PUT', 'https://x.test/api/entry/update')).toBe(true)
    expect(isBlockedRequest('GET', 'https://x.test/api/timesheet/approve')).toBe(false)
    expect(isBlockedRequest('POST', 'https://x.test/api/timesheet/list')).toBe(false)
  })
  it('retries a flaky connection with backoff, then gives up', async () => {
    let n = 0
    const waits: number[] = []
    const ok = await withRetry(async () => { if (++n < 3) throw new Error('down'); return 'up' }, { sleep: async (ms: number) => { waits.push(ms) } })
    expect(ok).toBe('up')
    expect(waits).toEqual([1000, 2000])
    await expect(withRetry(async () => { throw new Error('still down') }, { tries: 2, sleep: async () => {} })).rejects.toThrow('still down')
  })
  it('does not retry a fatal rejection (bad key)', async () => {
    let n = 0
    await expect(withRetry(async () => { n++; throw Object.assign(new Error('rejected'), { fatal: true }) }, { sleep: async () => {} })).rejects.toThrow('rejected')
    expect(n).toBe(1)
  })
  it('parses an env file', () => {
    expect(parseEnvFile('# c\nA=1\nB="two words"\n\nC = x')).toEqual({ A: '1', B: 'two words', C: 'x' })
  })
})
