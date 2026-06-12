'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  BarChart2, Bell, BookOpen, Building2, FolderKanban,
  GanttChartSquare, Layers, LayoutDashboard, ListChecks, Play, Search,
  ShieldAlert, Upload, UserCircle, UsersRound, X,
} from 'lucide-react'
import { WelcomeTour } from '@/components/onboarding/WelcomeTour'

// ─────────────────────────────────────────────────────────────────────────────
// KEEP THIS GUIDE CURRENT: this page is the product manual. Any change to a
// user-facing feature (new page, new button, changed behavior, new limit)
// MUST be reflected in the SECTIONS below in the same change set.
// ─────────────────────────────────────────────────────────────────────────────

type GuideSection = {
  id: string
  icon: typeof BookOpen
  title: string
  summary: string
  href?: string
  hrefLabel?: string
  items: { heading: string; text: string }[]
}

const SECTIONS: GuideSection[] = [
  {
    id: 'getting-started',
    icon: BookOpen,
    title: 'Getting Started',
    summary: 'The 5-minute path from empty workspace to a working schedule.',
    items: [
      { heading: '1. Check your board', text: 'Your company starts with a default board. Boards hold projects — open Boards in the sidebar to see yours. Create more boards to separate divisions, clients, or types of work.' },
      { heading: '2. Add projects', text: 'Use + New Project for one at a time, or Import Schedule on the Projects page to bring in a whole Excel workbook — each tab becomes a project with its phases, and everything lands on your default board.' },
      { heading: '3. Invite your team', text: 'Settings → Members → Invite. Teammates get an email link, set a password, and land in your workspace with the role you chose.' },
      { heading: '4. Work the schedule', text: 'Track day-to-day progress on the Dashboard, adjust dates on the Gantt, and move projects through board columns as jobs progress.' },
    ],
  },
  {
    id: 'boards',
    icon: Layers,
    title: 'Boards',
    summary: 'Workspaces that group projects, with custom columns, fields, and team visibility.',
    href: '/app/boards',
    hrefLabel: 'Open Boards',
    items: [
      { heading: 'Board kanban', text: 'Open a board to see its projects as cards in columns. Drag cards between columns (manager and up), search by project or customer name, and create a project directly inside any column with its + button.' },
      { heading: 'Columns', text: 'Each board has 3–10 columns (e.g. Queue, Mobilization, In Progress). Open a board and click "Customize columns" to add, rename, recolor, or delete columns directly from the kanban view. You can also mark a column as "done" for completion tracking. Deleting a column moves its projects to the first remaining column.' },
      { heading: 'Board settings', text: 'Admins can edit the board\'s name, description, and color, manage columns, link teams, or delete the board (the default board can\'t be deleted; a deleted board\'s projects become unassigned, not deleted).' },
      { heading: 'Field customization', text: 'Boards control which fields appear on project forms. Pick a preset (Construction, Software, General) or choose fields manually — unused fields disappear from New Project forms for that board.' },
      { heading: 'Custom stages', text: 'Boards can define their own project stages, replacing the default construction stages on project forms.' },
      { heading: 'Team visibility & privacy', text: 'By default a board is visible to all members. Link it to specific teams and only those team members (plus owners/admins) can see the board — and its projects disappear from every page, filter, and report for everyone else.' },
    ],
  },
  {
    id: 'projects',
    icon: FolderKanban,
    title: 'Projects',
    summary: 'The jobs themselves — details, status, priority, and the people running them.',
    href: '/app/projects',
    hrefLabel: 'Open Projects',
    items: [
      { heading: 'Creating & editing', text: 'Projects capture name, client, job location, start/end dates, project manager, superintendent, subcontractors (add as many as needed), permit status (Not Required / Pending / Submitted / Approved / Denied), priority (Low → Critical), notes, color, and board placement. Which fields appear depends on the board\'s field customization.' },
      { heading: 'Kanban & grid views', text: 'The Projects page shows everything as a kanban grouped by status, or a card grid. Drag cards or use the dropdown on a card to change status. Search by name, client, or location; the grid view adds a status filter. Select a single board in the Board filter and the kanban switches to that board\'s own columns, with drag-and-drop between them.' },
      { heading: 'Status stages', text: 'Construction-flavored stages out of the box: Queue → Mobilization → Construction Initiated → 30/60/90% Constructed → Final Punchlist → Closeout → Closed (boards can substitute custom stages).' },
      { heading: 'Project detail page', text: 'Click any project for its hub: a progress bar computed from phase completion, meta strip (client, location, dates, PM), and four tabs — Gantt, Tasks, Activity, and Files. The breadcrumb returns you to its board. Managers and up can edit or delete from the ⋯ menu.' },
      { heading: 'Activity history', text: 'The Activity tab is a timeline of everything that happened on the project — created, phases added/updated/deleted, comments — with who did it and when.' },
      { heading: 'Archiving & Files', text: 'Archived projects are hidden from active views but kept for reports (Reports has an "include archived" toggle). File attachments (contracts, drawings, photos) are coming soon — the tab is a placeholder today.' },
    ],
  },
  {
    id: 'phases',
    icon: ListChecks,
    title: 'Phases (Tasks)',
    summary: 'The scheduled chunks of work inside each project.',
    items: [
      { heading: 'Adding work', text: 'Add phases one at a time on a project\'s Tasks tab, or bulk-add many at once from multi-line text. Drag rows to reorder.' },
      { heading: 'What a phase holds', text: 'Name, start/end dates, status (Not Started, In Progress, Blocked, Completed, Skipped), percent complete, an owner (a team member or a trade), color, and notes. Changing status auto-updates percent complete.' },
      { heading: 'Milestones & critical path', text: 'Flag a phase as a milestone to surface it in the Dashboard\'s Upcoming Milestones card, or mark it critical-path to highlight schedule-driving work.' },
      { heading: 'Checklists & comments', text: 'Each phase has a checklist for sub-items and a comment thread for coordination right where the work is tracked.' },
    ],
  },
  {
    id: 'gantt',
    icon: GanttChartSquare,
    title: 'Gantt Timeline',
    summary: 'Every project and phase on one drag-and-drop schedule.',
    href: '/app/gantt',
    hrefLabel: 'Open Gantt',
    items: [
      { heading: 'Navigate', text: 'Zoom by day, week, month, or quarter; jump with the prev/next arrows; "Today" centers on the current date; "Fit Schedule" zooms to your entire date range; or set an exact from/to range. Collapse projects you\'re not working on.' },
      { heading: 'Drag to reschedule', text: 'Drag a bar to move a phase, drag its edges to change duration. The drag-mode toggle controls ripple: "Move 1" moves only that phase; "Shift later" pushes every later phase in the project along with it.' },
      { heading: 'Edit in place', text: 'Click a phase to open the edit panel: rename, re-date, change status and percent complete, assign a person or trade, toggle milestone/critical path, recolor, add notes, and comment — without leaving the timeline.' },
      { heading: 'Color modes & printing', text: 'Color bars by phase color (standard), by status (spot blockers instantly), or none (clean grayscale). The Print menu outputs chart or list style, for the current view or all projects.' },
      { heading: 'Board filter', text: 'The Board dropdown above the chart narrows the timeline to one board\'s projects.' },
    ],
  },
  {
    id: 'import',
    icon: Upload,
    title: 'Import Schedule',
    summary: 'Turn existing Excel, CSV, or Word schedules into projects in one step.',
    href: '/app/projects',
    hrefLabel: 'Open Projects',
    items: [
      { heading: 'Supported files', text: 'Excel (.xlsx/.xls), CSV, Word (.docx), plain text, and TSV — up to 10 MB. Rows need a task name plus start and end dates.' },
      { heading: 'Multi-tab workbooks', text: 'Each tab becomes its own project named after the tab, with its rows as phases. Summary tabs without schedule data are skipped, and duplicate projects across tabs are collapsed automatically.' },
      { heading: 'Review before import', text: 'You see every detected project and its phases first — uncheck anything you don\'t want, expand to inspect phases, then import.' },
      { heading: 'Board placement', text: 'Imported projects land on your default board with their status mapped to the matching column.' },
    ],
  },
  {
    id: 'dashboard',
    icon: LayoutDashboard,
    title: 'Dashboard',
    summary: 'Your daily briefing: what\'s active, what\'s at risk, and what starts this week.',
    href: '/app/dashboard',
    hrefLabel: 'Open Dashboard',
    items: [
      { heading: 'Summary cards', text: 'Active project count, at-risk count, tasks due this week, and average completion across active jobs with a trend sparkline.' },
      { heading: 'At Risk', text: 'Projects past their finish date or finishing within 7 days, with blocked and overdue phase counts so you know why.' },
      { heading: 'Tasks Due This Week', text: 'Phases starting in the next 7 days, grouped by project with owners — your look-ahead schedule.' },
      { heading: 'Team Capacity & Milestones', text: 'Per-team utilization (members carrying active work) and the next milestone phases with owners and target dates.' },
      { heading: 'Recent Activity', text: 'The latest changes across your projects — who did what, where, and when.' },
      { heading: 'Board filter', text: 'The Board dropdown at the top focuses the entire dashboard on one board. The same filter is on Gantt, Projects, Analytics, Reports, and Resources — your selection stays with you as you move between pages, and filtered views still show the board in the URL when present.' },
    ],
  },
  {
    id: 'notifications',
    icon: Bell,
    title: 'Notifications',
    summary: 'Stay ahead of overdue work without hunting for it.',
    href: '/app/notifications',
    hrefLabel: 'Open Notifications',
    items: [
      { heading: 'The bell', text: 'The bell in the top bar shows your unread count and a quick preview of recent notifications; click through for the full inbox.' },
      { heading: 'What you\'re told about', text: 'Overdue projects, overdue phases, and phases coming due soon — computed automatically from your schedule dates — plus system alerts.' },
      { heading: 'Managing them', text: 'Dismiss notifications one at a time or mark everything read in one click.' },
    ],
  },
  {
    id: 'teams',
    icon: UsersRound,
    title: 'Teams, Invites & Roles',
    summary: 'Who\'s in your workspace, what they can do, and how work is grouped.',
    href: '/app/teams',
    hrefLabel: 'Open Teams',
    items: [
      { heading: 'Inviting people', text: 'Settings → Members → Invite by email with a role (member, manager, or admin). Invitees get a branded email, set their own password, and are signed in automatically.' },
      { heading: 'Roles', text: 'Owner and Admin manage everything including billing and roles. Manager creates boards and projects and runs the work. Member works on what\'s assigned. Viewer is read-only. Admins change roles from the Admin Console, and every change is logged.' },
      { heading: 'Teams', text: 'Create color-coded teams (crews, departments), add members, and link projects. Rename or delete teams anytime — deleting a team only removes the grouping, never the people or projects.' },
      { heading: 'Why link teams', text: 'Team↔project links power the Dashboard\'s Team Capacity card and Resources utilization. Team↔board links restrict who can see a board and its projects.' },
    ],
  },
  {
    id: 'resources',
    icon: UsersRound,
    title: 'Resource Planning',
    summary: 'Per-person workload: who\'s overloaded, who\'s free, and what\'s unassigned.',
    href: '/app/resources',
    hrefLabel: 'Open Resources',
    items: [
      { heading: 'Workload cards', text: 'Each member\'s active, upcoming, and overdue phase counts, a stacked capacity bar, committed days, and their next scheduled phases — see at a glance who has room for more.' },
      { heading: 'Unassigned alert', text: 'Phases with no person or trade assigned are called out so nothing falls through the cracks.' },
      { heading: 'Board filter', text: 'Narrow the whole page to one board\'s workload.' },
    ],
  },
  {
    id: 'analytics-reports',
    icon: BarChart2,
    title: 'Analytics & Reports',
    summary: 'Trends and charts for managing; filterable tables and CSV exports for sharing.',
    href: '/app/analytics',
    hrefLabel: 'Open Analytics',
    items: [
      { heading: 'Analytics', text: 'Completion rate, overdue projects, projects by status and priority, phase status donut, phase health stats, average project/phase durations, and per-member workload charts.' },
      { heading: 'Reports', text: 'Three report types — Projects, Phases, Schedule — with text search, status and priority filters, a board filter, and an "include archived" toggle.' },
      { heading: 'Export & print', text: 'Any filtered report exports to CSV, and Print opens a clean landscape print sheet (matching the Gantt\'s print style) with a preview before the print dialog. What you filter is what you export.' },
    ],
  },
  {
    id: 'organization-billing',
    icon: Building2,
    title: 'Organization & Billing',
    summary: 'Your company at a glance, and the subscription that powers it.',
    href: '/app/organization',
    hrefLabel: 'Open Organization',
    items: [
      { heading: 'Organization page', text: 'Company summary (plan, member/team/project counts), a role-structure breakdown, every team with its members and projects, and the full member roster with emails, titles, and role badges.' },
      { heading: 'Plans', text: 'Free (1 board, 5 projects, 3 members, 1 team), Pro (10 boards, unlimited projects, 25 members, 5 teams), Business, and Enterprise. When you hit a limit, the app tells you which plan removes it.' },
      { heading: 'Billing page', text: 'Three tabs: Plan (current tier and its limits), Usage (your counts against each limit), and Invoices (history with amounts and paid status). Payments run securely through Stripe; a past-due warning appears if a payment fails.' },
    ],
  },
  {
    id: 'settings-account',
    icon: UserCircle,
    title: 'Settings & Your Account',
    summary: 'Your profile, your password, and your company\'s member roster.',
    href: '/app/settings',
    hrefLabel: 'Open Settings',
    items: [
      { heading: 'Profile', text: 'Edit your name and job title; your email and role are shown read-only (only owners/admins change roles).' },
      { heading: 'Members', text: 'Owners and admins see the full roster and invite new people from Settings → Members.' },
      { heading: 'Account & password', text: 'Sign-up creates your company workspace and requires email confirmation. Passwords currently need at least 8 characters. Forgot it? The login page sends a reset link to the email on your account.' },
    ],
  },
  {
    id: 'admin',
    icon: ShieldAlert,
    title: 'Admin Console',
    summary: 'Super-admin tools for managing the whole platform.',
    items: [
      { heading: 'Overview', text: 'Super-admins get an Admin section in the sidebar with platform totals (users, companies, projects) and recent admin actions.' },
      { heading: 'User management', text: 'Search all users, edit names/titles, change roles, move users between companies, deactivate/reactivate accounts, promote or demote super-admins, or permanently delete a user.' },
      { heading: 'Companies & audit', text: 'View every company with member/project counts and change its plan tier. Every admin action lands in the audit log with actor, action, target, and timestamp.' },
    ],
  },
]

