// The audit itself: pure logic, no I/O. Routing is injected so tests can run
// every rule deterministically and the server can supply a cached OSRM.
//
// The one rule that matters:
//
//     allowed = estimated drive + tolerance        (tolerance defaults to 45)
//     flag when recorded travel > allowed          (exactly +45 passes)
//
// A long drive is never a flag by itself; only recorded time beyond the
// estimate plus tolerance is. Anything the engine cannot ground in a real
// origin, a real destination, and a real route is UNABLE TO VERIFY. It never
// computes a route it had to make up.

export interface Place { lat: number; lng: number }
export type RouteResult = { minutes: number; miles: number | null; provider: string } | null
export type RouteFn = (a: Place, b: Place) => Promise<RouteResult>

export interface AuditEntry {
  key: string
  workDate: string
  jobNumber: string | null
  isTravel: boolean
  startMs: number
  endMs: number
  hours: number | null
  policyDeductionMinutes: number
  classCode: string | null
}

export interface AuditEmployee {
  kalosId: string | null
  name: string
  excluded: boolean
  /** null when no home address is on file. Never invented. */
  home: Place | null
}

export interface EngineSettings {
  toleranceMinutes: number
  includePolicyDeduction: boolean
}

export type Category =
  | 'excessive_travel' | 'jobsite_transition' | 'missing_travel' | 'unexplained_gap'
  | 'overlap' | 'impossible_transition' | 'unable_to_verify' | 'unmatched_job'

export type TravelType = 'home_to_job' | 'job_to_job' | 'job_to_home' | 'unknown'

export interface EngineFinding {
  key: string
  category: Category
  workDate: string | null
  travelType: TravelType | null
  originLabel: string | null
  destLabel: string | null
  jobNumbers: string[]
  entryKeys: string[]
  recordedMinutes: number | null
  estimatedMinutes: number | null
  allowedMinutes: number | null
  excessMinutes: number | null
  routeProvider: string | null
  summary: string
  assumptions: string[]
  evidence: Record<string, unknown>
}

export interface EngineStats {
  entries: number
  travelEntries: number
  trips: number
  withinAllowance: number
  flagged: number
  unverifiable: number
  suppressedForExclusion: number
}

export const HOME_RESET_GAP_MIN = 240    // gap this long means they went home between
export const MERGE_TRAVEL_GAP_MIN = 15  // travel entries closer than this are one trip
export const MISSING_TRAVEL_GAP_MIN = 15
export const MAX_TRANSITION_GAP_MIN = 360
const GRACE_MS = 5 * 60_000

const min = (ms: number) => Math.round(ms / 60_000)
export const fmtMin = (m: number) => { const h = Math.floor(Math.abs(m) / 60); const r = Math.abs(m) % 60; return `${m < 0 ? '-' : ''}${h ? `${h}h ` : ''}${r}m`.replace(' 0m', '') }
const hhmm = (ms: number, tz = 'America/New_York') =>
  new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(ms))

const BASE_ASSUMPTIONS = [
  'Drive time is a current OSRM road-routing estimate. Historical traffic is not available, so rush hour, closures, and weather are not reflected.',
]

interface Trip {
  entries: AuditEntry[]
  startMs: number
  endMs: number
  /** Union of the entries' time, so overlapping or doubled entries are not counted twice. */
  minutes: number
  deductionMinutes: number
}

function unionMinutes(list: { startMs: number; endMs: number }[]): number {
  const s = [...list].sort((a, b) => a.startMs - b.startMs)
  let total = 0
  let curS = -1, curE = -1
  for (const x of s) {
    if (curE < 0 || x.startMs > curE) { if (curE >= 0) total += curE - curS; curS = x.startMs; curE = x.endMs }
    else curE = Math.max(curE, x.endMs)
  }
  if (curE >= 0) total += curE - curS
  return min(total)
}

function placeLabel(job: string | null): string { return job ? `Job ${job}` : 'Unknown' }

