/**
 * Email parsers for Dispatch card auto-creation.
 * Supports: ServiceChannel HTML emails, Hussmann/ALDI plain-text bulletins.
 *
 * ServiceChannel emails are HTML tables. After HTML stripping, each table cell
 * becomes a newline, so fields appear as:
 *   Asset\nFROZEN GROCERY BUNKER CASE\n
 * rather than "Asset: FROZEN GROCERY BUNKER CASE".
 */

import type { DispatchUrgency } from '@/types/app'

export interface ParsedCard {
  store: string | null
  sc_number: string | null
  urgency: DispatchUrgency
  description: string | null
  rack_circuit_case: string | null
  eta_scheduled: string | null
  date_started: string | null
  email_subject: string
  email_sender: string
  source: 'email'
  needs_review: boolean
}

// ── Urgency mapping ─────────────────────────────────────────────────────────

function priorityToUrgency(priority: string): DispatchUrgency {
  const p = priority.toUpperCase().trim()
  if (p.startsWith('P0')) return 'critical'
  if (p.startsWith('P1') || p.startsWith('P2')) return 'high'
  if (p.startsWith('P3') || p.startsWith('P4')) return 'medium'
  return 'low'
}

// Grab the value on the line immediately following a label (HTML-stripped tables).
// e.g. labelAfter(body, 'Asset') → 'FROZEN GROCERY BUNKER CASE'
function labelAfter(body: string, label: string): string | null {
  const re = new RegExp(`\\b${label}\\b[\\s\\n]+([^\\n]+)`, 'i')
  const m = re.exec(body)
  return m ? m[1].trim() : null
}

// ServiceChannel descriptions are prefixed with "CATEGORY / SUB / ASSET / PROBLEM / actual text".
// Strip the all-caps path and return only the human-readable sentence at the end.
function extractHumanDescription(raw: string): string {
  const lastSlash = raw.lastIndexOf(' / ')
  if (lastSlash !== -1) {
    const after = raw.slice(lastSlash + 3).trim()
    // Only use the tail if it contains lowercase (i.e. it's a real sentence)
    if (after && /[a-z]/.test(after)) return after
  }
  return raw
}

// ── ServiceChannel parser ───────────────────────────────────────────────────

// Subject: "New Service Request | Location ID: 0673 | P0 (12 HOURS) | 354494021 | Sprouts Farmers Market | Daytona Beach | FL"

const SC_SUBJECT_RE =
  /New Service Request\s*\|\s*Location ID:\s*(\d+)\s*\|\s*(P\d+[^|]*)\|\s*(\d+)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([A-Z]{2})/i

function parseServiceChannel(subject: string, body: string, from: string): ParsedCard | null {
  const m = SC_SUBJECT_RE.exec(subject)
  if (!m) return null

  const [, , priority, scNumber, customer, city, state] = m
  const store = `${customer.trim()} - ${city.trim()}, ${state.trim()}`

  // Asset field → rack_circuit_case
  const rackCircuitCase = labelAfter(body, 'Asset')

  // Full problem description — everything after "Problem Description" until the
  // next section marker or end of meaningful content.
  const descMatch = /Problem Description[\s\n]+"?([\s\S]+?)(?="?\s*\n\s*(?:View Work Order|Follow Work Order)|\n\n\n|$)/i.exec(body)
  const shortDescMatch = /\bProblem\b[\s\n]+([^\n]{4,})/i.exec(body)
  const rawDesc = descMatch
    ? descMatch[1].replace(/\s+/g, ' ').trim()
    : shortDescMatch ? shortDescMatch[1].trim() : null
  const description = rawDesc ? extractHumanDescription(rawDesc).slice(0, 800) : null

  // Scheduled date — label on one line, date on next, time on the line after
  // e.g. "Scheduled\nJune 22, 2026\n9:16 PM"
  let etaScheduled: string | null = null
  const schedMatch = /\bScheduled\b[\s\n]+([A-Za-z]+ \d{1,2},?\s*\d{4})[\s\n]+(\d{1,2}:\d{2}\s*[AP]M)/i.exec(body)
  if (schedMatch) {
    try {
      etaScheduled = new Date(`${schedMatch[1]} ${schedMatch[2]}`).toISOString()
    } catch { /* leave null */ }
  }

  return {
    store,
    sc_number: scNumber.trim(),
    urgency: priorityToUrgency(priority),
    description,
    rack_circuit_case: rackCircuitCase,
    eta_scheduled: etaScheduled,
    date_started: new Date().toISOString().slice(0, 10),
    email_subject: subject,
    email_sender: from,
    source: 'email',
    needs_review: false,
  }
}

// ── Hussmann / ALDI plain-text parser ───────────────────────────────────────

// Body bullets: "Site Name/#: Aldi 303", "Tracking #: 353934549", "Priority: P6 …"

function parseHussmann(subject: string, body: string, from: string): ParsedCard | null {
  const siteMatch = /Site\s+Name\s*\/?#?:\s*(.+)/i.exec(body)
  const trackingMatch = /Tracking\s+#?:\s*(\d+)/i.exec(body)
  const priorityMatch = /Priority:\s*(.+)/i.exec(body)
  const problemMatch = /Problem:\s*([\s\S]+?)(?:\n[A-Z]|\n\n|$)/i.exec(body)

  if (!siteMatch && !trackingMatch) return null
  if (!from.toLowerCase().includes('hussmann') && !siteMatch && !priorityMatch) return null

  return {
    store: siteMatch ? siteMatch[1].trim() : null,
    sc_number: trackingMatch ? trackingMatch[1].trim() : null,
    urgency: priorityMatch ? priorityToUrgency(priorityMatch[1]) : 'medium',
    description: problemMatch ? problemMatch[1].trim().slice(0, 500) : null,
    rack_circuit_case: null,
    eta_scheduled: null,
    date_started: new Date().toISOString().slice(0, 10),
    email_subject: subject,
    email_sender: from,
    source: 'email',
    needs_review: !siteMatch && !trackingMatch,
  }
}

// ── Generic fallback ────────────────────────────────────────────────────────

function parseGeneric(subject: string, from: string): ParsedCard {
  return {
    store: null,
    sc_number: null,
    urgency: 'medium',
    description: subject,
    rack_circuit_case: null,
    eta_scheduled: null,
    date_started: new Date().toISOString().slice(0, 10),
    email_subject: subject,
    email_sender: from,
    source: 'email',
    needs_review: true,
  }
}

// ── Public entry point ──────────────────────────────────────────────────────

export function parseDispatchEmail(subject: string, body: string, from: string): ParsedCard {
  return (
    parseServiceChannel(subject, body, from) ??
    parseHussmann(subject, body, from) ??
    parseGeneric(subject, from)
  )
}
