// What the calendar draws, and the pure math that lays it out: which lane a
// bar sits in across a week, how overlapping timed events share a day column,
// which super and division an item belongs to, and what color it wears.

import { addDaysIso, diffDaysIso, minutesOf } from './dates'

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

/** Divisions are compared without case: REFRIGERATION and Refrigeration are one. */
export const divisionKey = (d: string | null | undefined): string => d?.trim().toLowerCase() ?? ''

/** An item's division: its super's, else the project's trade when that names a division. */
export function resolveDivision(superId: string | null, trade: string | null, supers: CalSuper[]): string | null {
  const own = supers.find((s) => s.id === superId)?.division
  if (own?.trim()) return own.trim()
  const t = divisionKey(trade)
  if (!t) return null
  return supers.find((s) => divisionKey(s.division) === t)?.division?.trim() ?? null
}

export function listDivisions(supers: CalSuper[]): string[] {
  const seen = new Map<string, string>()
  for (const s of supers) if (s.division?.trim() && !seen.has(divisionKey(s.division))) seen.set(divisionKey(s.division), s.division.trim())
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
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
  const order = [...inWeek].sort((a, b) => {
    const as = a.start < weekStart ? weekStart : a.start
    const bs = b.start < weekStart ? weekStart : b.start
    return Number(isTimed(a)) - Number(isTimed(b))
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
    const col = diffDaysIso(weekStart, from)
    const span = diffDaysIso(from, to) + 1
    let lane = 0
    for (;; lane++) {
      const row = taken[lane] ?? (taken[lane] = Array(days).fill(false))
      let free = true
      for (let c = col; c < col + span; c++) if (row[c]) { free = false; break }
      if (free) { for (let c = col; c < col + span; c++) row[c] = true; break }
    }
    segments.push({ item, col, span, lane, startsBefore: item.start < weekStart, endsAfter: item.end > weekEnd })
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
  const shown = new Set(visible.map((s) => s.item.key))
  const more = Array(days).fill(0) as number[]
  for (const s of segments) if (!shown.has(s.item.key)) for (let c = s.col; c < s.col + s.span; c++) more[c]++
  return { visible, more }
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
