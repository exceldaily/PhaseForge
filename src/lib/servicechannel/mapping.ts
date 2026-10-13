// Column mapping and row normalization for ServiceChannel exports. Pure and
// tested. Headers vary by report, so each field lists the headings seen so far;
// a person confirms the mapping before anything is imported and can save it.
//
// Dates come as "12/23/25", "Jul 23, 2026", "2026-07-23" or, from an XLSX read
// with cellDates, a Date. All become "YYYY-MM-DD" or null. Nothing is guessed:
// an unreadable cell is null and a warning.

import type { NormalizedRow } from './types'

export interface FieldDef { key: keyof NormalizedRow | 'storeFull'; label: string; aliases: string[]; required?: boolean; hint?: string }

export const FIELDS: FieldDef[] = [
  { key: 'trackingNumber', label: 'Tracking #', aliases: ['tracking #', 'tracking', 'tracking number', 'tracking no', 'sc tracking', 'work order tracking'], required: true },
  { key: 'woNumber', label: 'WO #', aliases: ['wo #', 'wo', 'work order #', 'work order', 'wo number'] },
  { key: 'poNumber', label: 'PO #', aliases: ['po #', 'po', 'po number'] },
  { key: 'customerName', label: 'Customer / subscriber', aliases: ['subscriber', 'customer', 'client', 'subscriber name', 'customer name'], hint: 'Not in every export. Can also be set for the whole file below.' },
  { key: 'storeFull', label: 'Store (number - city, state)', aliases: ['store', 'location', 'store #', 'location name', 'site'], hint: 'Split into store number, city and state.' },
  { key: 'region', label: 'Region', aliases: ['region'] },
  { key: 'district', label: 'District', aliases: ['district'] },
  { key: 'trade', label: 'Trade', aliases: ['trade'] },
  { key: 'category', label: 'Category', aliases: ['category'] },
  { key: 'priority', label: 'Priority', aliases: ['priority'] },
  { key: 'area', label: 'Area', aliases: ['area'] },
  { key: 'equipment', label: 'Equipment', aliases: ['equipment', 'asset', 'asset type'] },
  { key: 'problemType', label: 'Problem type', aliases: ['problem type'] },
  { key: 'problemCode', label: 'Problem code', aliases: ['problem code'] },
  { key: 'tagId', label: 'Tag ID', aliases: ['tag id', 'asset tag', 'tag'] },
  { key: 'problemDescription', label: 'Problem description', aliases: ['problem description', 'description', 'issue'] },
  { key: 'submittedBy', label: 'Submitted by', aliases: ['submitted by', 'caller', 'created by'] },
  { key: 'callDate', label: 'Call date', aliases: ['call date', 'created', 'created date', 'date created'] },
  { key: 'scheduledDate', label: 'Scheduled date', aliases: ['sched. date', 'sched date', 'scheduled date', 'scheduled', 'appointment'] },
  { key: 'originalEta', label: 'Original ETA', aliases: ['original eta', 'eta'] },
  { key: 'reassignDate', label: 'Reassign date', aliases: ['reass. date', 'reassign date', 'reassigned date'] },
  { key: 'reassignTime', label: 'Reassign time', aliases: ['reass. time', 'reassign time'] },
  { key: 'status', label: 'Status', aliases: ['status', 'wo status'] },
  { key: 'statusExt', label: 'Extended status', aliases: ['status ext.', 'status ext', 'extended status', 'ext status', 'sub status', 'substatus'] },
  { key: 'resolution', label: 'Resolution', aliases: ['resolution', 'resolution notes', 'work summary'] },
  { key: 'nte', label: 'NTE', aliases: ['nte', 'not to exceed', 'nte amount'] },
  { key: 'currency', label: 'Currency', aliases: ['currency'] },
  { key: 'assignee', label: 'Assignee (customer side)', aliases: ['assignee', 'assigned to'] },
  { key: 'dateAssigned', label: 'Date assigned', aliases: ['dateassigned', 'date assigned'] },
  { key: 'technicians', label: 'Technician(s)', aliases: ['assigned to technician(s)', 'technician', 'technicians', 'tech', 'assigned technician'] },
  { key: 'timezone', label: 'Time zone', aliases: ['timezone', 'time zone'] },
  { key: 'notesRaw', label: 'Notes (activity log)', aliases: ['notes', 'note', 'activity', 'history', 'latest notes'] },
]

