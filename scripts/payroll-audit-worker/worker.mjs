#!/usr/bin/env node
// PhaseForge payroll audit worker. Runs on your own Windows computer.
//
//   node scripts/payroll-audit-worker/worker.mjs login   sign in to Kalos once, in the worker's own Chrome window
//   node scripts/payroll-audit-worker/worker.mjs run     stay online and audit whenever PhaseForge queues a run
//   node scripts/payroll-audit-worker/worker.mjs once    do one queued run, then exit
//   node scripts/payroll-audit-worker/worker.mjs jobs    read missing job addresses from Kalos job pages, then exit
//
// What it does: opens Kalos payroll in a Chrome profile that belongs to this
// worker, opens each technician's timesheet for the requested pay weeks, and
// posts the page TEXT to PhaseForge, signed with a key only you hold.
//
// What it never does: type a password, send cookies or session data anywhere,
// open a debugging port, or click anything that could change payroll. Clicks
// are limited to the department/week filters, "Show Approved", and the
// eye icon that opens a timesheet. See lib.mjs for the guards.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { signRequest } from './sign.mjs'
import { employeeIdFromUrl, isBlockedRequest, isForbiddenControl, jitter, looksSignedOut, parseEnvFile, weekLabel, withRetry } from './lib.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const envFile = path.join(here, '.env')
const env = { ...(fs.existsSync(envFile) ? parseEnvFile(fs.readFileSync(envFile, 'utf8')) : {}), ...process.env }

const BASE = (env.PHASEFORGE_URL || '').replace(/\/$/, '')
const COMPANY = env.PAYROLL_AUDIT_COMPANY_ID || ''
const KEY = env.PAYROLL_AUDIT_WORKER_KEY || ''
const KALOS = (env.KALOS_BASE_URL || 'https://live.kalosflorida.com').replace(/\/$/, '')
const NAME = env.WORKER_NAME || os.hostname()
const PROFILE = env.WORKER_PROFILE_DIR || path.join(env.LOCALAPPDATA || os.homedir(), 'PhaseForgeAuditWorker', 'chrome-profile')
const BROWSER = env.WORKER_BROWSER || 'chrome'
const SIGNIN_WAIT_MS = 10 * 60_000
const POLL_MS = 15_000
const PAUSE_MS = 1500

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
process.on('unhandledRejection', (e) => log('unhandled error (continuing):', e && e.message ? String(e.message).slice(0, 160) : e))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function need(...vars) {
  const missing = vars.filter(([, v]) => !v).map(([n]) => n)
  if (missing.length) { console.error(`Missing settings: ${missing.join(', ')}. Copy .env.example to .env and fill it in.`); process.exit(2) }
}

/* ── PhaseForge API ────────────────────────────────────────────────────── */

