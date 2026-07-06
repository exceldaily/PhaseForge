# PhaseForge — Architecture Map

One-page orientation for any developer or AI session. Stack: **Next.js 16 App Router ·
React 19 · Supabase (Postgres + RLS + Storage + Auth, `@supabase/ssr`) · Tailwind 4 ·
Stripe · Vercel**. Multi-tenant: every table carries `company_id`; isolation enforced by
RLS (`get_my_company_id()`), module access by `org_has_module()` + `profiles.ops_role`.

## Routes (src/app)

| Route | What it is | Key code |
|---|---|---|
| `/` `/login` `/signup` `/privacy` `/terms` | Marketing/auth/legal (dark theme) | `src/app/page.tsx` |
| `/app/dashboard` | Command Center (live counts band) | `components/layout` |
| `/app/my-work` | Current user's assignments | |
| `/app/projects` | Project board + exec snapshot + search | `components/projects/*` |
| `/app/projects/[id]` | Tabs: **Gantt / Tasks / Punch / Activity / Files** | `ProjectDetailShell.tsx` |
| `/app/projects/[id]/edit` `/new` | Project forms | `components/projects/ProjectForm.tsx` |
| `/app/gantt` | Cross-project Gantt | `components/gantt/GanttChart.tsx` |
| `/app/boards` `[id]` `[id]/settings` | Kanban boards w/ field customization | `components/boards` |
| `/app/calls` | Service calls (queue chips, SLA tints, readings) | `components/operations` |
| `/app/dispatch/[boardId]` | Ticketing kanban (plan-gated / `dispatch_enabled`) | `components/dispatch` |
| `/app/customers` `[id]` | Customers → locations → assets | `components/operations` |
| `/app/staff` `/app/vendors` `/app/resources` `/app/teams` | Directories | |
| `/app/invoices` `[id]` | Invoices (print-to-PDF, no payments) | |
| `/app/files` | Org file library (`org-files` bucket) | |
| `/app/analytics` `/app/reports` `/reports/operations` | Insights (Pro-gated print/reports) | |
| `/app/settings` | Hub → `members`, `modules`, **`scheduling`** | |
| `/app/settings/scheduling` | Google Calendar wizard, superintendents, SCH labels | `settings/scheduling/*` |
| `/app/organization` `/app/billing` | Org + Stripe plans (free/individual/pro/business) | `lib/stripe.ts`, `planLimits.ts` |
| `/app/admin/*` | Cross-org superadmin (companies/users/activity) | `components/admin` |
| `/app/guide` | In-app user guide — **update with every user-facing change** | |

## API routes

- `/api/google/oauth/start|callback` — per-org Google OAuth (AES-256-GCM tokens)
- `/api/cron/calendar-sync` — daily two-way calendar sync (vercel.json 7:00 UTC; also
  callable with `?secret=CRON_SECRET`)
- `/api/dispatch/gmail-sync` — daily 6:00 UTC
- `/api/punch/import` — Excel/PDF punch-list import
- Stripe webhook (billing)

## Google Calendar sync (src/lib/scheduling)

- `calendarEvent.ts` — **pure builders** (unit-tested): title `[Job#] Project – Phase`,
  description, all-day exclusive ends, RRULE skip-days, `swapSuperintendentLabels`,
  `isPhaseForgeEvent` guard (only ever touch events carrying our
  `extendedProperties.private` metadata).
- `google.ts` — server-only REST client + token encryption (`GOOGLE_TOKEN_ENC_KEY`).
- `syncCore.ts` — engine, client-agnostic (user session OR service-role):
  `pushPhase`, `pullLinkedEvents` (Google date changes apply to phases; title edits →
  `gcal_pending_changes` review queue; deletions flagged), `removePhaseEvent`.
- Server actions: `app/app/projects/[id]/scheduleActions.ts` (sync/unsync one/selected/all,
  auto-sync flag, project+phase skip days, statuses).
- UI: `components/gantt/ProjectCalendarSyncBar.tsx` (bulk picker/desync/auto-sync/skip days),
  `PhaseSyncSection.tsx` (per-phase), `DayChips.tsx` (blue=shown, red=skipped).

## Data model (Supabase, all RLS org-scoped)

