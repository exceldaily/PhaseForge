/**
 * Document schedule parser — supports hierarchical multi-project PDFs.
 * Detects project groups and phases from indented task lists.
 */

export interface ParsedTask {
  name: string
  start_date: string
  end_date: string
  indent: number
}

export interface DetectedProject {
  id: string
  name: string
  start_date: string
  end_date: string
  phases: ParsedTask[]
  accepted: boolean
  status?: string // default: 'mobilization'
}

export interface ParseResult {
  projects: DetectedProject[]
  tasks: ParsedTask[]   // flat list (for single-project import)
  error?: string
}

// ─── Date normalisation ───────────────────────────────────────────────────────

export function normaliseDate(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === '') return null

  if (typeof raw === 'number') {
    const date = new Date((raw - 25569) * 86400 * 1000)
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0]
    return null
  }

  const s = String(raw).trim()
  if (!s) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slash) {
    const [, m, d, y] = slash
    const year = y.length === 2 ? (parseInt(y) > 50 ? `19${y}` : `20${y}`) : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const dash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/)
  if (dash) {
    const [, m, d, y] = dash
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]

  return null
}

// Parse a date that may omit its year (e.g. "7/5"). Returns the ISO string,
// a Date for comparison, and whether the source carried an explicit year.
function parseFlexibleDate(
  raw: string | number | null | undefined,
  baseYear: number
): { iso: string; date: Date; hasYear: boolean } | null {
  if (raw === null || raw === undefined || raw === '') return null

  if (typeof raw === 'number') {
    const iso = normaliseDate(raw)
    return iso ? { iso, date: new Date(iso), hasYear: true } : null
  }

  const str = String(raw).trim()

  // "m/d" or "m-d" with no year → fill in baseYear.
  const md = str.match(/^(\d{1,2})[\/\-](\d{1,2})$/)
  if (md) {
    const iso = `${baseYear}-${md[1].padStart(2, '0')}-${md[2].padStart(2, '0')}`
    const date = new Date(iso)
    if (isNaN(date.getTime())) return null
    return { iso, date, hasYear: false }
  }

  const iso = normaliseDate(str)
  return iso ? { iso, date: new Date(iso), hasYear: true } : null
}

// Resolve a start/end pair, inferring years when absent. A year-less end that
// lands before the start is rolled into the next year (e.g. Jul 5 → Jan 7).
function resolveDateSpan(
  startRaw: string | number | null,
  endRaw: string | number | null
): { start: string | null; end: string | null } {
  const baseYear = new Date().getFullYear()
  const start = parseFlexibleDate(startRaw, baseYear)
  if (!start) return { start: null, end: null }

  let end = parseFlexibleDate(endRaw, baseYear)
  if (end && !end.hasYear && end.date < start.date) {
    end = parseFlexibleDate(endRaw, baseYear + 1)
  }

  return { start: start.iso, end: end ? end.iso : null }
}

// ─── Indent scoring ───────────────────────────────────────────────────────────

function scoreIndent(line: string): number {
  const leading = line.match(/^(\s+)/)
  if (!leading) return 0
  return leading[1].length
}

// ─── Date pattern ─────────────────────────────────────────────────────────────

const DATE_RE = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/g

function extractDates(text: string): string[] {
  const matches: string[] = []
  let m: RegExpExecArray | null
  DATE_RE.lastIndex = 0
  while ((m = DATE_RE.exec(text)) !== null) {
    const [, mo, d, y] = m
    const year = y.length === 2 ? (parseInt(y) > 50 ? `19${y}` : `20${y}`) : y
    matches.push(`${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`)
  }
  return matches
}

// ─── Raw text parser (PDF / Word) ────────────────────────────────────────────

export interface RawRow {
  name: string
  start: string
  end: string
  indent: number
  project?: string   // set when the sheet has an explicit Project column
}

export function parseTextToRows(lines: string[]): RawRow[] {
  const rows: RawRow[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.length < 3) continue

    const dates = extractDates(trimmed)
    if (dates.length < 2) continue

    DATE_RE.lastIndex = 0
    const firstDateIdx = trimmed.search(DATE_RE)
    if (firstDateIdx <= 0) continue

    const name = trimmed.slice(0, firstDateIdx).trim().replace(/\s+/g, ' ')
    if (!name || name.length < 2) continue

    rows.push({
      name,
      start: dates[0],
      end: dates[1],
      indent: scoreIndent(line),
    })
  }

  return rows
}

// ─── Hierarchy detection ──────────────────────────────────────────────────────
// Strategy: find the natural indent breakpoints.
// Indent levels: 0 = top group (Cap-X/Remodels), 1 = sub-group (Miller),
//   2 = project/job (3887-248 Avon Park), 3+ = phase/task