async function api(action, payload = {}) {
  const body = JSON.stringify(payload)
  return withRetry(async () => {
    const res = await fetch(`${BASE}/api/payroll-audit/worker/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...signRequest(KEY, { companyId: COMPANY, action, body }) },
      body,
    })
    if (res.status === 401 || res.status === 403) { const e = new Error('PhaseForge rejected the worker key. Re-copy the settings from Payroll Audit > Settings.'); e.fatal = true; throw e }
    if (res.status === 503) { const e = new Error('PhaseForge has no PAYROLL_AUDIT_MASTER_KEY set yet.'); e.fatal = true; throw e }
    if (res.status >= 400 && res.status < 500) { const e = new Error(`PhaseForge said ${res.status}: ${(await res.text()).slice(0, 200)}`); e.fatal = true; throw e }
    if (!res.ok) throw new Error(`PhaseForge ${res.status}`)
    return res.json()
  })
}

/* ── Browser ───────────────────────────────────────────────────────────── */

async function openBrowser() {
  const { chromium } = await import('playwright')
  fs.mkdirSync(PROFILE, { recursive: true })
  // A persistent profile owned by the worker. Playwright drives it over a pipe,
  // so there is no remote debugging port for anything else to connect to.
  // WORKER_BROWSER: "chrome" (default), "msedge", "chromium" (Playwright's own
  // build, no install needed), or a full path to a Chromium based browser.
  const opts = { headless: false, viewport: { width: 1400, height: 900 } }
  if (BROWSER === 'chromium') { /* bundled build */ }
  else if (/[\/]/.test(BROWSER)) opts.executablePath = BROWSER
  else opts.channel = BROWSER
  const context = await chromium.launchPersistentContext(PROFILE, opts)
  // Belt and braces: a request that looks like a payroll write never leaves.
  await context.route('**/*', (route) => {
    const r = route.request()
    if (isBlockedRequest(r.method(), r.url(), new URL(KALOS).hostname)) { log('BLOCKED write-looking request', r.method(), new URL(r.url()).pathname); return route.abort() }
    return route.continue()
  })
  return context
}

async function gotoPayroll(page) {
  await page.goto(`${KALOS}/payroll`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  const text = await page.evaluate(() => document.body.innerText).catch(() => '')
  if (looksSignedOut(page.url(), text)) return false
  return /Select Week/i.test(text)
}

async function safeClick(locator, what) {
  const label = await locator.evaluate((el) => [el.innerText, el.getAttribute('aria-label'), el.getAttribute('title')].filter(Boolean).join(' | ')).catch(() => '')
  if (isForbiddenControl(label)) throw Object.assign(new Error(`Refused to click "${label}" (${what})`), { fatal: true })
  await locator.click({ timeout: 20_000 })
}

async function pickOption(page, comboIndex, optionText) {
  const combo = page.getByRole('combobox').nth(comboIndex)
  const current = (await combo.innerText().catch(() => '')).trim()
  if (current.includes(optionText)) return true
  await combo.click()
  const opt = page.getByRole('option', { name: optionText, exact: true }).first()
  if (!(await opt.count())) { await page.keyboard.press('Escape'); return false }
  await opt.click()
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  await sleep(800)
  return true
}

async function readRows(page) {
  return page.evaluate(() => [...document.querySelectorAll('tbody tr')].map((tr, i) => {
    const cells = [...tr.querySelectorAll('td')].map((td) => td.innerText.trim())
    return { index: i, name: cells[0] || '', status: cells[2] || '' }
  }).filter((r) => r.name && !/^no results\.?$/i.test(r.name)))
}

/**
 * Kalos shows either the unapproved or the approved timesheets for the week,
 * never both: "Show Approved" swaps the list and the button turns into "Show
 * Unapproved". Both are only view filters. Each list is read in its own view.
 */
async function setView(page, want) {
  const btn = page.getByRole('button', { name: want === 'approved' ? /^show approved$/i : /^show unapproved$/i })
  if (!(await btn.count())) return
  await safeClick(btn.first(), `switch to the ${want} list`)
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  await sleep(1200)
}

async function readTimesheet(context, page, name) {
  const row = page.locator('tbody tr', { has: page.getByText(name, { exact: true }) }).first()
  await row.scrollIntoViewIfNeeded({ timeout: 10_000 })
  const eye = row.locator('button').last()
  // Click and wait for the new tab together, so a slow or failed click is a
  // normal error here and never leaves an orphaned timer behind.
  const [popup] = await Promise.all([
    context.waitForEvent('page', { timeout: 30_000 }),
    safeClick(eye, `open timesheet for ${name}`),
  ])
  try {
    await popup.waitForLoadState('domcontentloaded', { timeout: 20_000 })
    await popup.waitForFunction(() => /Total:\s*[\d.]+/.test(document.body.innerText), null, { timeout: 25_000 }).catch(() => {})
    await sleep(600) // let the day columns finish rendering after the total appears
    const text = await popup.evaluate(() => document.body.innerText)
    return { text, url: popup.url() }
  } finally {
    await popup.close().catch(() => {})
  }
}

/* ── Job addresses ─────────────────────────────────────────────────────── */

/**
 * Visit the Kalos job page ({KALOS}/project/<job>, the same link the scheduler
 * uses) for every job number PhaseForge has no address for, and post the page
 * text. PhaseForge keeps only the property address. Read only.
 * report(done, total, job) returns true to stop.
 */
async function syncJobAddresses(page, report) {
  const { jobs } = await api('job-queue', {})
  const tally = { jobs: jobs.length, saved: 0, noAddress: 0, failed: 0, cards: 0, stopped: false }
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]
    if (report && (await report(i, jobs.length, job))) { tally.stopped = true; break }
    try {
      await page.goto(`${KALOS}/project/${encodeURIComponent(job)}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForFunction(() => /Property Address|Job Number|not found|No project/i.test(document.body.innerText), null, { timeout: 20_000 }).catch(() => {})
      await sleep(500)
      const text = await page.evaluate(() => document.body.innerText)
      if (looksSignedOut(page.url(), text)) { const e = new Error('Kalos session expired while reading job pages'); e.authExpired = true; throw e }
      const r = await api('job-address', { job, pageText: text })
      if (r.status === 'saved' || r.status === 'address_only') { tally.saved++; tally.cards += (r.projects ?? 0) + (r.directory ?? 0) }
      else tally.noAddress++
      log(`job ${job}: ${r.status}${r.approximate ? ' (town level)' : ''}${r.projects || r.directory ? `, filled ${r.projects} project and ${r.directory} schedule card(s)` : ''}`)
    } catch (e) {
      if (e && (e.authExpired || e.fatal)) throw e
      tally.failed++
      log(`job ${job}: could not read (${String(e.message).slice(0, 120)})`)
    }
    await sleep(jitter(PAUSE_MS))
  }
  return tally
}

/* ── One audit run ─────────────────────────────────────────────────────── */

async function doRun(context, run) {
  const stats = { employeesScanned: 0, entriesSeen: 0, failures: 0, weeks: run.weekStarts.length }
  // Reuse the window's first tab so a sign-in done there is the one the run sees.
  const page = context.pages().find((p) => !p.isClosed()) ?? (await context.newPage())
  const done = async (outcome, extra = {}) => api('complete', { runId: run.id, outcome, stats, ...extra })
  const progress = async (phase, message, current, total) => (await api('progress', { runId: run.id, phase, message, current, total })).cancel

  try {
    await progress('Opening Kalos payroll', 'Checking sign-in', 0, 0)
    if (!(await gotoPayroll(page))) {
      // Not signed in (a session cookie may not survive a browser restart, or it
      // expired). Ask for a sign-in in this window and wait for a person to do
      // it. Nothing is typed or bypassed here; the page is left alone meanwhile.
      log('Kalos needs a sign-in. Waiting in the worker browser window.')
      let ok = false
      for (const deadline = Date.now() + SIGNIN_WAIT_MS; Date.now() < deadline;) {
        if (await progress('Waiting for Kalos sign-in', 'Sign in to Kalos in the worker browser window on your computer', 0, 0)) return done('cancelled')
        await sleep(8000)
        const text = await page.evaluate(() => document.body.innerText).catch(() => '')
        const at = new URL(page.url()).pathname
        const leftLogin = (!looksSignedOut(page.url(), text) && at !== '/') || /Select Week/i.test(text)
        if (leftLogin) {
          ok = await gotoPayroll(page)
          if (ok) break
        }
      }
      if (!ok) {
        return done('failed', { errorCode: 'auth_expired', error: 'Kalos sign-in was not completed in the worker window within 10 minutes. Sign in there and run the audit again.' })
      }
      log('signed in, continuing')
    }

    const departments = (await page.getByRole('combobox').nth(0).innerText().catch(() => '')).trim()
    log(`department filter: ${departments || '(default)'}`)
    let mismatches = 0

    for (let w = 0; w < run.weekStarts.length; w++) {
      const weekStart = run.weekStarts[w]
      const label = weekLabel(weekStart)
      if (!(await pickOption(page, 2, label))) {
        stats.failures++
        log(`week not offered by Kalos: ${label}`)
        continue
      }
      const done_ = new Set()
      for (const view of ['unapproved', 'approved']) {
      await setView(page, view)
      const people = (await readRows(page)).filter((p) => !/no timesheet submitted/i.test(p.status) && !done_.has(p.name))
      log(`${label} (${view}): ${people.length} timesheets`)

      for (let i = 0; i < people.length; i++) {
        const p = people[i]
        done_.add(p.name)
        if (await progress(`${label} (week ${w + 1} of ${run.weekStarts.length}, ${view})`, `Reading timesheet ${i + 1} of ${people.length}`, i, people.length)) {
          return done('cancelled')
        }
        try {
          const sheet = await withRetry(() => readTimesheet(context, page, p.name), { tries: 2, baseMs: 2000 })
          if (looksSignedOut(sheet.url, sheet.text)) {
            return done('failed', { errorCode: 'auth_expired', error: 'The Kalos session expired mid run. Sign in again and retry.' })
          }
          const kalosEmployeeId = employeeIdFromUrl(sheet.url)
          if (!kalosEmployeeId) throw new Error(`No employee id in ${new URL(sheet.url).pathname}`)
          const r = await api('submit', { runId: run.id, kalosEmployeeId, employeeName: p.name, weekStart, pageText: sheet.text })
          stats.employeesScanned++
          stats.entriesSeen += r.entries ?? 0
          if (!r.looksLikeTimesheet) throw new Error('Page did not look like a timesheet')
          if ((r.warnings ?? []).some((x) => /does not fall in the week|No day headers/.test(x))) mismatches++
          else mismatches = 0
          if (mismatches >= 3) {
            return done('failed', { errorCode: 'interface_changed', error: 'Three timesheets in a row did not match the selected week. Kalos may have changed; nothing was changed.' })
          }
        } catch (e) {
          if (e && e.fatal) throw e
          stats.failures++
          log(`could not read ${p.name}: ${e.message}`)
        }
        await sleep(jitter(PAUSE_MS))
      }
      }
      await setView(page, 'unapproved')
    }

    if (stats.employeesScanned === 0) {
      return done('failed', { errorCode: 'interface_changed', error: 'No timesheets could be read. The Kalos page layout may have changed.' })
    }
    // Fill in addresses for any job PhaseForge cannot place yet, so this very
    // run can verify those trips. A failure here never fails the audit.
    try {
      const t = await syncJobAddresses(page, (i, n, job) => progress('Looking up job addresses', `Job ${job} (${i + 1} of ${n})`, i, n))
      if (t.jobs) log(`job addresses: ${t.saved} saved, ${t.noAddress} without an address, ${t.failed} failed, ${t.cards} card(s) filled`)
      if (t.stopped) return done('cancelled')
    } catch (e) {
      log('job address lookup skipped:', e.message)
    }
    await progress('Saving audit findings', 'Sending to PhaseForge for analysis', 1, 1)
    return done('completed')
  } catch (e) {
    log('run failed:', e.message)
    await done('failed', { errorCode: 'worker_error', error: String(e.message).slice(0, 250) }).catch(() => {})
    throw e
  }
}

/* ── Commands ──────────────────────────────────────────────────────────── */

async function login() {
  const context = await openBrowser()
  const page = context.pages()[0] ?? (await context.newPage())
  await page.goto(`${KALOS}/payroll`)
  console.log('\nSign in to Kalos in the window that opened. When the payroll page shows, close the window.')
  await new Promise((r) => context.on('close', r))
  console.log('Profile saved. Now run: node scripts/payroll-audit-worker/worker.mjs run')
}

async function jobs() {
  need(['PHASEFORGE_URL', BASE], ['PAYROLL_AUDIT_COMPANY_ID', COMPANY], ['PAYROLL_AUDIT_WORKER_KEY', KEY])
  const context = await openBrowser()
  try {
    const page = context.pages()[0] ?? (await context.newPage())
    const t = await syncJobAddresses(page, async (i, n, job) => { log(`(${i + 1}/${n}) job ${job}`); return false })
    console.log(`
Done: ${t.jobs} job number(s) checked, ${t.saved} address(es) saved, ${t.noAddress} with no address on the Kalos page, ${t.failed} failed, ${t.cards} card(s) filled.`)
  } catch (e) {
    console.error(e.authExpired ? 'Kalos is signed out. Run "run" or "login", sign in, and try again.' : e.message)
    process.exitCode = 1
  } finally {
    await context.close().catch(() => {})
  }
}

async function loop(once) {
  need(['PHASEFORGE_URL', BASE], ['PAYROLL_AUDIT_COMPANY_ID', COMPANY], ['PAYROLL_AUDIT_WORKER_KEY', KEY])
  log(`worker "${NAME}" online, polling ${BASE}`)
  let context = await openBrowser()
  context.on('close', () => { log('worker browser was closed; exiting. Start the worker again to sign in.'); process.exit(0) })
  { // Edge restores last session's tabs; keep a single one so runs use a known page.
    const [first, ...extra] = context.pages().length ? context.pages() : [await context.newPage()]
    for (const p of extra) await p.close().catch(() => {})
    await first.goto(`${KALOS}/payroll`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  }
  for (;;) {
    let res
    try {
      res = await api('poll', { workerName: NAME, state: 'idle' })
    } catch (e) {
      if (e.fatal) { console.error(e.message); process.exit(1) }
      log('PhaseForge unreachable, will retry:', e.message)
      await sleep(POLL_MS)
      continue
    }
    if (res.run) {
      log(`run ${res.run.id}: ${res.run.rangeStart} to ${res.run.rangeEnd}`)
      try {
        await doRun(context, res.run)
      } catch (e) {
        log('run ended with error:', e.message)
        if (e.fatal) process.exit(1)
      }
      if (once) break
    } else if (once) {
      log('no queued run')
      break
    }
    await sleep(POLL_MS)
  }
  await context?.close().catch(() => {})
}

const cmd = process.argv[2]
if (cmd === 'login') await login()
else if (cmd === 'run') await loop(false)
else if (cmd === 'once') await loop(true)
else if (cmd === 'jobs') await jobs()
else { console.log('Usage: worker.mjs login | run | once | jobs'); process.exit(cmd ? 1 : 0) }
