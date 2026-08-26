// Per-page help: which manual sections apply to a route, plus the short
// "what is this button" labels the Help panel pins onto the live page.
//
// Pins are matched by a data-help="<key>" attribute on the real control, not by
// CSS selector, so restyling a page can never silently break its labels. A pin
// whose element is not on screen (wrong plan, wrong role, empty state) is just
// skipped — never render a label for something the user cannot see.
//
// KEEP THIS CURRENT alongside src/lib/help/sections.ts whenever a page gains or
// loses a control worth explaining.

export interface HelpPin {
  /** Matches data-help="…" on the element to label. */
  key: string
  /** Short name for the control, e.g. "Add to board". */
  label: string
  /** One sentence on what it does. */
  text: string
}

export interface PageHelp {
  /** Tested against the pathname; first match wins, so list specific first. */
  match: RegExp
  title: string
  /** Ids from SECTIONS in src/lib/help/sections.ts. */
  sectionIds: string[]
  pins?: HelpPin[]
}

export const PAGE_HELP: PageHelp[] = [
  {
    match: /^\/app\/projects\/[^/]+\/plans\/[^/]+$/,
    title: 'Plan viewer',
    sectionIds: ['plans'],
    pins: [
      { key: 'plan-zoom', label: 'Zoom', text: 'Zoom the sheet, or fit it back to the window. Pinch works on a tablet.' },
      { key: 'plan-markup', label: 'Markups', text: 'Draw, add arrows, clouds, and notes on top of the sheet without changing the original.' },
      { key: 'plan-compare', label: 'Compare', text: 'Overlay this sheet against another revision to see what actually changed.' },
      { key: 'plan-download', label: 'Download', text: 'Save this sheet, or use the sheet list to grab a whole set at once.' },
    ],
  },
  {
    match: /^\/app\/projects\/[^/]+\/plans$/,
    title: 'Plans',
    sectionIds: ['plans'],
    pins: [
      { key: 'plans-upload', label: 'Upload', text: 'Drop in one PDF or twenty. Multi-page sets are split into sheets and named from the title block automatically.' },
      { key: 'plans-select', label: 'Select', text: 'Long press or use the checkbox to pick several sheets, then download or delete them together.' },
      { key: 'plans-filter', label: 'Filter', text: 'Narrow the set by discipline, revision, or sheet number when a package runs long.' },
    ],
  },
  {
    match: /^\/app\/projects\/[^/]+\/change-orders$/,
    title: 'Change orders on this project',
    sectionIds: ['change-orders'],
  },
  {
    match: /^\/app\/projects\/[^/]+\/edit$/,
    title: 'Editing a project',
    sectionIds: ['projects', 'phases'],
  },
  {
    match: /^\/app\/projects\/new$/,
    title: 'New project',
    sectionIds: ['projects', 'phases'],
  },
  {
    match: /^\/app\/projects\/[^/]+$/,
    title: 'Project detail',
    sectionIds: ['projects', 'phases', 'punch', 'plans', 'change-orders'],
    pins: [
      { key: 'project-tabs', label: 'Tabs', text: 'Everything about the job lives here: schedule, plans, punch list, change orders, and files. Swipe the row on a phone.' },
    ],
  },
  {
    match: /^\/app\/projects$/,
    title: 'Projects',
    sectionIds: ['projects', 'import', 'boards'],
    pins: [
      { key: 'projects-new', label: 'New project', text: 'Create one job by hand. It lands on your default board.' },
      { key: 'projects-import', label: 'Import schedule', text: 'Bring in a whole Excel workbook. Each tab becomes a project with its phases.' },
      { key: 'projects-search', label: 'Search and filter', text: 'Filter by status, manager, board, or trade. The trade filter in the top bar narrows this too.' },
      { key: 'projects-menu', label: 'Row menu', text: 'The three dots hold Edit, View Gantt, Add to board, and Delete for that one project.' },
    ],
  },
  {
    match: /^\/app\/boards\/[^/]+\/settings$/,
    title: 'Board settings',
    sectionIds: ['boards'],
  },
  {
    match: /^\/app\/boards\/[^/]+$/,
    title: 'Board',
    sectionIds: ['boards', 'projects'],
    pins: [
      { key: 'board-column-add', label: 'Add column', text: 'Columns are your stages. Add up to fifteen and name them whatever your process calls them.' },
      { key: 'board-settings', label: 'Board settings', text: 'Rename the board, set who can see it, and choose which fields show on the cards.' },
    ],
  },
  {
    match: /^\/app\/boards$/,
    title: 'Boards',
    sectionIds: ['boards'],
  },
  {
    match: /^\/app\/schedules$/,
    title: 'Schedules',
    sectionIds: ['schedules'],
    pins: [
      { key: 'sched-division', label: 'Department', text: 'Switch between departments. Each one has its own teams, project list, and layout.' },
      { key: 'sched-style', label: 'Layout', text: 'Crew grid is one block per job. Startup grid is jobs down, days across, with a shift note per person.' },
      { key: 'sched-week', label: 'Week', text: 'Step through weeks. Copy last week clones the previous one so you only edit what changed.' },
      { key: 'sched-roster', label: 'Crew', text: 'Type a name to add someone. Tap a name to rename or swap them out and every day they are on follows.' },
      { key: 'sched-reorder', label: 'Reorder', text: 'Drag a job by its grip to move it up or down. The order you set is the order it prints and emails in.' },
      { key: 'sched-projects', label: 'Job list', text: 'Your recurring jobs with their numbers. One tap drops a job onto this week.' },
      { key: 'sched-zoom', label: 'Zoom', text: 'Shrink the sheet to fit a wide week on a phone screen.' },
      { key: 'sched-copy', label: 'Copy for email', text: 'Copies the schedule as a formatted table. Paste straight into Gmail or Outlook.' },
    ],
  },
  {
    match: /^\/app\/change-orders\/[^/]+$/,
    title: 'Change order',
    sectionIds: ['change-orders'],
  },
  {
    match: /^\/app\/change-orders$/,
    title: 'Change orders',
    sectionIds: ['change-orders'],
    pins: [
      { key: 'co-new', label: 'New change order', text: 'Start a CO against any project that has CO tracking switched on.' },
      { key: 'co-stage', label: 'Stages', text: 'Drag a CO across the workflow. Who you are waiting on updates with it.' },
      { key: 'co-filter', label: 'Filters', text: 'Narrow by project, stage, or who owns it when the list gets long.' },
    ],
  },
  {
    match: /^\/app\/quotes\/pricing\/[^/]+$/,
    title: 'Pricing a quote',
    sectionIds: ['quote-pricing'],
    pins: [
      { key: 'pricing-markup', label: 'Markup', text: 'The percentage added to every line that has no markup of its own. Change it and the whole sheet re-prices.' },
      { key: 'pricing-add', label: 'Add a line', text: 'Labor, travel, or anything else that belongs on the job, alongside the parts read off the vendor PDF.' },
      { key: 'pricing-status', label: 'Status', text: 'Draft, sent, won, or lost. Lost sheets drop to the bottom of the list instead of cluttering it.' },
      { key: 'pricing-totals', label: 'Totals', text: 'Cost, markup, tax, and the number you give the customer, with the gross margin underneath.' },
    ],
  },
  {
    match: /^\/app\/quotes\/[^/]+$/,
    title: 'Quote',
    sectionIds: ['quotes'],
  },
  {
    match: /^\/app\/quotes$/,
    title: 'Quotes',
    sectionIds: ['quotes', 'quote-pricing'],
    pins: [
      { key: 'quotes-tabs', label: 'Two sections', text: 'Requests sends RFQs out to vendors. Pricing reads the quotes that come back and marks them up.' },
      { key: 'pricing-upload', label: 'Attach vendor quote', text: 'Reads each line item off the vendor PDF as your cost, ready to mark up.' },
      { key: 'quotes-gmail', label: 'Connect Gmail', text: 'Vendor emails send from your own address, so each person connects their own Gmail once.' },
    ],
  },
  {
    match: /^\/app\/gantt$/,
    title: 'Gantt',
    sectionIds: ['gantt', 'phases'],
    pins: [
      { key: 'gantt-zoom', label: 'Time scale', text: 'Day, week, month, or quarter. Wider scales fit more of the job on screen.' },
      { key: 'gantt-print', label: 'Print', text: 'Prints the chart to paper or PDF for a job trailer wall. Paid plans.' },
    ],
  },
  {
    match: /^\/app\/dashboard$/,
    title: 'Dashboard',
    sectionIds: ['dashboard', 'my-work'],
  },
  {
    match: /^\/app\/my-work$/,
    title: 'My Work',
    sectionIds: ['my-work'],
  },
  {
    match: /^\/app\/dispatch/,
    title: 'Dispatch',
    sectionIds: ['dispatch'],
  },
  {
    match: /^\/app\/calls/,
    title: 'Calls',
    sectionIds: ['dispatch', 'operations'],
  },
  {
    match: /^\/app\/customers/,
    title: 'Customers',
    sectionIds: ['operations'],
  },
  { match: /^\/app\/staff/,    title: 'Staff',    sectionIds: ['operations', 'teams'] },
  { match: /^\/app\/vendors/,  title: 'Vendors',  sectionIds: ['operations'] },
  { match: /^\/app\/invoices/, title: 'Invoices', sectionIds: ['operations'] },
  { match: /^\/app\/files/,    title: 'Files',    sectionIds: ['operations'] },
  { match: /^\/app\/teams/,    title: 'Teams',    sectionIds: ['teams'] },
  { match: /^\/app\/resources/, title: 'Resources', sectionIds: ['resources', 'teams'] },
  { match: /^\/app\/reports/,  title: 'Reports',  sectionIds: ['analytics-reports'] },
  { match: /^\/app\/analytics/, title: 'Analytics', sectionIds: ['analytics-reports'] },
  { match: /^\/app\/notifications/, title: 'Notifications', sectionIds: ['notifications'] },
  { match: /^\/app\/organization/,  title: 'Organization', sectionIds: ['organization-billing'] },
  { match: /^\/app\/billing/,       title: 'Billing',      sectionIds: ['organization-billing'] },
  {
    match: /^\/app\/settings\/scheduling$/,
    title: 'Scheduling settings',
    sectionIds: ['calendar-sync', 'schedules'],
  },
  { match: /^\/app\/settings\/members$/, title: 'Members', sectionIds: ['teams', 'organization-billing'] },
  { match: /^\/app\/settings\/modules$/, title: 'Modules', sectionIds: ['operations'] },
  { match: /^\/app\/settings/, title: 'Settings', sectionIds: ['settings-account', 'organization-billing'] },
  { match: /^\/app\/admin/,    title: 'Admin',    sectionIds: ['admin'] },
]

/** The help entry for a pathname, or null when the page has none mapped. */
export function helpForPath(pathname: string): PageHelp | null {
  return PAGE_HELP.find((p) => p.match.test(pathname)) ?? null
}
