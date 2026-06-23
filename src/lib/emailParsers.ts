/**
 * Email parsers for Dispatch card auto-creation.
 * Supports: ServiceChannel HTML emails, Hussmann/ALDI plain-text bulletins.
 */

import type { DispatchUrgency } from '@/types/app'

export interface ParsedCard {
  store: string | null
  sc_number: string | null
  urgency: DispatchUrgency
  description: string | null
  rack_circuit_case: string | null
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

// ── ServiceChannel parser ───────────────────────────────────────────────────

// Subject: "New Service Request | Location ID: 0673 | P0 (12 HOURS) | 354494021 | Sprouts Farmers Market | Daytona Beach | FL"

const SC_SUBJECT_RE =
  /New Service Request\s*\|\s*Location ID:\s*(\d+)\s*\|\s*(P\d+[^|]*)\|\s*(\d+)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([A-Z]{2})/i

function parseServiceChannel(subject: string, body: string, from: string): ParsedCard | null {
  const m = SC_SUBJECT_RE.exec(subject)
  if (!m) return null

  const [, , priority, scNumber, customer, city, state] = m
  const store = `${customer.trim()} - ${city.trim()}, ${state.trim()}`

  // Extract asset / problem type from body
  const assetMatch = /Asset(?:\s*\/\s*Equipment)?:\s*(.+)/i.exec(body)
  const problemMatch = /Problem(?:\s*Description)?:\s*([\s\S]+?)(?:\n[A-Z]|$)/i.exec(body)
  const description = problemMatch ? problemMatch[1].trim().slice(0, 500) : null
  const rackCircuitCase = assetMatch ? assetMatch[1].trim() : null

  return {
    store,
    sc_number: scNumber.trim(),
    urgency: priorityToUrgency(priority),
    description,
    rack_circuit_case: rackCircuitCase,
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

  // Hussmann emails always have a site name or tracking number
  if (!siteMatch && !trackingMatch) return null
  // Require at least one of the characteristic fields
  if (!from.toLowerCase().includes('hussmann') && !siteMatch && !priorityMatch) return null

  const store = siteMatch ? siteMatch[1].trim() : null
  const scNumber = trackingMatch ? trackingMatch[1].trim() : null
  const urgency = priorityMatch ? priorityToUrgency(priorityMatch[1]) : 'medium'
  const description = problemMatch ? problemMatch[1].trim().slice(0, 500) : null

  return {
    store,
    sc_number: scNumber,
    urgency,
    description,
    rack_circuit_case: null,
    date_started: new Date().toISOString().slice(0, 10),
    email_subject: subject,
    email_sender: from,
    source: 'email',
    needs_review: !store && !scNumber,
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
    date_started: new Date().toISOString().slice(0, 10),
    email_subject: subject,
    email_sender: from,
    source: 'email',
    needs_review: true,
  }
}

// ── Public entry point ──────────────────────────────────────────────────────

/**
 * Detects email format and returns parsed card data.
 * Always returns a result — falls back to generic parser with needs_review=true.
 */
export function parseDispatchEmail(
  subject: string,
  body: string,
  from: string
): ParsedCard {
  return (
    parseServiceChannel(subject, body, from) ??
    parseHussmann(subject, body, from) ??
    parseGeneric(subject, from)
  )
}
