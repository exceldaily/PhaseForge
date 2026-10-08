// Bulk import, the careful part. Everything here is pure: it takes rows from
// a spreadsheet plus what is already in the database and says, row by row,
// what would happen. The screen shows that as a preview; the server runs the
// very same functions again before it writes anything.
//
// Two rules hold throughout:
//   * nothing is invented: a blank cell stays blank
//   * an existing job number is never replaced unless that row was approved

import { isQuarter, parseLooseDate, parseQuarter } from './quarters'
import { PM_STATUSES, PRIORITIES, STATUS_LABEL, SYSTEM_TYPES, type PmStatus, type SystemType } from './types'

export type ImportKind = 'stores' | 'job_numbers' | 'pm_records'
export type Cell = string
export type RawRow = Record<string, Cell>

/* ── Columns ─────────────────────────────────────────────────────────────── */

export interface ColumnDef { key: string; label: string; aliases: string[]; width?: number }

export const STORE_COLUMNS: ColumnDef[] = [
  { key: 'storeNumber', label: 'Store #', aliases: ['store', 'store number', 'store no', 'store num', 'location', 'site'], width: 96 },
  { key: 'address', label: 'Address', aliases: ['street', 'street address'], width: 220 },
  { key: 'city', label: 'City', aliases: [], width: 140 },
  { key: 'county', label: 'County', aliases: [], width: 110 },
  { key: 'state', label: 'State', aliases: ['st'], width: 60 },
  { key: 'postalCode', label: 'ZIP', aliases: ['zip code', 'postal code', 'postal'], width: 76 },
  { key: 'region', label: 'Region', aliases: ['reg'], width: 100 },
  { key: 'facilityManager', label: 'ALDI FM', aliases: ['fm', 'facility manager', 'aldi facility manager'], width: 140 },
  { key: 'fmPhone', label: 'FM Phone', aliases: [], width: 120 },
  { key: 'fmEmail', label: 'FM Email', aliases: [], width: 170 },
  { key: 'storePhone', label: 'Store Phone', aliases: ['phone'], width: 120 },
  { key: 'primaryTech', label: 'Primary Tech', aliases: ['kalos primary tech', 'primary technician', 'tech', 'technician'], width: 120 },
  { key: 'secondaryTech', label: 'Secondary Tech', aliases: ['secondary technician', 'backup tech'], width: 120 },
  { key: 'systemType', label: 'System', aliases: ['system type', 'refrigeration system'], width: 86 },
  { key: 'refrigerant', label: 'Refrigerant', aliases: ['refrigerant type'], width: 100 },
  { key: 'notes', label: 'Notes', aliases: ['store notes'], width: 200 },
  { key: 'active', label: 'Status', aliases: ['active'], width: 86 },
]

