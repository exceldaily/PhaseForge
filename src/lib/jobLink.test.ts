import { describe, expect, it } from 'vitest'
import { buildJobUrl, jobUrlProblem } from './jobLink'

describe('buildJobUrl', () => {
  it('fills the job number into the pattern', () => {
    expect(buildJobUrl('https://live.kalosflorida.com/project/{job}', '244621')).toBe('https://live.kalosflorida.com/project/244621')
    expect(buildJobUrl('https://x.com/track?wo={job}&again={job}', ' 12 34 ')).toBe('https://x.com/track?wo=12%2034&again=12%2034')
  })
  it('gives nothing without a pattern or a number', () => {
    expect(buildJobUrl(null, '244621')).toBeNull()
    expect(buildJobUrl('https://x.com/{job}', '')).toBeNull()
    expect(buildJobUrl('https://x.com/no-placeholder', '1')).toBeNull()
  })
})

describe('jobUrlProblem', () => {
  it('accepts a good pattern or an empty one', () => {
    expect(jobUrlProblem('https://live.kalosflorida.com/project/{job}')).toBeNull()
    expect(jobUrlProblem('   ')).toBeNull()
  })
  it('explains what is wrong', () => {
    expect(jobUrlProblem('live.kalosflorida.com/project/{job}')).toMatch(/http/)
    expect(jobUrlProblem('https://live.kalosflorida.com/project/')).toMatch(/\{job\}/)
  })
})
