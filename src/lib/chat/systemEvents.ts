// System cards posted into chat by the rest of the app. Pure, tested: the
// shapes, the plain-text version of each card, and the day grouping the
// schedule card uses.

export interface CoEvent {
  type: 'change_order'
  action: 'created' | 'stage'
  coId: string
  label: string
  title: string
  from?: string | null
  to: string
  amount?: number | null
}

export interface BoardMoveEvent {
  type: 'board_move'
  projectName: string
  board: string | null
  from: string | null
  to: string | null
}

export interface ScheduleDay { date: string; names: string[] }
export interface ScheduleJobCard { title: string; jobNumber: string | null; url: string | null; days: ScheduleDay[] }

export interface ScheduleEvent {
  type: 'schedule'
  team: string
  department: string | null
  weekStart: string
  jobs: ScheduleJobCard[]
  /** True when a card for this team and week was posted before. */
  updated?: boolean
}

export type ChatEvent = CoEvent | BoardMoveEvent | ScheduleEvent

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function mmdd(iso: string) { return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` }
function dayName(iso: string) { return DAY[new Date(`${iso}T12:00:00Z`).getUTCDay()] }
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

/** Consecutive days with the same crew collapse into one line. */
export function groupDays(days: ScheduleDay[]): { from: string; to: string; names: string[] }[] {
  const sorted = days.filter((d) => d.names.length).sort((a, b) => a.date.localeCompare(b.date))
  const out: { from: string; to: string; names: string[] }[] = []
  for (const d of sorted) {
    const last = out.at(-1)
    const key = [...d.names].sort().join('|')
    const next = last ? new Date(`${last.to}T12:00:00Z`) : null
    if (next) next.setUTCDate(next.getUTCDate() + 1)
    if (last && [...last.names].sort().join('|') === key && next && next.toISOString().slice(0, 10) === d.date) last.to = d.date
    else out.push({ from: d.date, to: d.date, names: d.names })
  }
  return out
}

export function dayRangeLabel(from: string, to: string): string {
  return from === to ? `${dayName(from)} ${mmdd(from)}` : `${dayName(from)} ${mmdd(from)} to ${dayName(to)} ${mmdd(to)}`
}

/** "Title Case" for a department like REFRIGERATION. */
export function departmentLabel(dept: string | null | undefined): string | null {
  const d = dept?.trim()
  if (!d) return null
  return d.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase())
}

/** The plain-text version of a card: previews, notifications, search. */
export function eventText(e: ChatEvent): string {
  if (e.type === 'change_order') {
    const amt = e.amount != null ? ` (${money(e.amount)})` : ''
    return e.action === 'created'
      ? `${e.label} opened: ${e.title}${amt}`
      : `${e.label} ${e.title}: ${e.from ? `${e.from} to ` : ''}${e.to}${amt}`
  }
  if (e.type === 'board_move') {
    if (!e.to) return `${e.projectName} taken off ${e.board ?? 'its board'}`
    return e.from
      ? `${e.projectName} moved from ${e.from} to ${e.to}${e.board ? ` on ${e.board}` : ''}`
      : `${e.projectName} placed in ${e.to}${e.board ? ` on ${e.board}` : ''}`
  }
  const lines = [`${e.updated ? 'Updated schedule' : 'Schedule'}: ${e.team}${e.department ? ` (${departmentLabel(e.department)})` : ''}, week of ${mmdd(e.weekStart)}`]
  for (const j of e.jobs) {
    lines.push(`${j.title}${j.jobNumber ? ` (Job# ${j.jobNumber})` : ''}`)
    for (const g of groupDays(j.days)) lines.push(`  ${dayRangeLabel(g.from, g.to)}: ${g.names.join(', ')}`)
  }
  return lines.join('\n')
}