export const PM_COLUMNS: ColumnDef[] = [
  { key: 'storeNumber', label: 'Store #', aliases: ['store', 'store number', 'store no', 'location', 'site'], width: 96 },
  { key: 'period', label: 'Quarter', aliases: ['period', 'pm quarter', 'qtr'], width: 96 },
  { key: 'year', label: 'Year', aliases: [], width: 70 },
  { key: 'jobNumber', label: 'Job Number', aliases: ['job', 'job no', 'job num', 'kalos job', 'kalos job number', 'kalos job no'], width: 120 },
  { key: 'scWorkOrder', label: 'SC Work Order', aliases: ['wo', 'work order', 'sc wo', 'servicechannel wo', 'servicechannel work order', 'work order number', 'tracking'], width: 130 },
  { key: 'receivedDate', label: 'Date Received', aliases: ['received', 'job received'], width: 116 },
  { key: 'priority', label: 'Priority', aliases: ['p level', 'pri'], width: 76 },
  { key: 'dueDate', label: 'Due Date', aliases: ['due'], width: 110 },
  { key: 'technician', label: 'Technician', aliases: ['tech', 'assigned', 'assigned technician', 'assigned tech'], width: 120 },
  { key: 'scheduledDate', label: 'Scheduled', aliases: ['scheduled date', 'visit date', 'scheduled visit'], width: 110 },
  { key: 'actualStart', label: 'Actual Start', aliases: ['start', 'started', 'start date'], width: 110 },
  { key: 'actualEnd', label: 'Completed', aliases: ['actual completion', 'completion date', 'date of completion', 'actual end', 'end'], width: 110 },
  { key: 'status', label: 'Status', aliases: ['pm status'], width: 150 },
  { key: 'notes', label: 'Notes', aliases: ['coordinator notes', 'comments'], width: 200 },
]
/** The job number import is the same sheet with fewer columns. */
export const JOB_COLUMNS = PM_COLUMNS.filter((c) => ['storeNumber', 'period', 'year', 'jobNumber', 'scWorkOrder', 'receivedDate', 'priority', 'dueDate'].includes(c.key))
export const columnsFor = (kind: ImportKind) => (kind === 'stores' ? STORE_COLUMNS : kind === 'job_numbers' ? JOB_COLUMNS : PM_COLUMNS)

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const text = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)
  return String(v).replace(/\s+/g, ' ').trim()
}

/**
 * Turn a sheet (first row = headers) into rows keyed by our column names.
 * Headers match by name or alias, ignoring case and punctuation. Columns we
 * do not recognise are reported, not guessed at.
 */
export function mapSheet(cells: unknown[][], kind: ImportKind): { rows: RawRow[]; unmapped: string[]; matched: string[] } {
  const defs = columnsFor(kind)
  const headerAt = cells.findIndex((r) => r.filter((c) => text(c)).length >= 2)
  if (headerAt < 0) return { rows: [], unmapped: [], matched: [] }
  const lookup = new Map<string, string>()
  for (const d of defs) for (const a of [d.key, d.label, ...d.aliases]) lookup.set(norm(a), d.key)
  const header = cells[headerAt].map((h) => text(h))
  const keys = header.map((h) => lookup.get(norm(h)) ?? null)
  // First column wins if a sheet names the same thing twice.
  const seen = new Set<string>()
  const cols = keys.map((k) => (k && !seen.has(k) && seen.add(k) ? k : null))
  const rows: RawRow[] = []
  for (const r of cells.slice(headerAt + 1)) {
    const row: RawRow = {}
    cols.forEach((k, i) => { if (k) row[k] = text(r[i]) })
    if (Object.values(row).some((v) => v)) rows.push(row)
  }
  return {
    rows,
    unmapped: header.filter((h, i) => h && !cols[i]),
    matched: defs.filter((d) => seen.has(d.key)).map((d) => d.label),
  }
}

/* ── Stores ──────────────────────────────────────────────────────────────── */