export async function auditEmployee(input: {
  employee: AuditEmployee
  entries: AuditEntry[]
  jobPlaces: ReadonlyMap<string, Place>
  route: RouteFn
  settings: EngineSettings
  timezone?: string
}): Promise<{ findings: EngineFinding[]; stats: EngineStats; unmatchedJobs: string[] }> {
  const { employee, jobPlaces, route, settings } = input
  const tz = input.timezone ?? 'America/New_York'
  const empKey = employee.kalosId ?? `name:${employee.name.toLowerCase()}`
  const findings: EngineFinding[] = []
  const stats: EngineStats = { entries: 0, travelEntries: 0, trips: 0, withinAllowance: 0, flagged: 0, unverifiable: 0, suppressedForExclusion: 0 }
  const unmatched = new Set<string>()

  // Exact repeats of the same record count once.
  const byKey = new Map<string, AuditEntry>()
  for (const e of input.entries) if (!byKey.has(e.key)) byKey.set(e.key, e)
  const entries = [...byKey.values()].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
  stats.entries = entries.length
  stats.travelEntries = entries.filter((e) => e.isTravel).length

  const needPlace = (job: string | null): Place | null => {
    if (!job) return null
    const p = jobPlaces.get(job)
    if (!p) unmatched.add(job)
    return p ?? null
  }

  // ── Overlaps: anything that starts before the latest end so far ──────────
  let latest: AuditEntry | null = null
  for (const e of entries) {
    if (latest && e.startMs < latest.endMs - 60_000) {
      const mins = min(Math.min(latest.endMs, e.endMs) - e.startMs)
      findings.push({
        key: `overlap|${empKey}|${[latest.key, e.key].sort().join('~')}`,
        category: 'overlap', workDate: e.workDate, travelType: null, originLabel: null, destLabel: null,
        jobNumbers: [latest.jobNumber, e.jobNumber].filter((x): x is string => !!x), entryKeys: [latest.key, e.key],
        recordedMinutes: mins, estimatedMinutes: null, allowedMinutes: null, excessMinutes: null, routeProvider: null,
        summary: `Entries overlap by ${fmtMin(mins)}: ${hhmm(latest.startMs, tz)}-${hhmm(latest.endMs, tz)} and ${hhmm(e.startMs, tz)}-${hhmm(e.endMs, tz)}.`,
        assumptions: [], evidence: { a: latest.key, b: e.key },
      })
    }
    if (!latest || e.endMs > latest.endMs) latest = e
  }

  // ── Trips: contiguous travel entries are one trip ────────────────────────
  const trips: Trip[] = []
  let open: AuditEntry[] = []
  const flush = () => {
    if (!open.length) return
    trips.push({
      entries: open, startMs: open[0].startMs, endMs: Math.max(...open.map((x) => x.endMs)),
      minutes: unionMinutes(open), deductionMinutes: Math.max(...open.map((x) => x.policyDeductionMinutes)),
    })
    open = []
  }
  for (const e of entries) {
    if (e.isTravel) {
      const last = open[open.length - 1]
      if (last && e.startMs - Math.max(...open.map((x) => x.endMs)) > MERGE_TRAVEL_GAP_MIN * 60_000) flush()
      open.push(e)
    } else flush()
  }
  flush()
  stats.trips = trips.length

  const work = entries.filter((e) => !e.isTravel)

  for (const trip of trips) {
    const prev = [...work].reverse().find((w) => w.endMs <= trip.startMs + GRACE_MS && trip.startMs - w.endMs <= HOME_RESET_GAP_MIN * 60_000) ?? null
    const next = work.find((w) => w.startMs >= trip.endMs - GRACE_MS && w.startMs - trip.endMs <= HOME_RESET_GAP_MIN * 60_000) ?? null
    const cardJob = trip.entries.map((x) => x.jobNumber).find((j): j is string => !!j) ?? null
    const first = trip.entries[0]
    const base = {
      workDate: first.workDate, entryKeys: trip.entries.map((x) => x.key),
      jobNumbers: [...new Set([prev?.jobNumber, next?.jobNumber, cardJob].filter((x): x is string => !!x))],
    }
    const key = `trip|${empKey}|${trip.entries.map((x) => x.key).join('~')}`
    const recorded = trip.minutes + (settings.includePolicyDeduction ? trip.deductionMinutes : 0)
    const assumptions = [...BASE_ASSUMPTIONS]
    if (trip.deductionMinutes) {
      assumptions.push(settings.includePolicyDeduction
        ? `Kalos deducted ${trip.deductionMinutes} min under its travel policy; that time was added back for this comparison.`
        : `Kalos deducted ${trip.deductionMinutes} min under its travel policy; the paid duration shown on the timesheet was compared.`)
    }

    // Who went where. Neighbours in the same work chain decide; the job on the
    // travel card only fills a missing end, and a missing end that is not a job
    // is the technician's home.
    let originJob: string | null = null, destJob: string | null = null
    let originHome = false, destHome = false
    let travelType: TravelType = 'unknown'
    if (prev && next) {
      originJob = prev.jobNumber; destJob = next.jobNumber
      travelType = 'job_to_job'
      assumptions.push(`Origin inferred from the work entry ending at ${hhmm(prev.endMs, tz)}; destination from the entry starting at ${hhmm(next.startMs, tz)}.`)
    } else if (prev && !next) {
      originJob = prev.jobNumber
      if (cardJob && cardJob !== prev.jobNumber) { destJob = cardJob; travelType = 'job_to_job' }
      else { destHome = true; travelType = 'job_to_home' }
      assumptions.push(`Origin inferred from the work entry ending at ${hhmm(prev.endMs, tz)}.`)
    } else if (!prev && next) {
      originHome = true; destJob = next.jobNumber; travelType = 'home_to_job'
      assumptions.push('No work entry shortly before this travel, so the trip is assumed to start at the technician\'s home address on file.')
    } else if (cardJob) {
      originHome = true; destJob = cardJob; travelType = 'home_to_job'
      assumptions.push('No neighbouring work entries; assumed home to the job number on the travel entry.')
    }

    const unable = (reason: string, extra: Partial<EngineFinding> = {}) => {
      stats.unverifiable++
      findings.push({
        key: `unable|${key}`, category: 'unable_to_verify', travelType,
        originLabel: originHome ? 'Home' : originJob ? placeLabel(originJob) : null,
        destLabel: destHome ? 'Home' : destJob ? placeLabel(destJob) : null,
        recordedMinutes: recorded, estimatedMinutes: null, allowedMinutes: null, excessMinutes: null, routeProvider: null,
        summary: `UNABLE TO VERIFY ${fmtMin(recorded)} of travel: ${reason}`, assumptions, evidence: { reason },
        ...base, ...extra,
      })
    }

    if (!originHome && !originJob || !destHome && !destJob) { unable('the origin or destination could not be established from the timesheet.'); continue }
    if (!originHome && !destHome && originJob === destJob) { unable(`start and end are both Job ${originJob}, so there is no drive to compare (supply house run or on-site move).`); continue }
    if (originHome && destHome) { unable('both ends resolve to home.'); continue }

    const a = originHome ? employee.home : needPlace(originJob)
    const b = destHome ? employee.home : needPlace(destJob)
    if (!a || !b) {
      const who = [!a && (originHome ? 'technician home' : `Job ${originJob}`), !b && (destHome ? 'technician home' : `Job ${destJob}`)].filter(Boolean).join(' and ')
      unable(`no address on file for ${who}.`)
      continue
    }

    const r = await route(a, b)
    if (!r) { unable('the routing service did not return a drive time. Re-run the audit to retry.'); continue }

    const est = r.minutes
    const allowed = est + settings.toleranceMinutes
    const excess = recorded - est
    const originLabel = originHome ? 'Home' : placeLabel(originJob)
    const destLabel = destHome ? 'Home' : placeLabel(destJob)

    if (recorded > allowed) {
      if (employee.excluded) { stats.suppressedForExclusion++; continue }
      stats.flagged++
      const category: Category = travelType === 'job_to_job' ? 'jobsite_transition' : 'excessive_travel'
      findings.push({
        key, category, travelType, originLabel, destLabel, ...base,
        recordedMinutes: recorded, estimatedMinutes: est, allowedMinutes: allowed, excessMinutes: excess, routeProvider: r.provider,
        summary: `${originLabel} to ${destLabel}: recorded ${fmtMin(recorded)}, estimated drive ${fmtMin(est)}, allowed ${fmtMin(allowed)}. ${fmtMin(excess)} over the estimate (${fmtMin(recorded - allowed)} past the allowance).`,
        assumptions, evidence: { miles: r.miles, entries: trip.entries.map((x) => ({ key: x.key, job: x.jobNumber, start: hhmm(x.startMs, tz), end: hhmm(x.endMs, tz), hours: x.hours })) },
      })
    } else stats.withinAllowance++
  }

  // ── Between consecutive jobs: missing travel, unexplained time, impossible ──
  for (let i = 0; i + 1 < work.length; i++) {
    const A = work[i], B = work[i + 1]
    if (!A.jobNumber || !B.jobNumber || A.jobNumber === B.jobNumber) continue
    const gap = min(B.startMs - A.endMs)
    if (gap <= 0 || gap > MAX_TRANSITION_GAP_MIN) continue
    const between = trips.filter((t) => t.startMs >= A.endMs - GRACE_MS && t.endMs <= B.startMs + GRACE_MS)
    const recorded = between.reduce((s, t) => s + t.minutes, 0)
    const pa = jobPlaces.get(A.jobNumber), pb = jobPlaces.get(B.jobNumber)
    if (!pa) unmatched.add(A.jobNumber)
    if (!pb) unmatched.add(B.jobNumber)
    const est = pa && pb ? await route(pa, pb) : null
    const common = {
      workDate: A.workDate, travelType: 'job_to_job' as const, originLabel: placeLabel(A.jobNumber), destLabel: placeLabel(B.jobNumber),
      jobNumbers: [A.jobNumber, B.jobNumber], routeProvider: est?.provider ?? null, assumptions: [...BASE_ASSUMPTIONS],
      evidence: { gapMinutes: gap, recordedTravelMinutes: recorded, from: A.key, to: B.key },
    }
    const pairKey = `${empKey}|${A.key}>${B.key}`
    const impossible = recorded === 0 && !!est && gap + settings.toleranceMinutes < est.minutes
    // An impossible transition already says travel is missing; one finding, not two.
    if (recorded === 0 && gap >= MISSING_TRAVEL_GAP_MIN && !impossible) {
      findings.push({
        ...common, key: `missing|${pairKey}`, category: 'missing_travel', entryKeys: [A.key, B.key],
        recordedMinutes: 0, estimatedMinutes: est?.minutes ?? null, allowedMinutes: null, excessMinutes: null,
        summary: `No travel entry between Job ${A.jobNumber} (ended ${hhmm(A.endMs, tz)}) and Job ${B.jobNumber} (started ${hhmm(B.startMs, tz)}): ${fmtMin(gap)} gap${est ? `, estimated drive ${fmtMin(est.minutes)}` : ''}.`,
      })
    }
    if (impossible && est) {
      findings.push({
        ...common, key: `impossible|${pairKey}`, category: 'impossible_transition', entryKeys: [A.key, B.key],
        recordedMinutes: 0, estimatedMinutes: est.minutes, allowedMinutes: gap + settings.toleranceMinutes, excessMinutes: est.minutes - gap,
        summary: `Job ${B.jobNumber} starts ${fmtMin(gap)} after Job ${A.jobNumber} ends, but the drive alone is about ${fmtMin(est.minutes)}.`,
      })
    }
    if (recorded > 0 && gap - recorded > settings.toleranceMinutes) {
      findings.push({
        ...common, key: `gap|${pairKey}`, category: 'unexplained_gap', entryKeys: [A.key, B.key, ...between.flatMap((t) => t.entries.map((x) => x.key))],
        recordedMinutes: recorded, estimatedMinutes: est?.minutes ?? null, allowedMinutes: null, excessMinutes: gap - recorded,
        summary: `${fmtMin(gap - recorded)} between Job ${A.jobNumber} and Job ${B.jobNumber} is not covered by a work or travel entry (gap ${fmtMin(gap)}, travel ${fmtMin(recorded)}).`,
      })
    }
  }

  return { findings, stats, unmatchedJobs: [...unmatched] }
}
