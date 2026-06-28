'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  BarChart2, Bell, BookOpen, Building2, ClipboardList, FolderKanban,
  GanttChartSquare, Layers, LayoutDashboard, LifeBuoy, ListChecks, Mail, Play, Radio, Search,
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
      { heading: '1. Check your board', text: 'Your company starts with a default board. Boards hold projects — open Boards in the sidebar to see yours. Create more boards to separate divisions, clients, or types of work, and choose who sees each one: everyone, specific teams, or just you.' },
      { heading: '2. Add projects', text: 'Use + New Project for one at a time, or Import Schedule on the Projects page to bring in a whole Excel workbook — each tab becomes a project with its phases, and everything lands on your default board.' },
      { heading: '3. Invite your team', text: 'Settings → Members → Invite. Teammates get an email link, set a password, and land in your workspace with the role you chose.' },
      { heading: '4. Work the schedule', text: 'Track day-to-day progress on the Dashboard, adjust dates on the Gantt, and move projects through board columns as jobs progress.' },
    ],
  },
  {
    id: 'my-work',
    icon: ListChecks,
    title: 'My Work',
    summary: 'Everything assigned to you, in one place.',
    href: '/app/my-work',
    hrefLabel: 'Open My Work',
    items: [
      { heading: 'My Tasks', text: 'Every checklist task assigned to you across all projects, with the project and phase it belongs to. Check items off right here, or jump to the project.' },
      { heading: 'My Phases', text: 'Phases where you are the assignee, with their status and finish date, sorted by what is due soonest.' },
      { heading: 'My Punch Items', text: 'Punch-list items assigned to you, with their status. The To do / Done filter applies here too; tap one to open the project\'s Punch List.' },
      { heading: 'Getting assigned', text: 'When someone assigns you a checklist task or punch item, you get a notification in the bell, and it shows up here under My Work.' },
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
      { heading: 'Board settings', text: 'Open a board and click Settings. Owners, admins, and managers can edit the board\'s name, description, and color and manage its columns. Linking teams, the privacy toggle, and deleting the board are owner/admin only (the default board can\'t be deleted; a deleted board\'s projects become unassigned, not deleted).' },
      { heading: 'Field customization', text: 'Boards control which fields appear on project forms. Pick a preset (Construction, Software, General) or choose fields manually — unused fields disappear from New Project forms for that board.' },
      { heading: 'Custom stages', text: 'Boards can define their own project stages, replacing the default construction stages on project forms.' },
      { heading: 'Visibility & privacy', text: 'When you create a board you choose who can see it: Everyone (all members), Specific teams (only the teams you pick), or Just me (private to you, plus owners/admins who always see everything). You can change this anytime under Board settings → Visibility & Privacy — toggle the board private, or link teams. A restricted board and its projects disappear from every page, filter, and report for everyone who lacks access.' },
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
      { heading: 'Links', text: 'Add quick reference links to a project — plan sets, store info, permit portals, spec sheets, anything on the web. They appear as one-tap buttons on the project card (and open in a new tab). Add them in the New/Edit Project form under "Links" with an optional label and the web address.' },
      { heading: 'Kanban & grid views', text: 'The Projects page shows everything as a kanban grouped by status, or a card grid. Drag cards or use the dropdown on a card to change status, and the ⋯ menu on a card to edit, jump to the Gantt, or delete the project. Search by name, client, or location; the grid view adds a status filter. Select a single board in the Board filter and the kanban switches to that board\'s own columns, with drag-and-drop between them.' },
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
      { heading: 'Checklists & comments', text: 'Open a phase\'s Details to manage its checklist: add tasks, check them off, and assign each one to a teammate from the dropdown. Items save instantly and stay put. Each phase also has reminder notes and a comment thread for coordination right where the work is tracked.' },
    ],
  },
  {
    id: 'punch',
    icon: ClipboardList,
    title: 'Punch List',
    summary: 'Photo-first issue tracking and sign-off inside each project.',
    items: [
      { heading: 'Where to find it', text: 'Open any project and select the Punch List tab. Items are grouped by status: Open, In Progress, Needs Review, and Completed, with a filter and a running count on each.' },
      { heading: 'Logging an issue', text: 'Tap New Punch Item, take or upload a photo (required) and write an issue description (required). Optionally add a title, assignee, due date, location, priority, and category/trade. The item starts as Open. Photos are compressed on-device before upload.' },
      { heading: 'Tracking & assigning', text: 'Open an item to change its status or reassign it. Assigning someone notifies them, and the person who logged the item is notified when it is completed. Anyone on the project can add items and upload completion photos — you do not have to be the assignee. Owners and admins can delete.' },
      { heading: 'Completing an item', text: 'Completion requires BOTH a completion photo and a completion description — the item cannot be closed without them. Once saved, the item records who completed it and when, and moves to Completed.' },
      { heading: 'Quick access from the board', text: 'Each project can show a Punch List button right on its board card (with open / done counts) for one-tap access. Toggle it per project in the Details section of the project form. Punch lists are a construction/QA tool, so the option is hidden on General Tasks boards.' },
      { heading: 'Printable report', text: 'Use Export to generate a professional field report: the full punch list, open items only, or completed items only. Each item prints with its number, issue photo, completion photo, descriptions, assignee, status, and sign-off. Use your browser\'s Save as PDF to keep one combined file. (Export follows your plan\'s reporting access.)' },
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
      { heading: 'Navigate', text: 'Zoom by day, week, month, or quarter; jump with the prev/next arrows; "Today" centers on the current date; or set an exact from/to range. Collapse projects you\'re not working on.' },
      { heading: 'Drag to reschedule', text: 'Drag a bar to move a phase, drag its edges to change duration. The drag-mode toggle controls ripple: "Move 1" moves only that phase; "Shift later" pushes every later phase in the project along with it.' },
      { heading: 'Edit in place', text: 'Click a phase to open the edit panel: rename, re-date, change status and percent complete, assign a person or trade, toggle milestone/critical path, recolor, add notes, and comment — without leaving the timeline.' },
      { heading: 'Color modes & printing', text: 'Color bars by phase color (standard), by status (spot blockers instantly), or none (clean grayscale). Printing is a Pro/Business feature: on those plans the Print menu outputs chart or list style, for the current view or all projects.' },
      { heading: 'Board filter', text: 'The Board dropdown above the chart narrows the timeline to one board\'s projects.' },
      { heading: 'On mobile', text: 'On a phone the Gantt opens as a touch-friendly timeline: a frozen phase-name column with scrollable bars — swipe to pan. Zoom Day → Quarter, step the window with the ‹ › arrows, jump to Today, set an exact From/To range with the calendar button, or Collapse/Expand all projects. Toggle to List for a compact rundown, and tap any bar to open a full-screen detail sheet.' },
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
      { heading: 'Supported files', text: 'Excel (.xlsx/.xls), CSV, Word (.docx), plain text, and TSV — up to 10 MB. The importer reads two layouts: a normal table (a header row with a task name plus start/end dates), or a vertical sheet that lists fields down a column (e.g. Location, Store Number, Type, Start Date, End Date) as one job per tab.' },
      { heading: 'Multi-tab workbooks', text: 'Each tab becomes its own project. A tabular tab uses its rows as phases; a vertical one-job-per-tab sheet becomes a project named from its Store Number, Location, and Type with a single phase spanning the dates. Dates without a year assume the current year, rolling the end into next year when it falls before the start. Summary tabs without schedule data are skipped, and duplicates across tabs are collapsed.' },
      { heading: 'Review before import', text: 'You see every detected project and its phases first — uncheck anything you don\'t want, expand to inspect phases, then import.' },
      { heading: 'Board placement', text: 'Before importing, pick the destination board from the dropdown in the review step — it defaults to the board you\'re currently filtered to (or your default board). Projects land on that board with their status mapped to the matching column.' },
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
      { heading: 'Managing them', text: 'Dismiss notifications one at a time or mark everything read in one click. Dismissing a computed alert (overdue/due-soon) now sticks — it won\'t come back on reload, and your choice syncs to the mobile app.' },
      { heading: 'Star to keep', text: 'Star an alert to pin it to the top and keep it around even if you\'d otherwise dismiss it — handy for the one deadline you can\'t let slip. Starred and dismissed states are shared between the web and mobile apps.' },
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
      { heading: 'Reports (paid plans)', text: 'The Reports page is available on the Individual, Pro, and Business plans. Three report types — Projects, Phases, Schedule — with text search, status and priority filters, a board filter, and an "include archived" toggle. On the Free plan the Reports page shows an upgrade prompt. Analytics stays available on every plan.' },
      { heading: 'Export & print', text: 'On any paid plan, any filtered report exports to CSV, and Print opens a clean landscape print sheet (matching the Gantt\'s print style) with a preview before the print dialog. What you filter is what you export.' },
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
      { heading: 'Plans', text: 'Free (1 board, 5 projects, 3 members, 1 team), Individual ($3/mo — all Pro features for a single user: 10 boards, unlimited projects, 1 member), Pro (10 boards, unlimited projects, 25 members, 5 teams), Business, and Enterprise. When you hit a limit, the app tells you which plan removes it.' },
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
      { heading: 'Light & dark mode (paid plans)', text: 'On any paid plan (Individual, Pro, Business) a sun/moon button appears in the top bar — tap it to switch the whole app between light and dark. Your choice is remembered on that device. The toggle is hidden on the Free plan.' },
      { heading: 'Members', text: 'Owners and admins see the full roster and invite new people from Settings → Members.' },
      { heading: 'Account & password', text: 'Sign-up creates your company workspace and requires email confirmation. Passwords currently need at least 8 characters. Tap the eye icon in any password field to reveal what you typed and double-check it. Forgot it? The login page sends a reset link to the email on your account.' },
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
  {
    id: 'dispatch',
    icon: Radio,
    title: 'Dispatch',
    summary: 'Service call tracking, ticketing, and work order management (enabled per organization).',
    href: '/app/dispatch',
    hrefLabel: 'Open Dispatch',
    items: [
      { heading: 'Overview', text: 'Dispatch is a flexible board system for tracking service calls, punch items, maintenance requests, and other division-specific tickets. It is enabled per organization and hidden from organizations that don\'t have it turned on.' },
      { heading: 'Boards', text: 'Each organization can have multiple Dispatch boards — one per division or workflow (e.g. Refrigeration Service, Construction Punch, EMS/Controls). Each board has its own columns, card fields, and vendor list.' },
      { heading: 'Columns', text: 'Columns represent the workflow stages for that board. Example stages for a refrigeration board: New Call → Reviewing → Forwarded to Vendor → Scheduled → Waiting on Parts → In Progress → Completed → Closed.' },
      { heading: 'Cards', text: 'Each card is a service call, ticket, or work order. Kalos service call fields include Store, Urgency, Date Started, SC #, Kalos Job #, ETA/Scheduled, Rack/Circuit/Case, Description, Part Ordered, Who, and Notes. The Kalos Job # field is highlighted in red when blank — assign it as soon as the job number is created.' },
      { heading: 'Activity log', text: 'Every card has a full activity timeline: card created, status changes, field edits, notes added, emails received, vendor replies, and more. Each entry records who did it and when, giving a complete history of the service call.' },
      { heading: 'Vendors', text: 'Assign a vendor to any card, with optional vendor email. Vendor information is stored per organization and can be assigned to cards when forwarding service calls.' },
      { heading: 'Email integration (coming)', text: 'Dispatch is designed to receive service calls from Gmail automatically: parse the store, urgency, SC#, and description from an incoming email, create a card, and track all replies in the same thread. Gmail Thread ID is stored on every card to prevent duplicates.' },
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
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
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

      {/* Support */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600">
              <LifeBuoy size={20} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Still need a hand?</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Can&apos;t find your answer here? Our support team is happy to help.
              </p>
            </div>
          </div>
          <a
            href="mailto:customersupport@phase-forge.com"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            <Mail size={15} /> customersupport@phase-forge.com
          </a>
        </div>
      </div>
    </div>
  )
}