/** Two store numbers are the same store if they match ignoring case, spaces, and dashes. */
export const storeKey = (n: string | null | undefined) => String(n ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')

export function parseSystem(raw: string): { value: SystemType | null; ok: boolean } {
  const t = norm(raw).replace(/\s/g, '')
  if (!t) return { value: null, ok: true }
  if (t === 'hfc') return { value: 'HFC', ok: true }
  if (t === 'co2' || t === 'r744') return { value: 'CO2', ok: true }
  if (t === 'r290' || t === 'propane') return { value: 'R-290', ok: true }
  const direct = SYSTEM_TYPES.find((s) => s.toLowerCase() === raw.trim().toLowerCase())
  return direct ? { value: direct, ok: true } : { value: null, ok: false }
}
export const parseActive = (raw: string) => !['inactive', 'no', 'n', 'false', '0', 'closed', 'deactivated'].includes(norm(raw))

export interface ExistingStore {
  id: string; storeNumber: string
  address: string | null; city: string | null; county: string | null; state: string | null; postalCode: string | null; region: string | null
  facilityManager: string | null; fmPhone: string | null; fmEmail: string | null; storePhone: string | null
  primaryTech: string | null; secondaryTech: string | null; systemType: string | null; refrigerant: string | null; notes: string | null; isActive: boolean
}

export interface Change { field: string; label: string; from: string; to: string }
export interface StoreReview {
  index: number
  storeNumber: string
  action: 'create' | 'update' | 'same' | 'error'
  storeId: string | null
  problems: string[]
  warnings: string[]
  changes: Change[]
  /** Clean values to write. */
  values: {
    storeNumber: string; address: string | null; city: string | null; county: string | null; state: string | null; postalCode: string | null
    region: string | null; facilityManager: string | null; fmPhone: string | null; fmEmail: string | null; storePhone: string | null
    primaryTech: string | null; secondaryTech: string | null; systemType: SystemType | null; refrigerant: string | null; notes: string | null; isActive: boolean
  }
}

const orNull = (s: string | undefined) => (s && s.trim() ? s.trim() : null)

/**
 * `updateExisting` off: stores already in the directory are left exactly as
 * they are. On: a non-blank cell that differs replaces the stored value; a
 * blank cell never erases anything.
 */
export function reviewStores(rows: RawRow[], existing: ExistingStore[], opts: { updateExisting: boolean }): StoreReview[] {
  const byKey = new Map(existing.map((s) => [storeKey(s.storeNumber), s]))
  const firstAt = new Map<string, number>()
  return rows.map((r, index) => {
    const problems: string[] = []
    const warnings: string[] = []
    const storeNumber = (r.storeNumber ?? '').trim()
    const key = storeKey(storeNumber)
    if (!key) problems.push('No store number')
    else if (firstAt.has(key)) problems.push(`Same store as row ${firstAt.get(key)! + 1}`)
    else firstAt.set(key, index)

    const system = parseSystem(r.systemType ?? '')
    if (!system.ok) warnings.push(`System "${r.systemType}" is not HFC, CO2, or R-290, so it is left blank`)
    const state = orNull(r.state)?.toUpperCase() ?? null
    if (state && !/^[A-Z]{2}$/.test(state)) warnings.push(`State "${r.state}" is not a two letter code`)
    const email = orNull(r.fmEmail)
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) warnings.push(`FM email "${email}" does not look right`)
    if (!orNull(r.address)) warnings.push('No address')

    const values: StoreReview['values'] = {
      storeNumber, address: orNull(r.address), city: orNull(r.city), county: orNull(r.county), state, postalCode: orNull(r.postalCode),
      region: orNull(r.region), facilityManager: orNull(r.facilityManager), fmPhone: orNull(r.fmPhone), fmEmail: email, storePhone: orNull(r.storePhone),
      primaryTech: orNull(r.primaryTech), secondaryTech: orNull(r.secondaryTech), systemType: system.value, refrigerant: orNull(r.refrigerant),
      notes: orNull(r.notes), isActive: r.active === undefined || r.active === '' ? true : parseActive(r.active),
    }

    const found = key ? byKey.get(key) : undefined
    const changes: Change[] = []
    if (found) {
      for (const c of STORE_COLUMNS) {
        if (c.key === 'storeNumber') continue
        if (c.key === 'active') {
          if (r.active !== undefined && r.active !== '' && values.isActive !== found.isActive) changes.push({ field: 'active', label: 'Status', from: found.isActive ? 'Active' : 'Inactive', to: values.isActive ? 'Active' : 'Inactive' })
          continue
        }
        const to = values[c.key as keyof StoreReview['values']] as string | null
        const from = (found[c.key as keyof ExistingStore] as string | null) ?? null
        if (to && norm(to) !== norm(from)) changes.push({ field: c.key, label: c.label, from: from ?? '', to })
      }
      if (changes.length && !opts.updateExisting) warnings.push('Already in the directory with different details. Left as it is.')
    }
    const action: StoreReview['action'] = problems.length ? 'error' : !found ? 'create' : changes.length && opts.updateExisting ? 'update' : 'same'
    return { index, storeNumber, action, storeId: found?.id ?? null, problems, warnings, changes, values }
  })
}

