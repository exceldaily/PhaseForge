// "When did this person last use the site?" as words.
//
// Two sources. last_seen_at is the heartbeat the app sends while someone is
// actually clicking around. last_sign_in_at is Supabase Auth's record of the
// last time they typed their password, which can be weeks older because
// sessions stay signed in. The heartbeat wins whenever there is one.

export interface ActivityRow {
  profileId: string
  lastSeenAt: string | null
  lastPath: string | null
  lastSignInAt: string | null
}

export type ActivityTone = 'now' | 'today' | 'week' | 'stale' | 'never'

export interface ActivityLabel {
  /** "Active now", "12 min ago", "Yesterday, 3:12 PM", "Sep 25". */
  text: string
  tone: ActivityTone
  /** The moment it describes, or null for never. */
  at: string | null
  /** True when only the sign-in date is known, no heartbeat yet. */
  signInOnly: boolean
}

/** How long a heartbeat counts as "right now". The app pings about every four minutes. */
export const ACTIVE_WINDOW_MS = 6 * 60 * 1000

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function clock(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** A moment in the viewer's own time zone, relative to now. */
export function whenLabel(iso: string, now: Date): { text: string; tone: ActivityTone } {
  const d = new Date(iso)
  const ms = now.getTime() - d.getTime()
  if (ms < ACTIVE_WINDOW_MS) return { text: 'Active now', tone: 'now' }
  if (ms < 60 * 60 * 1000) return { text: `${Math.round(ms / 60000)} min ago`, tone: 'today' }
  const days = Math.round((dayStart(now) - dayStart(d)) / 86400000)
  if (days <= 0) return { text: `Today, ${clock(d)}`, tone: 'today' }
  if (days === 1) return { text: `Yesterday, ${clock(d)}`, tone: 'week' }
  if (days < 7) return { text: `${DAYS[d.getDay()]}, ${clock(d)}`, tone: 'week' }
  const year = d.getFullYear() === now.getFullYear() ? '' : `, ${d.getFullYear()}`
  return { text: `${MONTHS[d.getMonth()]} ${d.getDate()}${year}`, tone: 'stale' }
}

export function activityLabel(row: Pick<ActivityRow, 'lastSeenAt' | 'lastSignInAt'> | undefined, now: Date): ActivityLabel {
  if (row?.lastSeenAt) return { ...whenLabel(row.lastSeenAt, now), at: row.lastSeenAt, signInOnly: false }
  if (row?.lastSignInAt) {
    const w = whenLabel(row.lastSignInAt, now)
    // A sign-in is a single moment, not proof they are here now.
    return { text: `Signed in ${w.tone === 'now' ? 'just now' : w.text.replace(/^Today, /, 'today, ').replace(/^Yesterday, /, 'yesterday, ')}`, tone: w.tone === 'now' ? 'today' : w.tone, at: row.lastSignInAt, signInOnly: true }
  }
  return { text: 'Never signed in', tone: 'never', at: null, signInOnly: false }
}

/** The moment to sort by: newest activity first, never last. */
export function activityTime(row: Pick<ActivityRow, 'lastSeenAt' | 'lastSignInAt'> | undefined): number {
  const t = row?.lastSeenAt ?? row?.lastSignInAt
  return t ? new Date(t).getTime() : 0
}

const PAGES: Record<string, string> = {
  dashboard: 'Dashboard', 'my-work': 'My Work', chat: 'Chat', projects: 'Projects', 'change-orders': 'Change Orders',
  dispatch: 'Dispatch', quotes: 'Quotes', boards: 'Boards', gantt: 'Gantt', calendar: 'Calendar', schedules: 'Schedules',
  lodging: 'Lodging', employees: 'Employees', customers: 'Customers', staff: 'Staff', vendors: 'Vendors',
  resources: 'Resources', analytics: 'Analytics', reports: 'Reports', files: 'Files', invoices: 'Invoices',
  settings: 'Settings', organization: 'Organization', notifications: 'Notifications', guide: 'Guide',
  admin: 'Admin Console', teams: 'Teams', calls: 'Calls', billing: 'Billing',
}

/** "/app/projects/abc/plans" to "Projects". Only the section, never the record. */
export function pageName(path: string | null | undefined): string | null {
  if (!path) return null
  const seg = path.split('?')[0].split('/').filter(Boolean)
  if (seg[0] !== 'app' || !seg[1]) return null
  return PAGES[seg[1]] ?? seg[1].replace(/-/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

/** The section of a path, for storing: "/app/projects/abc?x=1" to "/app/projects". No ids, no queries. */
export function sectionPath(path: string | null | undefined): string | null {
  if (!path) return null
  const seg = path.split('?')[0].split('/').filter(Boolean)
  if (seg[0] !== 'app') return null
  return seg[1] ? `/app/${seg[1]}` : '/app'
}