function quantiseIndents(rows: RawRow[]): number[] {
  const indents = [...new Set(rows.map(r => r.indent))].sort((a, b) => a - b)
  return rows.map(r => indents.indexOf(r.indent))
}

export function detectProjects(rows: RawRow[], fileName?: string): DetectedProject[] {
  if (rows.length === 0) return []

  const levels = quantiseIndents(rows)
  const maxLevel = Math.max(...levels)

  // Extract filename without extension for use as default project name
  const defaultProjectName = fileName
    ? fileName.replace(/\.[^/.]+$/, '').trim() || 'Imported Schedule'
    : 'Imported Schedule'

  // If rows carry an explicit Project column, split into one project per value.
  if (rows.some(r => r.project)) {
    const groups = new Map<string, RawRow[]>()
    for (const row of rows) {
      const key = (row.project || defaultProjectName).trim()
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(row)
    }

    return [...groups.entries()].map(([name, groupRows]) => {
      const dates = groupRows.flatMap(r => [r.start, r.end]).filter(Boolean).sort()
      return {
        id: crypto.randomUUID(),
        name,
        start_date: dates[0],
        end_date: dates[dates.length - 1],
        phases: groupRows.map(r => ({ name: r.name, start_date: r.start, end_date: r.end, indent: 0 })),
        accepted: true,
        status: 'mobilization',
      }
    }).filter(p => p.phases.length > 0)
  }

  // If everything is the same indent, treat the whole file as one project
  if (maxLevel === 0) {
    const starts = rows.map(r => r.start).sort()
    const ends = rows.map(r => r.end).sort()
    return [{
      id: crypto.randomUUID(),
      name: defaultProjectName,
      start_date: starts[0],
      end_date: ends[ends.length - 1],
      phases: rows.map(r => ({ name: r.name, start_date: r.start, end_date: r.end, indent: 0 })),
      accepted: true,
      status: 'mobilization',
    }]
  }

  // Project boundary = rows at level <= 2 that have children beneath them
  // We treat level 2 rows as project headers (job sites)
  const PROJECT_LEVEL = Math.min(2, maxLevel - 1)

  const projects: DetectedProject[] = []
  let currentProject: DetectedProject | null = null

  for (let i = 0; i < rows.length; i++) {
    const level = levels[i]
    const row = rows[i]

    if (level <= PROJECT_LEVEL) {
      // Save previous project
      if (currentProject && currentProject.phases.length > 0) {
        projects.push(currentProject)
      }
      // Start new project
      currentProject = {
        id: crypto.randomUUID(),
        name: row.name,
        start_date: row.start,
        end_date: row.end,
        phases: [],
        accepted: true,
        status: 'mobilization',
      }
    } else {
      // This is a phase under the current project
      if (!currentProject) {
        currentProject = {
          id: crypto.randomUUID(),
          name: defaultProjectName,
          start_date: row.start,
          end_date: row.end,
          phases: [],
          accepted: true,
          status: 'mobilization',
        }
      }
      currentProject.phases.push({
        name: row.name,
        start_date: row.start,
        end_date: row.end,
        indent: level - PROJECT_LEVEL - 1,
      })
    }
  }

  if (currentProject && currentProject.phases.length > 0) {
    projects.push(currentProject)
  }

  // Filter out projects with no phases and update project dates to encompass all phases
  return projects.filter(p => p.phases.length > 0).map(project => {
    const phaseDates = project.phases.flatMap(ph => [ph.start_date, ph.end_date]).filter(Boolean)
    if (phaseDates.length > 0) {
      const sortedDates = phaseDates.sort()
      return {
        ...project,
        start_date: sortedDates[0],
        end_date: sortedDates[sortedDates.length - 1],
      }
    }
    return project
  })
}

// ─── Table row parser (Excel / CSV) ──────────────────────────────────────────

interface DetectedColumns {
  taskIdx: number
  phaseIdx: number
  genericNameIdx: number
  projectIdx: number
  typeIdx: number
  startIdx: number
  endIdx: number
}