Core: `companies` (org, plan, module flags) · `profiles` (role + ops_role) · `projects`
(job_number, store_site_id, superintendent_id, formatted_address/place_id/maps_url/lat/lng,
quick_links, schedule_label_ids, gcal_autosync, gcal_skip_days) · `phases` (dates, status,
deps, checklists, gcal_skip_days) · boards/columns · punch items.
Scheduling: `superintendents` · `schedule_labels` (SCH → color/calendar/attendee) ·
`gcal_connections` (1/org, encrypted tokens) · `gcal_event_links` (phase↔event, revisions,
etags) · `gcal_pending_changes` (review queue — **no UI yet**).
Operations chain: see below. Migrations: `supabase/migrations/*.sql`, applied via Supabase
MCP/SQL editor. See MIGRATION_AND_ROLLBACK.md.

## Conventions & gotchas

- Server `page.tsx` fetches + guards (`requireModule`), renders `*Client.tsx`; mutations in
  colocated `actions.ts` server actions that re-check auth/org/role. RLS is the final gate.
- Secrets never reach page payloads; crypto modules import `server-only`.
- Tests: Vitest in `src/**/__tests__` (27) · Playwright in `e2e/` (auth suite always-on;
  CRUD suite needs `E2E_TEST_EMAIL/PASSWORD`) · `npm run verify` runs everything.
- **Two "Brad Harvey" accounts/orgs exist**: exceldaily7 org `c0511e4d…` (test; PhaseForge
  Test calendar) and Kalos org `472355c2…` (REAL data, 50+ projects, Refrigeration Projects
  calendar). Check which org before touching data.
- Keep current: FABLE_HANDOFF.md (sprint log), GOOGLE_CALENDAR_SETUP.md, `/app/guide`.

---

# Operations platform detail

## Tenancy model

**Organization = existing `companies` row.** There is no parallel org table. Every operations
record carries `company_id` → `companies(id)`; the SQL helper `get_my_company_id()` (existing)
resolves the caller's org from `profiles.company_id`. Existing users, projects, boards, and all
legacy data were untouched — their company *is* their organization.

## Domain chain

```
Organization (companies)
  → customers
    → locations (site number, address, access notes, division)
      → assets (make/model/serial, warranty window, trade)
        → calls (work orders: status, priority, SLA, assignment, notes)
        → projects (existing PhaseForge projects; new customer/location/division links)
        → org_files (metadata over Storage bucket org-files/{company_id}/…)
        → invoices ← invoice_items (line items can reference source calls/projects)
```

Supporting tables: `divisions`, `org_tags` + `record_tags` (polymorphic), `saved_views`,
`ops_activity` (append-only shared timeline), `org_call_settings` (terminology/statuses/
priorities/card template per org), `org_counters` + `next_org_number()` (per-org call &
invoice numbering), `note_templates`, `call_notes`, `call_reads` (per-user unread tracking),
`staff_details` + `staff_certifications`, `vendors` + `vendor_contacts`,
`organization_modules` (entitlements).

## Layering

- **`src/lib/operations/types.ts`** — domain types mirroring the schema.
- **`src/lib/operations/modules.ts`** — module registry (key, label, route, allowed ops roles).
  One source of truth for sidebar, guards, and the settings toggle page.
- **`src/lib/operations/server.ts`** — server-only helpers: `getOpsContext()`, `requireModule()`
  (route guard), `visibleModules()`, `getCallSettings()` (with defaults), `logOpsActivity()`.
- **`src/components/operations/`** — reusable UI: `FilterBar` (URL-state filters), `shared.tsx`
  (page header, status pills, empty states, time helpers).

## Security layers (defense in depth)

1. **RLS** — every operations table enforces `company_id = get_my_company_id()` plus module
   (`org_has_module`) and role (`get_my_ops_role`) predicates. See MULTI_TENANT_SECURITY.md.
2. **Server route guards** — `requireModule()` redirects on disabled module or disallowed role.
3. **Server actions** — re-check role before writing (defense in depth, never the only gate).
4. **Sidebar** — only shows entitled modules (cosmetic layer, computed server-side).

## Calls module design (from the DispatchForge reference audit)

- Org-configurable **terminology**, **statuses**, **priorities**, and **card template kind**
  in `org_call_settings`, with defaults when no row exists.
- **Unread alerts**: `call_notes` trigger stamps `calls.last_note_at`; `call_reads` stores each
  user's `last_read_at`; yellow NEW UPDATE badge when `last_note_at > last_read_at`.
- **SLA/aging**: computed at render; needs-attention sort: unread → SLA → priority → age.
- **Extension points**: inert `external_*` columns; `calls.source` for email/API intake;
  `organization_modules.settings` jsonb per module; `ops_activity` as automation source.
