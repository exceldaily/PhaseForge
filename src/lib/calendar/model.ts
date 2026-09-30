// What the calendar draws, and the pure math that lays it out: which lane a
// bar sits in across a week, how overlapping timed events share a day column,
// which super and division an item belongs to, and what color it wears.

import { addDaysIso, diffDaysIso, dowIso, minutesOf } from './dates'

export type CalKind = 'phase' | 'event' | 'deadline'

export interface CalItem {
  /** `${kind}:${id}`, unique across kinds. */
  key: string
  kind: CalKind
  id: string
  title: string
  start: string
  end: string
  /** 'HH:MM'; null on both means all day. Only events carry times. */
  startTime: string | null
  endTime: string | null
  projectId: string | null
  projectName: string | null
  jobNumber: string | null
  /** The job's short tag ("2533") and its name without it ("Gulf Breeze Capx"). */
  jobCode?: string | null
  jobLabel?: string | null
  /** The super whose label it wears: its own, or the job's. */
  superId: string | null
  /** Only when a super was set on this item itself, not inherited from the job. */
  ownSuperId?: string | null
  division: string | null
  /** The item's own color, used when no super label applies. */
  color: string | null
  status?: string | null
  milestone?: boolean
  notes?: string | null
  /** Weekdays (0 = Sunday) switched off for this phase on the Gantt's skip-days setting. */
  skipDays?: number[] | null
  /** Weekdays it is not drawn on, worked out by applyWorkWeek. */
  off?: number[]
}

export interface CalSuper { id: string; name: string; division: string | null; color: string | null }

/* ── Supers, divisions, colors ───────────────────────────────────────────── */

/** Label colors offered for supers. Strong enough to carry white text. */
export const LABEL_COLORS: { hex: string; label: string }[] = [
  { hex: '#d93025', label: 'Red' },
  { hex: '#e8710a', label: 'Orange' },
  { hex: '#b08800', label: 'Gold' },
  { hex: '#188038', label: 'Green' },
  { hex: '#0b8f8f', label: 'Teal' },
  { hex: '#1a73e8', label: 'Blue' },
  { hex: '#4f46e5', label: 'Indigo' },
  { hex: '#8e24aa', label: 'Purple' },
  { hex: '#d81b60', label: 'Pink' },
  { hex: '#5f6368', label: 'Graphite' },
]
export const DEFAULT_ITEM_COLOR = '#4f46e5'

/** For a job with no color of its own: a steady pick from these by its id. */
export const JOB_COLORS = ['#2563eb', '#0d9488', '#c2410c', '#7c3aed', '#be123c', '#15803d', '#a16207', '#0369a1', '#a21caf', '#4d7c0f', '#b91c1c', '#475569']
export function jobColor(projectId: string, own: string | null | undefined): string {
  const c = safeColor(own)
  if (c) return c
  let h = 0
  for (let i = 0; i < projectId.length; i++) h = (h * 31 + projectId.charCodeAt(i)) >>> 0
  return JOB_COLORS[h % JOB_COLORS.length]
}

/**
 * Split a job name into the short tag people know it by and the rest.
 * "2533-1012 Gulf Breeze Capx" is tag 2533, label "Gulf Breeze Capx".
 * The store number on the project wins; otherwise the first 3 to 5 digit
 * number in the name. Notes in brackets are dropped from the label.
 */
export function jobTag(name: string, storeId?: string | null): { code: string | null; label: string } {
  const clean = name.replace(/\([^)]*\)?/g, ' ').replace(/\s+/g, ' ').trim()
  const store = storeId?.trim() || null
  const code = store ?? /(?:^|[^\d])(\d{3,5})(?!\d)/.exec(clean)?.[1] ?? null
  if (!code) return { code: null, label: clean || name.trim() }
  const bare = code.replace(/^0+(?=\d)/, '')
  const hit = new RegExp(`(^|[^\\d])0*${bare}(?:-\\d+)*(?!\\d)`).exec(clean)
  const label = hit
    ? `${clean.slice(0, hit.index + hit[1].length)} ${clean.slice(hit.index + hit[0].length)}`.replace(/\s+/g, ' ').replace(/^[\s&,\-]+|[\s&,\-]+$/g, '').trim()
    : clean
  return { code, label: label || clean }
}

