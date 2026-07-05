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

// Full Google Calendar API event body. Linked-event identity lives in
// extendedProperties.private — never in the title.
export function buildEventPayload(s: EventSource) {
  return {
    summary: buildEventTitle(s),
    location: s.formattedAddress ?? undefined,
    description: buildEventDescription(s),
    start: { date: s.startDate },
    end: { date: exclusiveEnd(s.endDate) },
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
