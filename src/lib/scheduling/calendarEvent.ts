// Pure builders for Google Calendar event payloads and SCH label logic.
// No I/O here — everything is unit-testable. The server-side sync actions
// (src/lib/scheduling/google.ts) consume these.

export interface QuickLink { label: string; url: string; kind?: string }

export interface EventSource {
  orgId: string
  projectId: string
  phaseId: string
  connectionId: string
  projectName: string
  phaseName: string
  jobNumber?: string | null
  storeSiteId?: string | null
  client?: string | null
  formattedAddress?: string | null
  mapsUrl?: string | null
  startDate: string   // yyyy-mm-dd (all-day events)
  endDate: string     // yyyy-mm-dd inclusive
  phaseStatus?: string | null
  pmName?: string | null
  superintendentName?: string | null
  schLabelNames?: string[]
  quickLinks?: QuickLink[]
  appBaseUrl: string
  pfRevision: number
  colorId?: string | null
  attendeeEmails?: string[]
  skipDays?: string[]   // RFC-5545 codes, e.g. ['FR','SA','SU']
}

// "[324-10482] Aldi 324 Madeira Beach – Mobilization"
export function buildEventTitle(s: Pick<EventSource, 'jobNumber' | 'projectName' | 'phaseName'>): string {
  const prefix = s.jobNumber?.trim() ? `[${s.jobNumber.trim()}] ` : ''
  return `${prefix}${s.projectName} – ${s.phaseName}`
}

export function buildEventDescription(s: EventSource): string {
  const lines: string[] = []
  const add = (label: string, value?: string | null) => {
    if (value?.trim()) lines.push(`${label}: ${value.trim()}`)
  }
  add('Project', s.projectName)
  add('Job #', s.jobNumber)
  add('Store / Site', s.storeSiteId)
  add('Client', s.client)
  add('Phase', s.phaseName)
  add('Status', s.phaseStatus)
  lines.push(`Dates: ${s.startDate} → ${s.endDate}`)
  add('Project Manager', s.pmName)
  add('Superintendent', s.superintendentName)
  if (s.schLabelNames?.length) lines.push(`SCH: ${s.schLabelNames.join(', ')}`)
  add('Address', s.formattedAddress)
  add('Map', s.mapsUrl)
  lines.push('')
  lines.push(`PhaseForge project: ${s.appBaseUrl}/app/projects/${s.projectId}`)
  lines.push(`PhaseForge phase: ${s.appBaseUrl}/app/projects/${s.projectId}?phase=${s.phaseId}`)
  for (const link of s.quickLinks ?? []) {
    if (link.url?.trim()) lines.push(`${link.label || 'Link'}: ${link.url}`)
  }
  return lines.join('\n')
}

