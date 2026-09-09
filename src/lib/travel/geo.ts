// Pure travel math and name matching. No I/O, fully tested.
//
// The rule the whole lodging flow leans on: a person needs a bed when the
// job is LODGING_THRESHOLD_MINUTES or more from their front door. Road
// minutes come from a routing service when it answers, and from a
// straight-line estimate when it does not, so the answer is never blank.

export const LODGING_THRESHOLD_MINUTES = 120

/** Straight-line miles between two points. */
export function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.7613
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/**
 * Road-time estimate from straight-line miles. Roads run about 25% longer
 * than the crow flies, and a mixed trip averages roughly 50 mph; both are
 * deliberately conservative so a borderline job reads as "far" rather than
 * "local".
 */
export function estimateDriveMinutes(straightMiles: number): number {
  const roadMiles = straightMiles * 1.25
  return Math.round((roadMiles / 50) * 60)
}

export type TravelSource = 'osrm' | 'estimate' | 'unknown'

export interface GuestTravel {
  name: string
  employeeId: string | null
  minutes: number | null
  miles: number | null
  source: TravelSource
  /** Why it is unknown: no employee match, no home address, no job address. */
  reason?: 'no_employee' | 'no_home' | 'no_job'
}

export interface StayTravel {
  computedAt: string
  jobLat: number | null
  jobLng: number | null
  guests: GuestTravel[]
}

export function needsLodging(t: GuestTravel, threshold = LODGING_THRESHOLD_MINUTES): boolean | null {
  if (t.minutes === null) return null
  return t.minutes >= threshold
}

/** "2h 40m", "45m". */
export function formatDrive(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m ? `${h}h ${m}m` : `${h}h`
}

// ── Name matching ────────────────────────────────────────────────────────────
//
// Schedule rosters use short names ("Jose", "John M", "Chris"). The employee
// list has full names. Matching order, most to least explicit:
//   1. the employee's schedule_name equals the roster name
//   2. the employee's full name equals the roster name
//   3. first name (or a known nickname of it) plus optional last initial,
//      when that narrows it to exactly one person

const NICKNAMES: Record<string, string[]> = {
  nick: ['nicholas'], chris: ['christopher', 'christian'], dom: ['dominic', 'dominick'],
  matt: ['matthew'], billy: ['william'], bill: ['william'], will: ['william'], mike: ['michael'],
  jake: ['jacob'], jon: ['jonathan', 'jonothan'], joe: ['joseph'],
  tom: ['thomas'], tommy: ['thomas'], dan: ['daniel'], danny: ['daniel'], dave: ['david'],
  alex: ['alexander', 'alejandro'], andy: ['andrew'], drew: ['andrew'], rob: ['robert'], bob: ['robert'],
  rick: ['richard'], rich: ['richard'], ed: ['edward', 'eduardo'], eddie: ['edward', 'eduardo'],
  tony: ['anthony'], ben: ['benjamin'], sam: ['samuel'], zach: ['zachary'], greg: ['gregory'],
  max: ['maxwell', 'maximilian'], ray: ['raymond'], pat: ['patrick'], steve: ['steven', 'stephen'],
  jim: ['james'], jimmy: ['james'], ken: ['kenneth'], kenny: ['kenneth'], tim: ['timothy'],
  josh: ['joshua'], nate: ['nathan', 'nathaniel'], ty: ['tyler'], gabe: ['gabriel'],
}

export interface MatchableEmployee {
  id: string
  name: string
  schedule_name: string | null
  superintendent_id?: string | null
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.]/g, '')

function firstAndLast(fullName: string): { first: string; last: string } {
  const parts = norm(fullName).split(' ').filter(Boolean)
  return { first: parts[0] ?? '', last: parts.length > 1 ? parts[parts.length - 1] : '' }
}

/**
 * Find the employee a roster name refers to. Prefers the given team, falls
 * back to the whole company, and returns null when the name is ambiguous
 * rather than guessing.
 */
