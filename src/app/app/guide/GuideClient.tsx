'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  BarChart2, BookOpen, Building2, CreditCard, FileText, FolderKanban,
  GanttChartSquare, Layers, LayoutDashboard, Play, Search, Settings,
  Upload, UsersRound, X,
} from 'lucide-react'
import { WelcomeTour } from '@/components/onboarding/WelcomeTour'
import { cn } from '@/lib/utils'

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
      { heading: '1. Check your board', text: 'Your company starts with a default board (yours is Refrigeration). Boards hold projects — open Boards in the sidebar to see it. Create more boards to separate divisions, clients, or types of work.' },
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
      { heading: 'Columns', text: 'Each board has 3–10 columns (Queue, Mobilization, In Progress...) that projects move through. Edit them in the board\'s settings — rename, recolor, reorder, or mark a column as "done".' },
      { heading: 'Field customization', text: 'Boards control which fields appear on project forms. Pick a preset (Construction, Software, General) or choose fields manually — unused fields disappear from New Project forms for that board.' },
      { heading: 'Custom stages', text: 'Boards can define their own project stages, replacing the default construction stages on project forms.' },
      { heading: 'Team visibility', text: 'By default a board is visible to all members. Link it to specific teams and only those team members (plus owners/admins) can see the board — and its projects vanish from every page for everyone else.' },
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
      { heading: 'Creating', text: 'New Project asks for name, client, location, dates, PM, superintendent, subcontractors, permit status, and priority. Which fields appear depends on the board\'s field customization.' },
      { heading: 'Kanban & grid views', text: 'The Projects page shows everything as a kanban board grouped by status, or a card grid. Drag cards between columns to update status, or use the dropdown on each card.' },
      { heading: 'Status stages', text: 'Construction-flavored stages out of the box: Queue → Mobilization → Construction Initiated → 30/60/90% → Final Punchlist → Closeout → Closed.' },
      { heading: 'Detail page', text: 'Click any project for its full picture: phases, comments, activity history, and editing. The breadcrumb takes you back to its board.' },
    ],
  },
  {
    id: 'phases',
    icon: GanttChartSquare,
    title: 'Phases & Gantt',
    summary: 'Break projects into scheduled work and manage it on a drag-and-drop timeline.',
    href: '/app/gantt',
    hrefLabel: 'Open Gantt',
    items: [
      { heading: 'Phases', text: 'Each phase has dates, a status (Not Started, In Progress, Blocked, Completed, Skipped), and an owner — assign a team member or a trade. Mark key phases as milestones to surface them on the Dashboard.' },
      { heading: 'Drag to reschedule', text: 'On the Gantt, drag a bar to move a phase, drag its edges to change duration. Shift mode moves an entire project\'s phases together.' },
      { heading: 'Zoom & color', text: 'Switch between day, week, and month zoom. Color bars by project or by status to spot blockers at a glance.' },
      { heading: 'Editing', text: 'Click a phase to open the edit panel — rename, re-date, reassign, or change status without leaving the timeline.' },
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
      { heading: 'Board filter', text: 'The Board dropdown at the top focuses the entire dashboard on one board. The same filter is on Gantt, Projects, Analytics, Reports, and Resources — your selection lives in the URL, so you can bookmark a filtered view.' },
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
      { heading: 'Inviting people', text: 'Settings → Members → Invite by email. Invitees get a branded email, set their own password, and are signed in automatically.' },
      { heading: 'Roles', text: 'Owner and Admin manage everything including billing and roles. Manager creates boards and projects. Member works on assigned items. Viewer is read-only. Admins change roles from the Admin Console, and every change is logged.' },
      { heading: 'Teams', text: 'Group members into teams (crews, departments) and link teams to projects. Team Capacity on the Dashboard and Resources use these links to show utilization.' },
      { heading: 'Board access', text: 'Linking teams to a board restricts it — only those teams see the board and its projects anywhere in the app.' },
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
      { heading: 'Workload cards', text: 'Each member\'s active, upcoming, and overdue phases, plus committed days — see at a glance who has room for more.' },
      { heading: 'Unassigned alert', text: 'Phases with no person or trade assigned are called out so nothing falls through the cracks.' },
      { heading: 'Next up', text: 'Each card lists the member\'s next scheduled phases with start dates.' },
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
      { heading: 'Analytics', text: 'Completion rate, overdue projects, status and priority breakdowns, phase health, average durations, and team workload charts.' },
      { heading: 'Reports', text: 'Three report types — Projects, Phases, Schedule — with search, status/priority filters, and an archived toggle.' },
      { heading: 'Export & print', text: 'Any filtered report exports to CSV or prints cleanly. What you filter is what you export.' },
    ],
  },
  {
    id: 'settings-admin',
    icon: Settings,
    title: 'Settings, Organization & Billing',
    summary: 'Profile, company info, member management, and your subscription.',
    href: '/app/settings',
    hrefLabel: 'Open Settings',
    items: [
      { heading: 'Settings', text: 'Your profile (name, title, avatar) and Members management — invite, deactivate, and review your roster.' },
      { heading: 'Organization', text: 'Company-level details and configuration.' },
      { heading: 'Billing', text: 'Your current plan, usage against plan limits, and upgrades — handled securely through Stripe.' },
      { heading: 'Admin Console', text: 'Super-admins get an extra Admin section for user management (including role changes), company oversight, and the activity log.' },
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