export function GuideClient() {
  const [query, setQuery] = useState('')
  const [tourOpen, setTourOpen] = useState(false)

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return SECTIONS
    return SECTIONS.map((section) => {
      const sectionMatches =
        section.title.toLowerCase().includes(q) || section.summary.toLowerCase().includes(q)
      const items = section.items.filter(
        (item) => item.heading.toLowerCase().includes(q) || item.text.toLowerCase().includes(q)
      )
      if (sectionMatches) return section
      if (items.length > 0) return { ...section, items }
      return null
    }).filter((s): s is GuideSection => s !== null)
  }, [q])

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <WelcomeTour open={tourOpen} onClose={() => setTourOpen(false)} />

      {/* Hero */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-600 to-indigo-800 p-8 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Phase Forge Guide</h1>
            <p className="mt-2 max-w-xl text-sm text-indigo-100">
              Everything in the app, explained — from your first board to filtered reports.
              New here? The welcome tour covers the big picture in about a minute.
            </p>
          </div>
          <button
            onClick={() => setTourOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50"
          >
            <Play size={15} /> Take the tour
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the guide... (e.g. import, roles, milestones)"
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Quick nav */}
      {!q && (
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:border-indigo-300 hover:text-indigo-600"
            >
              {section.title}
            </a>
          ))}
        </div>
      )}

      {/* Sections */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-400">
          Nothing in the guide matches &quot;{query}&quot;.
        </div>
      ) : (
        <div className="space-y-6">
          {filtered.map(({ id, icon: Icon, title, summary, href, hrefLabel, items }) => (
            <section key={id} id={id} className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600">
                    <Icon size={20} />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{title}</h2>
                    <p className="mt-0.5 text-sm text-slate-500">{summary}</p>
                  </div>
                </div>
                {href && hrefLabel && (
                  <Link href={href} className="text-xs font-medium text-indigo-600 hover:underline">
                    {hrefLabel} →
                  </Link>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {items.map((item) => (
                  <div key={item.heading} className="rounded-xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-800">{item.heading}</p>
                    <p className="mt-1 text-sm leading-5 text-slate-600">{item.text}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
