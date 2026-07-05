# PhaseForge Operations — Architecture

## Stack (unchanged)

Next.js 16 App Router · React 19 · Tailwind 4 · Supabase (Postgres + Auth + Storage, `@supabase/ssr`) · TypeScript.

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
- **Pages** follow one pattern: server `page.tsx` calls `requireModule(...)`, fetches the org
  dataset, renders a `*Client.tsx`; mutations go through `actions.ts` server actions that
  re-check the module + role and log to `ops_activity`. RLS is the final gate regardless.

## Security layers (defense in depth)

1. **RLS** — every operations table enforces `company_id = get_my_company_id()` plus module
   (`org_has_module`) and role (`get_my_ops_role`) predicates. See MULTI_TENANT_SECURITY.md.
2. **Server route guards** — `requireModule()` redirects on disabled module or disallowed role,
   so direct URLs are blocked server-side.
3. **Server actions** — re-check role before writing (defense in depth, never the only gate).
4. **Sidebar** — only shows entitled modules (cosmetic layer, computed server-side).

## Calls module design (from the DispatchForge reference audit)

- Org-configurable **terminology** (Calls/Work Orders/Service Requests/Jobs), **statuses**,
  **priorities**, and **card template kind** (commercial/residential/construction) in
  `org_call_settings`, with sensible defaults when no row exists.
- **Unread alerts**: `call_notes` trigger stamps `calls.last_note_at`; `call_reads` stores each
  user's `last_read_at`; a call renders yellow with a NEW UPDATE badge when
  `last_note_at > last_read_at`. Opening the drawer marks it read.
- **SLA/aging**: computed at render (`sla_at`/`due_date` → overdue/at-risk tints; days-open
  counter). Needs-attention sort: unread → SLA state → priority rank → age. Rule-based, no AI.
- **Views**: list (dense rows with priority bar + badge stack), cards, status-lane board.
- **Extension points**: inert `external_*` columns for a future ServiceChannel-style
  integration; no live API calls anywhere.

## Future extension points (architected, not built)

Module registry accepts new keys; `organization_modules.settings` jsonb per module;
`invoices.payment_provider/payment_external_id` abstraction; `calls.source` for email/API
intake; `staff_details.external_tech_mapping` / `payroll_reference`; `ops_activity` as an
automation event source; `org_call_settings.external_system_enabled` flag.