function detectColumns(headers: string[]): DetectedColumns | null {
  const h = headers.map(c => String(c || '').toLowerCase().trim())
  const find = (pred: (c: string) => boolean) => h.findIndex(pred)
  const notCount = (c: string) => !c.includes('count') // avoid "Phase Count" / "Task Count"

  // A dedicated Project/Job/Site column lets us split one sheet into many projects.
  const projectIdx = find(c => notCount(c) && (c === 'project' || c === 'job' || c === 'site' || (c.includes('project') && !c.includes('summary'))))
  const taskIdx = find(c => notCount(c) && c.includes('task'))
  const phaseIdx = find(c => notCount(c) && c.includes('phase'))
  const genericNameIdx = find(c => notCount(c) && (c.includes('name') || c.includes('description') || c.includes('activity') || c === 'item'))
  const startIdx = find(c => c.includes('start') || c.includes('begin') || c.includes('from'))
  const endIdx = find(c => c.includes('end') || c.includes('finish') || c.includes('due') || c.includes('complete'))
  const typeIdx = find(c => c === 'type')

  const hasName = taskIdx !== -1 || phaseIdx !== -1 || genericNameIdx !== -1
  if (!hasName || startIdx === -1 || endIdx === -1) return null
  return { taskIdx, phaseIdx, genericNameIdx, projectIdx, typeIdx, startIdx, endIdx }
}

// Vertical / transposed layout: labels down column A, values in column B
// (e.g. one job per sheet — Location, Store Number, Type, Start Date, End Date).
// Produces a single RawRow whose `project` is the composed project name, so
// detectProjects turns the sheet into one project with one phase.
export function parseVerticalSheet(rows: (string | number | null)[][]): RawRow[] {
  const kv = new Map<string, string | number | null>()
  for (const row of rows) {
    if (!row || row.length < 2) continue
    const key = String(row[0] ?? '').toLowerCase().trim()
    if (!key || kv.has(key)) continue
    kv.set(key, row[1])
  }
  if (kv.size === 0) return []

  // First value whose label matches any of the given substrings.
  const get = (...needles: string[]): string | number | null => {
    for (const needle of needles) {
      for (const [label, value] of kv) {
        if ((label === needle || label.includes(needle)) && value !== null && String(value).trim() !== '') {
          return value
        }
      }
    }
    return null
  }

  const startRaw = get('start date', 'start', 'begin')
  const endRaw = get('end date', 'end', 'finish', 'due')
  if (startRaw === null || endRaw === null) return []

  const { start, end } = resolveDateSpan(startRaw, endRaw)
  if (!start || !end) return []

  const location = get('location', 'site', 'city', 'address')
  const store = get('store number', 'store', 'job number', 'job #')
  const type = get('type', 'scope', 'category')

  const nameParts = [store, location, type]
    .map(v => (v === null ? '' : String(v).trim()))
    .filter(Boolean)
  const project = nameParts.join(' ').trim() || 'Imported Project'
  const phaseName = type !== null && String(type).trim() ? String(type).trim() : 'Schedule'

  return [{ name: phaseName, start, end, indent: 0, project }]
}

export function parseTableRows(rows: (string | number | null)[][]): RawRow[] {
  if (rows.length < 2) return []

  // Find the real header row — scan past any title/metadata preamble until a
  // row both looks like a header (≥3 cells) AND yields recognizable columns.
  let cols: DetectedColumns | null = null
  let headerRowIdx = -1
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    if (rows[i].filter(c => c !== null && c !== '').length < 3) continue
    const candidate = detectColumns(rows[i].map(c => String(c ?? '')))
    if (candidate) { cols = candidate; headerRowIdx = i; break }
  }
  // No horizontal header found — fall back to a vertical key/value layout.
  if (!cols) return parseVerticalSheet(rows)

  const result: RawRow[] = []
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i]

    // Skip project-summary rows (Type === 'Project') so they don't become phases.
    if (cols.typeIdx !== -1) {
      const t = String(row[cols.typeIdx] ?? '').toLowerCase().trim()
      if (t === 'project') continue
    }

    // Phase name: prefer the most specific (Task), then Phase, then a generic name.
    const taskVal = cols.taskIdx !== -1 ? String(row[cols.taskIdx] ?? '').trim() : ''
    const phaseVal = cols.phaseIdx !== -1 ? String(row[cols.phaseIdx] ?? '').trim() : ''
    const genVal = cols.genericNameIdx !== -1 ? String(row[cols.genericNameIdx] ?? '').trim() : ''
    const rawName = taskVal || phaseVal || genVal
    const name = rawName.replace(/\s+/g, ' ').trim()
    if (!name || name.length < 2) continue

    const start = normaliseDate(row[cols.startIdx] as string | number | null)
    const end = normaliseDate(row[cols.endIdx] as string | number | null)
    if (!start || !end) continue

    const project = cols.projectIdx !== -1 ? String(row[cols.projectIdx] ?? '').trim() || undefined : undefined

    const leading = String(rawName).match(/^(\s+)/)
    const indent = leading ? Math.floor(leading[1].length / 2) : 0

    result.push({ name, start, end, indent, project })
  }
  return result
}