/* ── Job numbers and PM records ──────────────────────────────────────────── */

export interface ExistingCycle {
  id: string; storeId: string; year: number; quarter: number
  jobNumber: string | null; scWorkOrder: string | null; jobReceivedDate: string | null; priority: string | null; dueDate: string | null
  techId: string | null; scheduledDate: string | null; actualStart: string | null; actualEnd: string | null; status: PmStatus; coordinatorNotes: string | null
}

export interface PmReview {
  index: number
  storeNumber: string
  year: number | null
  quarter: number | null
  /**
   * create   no PM for that store and quarter yet
   * update   fills in or changes an existing PM
   * same     nothing to do
   * conflict the PM already has a different job number, and this row is not approved to replace it
   * error    cannot be imported as written
   */
  action: 'create' | 'update' | 'same' | 'conflict' | 'error'
  storeId: string | null
  pmId: string | null
  problems: string[]
  warnings: string[]
  changes: Change[]
  /** Set when the row would replace an existing job number. */
  jobConflict: { from: string; to: string } | null
  values: {
    jobNumber: string | null; scWorkOrder: string | null; jobReceivedDate: string | null; priority: string | null; dueDate: string | null
    technician: string | null; scheduledDate: string | null; actualStart: string | null; actualEnd: string | null; status: PmStatus | null; coordinatorNotes: string | null
  }
}

export function parseStatus(raw: string): { value: PmStatus | null; ok: boolean } {
  const t = norm(raw)
  if (!t) return { value: null, ok: true }
  const hit = PM_STATUSES.find((s) => norm(s) === t || norm(STATUS_LABEL[s]) === t)
    ?? ({ complete: 'completed', done: 'completed', closed: 'completed', submitted: 'submitted', 'pending closeout': 'submitted',
      'field complete': 'field_complete', 'hold': 'on_hold', 'canceled': 'cancelled', 'awaiting job': 'awaiting_job_number', 'received': 'job_received',
      'unscheduled': 'not_scheduled' } as Record<string, PmStatus>)[t]
  return hit ? { value: hit, ok: true } : { value: null, ok: false }
}

export function parsePriority(raw: string): { value: string | null; ok: boolean } {
  const t = raw.trim().toUpperCase().replace(/\s+/g, '')
  if (!t) return { value: null, ok: true }
  const key = /^P?[1-7]$/.test(t) ? `P${t.replace('P', '')}` : null
  return key && PRIORITIES.some((p) => p.key === key) ? { value: key, ok: true } : { value: null, ok: false }
}

export interface PmReviewContext {
  stores: { id: string; storeNumber: string; isActive: boolean }[]
  cycles: ExistingCycle[]
  techs: { id: string; name: string }[]
  /** Used when a row does not say which quarter it is for. */
  defaults: { year: number; quarter: number }
  /** Replace stored values that differ (never the job number: that is per row). */
  overwrite: boolean
  /** Row indexes approved to replace an existing job number. */
  approvedJobRows: number[]
}

const FIELD: { key: keyof PmReview['values']; label: string; existing: keyof ExistingCycle }[] = [
  { key: 'scWorkOrder', label: 'SC Work Order', existing: 'scWorkOrder' },
  { key: 'jobReceivedDate', label: 'Date Received', existing: 'jobReceivedDate' },
  { key: 'priority', label: 'Priority', existing: 'priority' },
  { key: 'dueDate', label: 'Due Date', existing: 'dueDate' },
  { key: 'scheduledDate', label: 'Scheduled', existing: 'scheduledDate' },
  { key: 'actualStart', label: 'Actual Start', existing: 'actualStart' },
  { key: 'actualEnd', label: 'Completed', existing: 'actualEnd' },
  { key: 'status', label: 'Status', existing: 'status' },
  { key: 'coordinatorNotes', label: 'Notes', existing: 'coordinatorNotes' },
]