export const safeColor = (hex: string | null | undefined): string | null =>
  hex && /^#[0-9a-f]{6}$/i.test(hex.trim()) ? hex.trim().toLowerCase() : null

/** A super's label color: the one picked for them, else a steady default by position. */
export function superColor(sup: CalSuper, index: number): string {
  return safeColor(sup.color) ?? LABEL_COLORS[index % LABEL_COLORS.length].hex
}

/** White or near-black, whichever reads on this background. */
export function textOn(hex: string): string {
  const c = safeColor(hex) ?? DEFAULT_ITEM_COLOR
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#0f172a' : '#ffffff'
}

/** The hex with an alpha channel, for the pale fill behind a phase bar. */
export const tint = (hex: string, alpha: number): string =>
  `${safeColor(hex) ?? DEFAULT_ITEM_COLOR}${Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0')}`

/**
 * A project's super. The link column wins; failing that, the name typed on
 * the project ("Carlos Betancourt") is matched to a team ("Betancourt").
 */
export function resolveSuper(
  project: { superintendentId: string | null; superintendentText: string | null },
  supers: CalSuper[],
): string | null {
  if (project.superintendentId && supers.some((s) => s.id === project.superintendentId)) return project.superintendentId
  const text = project.superintendentText?.trim().toLowerCase()
  if (!text) return null
  const words = text.split(/[^a-z0-9]+/).filter(Boolean)
  const hit = supers.find((s) => s.name.trim().toLowerCase() === text)
    ?? supers.find((s) => {
      const name = s.name.trim().toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
      return name.length > 0 && name.every((w) => words.includes(w))
    })
  return hit?.id ?? null
}

/**
 * Work that belongs to a division because of what it is, whoever runs the
 * job. Anything EMS is Electrical. Checked against the phase or event name,
 * whole words only, so "items" or "systems" never match.
 */
export const DIVISION_KEYWORDS: { match: RegExp; division: string }[] = [
  { match: /\bems\b/i, division: 'ELECTRICAL' },
]
export function keywordDivision(title: string | null | undefined): string | null {
  if (!title) return null
  return DIVISION_KEYWORDS.find((k) => k.match.test(title))?.division ?? null
}

/** Divisions are compared without case: REFRIGERATION and Refrigeration are one. */
export const divisionKey = (d: string | null | undefined): string => d?.trim().toLowerCase() ?? ''

/**
 * An item's division: what the work is (EMS is Electrical) comes first, then
 * its super's division, then the project's trade when that names a division.
 */
export function resolveDivision(superId: string | null, trade: string | null, supers: CalSuper[], title?: string | null): string | null {
  const byWork = keywordDivision(title)
  if (byWork) return byWork
  const own = supers.find((s) => s.id === superId)?.division
  if (own?.trim()) return own.trim()
  const t = divisionKey(trade)
  if (!t) return null
  return supers.find((s) => divisionKey(s.division) === t)?.division?.trim() ?? null
}

