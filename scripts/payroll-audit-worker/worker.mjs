#!/usr/bin/env node
// PhaseForge payroll audit worker. Runs on your own Windows computer.
//
//   node scripts/payroll-audit-worker/worker.mjs login   sign in to Kalos once, in the worker's own Chrome window
//   node scripts/payroll-audit-worker/worker.mjs run     stay online and audit whenever PhaseForge queues a run
//   node scripts/payroll-audit-worker/worker.mjs once    do one queued run, then exit
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
const POLL_MS = 15_000
const PAUSE_MS = 1500

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
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
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome', headless: false, viewport: { width: 1400, height: 900 },
  })
  // Belt and braces: a request that looks like a payroll write never leaves.
  await context.route('**/*', (route) => {
    const r = route.request()
    if (isBlockedRequest(r.method(), r.url())) { log('BLOCKED write-looking request', r.method(), new URL(r.url()).pathname); return route.abort() }
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
  await locator.click()
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
  }).filter((r) => r.name))
}

/** Rows for the chosen week, including approved ones ("Show Approved" is only a view filter). */
async function listEmployees(page) {
  const seen = new Map()
  for (const r of await readRows(page)) seen.set(r.name, r)
  const btn = page.getByRole('button', { name: /^show approved$/i })
  if (await btn.count()) {
    await safeClick(btn.first(), 'show approved')
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await sleep(800)
    for (const r of await readRows(page)) seen.set(r.name, r)
  }
  return [...seen.values()]
}

async function readTimesheet(context, page, name) {
  const row = page.locator('tbody tr', { has: page.getByText(name, { exact: true }) }).first()
  const eye = row.locator('button').last()
  const popupPromise = context.waitForEvent('page', { timeout: 15_000 })
  await safeClick(eye, `open timesheet for ${name}`)
  const popup = await popupPromise
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

/* ── One audit run ─────────────────────────────────────────────────────── */

async function doRun(context, run) {
  const stats = { employeesScanned: 0, entriesSeen: 0, failures: 0, weeks: run.weekStarts.length }
  const page = await context.newPage()
  const done = async (outcome, extra = {}) => { await page.close().catch(() => {}); return api('complete', { runId: run.id, outcome, stats, ...extra }) }
  const progress = async (phase, message, current, total) => (await api('progress', { runId: run.id, phase, message, current, total })).cancel

  try {
    await progress('Opening Kalos payroll', 'Checking sign-in', 0, 0)
    if (!(await gotoPayroll(page))) {
      return done('failed', { errorCode: 'auth_expired', error: 'Kalos asked for a sign-in. Run the worker "login" command, sign in, then run the audit again.' })
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
      const people = (await listEmployees(page)).filter((p) => !/no timesheet submitted/i.test(p.status))
      log(`${label}: ${people.length} timesheets`)

      for (let i = 0; i < people.length; i++) {
        const p = people[i]
        if (await progress(`${label} (week ${w + 1} of ${run.weekStarts.length})`, `Reading timesheet ${i + 1} of ${people.length}`, i, people.length)) {
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

    if (stats.employeesScanned === 0) {
      return done('failed', { errorCode: 'interface_changed', error: 'No timesheets could be read. The Kalos page layout may have changed.' })
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

async function loop(once) {
  need(['PHASEFORGE_URL', BASE], ['PAYROLL_AUDIT_COMPANY_ID', COMPANY], ['PAYROLL_AUDIT_WORKER_KEY', KEY])
  log(`worker "${NAME}" online, polling ${BASE}`)
  let context = null
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
        context ??= await openBrowser()
        await doRun(context, res.run)
      } catch (e) {
        log('run ended with error:', e.message)
        if (e.fatal) process.exit(1)
        await context?.close().catch(() => {})
        context = null
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
else { console.log('Usage: worker.mjs login | run | once'); process.exit(cmd ? 1 : 0) }
