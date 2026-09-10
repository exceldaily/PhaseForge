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
    title: 'Project hub',
    sectionIds: ['project-hub', 'command-center', 'projects', 'phases', 'punch', 'plans', 'change-orders'],
    pins: [
      { key: 'project-hub', label: 'Tiles', text: 'One box per part of the job with a live preview. Click a box to open that section; Hub in the strip brings you back.' },
      { key: 'hub-schedule', label: 'Schedule', text: 'A small timeline of the phases with today marked. Click it for the full Gantt.' },
      { key: 'hub-health', label: 'Command Center', text: 'Health score and the top things needing eyes, with the full breakdown one click away.' },
      { key: 'hub-chat', label: 'Job chat', text: 'The chat space for this job, with the last few messages. Opens the Chat section right here on the project.' },
      { key: 'hub-details', label: 'Project details', text: 'Every field on the project in one list: customer, job number, address with a map link, dates, people, permit, tags, and notes.' },
      { key: 'project-tabs', label: 'Sections', text: 'Once you are inside a section, this strip switches between them. Hub is the first one.' },
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
      { key: 'board-density', label: 'Card size', text: 'Compact, Standard, or Detailed cards. Your pick is remembered.' },
      { key: 'board-sort', label: 'Sort', text: 'How cards order inside each column. Smart Priority puts the project that needs eyes first on top.' },
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
    match: /^\/app\/chat/,
    title: 'Chat',
    sectionIds: ['chat'],
    pins: [
      { key: 'chat-spaces', label: 'Spaces', text: 'General and Project updates for the whole company, one space per trade, one per project, and direct messages. The + next to a group starts a new one.' },
      { key: 'chat-my-trades', label: 'My trades', text: 'Pick the trades you belong to. When someone types @Refrigeration, everyone with that trade picked gets a notification.' },
      { key: 'chat-composer', label: 'Message box', text: 'Type @ to ping a trade, a person, or everyone. Enter sends, Shift+Enter starts a new line.' },
      { key: 'chat-photos', label: 'Photos', text: 'Attach up to ten photos to a message. You can also paste or drag them into the box. They are shrunk before upload so they send fast from a phone.' },
      { key: 'chat-trade-strip', label: 'Trade sections', text: 'In a project space, pick a trade to see only that trade\u2019s messages on the job. Anything you send while a trade is picked pings that trade.' },
      { key: 'chat-ping-trade', label: 'Ping trade', text: 'Drops @Trade into the message box for the trade you have picked, or the project\u2019s own trade.' },
      { key: 'chat-update', label: 'Project update', text: 'In a project space, tick this and the message is also posted to the company-wide Project updates feed.' },
    ],
  },
  {
    match: /^\/app\/employees/,
    title: 'Employees',
    sectionIds: ['employees', 'lodging', 'schedules'],
    pins: [
      { key: 'emp-import', label: 'Paste a directory', text: 'Paste rows from your spreadsheet or directory page. Team lead names become headers for the people under them.' },
      { key: 'emp-locate', label: 'Locate addresses', text: 'Puts every home and job address on the map, a batch at a time, so drive times can be worked out.' },
      { key: 'emp-invite', label: 'Add to PhaseForge', text: 'Sends this person a login invite. Nobody is invited until you press it.' },
      { key: 'emp-schedule', label: 'On schedule', text: 'Adds or removes them from their team\u2019s crew roster on the Schedules page.' },
    ],
  },
  {
    match: /^\/app\/lodging/,
    title: 'Lodging',
    sectionIds: ['lodging', 'schedules'],
    pins: [
      { key: 'lodging-generate', label: 'Generate', text: 'Pick a team and week; everyone scheduled on each job becomes a guest for those nights.' },
      { key: 'lodging-find', label: 'Find hotels', text: 'Opens a hotel search near the job with dates, headcount, and rooms filled in.' },
      { key: 'lodging-far', label: 'Only 2+ hours away', text: 'Leaves out anyone whose home is under two hours from the job. People with no address are kept and flagged.' },
      { key: 'lodging-drive', label: 'Check drive times', text: 'Works out each guest\u2019s drive from home to the job again after addresses change.' },
      { key: 'lodging-job-address', label: 'Job address', text: 'The same address the pin on the Schedules job list holds. Change it in either place and both update, and the drive times re-run.' },
    ],
  },
  {
    match: /^\/app\/schedules$/,
    title: 'Schedules',
    sectionIds: ['schedules'],
    pins: [
      { key: 'sched-division', label: 'Department', text: 'Switch between departments. Each one has its own teams, project list, and layout.' },
      { key: 'sched-style', label: 'Layout', text: 'Crew grid is one block per job. Startup grid is jobs down, days across, with a shift note per person.' },
      { key: 'sched-week', label: 'Week', text: 'Step through weeks. Copy last week clones the previous one so you only edit what changed.' },
      { key: 'sched-roster', label: 'Crew', text: 'Type a name to add someone; names from the Employees page are suggested as you type. Tap a name to rename or swap them out and every day they are on follows.' },
      { key: 'sched-from-employees', label: 'Add from employees', text: 'Drops every employee on this team who is not on the crew list yet onto it in one go.' },
      { key: 'sched-job-address', label: 'Job address', text: 'The pin beside each project sets its address. Green means it is on the map and drive times can use it.' },
      { key: 'sched-erase', label: 'Eraser', text: 'Flip it on and the same taps and drags take people off days instead of putting them on.' },
      { key: 'sched-undo', label: 'Undo', text: 'Puts back the last tap or drag on this job. Ctrl+Z does the same.' },
      { key: 'sched-add-person', label: 'Add to a day', text: 'The + at the end of a day opens the rest of the crew. Tap a name to put them on that day.' },
      { key: 'sched-reorder', label: 'Reorder', text: 'Drag a job by its grip to move it up or down. The order you set is the order it prints and emails in.' },
      { key: 'sched-highlight', label: 'Highlight', text: 'Tint a row so it stands out. The color carries through to print and to the copied email.' },
      { key: 'sched-projects', label: 'Job list', text: 'Your recurring jobs with their numbers. One tap drops a job onto this week.' },
      { key: 'sched-zoom', label: 'Zoom', text: 'Shrink the sheet to fit a wide week on a phone screen.' },
      { key: 'sched-lodging', label: 'Lodging', text: 'Jumps to Lodging for this team and week to generate and book the crew\u2019s hotel stays.' },
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
      { key: 'gantt-undo', label: 'Undo / redo', text: 'Steps back through bar moves, resizes, and percent changes you made on the chart. Ctrl+Z and Ctrl+Shift+Z work too.' },
      { key: 'gantt-schedule', label: 'Schedule menu', text: 'Baseline, critical path, lookahead, and the compare view live here.' },
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
