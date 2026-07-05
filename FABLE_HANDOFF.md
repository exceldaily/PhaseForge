# FABLE_HANDOFF — PhaseForge Operations Foundation

Branch: `fable/phaseforge-operations-foundation` · Checkpoint: tag `pre-operations-platform`
Status: **implementation plan** (this file is updated at the end with results — see bottom sections).

## Repository audit (facts the plan is built on)

- Next.js 16 App Router + React 19 + Tailwind 4 + Supabase (`@supabase/ssr`), TypeScript, Zustand, TanStack Query.
- Tenancy **already exists**: `companies` table, `profiles.company_id`, SQL helpers
  `get_my_company_id()` and `get_my_role()` (roles: owner/admin/manager/member/viewer), RLS on all tables.
- Existing feature set to preserve untouched: projects, phases, dependencies, Gantt, boards,
  punch lists, checklists, attachments, teams, notifications, billing/Stripe, guide, admin,
  and the Kalos-flavored **Tickets** (dispatch_*) module.
- Migrations live in `supabase/migrations/*.sql` and are applied manually in the Supabase SQL editor
  (per project convention — see memory/session notes).

## Design decisions

1. **Organization = existing `companies` row.** No parallel org table; everything new hangs off
   `company_id`. UI label is "Organization". This preserves every existing user/record with zero
   data migration — existing companies *are* the legacy orgs.
2. **Module entitlements** in new `organization_modules` table (company_id + module_key + enabled),
   with SQL helper `org_has_module(text)` used in RLS **and** in server-side route guards.
   Seeded for existing companies: `projects` enabled (legacy behavior preserved), new modules off.
3. **Operations roles** as a new additive `profiles.ops_role` column
   (owner/admin/dispatcher/project_manager/billing/staff/read_only), defaulted from legacy role.
   Legacy `role` keeps driving all existing features; new modules check ops_role.
4. **New Calls module** (`calls` tables + `/app/calls`) built generalized per
   DISPATCHFORGE_REFERENCE_AUDIT.md. Existing Tickets module is left alone.
5. **Additive-only migrations**, every table: `company_id`, FKs, indexes, RLS with
   `company_id = get_my_company_id()` + module + role predicates.
6. Invoice PDF via print-optimized invoice page (browser print → PDF); no new dependencies, no payments.
7. Reusable filtering: one `FilterBar` component + URL-query state helper + per-page filter definitions;
   `saved_views` table for named views.

## Milestones / commit plan

1. `docs:` DispatchForge reference audit + this plan
2. `feat(db):` operations foundation migration — organization_modules, ops_role, divisions,
   org_tags, saved_views, org_call_settings, helper functions, entitlement seeding
3. `feat(db):` customers, customer_contacts, locations, assets
4. `feat(db):` staff details, vendors, vendor_contacts
5. `feat(db):` calls, call_notes, call_activity, call_reads (unread alerts), invoices, invoice_items, org_files
6. `feat(ui):` module registry, entitlement helpers, module-gated sidebar + route guards
7. `feat(ui):` Customers / Locations / Assets pages
8. `feat(ui):` Staff / Vendors pages
9. `feat(ui):` Calls module (list/card/board, detail panel, notes, unread highlight, templates)
10. `feat(ui):` Files, Invoices (+ printable PDF), Reports
11. `docs:` ARCHITECTURE, MULTI_TENANT_SECURITY, MODULES_AND_PERMISSIONS,
    FILTERING_AND_SAVED_VIEWS, MIGRATION_AND_ROLLBACK, final handoff + guide update

## Constraints honored

- No AI, no live integrations (ServiceChannel/Gmail/Stripe-new/QuickBooks), inert `external_*`
  placeholder columns only.
- No DispatchForge code/data/Kalos details imported.
- No destructive SQL: no DROP/DELETE/ALTER-narrowing; `IF NOT EXISTS` everywhere.
- No pushes to `main`; no history rewrites.

---

*The sections below are filled in at the end of implementation: What was completed, What remains,
Migrations created, Assumptions, Risks, Commands (setup/test/build/migrate/rollback/git).*
