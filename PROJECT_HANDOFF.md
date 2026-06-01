# GANTTIC Project Handoff Document

**Project**: Ganttic - Professional Gantt Chart SaaS Application  
**Status**: MVP Complete with Admin Console  
**Last Updated**: June 1, 2026  
**Owner**: Brad Harvey (exceldaily7@gmail.com)

---

## 1. CURRENT TECH STACK

**Frontend:**
- Next.js 16.2.6 (React 19.2.4)
- TypeScript 5
- Tailwind CSS 4 + PostCSS 4
- Zustand (state management)
- React Query (data fetching)
- Lucide React (icon library)

**Backend:**
- Node.js (Next.js SSR)
- Supabase (PostgreSQL database + Auth)
- Server Components + Server Actions (Next.js 16)

**Data Processing:**
- PDF parsing: pdfjs-dist, pdf-parse
- Excel parsing: xlsx, papaparse
- CSV support: papaparse
- Document parsing: mammoth (Word docs)
- Date handling: date-fns

**Deployment:**
- Vercel (production)
- GitHub (version control)
- Supabase Postgres (hosted database)

**Development:**
- ESLint (code linting)
- npm (package manager)

---

## 2. PROJECT ARCHITECTURE

### High-Level Flow
```
User (Browser)
    ↓
Next.js App Router (React 19 Components)
    ├─ Client Components (UI, state with Zustand)
    └─ Server Components (data fetching, auth checks)
        ↓
    Server Actions (form submission, auth checks)
        ↓
    Supabase Client (SSR-compatible)
        ↓
    PostgreSQL Database + Auth (Supabase)
```

### Authentication Flow
1. Supabase Auth (email/password, JWT tokens, cookies)
2. Middleware.ts redirects unauthenticated users to /login
3. Server-side Supabase client with `createClient()` (SSR safe)
4. Row-Level Security (RLS) policies enforce company/user scoping
5. Role-based checks in components (owner, admin, manager, viewer)

### Data Architecture
- **Multi-tenant**: Each company is isolated via RLS
- **Company-scoped**: All resources (projects, phases, users) belong to a company
- **RLS Policies**: Filter data automatically based on authenticated user's company
- **Relationships**: Projects → Phases, Companies → Profiles (members)

### Component Architecture
- **Server Components**: Pages, layouts (handle auth, fetch data)
- **Client Components**: Interactive UI (marked with 'use client')
- **Form Actions**: Server-side data mutations with auth checks
- **State Management**: Zustand stores (GanttStore for Gantt chart state)

---

## 3. FOLDER STRUCTURE

