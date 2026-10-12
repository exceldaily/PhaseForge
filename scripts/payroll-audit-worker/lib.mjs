// Pure helpers for the payroll audit worker. Kept separate from worker.mjs so
// they can be unit tested without a browser.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "2026-10-03" -> "Week of October 3, 2026", the label Kalos shows in its week picker. */
export function weekLabel(weekStart) {
  const [y, m, d] = weekStart.split('-').map(Number)
  return `Week of ${MONTHS[m - 1]} ${d}, ${y}`
}

/** The Kalos employee id is the number in /timesheet/<id>. */
export function employeeIdFromUrl(url) {
  const m = /\/timesheet\/(\d{1,12})(?:[/?#]|$)/.exec(url)
  return m ? m[1] : null
}

/** True when the browser has been sent to a sign-in page, i.e. the session expired. */
export function looksSignedOut(url, bodyText = '') {
  if (/\/(login|signin|sign-in|auth|logout)\b/i.test(new URL(url, 'https://x.invalid').pathname)) return true
  return /\b(sign in|log in|forgot password)\b/i.test(bodyText) && !/Total:\s*[\d.]+/.test(bodyText) && !/Timesheet/.test(bodyText)
}

/**
 * The worker may click filters and open timesheets. It must never click
 * anything that could change payroll. Any control whose visible text, label,
 * or tooltip matches this is refused outright.
 */
const FORBIDDEN_CONTROL = /\b(approve|unapprove|reject|submit|delete|remove|save|edit|send|pay|post|update|add|create|merge|override|adjust)\b/i
export function isForbiddenControl(...texts) {
  return texts.some((t) => t && FORBIDDEN_CONTROL.test(t))
}

/**
 * Requests that write. Reads of any method are left alone (some apps POST to
 * fetch data); a write-looking request is dropped, so even a mis-click cannot
 * leave the browser.
 */
const WRITE_URL = /(approv|reject|submit|delete|remove|save|update|edit|create|insert|post|send|pay)/i
export function isBlockedRequest(method, url) {
  if (/^(GET|HEAD|OPTIONS)$/i.test(method)) return false
  return WRITE_URL.test(new URL(url, 'https://x.invalid').pathname)
}

/** Run fn, retrying on thrown errors with backoff. A thrown error with `.fatal` stops immediately. */
export async function withRetry(fn, { tries = 4, baseMs = 1000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let last
  for (let i = 0; i < tries; i++) {
    try { return await fn(i) } catch (e) {
      last = e
      if (e && e.fatal) throw e
      if (i < tries - 1) await sleep(baseMs * 2 ** i)
    }
  }
  throw last
}

/** KEY=value lines, # comments, optional quotes. */
export function parseEnvFile(text) {
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (!m || line.trim().startsWith('#')) continue
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

/** A polite pause: base plus up to 50% jitter. */
export function jitter(baseMs, rand = Math.random) { return Math.round(baseMs * (1 + rand() * 0.5)) }