export const normHeader = (h: unknown) => String(h ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/** Same export layout again: the sorted header list, lowercased. */
export function headerSignature(headers: string[]): string {
  return [...new Set(headers.map(normHeader).filter(Boolean))].sort().join('|')
}

/** Header -> field key. Unmatched headers map to ''. First match wins for a field. */
export function suggestMapping(headers: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  const taken = new Set<string>()
  for (const h of headers) {
    const n = normHeader(h)
    if (!n) continue
    const f = FIELDS.find((d) => !taken.has(d.key) && d.aliases.includes(n))
    out[h] = f ? f.key : ''
    if (f) taken.add(f.key)
  }
  return out
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }
const pad = (n: number) => String(n).padStart(2, '0')
const valid = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100

/** "12/23/25", "7/1/2026", "Jul 23, 2026", "2026-07-23", or a Date, to "YYYY-MM-DD". */
export function parseDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null
    // xlsx gives local-midnight Dates for date cells; read the local parts
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
  }
  const s = String(v).trim()
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s.*)?$/.exec(s)
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return valid(y, +m[1], +m[2]) ? `${y}-${pad(+m[1])}-${pad(+m[2])}` : null
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return valid(+m[1], +m[2], +m[3]) ? `${m[1]}-${m[2]}-${m[3]}` : null
  m = /^([A-Za-z]{3,4})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s)
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()]
    return mo && valid(+m[3], mo, +m[2]) ? `${m[3]}-${pad(mo)}-${pad(+m[2])}` : null
  }
  return null
}

/** "49-00699 - Winter Garden,FL" -> { number: "49-00699", city: "Winter Garden", state: "FL" }. */
export function parseStore(label: string | null): { number: string | null; city: string | null; state: string | null } {
  const s = (label ?? '').trim()
  if (!s) return { number: null, city: null, state: null }
  const m = /^(.+?)\s+-\s+(.+?)(?:,\s*([A-Za-z]{2}))?\s*$/.exec(s)
  if (!m) return { number: s, city: null, state: null }
  return { number: m[1].trim(), city: m[2].trim() || null, state: m[3] ? m[3].toUpperCase() : null }
}

const text = (v: unknown): string | null => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim()
  return s ? s : null
}
const longText = (v: unknown): string | null => {
  const s = String(v ?? '').trim()
  return s ? s : null
}

export interface NormalizeResult {
  rows: NormalizedRow[]
  warnings: string[]
  /** Tracking numbers that appeared more than once; the last row won. */
  duplicates: string[]
  skipped: number
}

/**
 * Cells (first row = headers) plus a confirmed mapping to normalized rows.
 * `fileCustomer` applies one subscriber to every row when the export was
 * filtered to a single customer and has no customer column.
 */