// Google all-day events use an EXCLUSIVE end date — add one day.
export function exclusiveEnd(endDate: string): string {
  const d = new Date(`${endDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// RFC-5545 weekday codes indexed by Date.getUTCDay() (0 = Sunday).
export const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const
export type WeekdayCode = (typeof WEEKDAY_CODES)[number]

// When days are skipped (e.g. FR,SA,SU), the phase becomes a WEEKLY recurring
// one-day event on the remaining days, bounded by the phase end date. Returns
// the adjusted first occurrence + RRULE, or null when nothing is skipped
// (plain spanning event). Throws when the skip set leaves no calendar days.
export function buildRecurrence(startDate: string, endDate: string, skipDays: string[]) {
  const skips = new Set(skipDays.map((d) => d.toUpperCase()))
  if (skips.size === 0) return null

  const included = WEEKDAY_CODES.filter((c) => !skips.has(c))
  if (included.length === 0) {
    throw new Error('Every weekday is skipped — nothing would appear on the calendar')
  }

  // First occurrence must land on an included weekday within the range.
  const cursor = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  while (cursor <= end && skips.has(WEEKDAY_CODES[cursor.getUTCDay()])) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  if (cursor > end) {
    throw new Error('All days in this phase date range are skipped')
  }

  const first = cursor.toISOString().slice(0, 10)
  const until = endDate.replaceAll('-', '')
  return {
    firstDate: first,
    rrule: `RRULE:FREQ=WEEKLY;BYDAY=${included.join(',')};UNTIL=${until}`,
  }
}

// Full Google Calendar API event body. Linked-event identity lives in
// extendedProperties.private — never in the title.
export function buildEventPayload(s: EventSource) {
  const recurrence = buildRecurrence(s.startDate, s.endDate, s.skipDays ?? [])
  return {
    summary: buildEventTitle(s),
    location: s.formattedAddress ?? undefined,
    description: buildEventDescription(s),
    // Recurring mode: one-day event repeating weekly on the included days.
    // Plain mode: single event spanning the whole phase.
    start: { date: recurrence ? recurrence.firstDate : s.startDate },
    end: { date: recurrence ? exclusiveEnd(recurrence.firstDate) : exclusiveEnd(s.endDate) },
    // null (not undefined) when absent so patching a previously-recurring
    // event back to a plain span actually CLEARS the recurrence on Google.
    recurrence: recurrence ? [recurrence.rrule] : null,
    colorId: s.colorId ?? undefined,
    attendees: s.attendeeEmails?.length
      ? s.attendeeEmails.map((email) => ({ email }))
      : undefined,
    extendedProperties: {
      private: {
        pf_org: s.orgId,
        pf_project: s.projectId,
        pf_phase: s.phaseId,
        pf_connection: s.connectionId,
        pf_revision: String(s.pfRevision),
        pf_owner: 'phaseforge',
      },
    },
  }
}

// Google Calendar's 11 fixed event colors (colorId → representative hex).
// Event color on the calendar is driven ONLY by colorId — a chip's arbitrary
// hex must be mapped to the nearest of these.
export const GOOGLE_EVENT_COLORS: Record<string, string> = {
  '1': '#7986CB', // Lavender
  '2': '#33B679', // Sage
  '3': '#8E24AA', // Grape
  '4': '#E67C73', // Flamingo
  '5': '#F6BF26', // Banana
  '6': '#F4511E', // Tangerine
  '7': '#039BE5', // Peacock
  '8': '#616161', // Graphite
  '9': '#3F51B5', // Blueberry
  '10': '#0B8043', // Basil
  '11': '#D50000', // Tomato
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)]
}

// Nearest Google colorId (1–11) to an arbitrary chip hex, by RGB distance.
export function nearestGoogleColorId(hex: string | null | undefined): string | null {
  if (!hex) return null
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  let best = '1', bestDist = Infinity
  for (const [id, ghex] of Object.entries(GOOGLE_EVENT_COLORS)) {
    const g = hexToRgb(ghex)!
    const d = (rgb[0] - g[0]) ** 2 + (rgb[1] - g[1]) ** 2 + (rgb[2] - g[2]) ** 2
    if (d < bestDist) { bestDist = d; best = id }
  }
  return best
}

// When the Superintendent changes: remove only the PREVIOUS superintendent's
// default SCH labels, add the new one's, and preserve every unrelated label.
export function swapSuperintendentLabels(
  currentLabelIds: string[],
  prevSupDefaultIds: string[],
  newSupDefaultIds: string[],
): string[] {
  const prev = new Set(prevSupDefaultIds)
  const kept = currentLabelIds.filter((id) => !prev.has(id))
  const next = new Set(kept)
  for (const id of newSupDefaultIds) next.add(id)
  return [...next]
}

// Only events carrying our private metadata may ever be updated or deleted —
// this is the guard that keeps unrelated calendar events untouchable.
export function isPhaseForgeEvent(event: {
  extendedProperties?: { private?: Record<string, string> }
}): boolean {
  return event.extendedProperties?.private?.pf_owner === 'phaseforge'
}
