// Compares an export against what PhaseForge already holds and produces the
// plan that sc_commit_import applies. Pure and tested.
//
// Rules the whole module leans on:
//   * The tracking number is the identity. Same number twice in a file: last wins, warned.
//   * A work order absent from a file is never completed or deleted. It is
//     marked "not in latest comparable export" only when this file's declared
//     coverage says it should have been there; outside the call-date window it
//     is "outside window"; otherwise it is left alone.
//   * Official values are compared field by field; internal follow-up is not
//     touched here at all.

import { toColumns } from './mapping'
import { noteSignals, notesHash, parseNotes } from './notes'
import type { Change, Coverage, ImportFlag, NormalizedRow } from './types'

export interface ExistingWo {
  trackingNumber: string
  status: string | null
  statusExt: string | null
  scheduledDate: string | null
  originalEta: string | null
  technicians: string[]
  assignee: string | null
  nte: number | null
  resolution: string | null
  priority: string | null
  trade: string | null
  category: string | null
  callDate: string | null
  customerName: string | null
  notesRaw: string | null
  observationState: string
}

export interface LocationMatch { locationId: string; customerId: string | null; customerName: string | null }

export interface PlanRow {
  trackingNumber: string
  kind: 'new' | 'changed' | 'unchanged'
  cols: Record<string, unknown>
  raw: Record<string, string>
  changes: Change[]
  flags: ImportFlag[]
  reopened: boolean
  newUnsat: boolean
  summary: string | null
}

export interface Plan {
  rows: PlanRow[]
  missing: { trackingNumber: string; state: 'not_in_latest' | 'outside_window'; reason: string }[]
  stats: Record<string, number>
  warnings: string[]
}

const COMPLETED = /^(COMPLETED|CLOSED|INVOICED|CANCELLED|CANCELED)/i
const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null)
const fmt = (v: unknown) => (v === null || v === undefined || v === '' ? null : Array.isArray(v) ? v.join('; ') : String(v))

const COMPARE: { key: keyof NormalizedRow; ex: keyof ExistingWo; label: string }[] = [
  { key: 'status', ex: 'status', label: 'Status' },
  { key: 'statusExt', ex: 'statusExt', label: 'Extended status' },
  { key: 'scheduledDate', ex: 'scheduledDate', label: 'Scheduled date' },
  { key: 'originalEta', ex: 'originalEta', label: 'Original ETA' },
  { key: 'assignee', ex: 'assignee', label: 'Assignee' },
  { key: 'nte', ex: 'nte', label: 'NTE' },
  { key: 'priority', ex: 'priority', label: 'Priority' },
  { key: 'trade', ex: 'trade', label: 'Trade' },
  { key: 'category', ex: 'category', label: 'Category' },
  { key: 'resolution', ex: 'resolution', label: 'Resolution' },
]