```
ganttic/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # Auth pages (login, signup, invite)
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   └── invite/[token]/page.tsx
│   │   ├── app/                      # Protected routes (logged-in users)
│   │   │   ├── layout.tsx            # Main app shell with sidebar
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── projects/             # Project management
│   │   │   │   ├── page.tsx          # Projects list (Kanban board)
│   │   │   │   ├── new/page.tsx      # New project form
│   │   │   │   └── [id]/             # Project detail/edit
│   │   │   ├── gantt/                # Gantt chart
│   │   │   │   └── page.tsx          # SVG-based interactive Gantt
│   │   │   ├── settings/             # User & company settings
│   │   │   │   ├── page.tsx          # Company settings hub
│   │   │   │   └── members/page.tsx  # Team member management
│   │   │   └── admin/                # NEW: Admin console (super-admin only)
│   │   │       ├── layout.tsx        # Auth guard for super-admin
│   │   │       ├── page.tsx          # Dashboard with stats
│   │   │       ├── users/page.tsx    # All users across all companies
│   │   │       ├── companies/page.tsx # All companies overview
│   │   │       └── activity/page.tsx  # Audit log
│   │   ├── admin/                    # Server actions
│   │   │   └── actions.ts            # Admin operations (promote, deactivate, etc)
│   │   └── api/
│   │       └── import-schedule/      # PDF/Excel import endpoint
│   │
│   ├── components/
│   │   ├── ui/                       # Base UI components
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Badge.tsx
│   │   │   └── ... (others)
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx           # Left navigation (conditionally shows Admin)
│   │   │   ├── TopBar.tsx            # Top navigation
│   │   │   └── Breadcrumbs.tsx
│   │   ├── gantt/
│   │   │   ├── GanttChart.tsx        # Main Gantt SVG component
│   │   │   ├── GanttSidebar.tsx      # Project/phase list
│   │   │   ├── GanttToolbar.tsx      # Controls (zoom, date range, print)
│   │   │   ├── GanttEditPanel.tsx    # Edit phase inline
│   │   │   └── GanttPrintModal.tsx   # Print preview & export
│   │   ├── projects/
│   │   │   ├── ProjectForm.tsx       # Create/edit project
│   │   │   ├── ProjectCard.tsx       # Kanban card
│   │   │   ├── KanbanBoard.tsx       # Kanban view
│   │   │   └── ProjectsClient.tsx    # Client wrapper for projects
│   │   ├── phases/
│   │   │   ├── PhaseForm.tsx         # Create/edit phase
│   │   │   └── ... (phase components)
│   │   ├── settings/
│   │   │   ├── InviteMemberButton.tsx
│   │   │   └── ProfileSettingsCard.tsx
│   │   ├── admin/                    # NEW: Admin components
│   │   │   ├── UsersTable.tsx        # User management table
│   │   │   ├── CompaniesTable.tsx    # Companies overview
│   │   │   └── ActivityTimeline.tsx  # Audit log display
│   │   └── branding/
│   │       └── GantticLogo.tsx
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── server.ts            # SSR Supabase client
│   │   │   └── client.ts            # Client-side Supabase client
│   │   ├── constants.ts             # Status, priority, role definitions
│   │   ├── dates.ts                 # Date utility functions
│   │   ├── utils.ts                 # cn() (classname merger)
│   │   ├── projectAudit.ts          # Activity logging
│   │   └── pdf-parser.ts            # PDF extraction logic
│   │
│   ├── stores/
│   │   └── ganttStore.ts            # Zustand: Gantt state (zoom, dates, selected)
│   │
│   ├── types/
│   │   └── app.ts                   # All TypeScript interfaces
│   │
│   └── styles/
│       └── globals.css              # Tailwind directives
│
├── supabase/
│   ├── migrations/                  # Database migrations (applied in order)
│   │   ├── 20260531_change_pm_to_text.sql
│   │   ├── 20260531_add_teams.sql   # (REVERTED - Teams feature)
│   │   └── 20260601_add_super_admin.sql # NEW: is_super_admin column & audit logs
│   └── schema.sql                   # Base schema (initial creation)
│
├── middleware.ts                    # Route protection
├── next.config.ts                   # Next.js config
├── tsconfig.json                    # TypeScript config
├── tailwind.config.js               # Tailwind theming (auto-generated)
├── postcss.config.mjs               # PostCSS config (Tailwind)
├── .env.local                       # Environment variables (Supabase credentials)
└── package.json                     # Dependencies
```

---

## 4. DATABASE SCHEMA

### Core Tables

**profiles**
```
id (UUID) - FK to auth.users
email (TEXT)
company_id (UUID) - FK to companies
full_name (TEXT)
avatar_url (TEXT)
role (TEXT) - 'owner' | 'admin' | 'manager' | 'viewer'
job_title (TEXT)
is_active (BOOLEAN)
is_super_admin (BOOLEAN) - NEW: Super-admin access to /app/admin
invited_by (UUID) - Who invited this user
created_at, updated_at (TIMESTAMPTZ)
```

**companies**
```
id (UUID)
name (TEXT)
slug (TEXT) - Unique per company
logo_url (TEXT)
plan (TEXT) - 'Free', 'Pro', etc
created_at, updated_at (TIMESTAMPTZ)
```

**projects**
```
id (UUID)
company_id (UUID) - FK to companies
name (TEXT)
customer_name (TEXT)
job_location (TEXT)
start_date, end_date (DATE)
project_manager (TEXT) - Now TEXT, allows custom names
superintendent (TEXT) - Now TEXT, allows custom names
status (TEXT) - Project lifecycle status
priority (TEXT) - 'low' | 'medium' | 'high' | 'critical'
color (TEXT) - Hex color for Gantt bars
tags (TEXT[])
subcontractors (TEXT[])
permit_status (TEXT)
is_archived (BOOLEAN)
notes (TEXT)
created_by, updated_by (UUID) - FK to profiles
created_at, updated_at (TIMESTAMPTZ)
```