export function normalizeRows(cells: unknown[][], mapping: Record<string, string>, opts: { fileCustomer?: string | null } = {}): NormalizeResult {
  const warnings: string[] = []
  const rows: NormalizedRow[] = []
  const seen = new Map<string, number>()
  const duplicates = new Set<string>()
  let skipped = 0
  if (!cells.length) return { rows, warnings: ['The file is empty.'], duplicates: [], skipped }

  const headers = cells[0].map((h) => String(h ?? '').trim())
  const col = (key: string) => headers.findIndex((h) => mapping[h] === key)
  const idx: Record<string, number> = {}
  for (const f of FIELDS) idx[f.key] = col(f.key)
  if (idx.trackingNumber < 0) return { rows, warnings: ['No column is mapped to Tracking #. Every row needs one.'], duplicates: [], skipped }

  const get = (r: unknown[], key: string) => (idx[key] >= 0 ? r[idx[key]] : undefined)
  const date = (r: unknown[], key: string, rowNo: number) => {
    const v = get(r, key)
    const d = parseDate(v)
    if (v !== undefined && v !== null && String(v).trim() && !d) warnings.push(`Row ${rowNo}: could not read ${key} "${String(v).slice(0, 30)}".`)
    return d
  }

  for (let i = 1; i < cells.length; i++) {
    const r = cells[i]
    if (!r || !r.some((c) => String(c ?? '').trim())) continue
    const rowNo = i + 1
    const tracking = text(get(r, 'trackingNumber'))
    if (!tracking) { skipped++; warnings.push(`Row ${rowNo}: no tracking number, skipped.`); continue }
    const storeFull = text(get(r, 'storeFull'))
    const store = parseStore(storeFull)
    const nteRaw = text(get(r, 'nte'))
    const nte = nteRaw === null ? null : Number(nteRaw.replace(/[^0-9.-]/g, ''))
    const techRaw = text(get(r, 'technicians'))
    const raw: Record<string, string> = {}
    headers.forEach((h, k) => { if (h) raw[h] = String(r[k] ?? '').trim() })

    const row: NormalizedRow = {
      trackingNumber: tracking,
      woNumber: text(get(r, 'woNumber')), poNumber: text(get(r, 'poNumber')),
      customerName: text(get(r, 'customerName')) ?? text(opts.fileCustomer),
      customerSource: text(get(r, 'customerName')) ? 'import' : text(opts.fileCustomer) ? 'coverage' : null,
      storeLabel: storeFull, storeNumber: store.number, storeCity: store.city, storeState: store.state,
      region: text(get(r, 'region')), district: text(get(r, 'district')), trade: text(get(r, 'trade')), category: text(get(r, 'category')),
      priority: text(get(r, 'priority')), area: text(get(r, 'area')), equipment: text(get(r, 'equipment')), problemType: text(get(r, 'problemType')),
      problemCode: text(get(r, 'problemCode')), tagId: text(get(r, 'tagId')), problemDescription: longText(get(r, 'problemDescription')),
      submittedBy: text(get(r, 'submittedBy')),
      callDate: date(r, 'callDate', rowNo), scheduledDate: date(r, 'scheduledDate', rowNo), originalEta: date(r, 'originalEta', rowNo),
      reassignDate: date(r, 'reassignDate', rowNo), reassignTime: text(get(r, 'reassignTime')),
      status: text(get(r, 'status'))?.toUpperCase() ?? null, statusExt: text(get(r, 'statusExt'))?.toUpperCase() ?? null,
      resolution: longText(get(r, 'resolution')), nte: nte === null || Number.isNaN(nte) ? null : nte, currency: text(get(r, 'currency')),
      assignee: text(get(r, 'assignee')), dateAssigned: date(r, 'dateAssigned', rowNo),
      technicians: techRaw ? techRaw.split(/\s*;\s*/).map((t) => t.trim()).filter(Boolean) : [],
      timezone: text(get(r, 'timezone')), notesRaw: longText(get(r, 'notesRaw')), raw,
    }
    if (seen.has(tracking)) {
      duplicates.add(tracking)
      rows[seen.get(tracking)!] = row
    } else {
      seen.set(tracking, rows.length)
      rows.push(row)
    }
  }
  if (duplicates.size) warnings.push(`${duplicates.size} tracking number(s) appeared more than once in the file; the last row was used: ${[...duplicates].slice(0, 5).join(', ')}${duplicates.size > 5 ? '…' : ''}`)
  return { rows, warnings, duplicates: [...duplicates], skipped }
}

/** Column names for sc_work_orders, from a normalized row. The links are added by the planner. */
export function toColumns(r: NormalizedRow): Record<string, unknown> {
  return {
    tracking_number: r.trackingNumber, wo_number: r.woNumber, po_number: r.poNumber, customer_name: r.customerName, customer_source: r.customerSource,
    store_label: r.storeLabel, store_number: r.storeNumber, store_city: r.storeCity, store_state: r.storeState,
    region: r.region, district: r.district, trade: r.trade, category: r.category, priority: r.priority,
    area: r.area, equipment: r.equipment, problem_type: r.problemType, problem_code: r.problemCode, tag_id: r.tagId,
    problem_description: r.problemDescription, submitted_by: r.submittedBy,
    call_date: r.callDate, scheduled_date: r.scheduledDate, original_eta: r.originalEta, reassign_date: r.reassignDate, reassign_time: r.reassignTime,
    status: r.status, status_ext: r.statusExt, resolution: r.resolution, nte: r.nte, currency: r.currency,
    assignee: r.assignee, date_assigned: r.dateAssigned, technicians: r.technicians, timezone: r.timezone, notes_raw: r.notesRaw,
  }
}