export function buildPlan(input: {
  rows: NormalizedRow[]
  existing: ExistingWo[]
  coverage: Coverage
  today: string
  /** store number -> existing PhaseForge location, when exactly one matches */
  locations?: Map<string, LocationMatch>
  /** store number -> customer, from the store directory a person maintains */
  storeCustomers?: Map<string, string>
}): Plan {
  const { rows, coverage, today } = input
  const byTracking = new Map(input.existing.map((e) => [e.trackingNumber, e]))
  const inFile = new Set<string>()
  const warnings: string[] = []
  const stats: Record<string, number> = { rows: rows.length, new: 0, changed: 0, unchanged: 0, reopened: 0, newUnsat: 0, appointmentChanged: 0, techChanged: 0, slaRisk: 0, overdue: 0, missing: 0, outsideWindow: 0, located: 0 }
  const out: PlanRow[] = []

  for (const r of rows) {
    inFile.add(r.trackingNumber)
    const ex = byTracking.get(r.trackingNumber)
    const cols = toColumns(r)
    const loc = r.storeNumber ? input.locations?.get(r.storeNumber) : undefined
    if (loc) {
      cols.location_id = loc.locationId
      cols.customer_id = loc.customerId
      if (!cols.customer_name && loc.customerName) { cols.customer_name = loc.customerName; cols.customer_source = 'location' }
      stats.located++
    }
    const dir = r.storeNumber ? input.storeCustomers?.get(r.storeNumber) : undefined
    if (!cols.customer_name && dir) { cols.customer_name = dir; cols.customer_source = 'directory'; stats.fromDirectory = (stats.fromDirectory ?? 0) + 1 }
    const flags: ImportFlag[] = []
    const changes: Change[] = []
    let reopened = false
    let newUnsat = false

    // Signals from the activity log, used for both new and existing rows.
    const sig = noteSignals(parseNotes(r.notesRaw))
    const unsatNow = r.statusExt === 'UNSATISFACTORY'
    const openNow = !r.status || !COMPLETED.test(r.status)
    if (r.originalEta && openNow && r.originalEta < today && r.statusExt !== 'ON SITE') flags.push('sla_risk')
    if (r.scheduledDate && openNow && r.scheduledDate < today && !/MAINTENANCE/i.test(r.category ?? '') && r.statusExt !== 'ON SITE') flags.push('overdue')

    if (!ex) {
      if (unsatNow) { newUnsat = true; flags.push('new_unsat') }
      out.push({ trackingNumber: r.trackingNumber, kind: 'new', cols, raw: r.raw, changes, flags, reopened, newUnsat, summary: null })
      stats.new++
      if (newUnsat) stats.newUnsat++
      if (flags.includes('sla_risk')) stats.slaRisk++
      if (flags.includes('overdue')) stats.overdue++
      continue
    }

    for (const c of COMPARE) {
      const a = ex[c.ex], b = r[c.key]
      if (!same(a, b)) changes.push({ field: c.key, label: c.label, from: fmt(a), to: fmt(b) })
    }
    const techA = ex.technicians.join('; '), techB = r.technicians.join('; ')
    if (techA !== techB) { changes.push({ field: 'technicians', label: 'Technician(s)', from: techA || null, to: techB || null }); flags.push('tech_changed'); stats.techChanged++ }
    if (!same(ex.scheduledDate, r.scheduledDate) || !same(ex.originalEta, r.originalEta)) { flags.push('appointment_changed'); stats.appointmentChanged++ }
    if (notesHash(ex.notesRaw) !== notesHash(r.notesRaw)) changes.push({ field: 'notesRaw', label: 'Notes', from: null, to: 'updated' })

    const wasCompleted = !!ex.status && COMPLETED.test(ex.status)
    if (wasCompleted && openNow) reopened = true
    if (!reopened && sig.lastReopenedAt && ex.notesRaw && !/Status has been changed from COMPLETED/i.test(ex.notesRaw)) reopened = true
    if (unsatNow && ex.statusExt !== 'UNSATISFACTORY') newUnsat = true
    if (reopened) { flags.push('reopened'); stats.reopened++ }
    if (newUnsat) { flags.push('new_unsat'); stats.newUnsat++ }
    if (flags.includes('sla_risk')) stats.slaRisk++
    if (flags.includes('overdue')) stats.overdue++

    const kind = changes.length ? 'changed' : 'unchanged'
    stats[kind]++
    const summary = changes.length
      ? changes.filter((c) => c.field !== 'notesRaw').slice(0, 3).map((c) => `${c.label}: ${c.from ?? 'blank'} → ${c.to ?? 'blank'}`).join('; ') || 'Notes updated'
      : null
    out.push({ trackingNumber: r.trackingNumber, kind, cols, raw: r.raw, changes, flags, reopened, newUnsat, summary })
  }

  // Missing from this file, judged against what the file claims to cover.
  const missing: Plan['missing'] = []
  const statusSet = new Set(coverage.statuses.map((s) => s.toUpperCase()))
  const subSet = new Set(coverage.subscribers.map((s) => s.toLowerCase()))
  for (const ex of input.existing) {
    if (inFile.has(ex.trackingNumber)) continue
    if (ex.observationState === 'needs_verification' || ex.observationState === 'manually_verified') continue
    if (statusSet.size && (!ex.status || !statusSet.has(ex.status.toUpperCase()))) continue
    if (subSet.size && (!ex.customerName || !subSet.has(ex.customerName.toLowerCase()))) continue
    if (coverage.callDateFrom && ex.callDate && ex.callDate < coverage.callDateFrom) {
      if (ex.observationState !== 'outside_window') { missing.push({ trackingNumber: ex.trackingNumber, state: 'outside_window', reason: `Call date ${ex.callDate} is before this export's window (${coverage.callDateFrom})` }); stats.outsideWindow++ }
      continue
    }
    if (coverage.callDateTo && ex.callDate && ex.callDate > coverage.callDateTo) continue
    if (ex.observationState !== 'not_in_latest') { missing.push({ trackingNumber: ex.trackingNumber, state: 'not_in_latest', reason: 'Not present in the latest comparable export; last official status kept' }); stats.missing++ }
  }

  if (!coverage.statuses.length) warnings.push('No status filter was declared, so every stored work order absent from this file is treated as missing. Declare the statuses the export was filtered to if that is not right.')
  return { rows: out, missing, stats, warnings }
}