**phases**
```
id (UUID)
project_id (UUID) - FK to projects
name (TEXT)
start_date, end_date (DATE)
assigned_to (UUID) - FK to profiles (optional)
assigned_trade (TEXT) - Editable trade/role name
status (TEXT) - 'not_started' | 'in_progress' | 'completed' | 'blocked' | 'skipped'
color (TEXT) - Hex color for Gantt bars
notes (TEXT)
sort_order (INT)
created_at, updated_at (TIMESTAMPTZ)
```

**phase_dependencies**
```
id (UUID)
phase_id (UUID) - FK to phases
depends_on_id (UUID) - FK to phases
type (TEXT) - 'finish_to_start' | 'start_to_start' | 'finish_to_finish'
lag_days (INT)
```

**activity_logs**
```
id (UUID)
company_id (UUID) - FK to companies
project_id, phase_id (UUID) - Optional FK
actor_id (UUID) - FK to profiles (who did it)
action (TEXT)
payload (JSONB) - What changed
created_at (TIMESTAMPTZ)
```

**invitations**
```
id (UUID)
company_id (UUID) - FK to companies
email (TEXT)
role (TEXT)
token (TEXT) - Unique, 7-day expiry
expires_at (TIMESTAMPTZ)
accepted_at (TIMESTAMPTZ)
```

**admin_audit_logs** (NEW)
```
id (UUID)
actor_id (UUID) - FK to profiles (who performed action)
action (TEXT) - 'deactivate_user', 'promote_to_super_admin', etc
target_type (TEXT) - 'user' | 'company'
target_id (UUID) - User or company ID
target_email (TEXT)
changes (JSONB) - What was changed
created_at (TIMESTAMPTZ)
```

### Row-Level Security (RLS)
- **Default pattern**: All tables have RLS enabled
- **Helper function**: `get_my_company_id()` - returns current user's company
- **Policy pattern**: `WHERE company_id = get_my_company_id()`
- **Exception**: Admin tables have checks at application level

---

## 5. AUTHENTICATION SYSTEM

### Overview
- **Type**: Supabase Auth (email/password, JWT)
- **Storage**: HTTP-only cookies (secure for SSR)
- **SSR Client**: `createClient()` from `@supabase/ssr`

### Flow
1. User signs up → creates Supabase Auth user
2. Server action creates `profiles` row with role='owner' and auto-creates `companies` row
3. Auth tokens stored in HTTP-only cookies
4. Middleware checks auth on every route `/app/*`
5. Server components use `supabase.auth.getUser()` to fetch current user
6. RLS policies automatically filter data by company

### Roles (Company-scoped)
- **owner**: Full access, can invite members, manage roles
- **admin**: Same as owner (legacy distinction)
- **manager**: Can create/edit projects and phases
- **viewer**: Read-only access

### Super-Admin (NEW)
- **is_super_admin = true**: Access to `/app/admin/*` console
- Bypass company isolation → see all users and companies
- Can deactivate, delete, or promote users
- All actions logged in `admin_audit_logs`

---

## 6. CURRENT COMPLETED FEATURES

### ✅ Authentication & Onboarding
- Email/password signup with Supabase Auth
- Login with persistence
- Middleware-protected `/app/*` routes
- Email-based invitations (7-day tokens, role selection)
- Auto-company creation on first signup

### ✅ Project Management
- Create, read, update, delete projects
- Kanban board view (by status)
- Inline editable columns (name, status, priority)
- Custom PM/Superintendent fields (text input, not just dropdown)
- Color-coded project cards
- Project filtering and search
- Editable phases/tasks within projects
- Phase status tracking (not_started, in_progress, completed, blocked, skipped)

### ✅ Gantt Chart
- SVG-based interactive Gantt chart
- Drag-and-drop phase/project bars (resize, move)
- Zoom levels: day, week, month, quarter
- Pan and zoom with keyboard/mouse
- Project and phase collapsing
- Phase assignment and trade/role management
- Color-coded bars by project/phase
- Date range controls (fit schedule button)

### ✅ Data Import
- PDF schedule import (extracts project names/dates via text parsing)
- Excel/CSV import support
- Word document parsing
- Date detection and parsing

### ✅ Printing & Export
- Gantt chart print in list or chart view
- Chart style: SVG export to PDF
- List style: Table with project/phase data
- Landscape orientation, custom scaling
- Date range persistence in print
- Respect project collapse state when printing (optional)

### ✅ Team Management
- View all company team members
- Invite members via email (with role selection)
- Member list with roles and job titles
- Deactivate/remove members
- Profile editing (name, job title)
- Company settings overview