export function matchEmployee<T extends MatchableEmployee>(
  rosterName: string, employees: T[], teamId?: string | null,
): T | null {
  const target = norm(rosterName)
  if (!target) return null
  const pools = teamId
    ? [employees.filter((e) => e.superintendent_id === teamId), employees]
    : [employees]

  for (const pool of pools) {
    if (!pool.length) continue
    const bySchedule = pool.filter((e) => e.schedule_name && norm(e.schedule_name) === target)
    if (bySchedule.length === 1) return bySchedule[0]
    const byFull = pool.filter((e) => norm(e.name) === target)
    if (byFull.length === 1) return byFull[0]

    const tokens = target.split(' ')
    const first = tokens[0]
    const initial = tokens.length === 2 && tokens[1].length === 1 ? tokens[1] : null
    if (tokens.length > 2 || (tokens.length === 2 && !initial)) continue
    const firsts = new Set([first, ...(NICKNAMES[first] ?? [])])
    const cands = pool.filter((e) => {
      const { first: f, last: l } = firstAndLast(e.name)
      if (!firsts.has(f) && !(NICKNAMES[f] ?? []).includes(first)) return false
      return initial ? l.startsWith(initial) : true
    })
    if (cands.length === 1) return cands[0]
  }
  return null
}

/** Default short name for the schedule: the first name. */
export function defaultScheduleName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName.trim()
}

// ── Job title to something a geocoder can find ───────────────────────────────

/** Store chains that show up in job titles and mean nothing to a geocoder. */
const CHAIN_WORDS = new Set([
  'walmart', 'wm', 'aldi', 'sams', 'sam', 'tj', 'tjs', 'bj', 'bjs', 'publix', 'kroger', 'costco', 'target',
  'lowes', 'depot', 'restaurant', 'cvs', 'walgreens', 'wawa', 'winn', 'dixie', 'dollar', 'general', 'family',
  'store', 'supercenter', 'neighborhood', 'market', 'club', 'condensers', 'racks', 'rack',
])

/**
 * Directory job titles look like "WM 3029 Spring Hill" or "ALDI 0658 Madeira
 * Beach": a chain, a store number, a town. Strip the numbers, the short
 * all-caps codes, and the chain words, and what is left is usually the town.
 */
export function placeFromJobTitle(title: string): string | null {
  const words = title.replace(/[()#,]/g, ' ').split(/\s+/).filter(Boolean)
  const kept = words.filter((w) => {
    if (/\d/.test(w)) return false
    const bare = w.replace(/'s$/i, '')
    if (/^[A-Z&.]{1,5}$/.test(bare)) return false        // WM, ALDI, TJ, BJ's
    if (CHAIN_WORDS.has(bare.toLowerCase())) return false
    return true
  })
  const place = kept.join(' ').trim()
  if (!place || place.length < 3) return null
  return place
}

/**
 * The state most of the company's addresses are in, read off the "..., FL
 * 33708" tail. Used to pin a bare town name to the right state.
 */
export function inferState(addresses: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>()
  for (const a of addresses) {
    const m = a?.match(/,?\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?\s*$/)
    if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
  }
  let best: string | null = null, n = 0
  for (const [k, v] of counts) if (v > n) { best = k; n = v }
  return best
}

// ── Directory paste parsing ──────────────────────────────────────────────────

export interface ParsedEmployeeRow {
  name: string
  address: string | null
  phone: string | null
  email: string | null
  /** Team header this row sat under, if any. */
  team: string | null
}

/**
 * Parse text pasted from a spreadsheet or directory page. Tab-separated
 * columns are read as name, then whichever of address / phone / email each
 * cell looks like. A line with only a name that matches a team (or a team
 * lead's last name) becomes a header: rows under it belong to that team.
 */
export function parseDirectoryPaste(text: string, teamNames: string[]): ParsedEmployeeRow[] {
  const teams = teamNames.map((t) => ({ raw: t, key: norm(t) }))
  const out: ParsedEmployeeRow[] = []
  let currentTeam: string | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/ /g, ' ').trim()
    if (!line) continue
    const cells = (line.includes('\t') ? line.split('\t') : [line]).map((c) => c.trim()).filter(Boolean)
    if (!cells.length) continue
    // Header row from a spreadsheet.
    if (/^(name|employee|full name)$/i.test(cells[0])) continue

    const name = cells[0]
    if (cells.length === 1) {
      const key = norm(name)
      const { first, last } = firstAndLast(name)
      const team = teams.find((t) => t.key === key || (last && t.key === last) || t.key === first)
      if (team) { currentTeam = team.raw; continue }
      out.push({ name, address: null, phone: null, email: null, team: currentTeam })
      continue
    }
    let address: string | null = null, phone: string | null = null, email: string | null = null
    for (const c of cells.slice(1)) {
      if (!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) { email = c.toLowerCase(); continue }
      if (!phone && /^[\d\s().+-]{7,}$/.test(c) && (c.match(/\d/g) ?? []).length >= 7) { phone = c; continue }
      if (!address || c.length > address.length) address = c
    }
    out.push({ name, address, phone, email, team: currentTeam })
  }
  return out
}