export function reviewPmRows(rows: RawRow[], ctx: PmReviewContext): PmReview[] {
  const storeByKey = new Map(ctx.stores.map((s) => [storeKey(s.storeNumber), s]))
  const storeNumberById = new Map(ctx.stores.map((s) => [s.id, s.storeNumber]))
  const cycleAt = new Map(ctx.cycles.map((c) => [`${c.storeId}:${c.year}:${c.quarter}`, c]))
  const jobOwner = new Map<string, ExistingCycle>()
  for (const c of ctx.cycles) if (c.jobNumber) jobOwner.set(c.jobNumber.trim().toLowerCase(), c)
  const techByName = new Map(ctx.techs.map((t) => [norm(t.name), t]))
  const approved = new Set(ctx.approvedJobRows)
  const slotAt = new Map<string, number>()
  const jobAt = new Map<string, { index: number; slot: string }>()

  return rows.map((r, index) => {
    const problems: string[] = []
    const warnings: string[] = []
    const storeNumber = (r.storeNumber ?? '').trim()
    const store = storeByKey.get(storeKey(storeNumber))
    if (!storeKey(storeNumber)) problems.push('No store number')
    else if (!store) problems.push(`Store ${storeNumber} is not in the directory`)
    else if (!store.isActive) warnings.push('This store is inactive')

    // Which quarter: "Q2 2026" in one cell, or separate cells, or the default.
    let year: number | null = null
    let quarter: number | null = null
    const period = (r.period ?? '').trim()
    const yearCell = (r.year ?? '').trim()
    const fallbackYear = /^20\d{2}$/.test(yearCell) ? Number(yearCell) : ctx.defaults.year
    if (period) {
      const p = parseQuarter(period, fallbackYear)
      if (p) { year = p.year; quarter = p.quarter } else problems.push(`"${period}" is not a quarter`)
    } else { year = fallbackYear; quarter = ctx.defaults.quarter }
    if (yearCell && !/^20\d{2}$/.test(yearCell)) problems.push(`"${yearCell}" is not a year`)
    if (quarter !== null && !isQuarter(quarter)) problems.push('Quarter must be 1 to 4')

    const date = (raw: string | undefined, label: string): string | null => {
      if (!raw || !raw.trim()) return null
      const d = parseLooseDate(raw)
      if (!d) problems.push(`${label} "${raw}" is not a date`)
      return d
    }
    const priority = parsePriority(r.priority ?? '')
    if (!priority.ok) problems.push(`Priority "${r.priority}" is not P1 to P7`)
    const status = parseStatus(r.status ?? '')
    if (!status.ok) problems.push(`Status "${r.status}" is not one of the PM statuses`)
    const technician = orNull(r.technician)
    if (technician && !techByName.has(norm(technician))) warnings.push(`${technician} is not a technician yet and will be added`)

    const values: PmReview['values'] = {
      jobNumber: orNull(r.jobNumber), scWorkOrder: orNull(r.scWorkOrder), jobReceivedDate: date(r.receivedDate, 'Date received'),
      priority: priority.value, dueDate: date(r.dueDate, 'Due date'), technician,
      scheduledDate: date(r.scheduledDate, 'Scheduled date'), actualStart: date(r.actualStart, 'Actual start'), actualEnd: date(r.actualEnd, 'Completed date'),
      status: status.value, coordinatorNotes: orNull(r.notes),
    }

    const slot = store && year && quarter ? `${store.id}:${year}:${quarter}` : null
    if (slot) {
      if (slotAt.has(slot)) problems.push(`Same store and quarter as row ${slotAt.get(slot)! + 1}`)
      else slotAt.set(slot, index)
    }
    const existing = slot ? cycleAt.get(slot) : undefined

    // A Kalos job number belongs to one PM.
    const jobKey = values.jobNumber?.toLowerCase() ?? null
    if (jobKey && slot) {
      const owner = jobOwner.get(jobKey)
      if (owner && owner.id !== existing?.id) problems.push(`Job number ${values.jobNumber} is already on ${storeNumberById.get(owner.storeId) ?? 'another store'} Q${owner.quarter} ${owner.year}`)
      const earlier = jobAt.get(jobKey)
      if (earlier && earlier.slot !== slot) problems.push(`Job number ${values.jobNumber} is also on row ${earlier.index + 1}`)
      else if (!earlier) jobAt.set(jobKey, { index, slot })
    }

    const changes: Change[] = []
    let jobConflict: PmReview['jobConflict'] = null
    if (existing) {
      if (values.jobNumber && values.jobNumber !== (existing.jobNumber ?? '')) {
        if (existing.jobNumber) jobConflict = { from: existing.jobNumber, to: values.jobNumber }
        changes.push({ field: 'jobNumber', label: 'Job Number', from: existing.jobNumber ?? '', to: values.jobNumber })
      }
      for (const f of FIELD) {
        const to = values[f.key]
        if (to === null) continue
        const from = (existing[f.existing] as string | null) ?? null
        if (String(to) === String(from ?? '')) continue
        if (from && !ctx.overwrite) { warnings.push(`${f.label} is already ${f.key === 'status' ? STATUS_LABEL[from as PmStatus] ?? from : from}. Kept.`); continue }
        // A status in the file only fills in a PM that has not moved yet.
        if (f.key === 'status' && !ctx.overwrite && !['awaiting_job_number', 'job_received'].includes(existing.status)) continue
        changes.push({ field: f.key, label: f.label, from: f.key === 'status' ? STATUS_LABEL[from as PmStatus] ?? '' : from ?? '', to: f.key === 'status' ? STATUS_LABEL[to as PmStatus] : String(to) })
      }
      if (values.technician) {
        const t = techByName.get(norm(values.technician))
        const current = ctx.techs.find((x) => x.id === existing.techId)?.name ?? ''
        if (!existing.techId) changes.push({ field: 'technician', label: 'Technician', from: '', to: values.technician })
        else if (t?.id !== existing.techId) {
          if (ctx.overwrite) changes.push({ field: 'technician', label: 'Technician', from: current, to: values.technician })
          else warnings.push(`Technician is already ${current}. Kept.`)
        }
      }
    }

    let action: PmReview['action']
    if (problems.length) action = 'error'
    else if (!existing) action = 'create'
    else if (jobConflict && !approved.has(index)) action = 'conflict'
    else action = changes.length ? 'update' : 'same'
    return { index, storeNumber, year, quarter, action, storeId: store?.id ?? null, pmId: existing?.id ?? null, problems, warnings, changes, jobConflict, values }
  })
}

/* ── Summaries and the error report ──────────────────────────────────────── */

export function tally<T extends { action: string }>(reviews: T[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of reviews) out[r.action] = (out[r.action] ?? 0) + 1
  return out
}

export function errorReport(reviews: (StoreReview | PmReview)[]): Record<string, string>[] {
  return reviews.filter((r) => r.problems.length || r.warnings.length || r.action === 'conflict').map((r) => ({
    Row: String(r.index + 1),
    'Store #': r.storeNumber,
    Result: r.action === 'error' ? 'Not imported' : r.action === 'conflict' ? 'Skipped, would replace a job number' : 'Imported with notes',
    Problems: r.problems.join('; '),
    Notes: [...r.warnings, ...('jobConflict' in r && r.jobConflict ? [`Existing job number ${r.jobConflict.from} would become ${r.jobConflict.to}`] : [])].join('; '),
  }))
}