### ✅ Admin Console (NEW)
- Super-admin dashboard with stats
- Users page: view all users across all companies
- User management: edit, deactivate, delete, promote to super-admin
- Companies page: view all registered companies with member/project counts
- Activity/audit log: track all admin actions

### ✅ UI & UX
- Responsive design (desktop-first)
- Sidebar navigation with collapse
- Tailwind CSS theming
- Dark slate color scheme (#slate-900, #slate-800)
- Consistent component library (buttons, inputs, modals, badges)
- Loading states and error handling
- Toast/alert notifications (built-in UI)

### ✅ Database & Security
- Supabase Postgres with RLS
- Company-scoped data isolation via RLS
- Server-side Supabase client (SSR-safe)
- Activity logging for audit trail
- Service role for admin operations

---

## 7. CURRENT UNFINISHED FEATURES

### ⏳ In Progress / Partial
- None currently - MVP is feature-complete

### 🔮 Future Roadmap (Not Started)
1. **Desktop App Packaging** (Electron or Tauri)
   - Standalone executable for Windows/Mac/Linux
   - Offline-first capabilities

2. **Analytics Dashboard**
   - Project completion rates
   - Team utilization
   - Schedule variance tracking

3. **Advanced Reporting**
   - Custom report builder
   - Email report scheduling
   - Export to various formats (PDF, Excel, etc)

4. **Resource Planning**
   - Resource allocation view
   - Capacity planning
   - Workload balancing

5. **Time Tracking**
   - Hours logged per phase
   - Labor cost integration
   - Budget tracking

6. **Notifications & Alerts**
   - Phase completion notifications
   - Overdue task alerts
   - Schedule change notifications

7. **Collaboration Features**
   - Phase comments/discussions
   - @mentions
   - File attachments

8. **Advanced Teams Feature** (was attempted, needs redesign)
   - Sub-groups within companies
   - Team-scoped projects
   - Team-scoped Gantt views

---

## 8. KNOWN BUGS

### 🐛 None Currently Reported
All known issues from development have been resolved. If new bugs are discovered, document them here with:
- Reproduction steps
- Expected vs actual behavior
- Affected components/pages
- Priority level

---

## 9. RECENT CHANGES MADE

### Latest Session (June 1, 2026)

**Major**: Admin Console Implementation
- Created `/app/admin/*` routes with super-admin auth guard
- Implemented user management with edit, deactivate, delete, promote functionality
- Added company overview page with stats
- Created admin audit log for action tracking
- Added `is_super_admin` column to profiles table
- Updated Sidebar to conditionally show Admin link

**Fixes**:
- Fixed syntax error in UsersTable async function (missing `=>`)
- Fixed audit logging implementation (removed broken RPC call)

**Code Quality**:
- All admin operations require is_super_admin check
- Server-side action validation
- Try-catch error handling on all mutations

**Previous Sessions**:
- Fixed print modal to show all projects with phases (layout grouping)
- Reduced print modal font sizes and padding for multi-page support
- Hid sidebar in print styles
- Added custom PM/Superintendent as text fields (not just dropdowns)
- Removed optional Teams feature (attempted, reverted)
- Fixed PM display on Kanban cards to handle custom names
- Added Queue status to project status options
- Enhanced print functionality with date range persistence
- Added project archive support

---

## 10. IMPORTANT DESIGN STANDARDS

### Code Organization
- **Server Components**: Used for pages, layouts, data fetching
- **Client Components**: Minimal state, marked with 'use client'
- **Server Actions**: All data mutations and auth-required operations
- **Zustand Stores**: UI state only (Gantt zoom, selected phase, etc)
- **Supabase Client**: Always server-side for SSR safety; client-side only for browser events

### Naming Conventions
- **Components**: PascalCase (GanttChart, ProjectForm, UsersTable)
- **Functions**: camelCase (handleDelete, logAdminAction)
- **Constants**: UPPER_SNAKE_CASE (PROJECT_ROW_HEIGHT)
- **Files**: Match component name or descriptive lowercase (gantt-store.ts)
- **CSS Classes**: Tailwind utilities, no custom classes unless necessary

### Error Handling
- Try-catch on all server actions
- User-friendly error messages (no stack traces)
- Alert dialogs for confirmation on destructive actions
- Return `{ success, message }` objects from server actions

### Database Queries
- Always include company scoping: `.eq('company_id', companyId)`
- Use RLS policies for automatic filtering
- Order results consistently: `.order('created_at', { ascending: false })`
- Limit results for performance when appropriate

### Component Props
- Export interface Props as first type in component file
- Pass only required data; avoid spreading whole objects
- Document required vs optional props
- Use TypeScript Partial<> for optional edit fields

### Styling
- Tailwind utilities only (no custom CSS classes)
- Consistent spacing: use Tailwind scale (px, 2, 3, 4, 6, 8, etc)
- Colors: Use slate (primary), blue, green, red variants
- Responsive: Mobile-first or explicit breakpoints (md:, lg:)
- Dark mode: Use light slate backgrounds, dark text (not implemented currently)

---

## 11. UI THEME REQUIREMENTS

### Color Palette
| Element | Color | Usage |
|---------|-------|-------|
| Primary BG | `#0f172a` (slate-900) | Sidebar, main nav |
| Secondary BG | `#1e293b` (slate-800) | Sidebar hover, deeper sections |
| White/Light | `#ffffff` | Content areas, cards |
| Text Primary | `#0f172a` (slate-900) | Body text on light |
| Text Secondary | `#64748b` (slate-500) | Muted text, labels |
| Text Tertiary | `#94a3b8` (slate-400) | Disabled, lighter hints |
| Accent | `#4f46e5` (indigo-600) | Active nav, primary buttons |
| Success | `#10b981` (emerald-500) | Active status, positive actions |
| Warning | `#f59e0b` (amber-500) | Warnings, caution states |
| Danger | `#ef4444` (red-500) | Destructive actions, errors |
| Super-Admin | `#dc2626` (red-600) | Admin badge, admin nav |

### Typography
- **Font**: System fonts (no custom imports)
- **Heading sizes**: text-2xl (page titles), text-lg (section headers), text-sm (labels)
- **Font weights**: font-bold (headers), font-medium (buttons/labels), normal (body)
- **Line height**: Normal for body text, tight for headers

### Components
- **Buttons**: Primary (indigo bg), secondary (slate border), danger (red), ghost (hover only)
- **Inputs**: Slate borders, slate-50 or white background, slate-700 text
- **Modals**: White bg, slate-100 footer, centered with shadow
- **Tables**: Alternating row colors optional, borders for cells
- **Cards**: White bg, subtle border or shadow, p-6 padding standard

### Spacing
- **Page padding**: px-8 py-8 (standard)
- **Section spacing**: gap-6, space-y-6 (between sections)
- **Component padding**: p-3 to p-6 (buttons), p-4 (inputs/cards)
- **Border radius**: rounded-lg standard, rounded-xl for modals

### States
- **Hover**: Darken bg or add shadow (not scale, no transforms)
- **Active**: Indigo bg with white text
- **Disabled**: Opacity-50, cursor-not-allowed
- **Loading**: Subtle opacity change or spinner

---

## 12. COMPONENTS THAT SHOULD NOT BE MODIFIED

### Core Infrastructure (Do Not Touch Without Discussion)
- **Middleware.ts**: Route protection logic
- **Supabase RLS Policies**: Data security depends on these
- **Database Migrations**: Any schema changes need migration files
- **Authentication Flow**: signup/login logic is stable
- **Server Component Patterns**: Server/Client split must be maintained

### Stable, Well-Tested Components (Low Risk to Modify)
- **GanttChart.tsx**: Core visualization engine - test extensively if modified
- **Sidebar.tsx**: Navigation structure affects many pages - test admin link visibility
- **ProjectForm.tsx**: Used by multiple features - verify all create/edit flows
- **PhaseForm.tsx**: Phase creation/editing - test with various status transitions

### Admin Console (New, Use Caution)
- **Admin layout.tsx**: Super-admin auth guard - do not weaken
- **Server actions in /admin/actions.ts**: All mutations require auth check
- **Admin components**: Styled consistently with rest of app, follow patterns

---

## 13. DEPLOYMENT SETUP

### GitHub
- **Repo**: https://github.com/exceldaily/Ganttic.git
- **Main branch**: Default deployment branch
- **Protected branch**: main (requires PR reviews recommended)
- **Recent commits**: Admin console implementation, print fixes, import features

### Vercel
- **Live URL**: https://ganttic.vercel.app
- **Domain**: Custom domain via Vercel dashboard
- **Auto-deploy**: On push to main branch
- **Environment**: Production only (no staging env configured)
- **Build command**: `npm run build` (Next.js standard)
- **Start command**: `npm start`

### Environment Variables
Required in Vercel (set via dashboard):
```
NEXT_PUBLIC_SUPABASE_URL=https://iugqydkkounnlkbploox.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<set-in-vercel>
SUPABASE_SERVICE_ROLE_KEY=<set-in-vercel>
```

**Local Development**:
- Create `.env.local` with above variables
- Service role key NOT committed to git

### Supabase
- **Project URL**: https://iugqydkkounnlkbploox.supabase.co
- **Database**: PostgreSQL hosted
- **Auth**: Supabase Auth (email/password)
- **Storage**: File uploads via Supabase Storage (if implemented)
- **Migrations**: Stored in `supabase/migrations/` directory
- **Apply migrations**: Via Supabase dashboard or migration tools

### Local Development
```bash
# Install dependencies
npm install

# Start dev server
npm run dev
# Accessible at http://localhost:3000

# Build for production
npm run build

# Run production server
npm start

# Lint
npm run lint
```

---

## 14. CURRENT ROADMAP

### Phase 1: MVP ✅ COMPLETE
- Core Gantt chart
- Project CRUD
- Phase management
- Team members
- Data import
- Print functionality
- Admin console

### Phase 2: Desktop App (Planned)
- Electron or Tauri wrapper
- Offline capability with sync
- Standalone .exe/.dmg/.appImage

### Phase 3: Advanced Features (Planned)
- Analytics & reporting
- Time tracking
- Resource planning
- Collaboration (comments, mentions)
- Notifications & alerts

### Phase 4: Scaling (Future)
- Advanced Teams feature (redesign)
- Enterprise features (SSO, advanced permissions)
- White-label option
- Mobile app (React Native)

---

## 15. TECHNICAL DEBT & REFACTORING OPPORTUNITIES

### Medium Priority
1. **Print Modal Complexity**
   - GanttPrintModal.tsx is 350+ lines
   - Split chart vs list view into separate components
   - Extract print style logic

2. **Gantt Chart State Management**
   - GanttChart.tsx has local state + Zustand store
   - Consolidate into single source of truth
   - Consider extracting interaction logic

3. **Form Validation**
   - Currently minimal (basic required checks)
   - Add schema validation (Zod or similar)
   - Centralize validation rules

4. **Error Handling**
   - Most errors show generic alerts
   - Add error boundary for unhandled exceptions
   - Implement structured error codes

### Low Priority
1. **Component Organization**
   - Some components could be split further (ProjectForm is 300+ lines)
   - Create sub-components for complex sections

2. **Testing**
   - No unit tests currently
   - Consider adding Jest + React Testing Library
   - Critical paths: auth, data import, Gantt interactions

3. **Documentation**
   - Component prop docs could be more detailed
   - Add storybook or similar for component showcase
   - API documentation for server actions

4. **Performance**
   - Gantt chart SVG rendering could be optimized for very large projects
   - Consider virtual scrolling for long phase lists
   - Image optimization for logos

### Not Recommended
- **Rewrite in different framework**: App is stable, Next.js 16 is current
- **Change database**: Supabase is well-integrated, RLS is solid
- **Complete redesign**: UI is consistent, just needs polish

---

## Quick Start for New Developer

1. **Clone & setup**:
   ```bash
   git clone https://github.com/exceldaily/Ganttic.git
   cd ganttic
   npm install
   cp .env.example .env.local  # Set Supabase credentials
   ```

2. **Run locally**:
   ```bash
   npm run dev
   ```

3. **Apply database migrations**:
   - Go to Supabase dashboard
   - Run SQL migrations in `supabase/migrations/` directory in order

4. **Create your account**:
   - Sign up at http://localhost:3000/signup
   - You'll be assigned as company owner with super-admin access

5. **Key files to understand first**:
   - `src/types/app.ts` - All data types
   - `src/app/app/layout.tsx` - App shell + auth
   - `src/stores/ganttStore.ts` - Gantt state
   - `src/components/gantt/GanttChart.tsx` - Gantt visualization
   - `supabase/schema.sql` - Database structure

---

## Support & Questions

For questions about specific features or implementation details, see the Git commit history for context on:
- Print functionality enhancements
- Admin console implementation
- Data import features
- Gantt chart interactions

Recent commits in order show the progression of features and can serve as a learning guide.
