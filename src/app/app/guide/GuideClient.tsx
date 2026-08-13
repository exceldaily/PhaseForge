'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  BadgeDollarSign, BarChart2, Bell, BookOpen, Building2, CalendarCheck2, CalendarDays, ClipboardList, Contact, FolderKanban,
  GanttChartSquare, Layers, LayoutDashboard, LifeBuoy, ListChecks, Mail, Map, Play, Radio, Search,
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

const OPERATIONS_SECTIONS: GuideSection[] = [
  {
    id: 'operations',
    icon: Contact,
    title: 'Operations Modules',
    summary: 'Customers, staff, vendors, calls, files, and invoices — enable only what your organization uses.',
    items: [
      { heading: 'Modules', text: 'Owners and admins turn operations modules on or off at Settings → Modules. Disabled modules disappear from the sidebar and their pages become inaccessible, even with a direct link. New organizations start with Projects, Reports, and Files enabled.' },
      { heading: 'Customers → Locations → Assets', text: 'The Customers page is the operations hub: customer accounts, their sites (with store/site numbers, addresses, and access notes), and the equipment at each site (make, model, serial, warranty dates). Everything else — calls, projects, files, invoices — links back through this chain.' },
      { heading: 'Residential customers', text: 'Pick "Residential" as the type when creating a customer and enter their home address — the service location is created automatically in the same step. Addresses everywhere show a map pin that opens Google Maps for directions.' },
      { heading: 'Equipment service history', text: 'Click any asset on the Assets tab to see its full service history: every reading techs recorded, with trade-specific values and attached photos, newest first.' },
      { heading: 'Staff & roles', text: 'The Staff page shows every member with an operations role: Owner, Admin, Dispatcher, Project Manager, Billing, Staff/Technician, or Read Only. Roles control what each person can see and do — e.g. Billing users manage invoices but staff records stay hidden, and technicians only see calls assigned to them. Track divisions, skills, and certifications with expiration warnings.' },
      { heading: 'Vendors', text: 'Subcontractor records with trades, coverage areas, contacts, and insurance/license expiration alerts. Assign vendors to calls and watch compliance dates on the vendor cards.' },
      { heading: 'Files & invoices', text: 'Files is a company-wide library plus attachments linked to customers, calls, projects, and more. Invoices is an invoice-ready workflow: flag completed calls as "Invoice ready", pull them into a draft, add line items, and print to PDF — no payment processing.' },
    ],
  },
]

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
  ...OPERATIONS_SECTIONS,
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
      { heading: 'Columns', text: 'Each board has 3–15 columns. When you create a board, the stages you pick (from a template or your own list) become its columns automatically — a Construction-template board starts with all nine construction stages, not a generic four. Afterwards, open the board and click "Customize columns" to add, rename, recolor, or delete columns directly from the kanban view. You can also mark a column as "done" for completion tracking. Deleting a column moves its projects to the first remaining column.' },
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
      { heading: 'Project detail page', text: 'Click any project for its hub: a progress bar computed from phase completion, meta strip (client, location, dates, PM), and its tabs — Gantt, Tasks, Punch List, Activity, Files, and Plans. The breadcrumb returns you to its board. Managers and up can edit or delete from the ⋯ menu.' },
      { heading: 'Add to board', text: 'Put a project on any board at any time: use "Add to Board" in the ⋯ menu on a project card (or on the project detail page), pick the board and which stage to land in, and confirm. This LINKS the project — it stays on the Projects page exactly as before and also appears as a card on the board, always in sync. The same dialog moves it between stages, switches it to a different board, or removes it from boards. The board card shows whatever fields that board is configured to display.' },
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
    id: 'plans',
    icon: Map,
    title: 'Plans (Construction Drawings)',
    summary: 'A full drawing management system inside every project: upload a whole PDF plan set, navigate sheets instantly, and never build from a superseded drawing.',
    items: [
      { heading: 'Where to find it', text: 'Open any project and select the Plans tab. It opens a dedicated plans area with grid, list, and sheet-navigator views (your choice is remembered).' },
      { heading: 'Uploading plans', text: 'Managers and admins can drag PDFs into Upload — one big multi-sheet set, many individual sheet PDFs at once, or a mix. Multi-sheet sets are split into individual sheets automatically, and each title block is read to detect the sheet number (A1.01), title, discipline, and revision; single-sheet files named like "A1.01 First Floor Plan.pdf" also pull the number and title from the file name. You review and correct everything on one screen before it saves — no typing 40 sheets by hand. Uploading a sheet number that already exists is automatically offered as a new revision, and oversized scanned pages are optimized automatically to fit storage limits.' },
      { heading: 'Finding a drawing fast', text: 'Press / to search. Type a sheet number ("M1.01"), a word from the title ("roof"), a discipline ("electrical"), or even text that appears ON the drawing ("RTU-3") and press Enter to open the first match. Quick filter chips cover disciplines, favorites, recently updated, and revised sheets.' },
      { heading: 'The viewer', text: 'Purpose-built for drawings: pinch or scroll to zoom, drag to pan, double-tap to zoom into a detail, arrow keys or on-screen arrows for previous/next sheet (the neighbors preload so switching is instant). The sidebar groups sheets by discipline; on a phone it becomes a swipe-up drawer and a tap on the drawing hides all controls. PhaseForge remembers roughly where you were looking on each sheet.' },
      { heading: 'Revisions', text: 'Each sheet keeps its full history. The newest upload becomes CURRENT and older ones are marked SUPERSEDED — opening an old revision shows an unmissable orange banner with one tap back to current. Compare any two revisions side by side or as an overlay with an opacity slider to spot what changed. Old revisions are never deleted automatically.' },
      { heading: 'Markups, pins & measure', text: 'Anyone can add personal markups (arrow, cloud, highlight, text, freehand and more); managers can publish shared project markups. Markups are a separate layer — the original PDF is never altered, and you can hide the layer any time. Drop a pin to start a located comment thread with resolve/reopen status. Calibrate a sheet with two points and a known distance to take real measurements.' },
      { heading: 'Downloads & printing', text: 'Select sheets (or just filter) and download as one combined PDF or a ZIP of individual sheets — always the full-quality vector drawings, never screenshots. Create Plan Package builds a professional PDF with a cover sheet and drawing index for emailing or printing. Print opens the crisp PDF in a new tab where your browser handles paper size and orientation.' },
      { heading: 'Field use', text: 'Star your go-to sheets as favorites, use the Recently Viewed rail, and mark critical sheets Available Offline so they still open when jobsite signal drops. A "since your last visit" banner lists new and revised drawings so nobody misses an update.' },
      { heading: 'Managing & deleting drawings', text: 'Every drawing card has a ⋮ menu with Download, Select, Archive/Restore, and (owners/admins) Delete. For many at once: tap Select (or long-press any card) to enter multi-select, use "Select all" to grab everything filtered, then Download, Print, Tag, Archive, or Delete from the floating bar. A sheet can also be deleted from the viewer\'s info panel ("Delete sheet & all revisions"). Deletion removes every revision and its files permanently, so Archive is the safer choice when in doubt.' },
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
    id: 'schedules',
    icon: CalendarDays,
    title: 'Schedules (Weekly Crew)',
    summary: 'Build and send weekly crew schedules — replaces the spreadsheet tabs. Paid plans.',
    href: '/app/schedules',
    hrefLabel: 'Open Schedules',
    items: [
      { heading: 'Departments & teams', text: 'Pick a department (e.g. Refrigeration, Plumbing) from the dropdown, then a team tab under it. "+ Team" adds a superintendent team — give it a new department name to create the department on the spot. Hover the active tab for the delete option (removes that team\'s saved weeks too).' },
      { heading: 'Crew roster', text: 'Each team has its own crew list under the top bar. Type a name to add someone; hover a name to remove them. The roster drives the tap-to-assign chips on every job.' },
      { heading: 'Jobs & the project list', text: '"Add job" creates a blank job block for the week. Faster: keep your recurring projects (name + Job#) in the Projects panel on the left — one click drops a project onto the current team\'s week, and its Job# links to your job site. The panel is per-department and keeps your history; add or delete entries anytime.' },
      { heading: 'Assigning the week', text: 'Tap a name chip on a day to put that person on it, tap again to remove. Press and drag a chip down across days to fill several at once, spreadsheet-style. The "This week" row toggles someone onto all 7 days at once. Everything saves automatically.' },
      { heading: 'Sending it out', text: '"Copy for email" copies the schedule as a formatted table — paste into Gmail or Outlook and you get bordered rows, grey banding, the yellow shift cell, and a clickable Job#. Days with nobody assigned on Sunday, Friday, or Saturday are left out automatically. "Print / PDF" makes a clean paper copy, and "Copy last week" clones the previous week to edit.' },
      { heading: 'Who can edit', text: 'Owners, admins, managers, and dispatchers can edit schedules; everyone else sees a read-only view. Schedules is available on Individual, Pro, and Business plans.' },
    ],
  },
  {
    id: 'calendar-sync',
    icon: CalendarCheck2,
    title: 'Google Calendar Sync',
    summary: 'Two-way sync between project phases and Google Calendar. Paid plans.',
    href: '/app/settings/scheduling',
    hrefLabel: 'Open Scheduling Settings',
    items: [
      { heading: 'Connect', text: 'An owner or admin connects the org\'s Google account under Settings → Scheduling, then picks the target calendar. One connection serves the whole organization — tokens stay encrypted on the server.' },
      { heading: 'Pushing phases', text: 'Sync a phase from its edit panel, or select multiple phases (or the whole project) with the sync bar on the project\'s Gantt view. Projects with auto-sync on push new phases automatically. Events carry the project name, Job#, and address.' },
      { heading: 'Superintendents & colors', text: 'Assign a superintendent to a project and its events take that super\'s color on the calendar. Schedule labels — optional tags like a crew, division, or person — use Google\'s own 11-color palette so what you pick is exactly what shows, and each label can route events to its own calendar or send an invite.' },
      { heading: 'Two-way updates', text: 'Move or resize a PhaseForge event in Google Calendar and the phase\'s dates follow (including recurring series). Non-date edits made in Google are queued for review in Settings → Scheduling instead of silently applied. A daily background sync trues everything up; "Sync now" runs it on demand.' },
      { heading: 'Safety', text: 'PhaseForge only ever touches events it created — your personal and unrelated calendar events are never modified or deleted. Deleting a phase or project removes its calendar events first. Calendar sync is available on Individual, Pro, and Business plans.' },
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
    summary: 'The service-call command center: smart priority queue, kanban, My Work for techs, on-call rotation, and the parts pipeline. Paid plans.',
    href: '/app/dispatch',
    hrefLabel: 'Open Dispatch',
    items: [
      { heading: 'Command Center', text: 'Every open service call, auto-ranked by what needs attention first. Smart section chips slice the queue instantly: New Needs Review, Needs Dispatch Now, No Tech, Missing ETA, Follow-Up, Parts Received, Proposal Approved, Scheduled Today/Tomorrow, Aging, Recently Completed. Sort by smart priority or ETA, search and filter by customer, store, status, urgency, tech, part/proposal status, or date range. Each row shows the tech, ETA, NTE, days open, latest note, and a suggested next action.' },
      { heading: 'ETA row alerts', text: 'Call rows light up red when the ETA is close or blown and yellow when it is one step out (12 and 24 hours by default), with an "Expires in Xh" countdown. Change both thresholds under Manage → Card Fields → ETA row alerts.' },
      { heading: 'Kanban view', text: 'The same calls as workflow lanes: Needs Dispatch → Waiting on Vendor → Waiting on Parts → Ready to Schedule → Scheduled / In Progress → Closed. A call\'s lane is derived automatically from its status, parts, and proposal state.' },
      { heading: 'My Work (for techs)', text: 'Dispatch → My Work shows each tech only the calls assigned to them, phone friendly for the field. On first visit pick your name from the roster (it links automatically when your roster email matches your login). Techs can update status, dates, and notes on their calls right there.' },
      { heading: 'On Call', text: 'Dispatch → On Call runs the rotation: add names in order, set the start date and shift length (weekly, every 2 weeks, or monthly), and the whole year maps itself. The banner always shows who is on call now and who is up next, with week, month, and year views.' },
      { heading: 'Parts & Proposals', text: 'Dispatch → Parts & Proposals is the milestone pipeline: Quote Requested → Proposal Sent → Proposal Approved → Parts Ordered → Parts Received → Ready to Schedule → Scheduled / In Progress → Completed. Stages that owe someone a follow-up light up teal.' },
      { heading: 'Creating a call', text: 'New Call needs just a description and a customer or a store, either one works, so customers without store locations are fine. The Service Call # auto-numbers (SC-1001, SC-1002…) unless you paste the customer\'s own call number. It also captures a tracking link, your internal Job #, urgency or the customer\'s priority level (P1, P2…), dates, an ETA with an optional exact time, assigned tech, equipment, NTE dollar cap, part and proposal status, manager note, and description.' },
      { heading: 'Custom fields', text: 'The Custom Fields section holds extra fillable blanks your org wants on every call card (PO #, gate code, landlord contact). Add or remove them right from the New Call form or under Manage → Card Fields. Built-in optional fields work the same way: managers can remove Rack / Circuit / Case from the form and bring it back anytime. Removing a field keeps values already saved on calls.' },
      { heading: 'Working a call', text: 'Open any call to edit everything inline: status, priority, dates, multi-tech assignment, links, NTE. Add categorized notes (customer, vendor, parts, scheduling…) and see the full activity timeline — every status change, assignment, ETA change, and note, with who and when. A suggested Next Action is computed from the call\'s state; you can override it.' },
      { heading: 'Stores, techs & customers', text: 'Under Manage: your store/site list (numbers, names, map links) and your tech and vendor roster. Customer accounts and their priority scales (P-codes mapped to internal urgency) live on the Dispatch → Customers & Priorities page, and under Manage → Customers.' },
      { heading: 'Who can do what', text: 'Owners, admins, managers, and dispatchers manage everything; changing a Service Call # is admin-only since it re-keys the call\'s identity. Dispatch is available on Individual, Pro, and Business plans.' },
    ],
  },
  {
    id: 'quotes',
    icon: BadgeDollarSign,
    title: 'Quotes',
    summary: 'Tech RFQ forms in, vendor quote inquiries out, replies tracked — sent from each person\'s own Gmail. Paid plans.',
    href: '/app/quotes',
    hrefLabel: 'Open Quotes',
    items: [
      { heading: 'Connect your Gmail', text: 'Quotes send from your own email address, so each teammate connects their own Gmail on the Quotes page (one-time Google sign-in). Your email signature is pulled in automatically and added to the bottom of every quote. Nothing ever sends without you pressing Send.' },
      { heading: 'Intake', text: 'Attach a tech\'s "Projects Forms" RFQ PDF and it becomes a quote request automatically — PO number, trade, tech name, job number, store, and the parts list are all parsed out. If a PDF is a scan without text, paste the form text instead. Every parsed field is editable afterward.' },
      { heading: 'Vendors', text: 'Keep one shared vendor list with name, email, and trade. A Refrigeration quote preselects Refrigeration vendors; use Select all / Deselect all to adjust. Edit or deactivate vendors anytime — inactive vendors stay out of new sends.' },
      { heading: 'Sending', text: 'Each vendor gets a personalized email (their own greeting, your signature) with just the parts and the ask — the job number is the subject line\'s tracking code, and internal details like store, PO, and trade never leak to vendors. Edit the message body before sending if you like.' },
      { heading: 'Replies & completion', text: 'The outreach list tracks each vendor: sent, failed, or replied, with a running "3/5 replied" count. Press "Check for replies" to scan your Gmail for vendor answers. When every vendor has replied, the quote lights up "ready to complete" — Complete & archive moves it out of the active list (reopen anytime).' },
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