/** Every division to offer: the supers' own, plus any that items carry (Electrical, from EMS work). */
export function listDivisions(supers: CalSuper[], items: { division: string | null }[] = []): string[] {
  const seen = new Map<string, string>()
  for (const d of [...supers.map((s) => s.division), ...items.map((i) => i.division)]) {
    if (d?.trim() && !seen.has(divisionKey(d))) seen.set(divisionKey(d), d.trim())
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

/* ── The work week ───────────────────────────────────────────────────────── */

/** Crews work Monday through Thursday. Friday, Saturday, and Sunday are off by default. */
export const DEFAULT_OFF_DAYS = [5, 6, 0]

/**
 * The weekdays a phase is not drawn on.
 *  1. Skip days set on the phase or its project (the Gantt's setting) win.
 *  2. Otherwise, with the work week on, Friday through Sunday are off,
 *     except a day the phase itself starts or ends on: scheduling a phase
 *     to start Sunday or finish Friday is how it "lists" that day.
 * A phase is never hidden outright: if that would leave it no days at all,
 * every day shows.
 */
export function phaseOffDays(item: { start: string; end: string; skipDays?: number[] | null }, workWeek: boolean): number[] {
  let off: number[]
  if (item.skipDays?.length) off = item.skipDays
  else if (!workWeek) return []
  else {
    const listed = new Set([dowIso(item.start), dowIso(item.end)])
    off = DEFAULT_OFF_DAYS.filter((d) => !listed.has(d))
  }
  const span = Math.min(7, diffDaysIso(item.start, item.end) + 1)
  for (let i = 0; i < span; i++) if (!off.includes(dowIso(addDaysIso(item.start, i)))) return off
  return []
}

/** Stamp each phase with the days it is off. Events and end dates always show as typed. */
export function applyWorkWeek(items: CalItem[], workWeek: boolean): CalItem[] {
  return items.map((i) => {
    if (i.kind !== 'phase') return i
    const off = phaseOffDays(i, workWeek)
    return off.length ? { ...i, off } : i
  })
}

/** Is this item drawn on this day? */
export function coversDay(item: CalItem, date: string): boolean {
  return item.start <= date && item.end >= date && !(item.off?.length && item.off.includes(dowIso(date)))
}

export interface CalFilter {
  /** '' means every division. */
  division: string
  /** Super ids switched off; 'none' switches off items with no super. */
  hiddenSupers: Set<string>
  hiddenKinds: Set<CalKind>
  /** Limit to one project, or null for all. */
  projectId: string | null
}

export function passesFilter(item: CalItem, f: CalFilter): boolean {
  if (f.hiddenKinds.has(item.kind)) return false
  if (f.projectId && item.projectId !== f.projectId) return false
  if (f.division && divisionKey(item.division) !== divisionKey(f.division)) return false
  if (f.hiddenSupers.has(item.superId ?? 'none')) return false
  return true
}

/* ── Month and all-day lanes ─────────────────────────────────────────────── */

export interface WeekSegment {
  /** Unique per bar: a phase with days off has several bars in one week. */
  key: string
  item: CalItem
  /** 0 to 6, Sunday first. */
  col: number
  span: number
  lane: number
  /** The bar started before this week, or runs past it. */
  startsBefore: boolean
  endsAfter: boolean
}

const isTimed = (i: CalItem) => !!i.startTime && i.start === i.end

/**
 * Lay a week out Google style: long bars first so they sit on top and stay
 * on one line, then single days, each in the highest free lane.
 */
export function layoutWeek(items: CalItem[], weekStart: string, days = 7): { segments: WeekSegment[]; lanes: number } {
  const weekEnd = addDaysIso(weekStart, days - 1)
  const inWeek = items.filter((i) => i.start <= weekEnd && i.end >= weekStart)
  const clamp = (i: CalItem) => (i.start < weekStart ? weekStart : i.start)
  // One job's bars sit together: a job takes its place by its earliest bar
  // this week, and the rest of its bars follow it before the next job starts.
  const groupOf = (i: CalItem) => (i.projectId && !isTimed(i) ? `job:${i.projectId}` : `own:${i.key}`)
  const groupStart = new Map<string, string>()
  for (const i of inWeek) {
    const g = groupOf(i)
    const s = clamp(i)
    if (!groupStart.has(g) || s < groupStart.get(g)!) groupStart.set(g, s)
  }
  const order = [...inWeek].sort((a, b) => {
    const as = clamp(a)
    const bs = clamp(b)
    return Number(isTimed(a)) - Number(isTimed(b))
      || groupStart.get(groupOf(a))!.localeCompare(groupStart.get(groupOf(b))!)
      || groupOf(a).localeCompare(groupOf(b))
      || as.localeCompare(bs)
      || diffDaysIso(b.start, b.end) - diffDaysIso(a.start, a.end)
      || (a.startTime ?? '').localeCompare(b.startTime ?? '')
      || a.title.localeCompare(b.title)
      || a.key.localeCompare(b.key)
  })
  const taken: boolean[][] = []
  const segments: WeekSegment[] = []
  for (const item of order) {
    const from = item.start < weekStart ? weekStart : item.start
    const to = item.end > weekEnd ? weekEnd : item.end
    const first = diffDaysIso(weekStart, from)
    const last = diffDaysIso(weekStart, to)
    // Runs of days it is actually on. Days off split the bar in two.
    const runs: [number, number][] = []
    for (let c = first; c <= last; c++) {
      if (item.off?.length && item.off.includes(dowIso(addDaysIso(weekStart, c)))) continue
      const open = runs[runs.length - 1]
      if (open && open[1] === c - 1) open[1] = c
      else runs.push([c, c])
    }
    if (!runs.length) continue
    // All of one item's bars share a lane, so the eye follows it across the gap.
    let lane = 0
    for (;; lane++) {
      const row = taken[lane] ?? (taken[lane] = Array(days).fill(false))
      if (runs.every(([a, b]) => { for (let c = a; c <= b; c++) if (row[c]) return false; return true })) {
        for (const [a, b] of runs) for (let c = a; c <= b; c++) row[c] = true
        break
      }
    }
    for (const [a, b] of runs) {
      segments.push({
        key: `${item.key}@${a}`, item, col: a, span: b - a + 1, lane,
        startsBefore: item.start < addDaysIso(weekStart, a), endsAfter: item.end > addDaysIso(weekStart, b),
      })
    }
  }
  return { segments, lanes: taken.length }
}

/**
 * Fit a week into `maxLanes` rows. When a day has more than fits, its last
 * row becomes "+N more", so a bar in that row is only drawn if every day it
 * crosses has room for it.
 */
export function fitWeek(segments: WeekSegment[], maxLanes: number, days = 7): { visible: WeekSegment[]; more: number[] } {
  const count = Array(days).fill(0) as number[]
  for (const s of segments) for (let c = s.col; c < s.col + s.span; c++) count[c] = Math.max(count[c], s.lane + 1)
  const max = Math.max(1, maxLanes)
  const crowded = count.map((n) => n > max)
  const visible = segments.filter((s) => {
    if (s.lane < max - 1) return true
    if (s.lane > max - 1) return false
    for (let c = s.col; c < s.col + s.span; c++) if (crowded[c]) return false
    return true
  })
  const shown = new Set(visible.map((s) => s.key))
  const more = Array(days).fill(0) as number[]
  for (const s of segments) if (!shown.has(s.key)) for (let c = s.col; c < s.col + s.span; c++) more[c]++
  return { visible, more }
}

/* ── Grouping by job ─────────────────────────────────────────────────────── */

export interface JobGroup {
  /** null gathers everything that is not tied to a job. */
  projectId: string | null
  items: CalItem[]
}

/** Items bucketed by job, jobs in name order, the no-job bucket last. */
export function groupByJob(items: CalItem[]): JobGroup[] {
  const map = new Map<string, JobGroup>()
  for (const i of items) {
    const k = i.projectId ?? ''
    const g = map.get(k) ?? { projectId: i.projectId, items: [] }
    g.items.push(i)
    map.set(k, g)
  }
  const name = (g: JobGroup) => g.items[0]?.jobLabel ?? g.items[0]?.projectName ?? ''
  return [...map.values()].sort((a, b) => Number(a.projectId === null) - Number(b.projectId === null) || name(a).localeCompare(name(b)))
}

/* ── Timed events in a day column ────────────────────────────────────────── */

export interface TimedBox { item: CalItem; startMin: number; endMin: number; col: number; cols: number }

/** Timed single-day events; everything else belongs in the all-day strip. */
export function splitTimed(items: CalItem[]): { timed: CalItem[]; allDay: CalItem[] } {
  return { timed: items.filter(isTimed), allDay: items.filter((i) => !isTimed(i)) }
}

/** Overlapping events split the column side by side, like Google Calendar. */
export function layoutTimed(items: CalItem[]): TimedBox[] {
  const boxes = items.filter(isTimed).map((item) => {
    const startMin = minutesOf(item.startTime!)
    const rawEnd = item.endTime ? minutesOf(item.endTime) : startMin + 60
    return { item, startMin, endMin: Math.min(24 * 60, Math.max(rawEnd, startMin + 30)), col: 0, cols: 1 }
  }).sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin || a.item.key.localeCompare(b.item.key))

  let cluster: TimedBox[] = []
  let clusterEnd = -1
  const close = () => {
    const cols = Math.max(0, ...cluster.map((b) => b.col)) + 1
    for (const b of cluster) b.cols = cols
    cluster = []
  }
  for (const box of boxes) {
    if (cluster.length && box.startMin >= clusterEnd) close()
    const used = new Set(cluster.filter((b) => b.endMin > box.startMin).map((b) => b.col))
    let col = 0
    while (used.has(col)) col++
    box.col = col
    cluster.push(box)
    clusterEnd = Math.max(clusterEnd, box.endMin)
  }
  if (cluster.length) close()
  return boxes
}
