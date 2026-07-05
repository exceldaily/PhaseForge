# FABLE_HANDOFF — PhaseForge Operations Foundation

Branch: `fable/phaseforge-operations-foundation` · Checkpoint: tag `pre-operations-platform` (= `main` @ 8ca2dd9)
Companion docs: ARCHITECTURE.md · DISPATCHFORGE_REFERENCE_AUDIT.md · MULTI_TENANT_SECURITY.md ·
MODULES_AND_PERMISSIONS.md · FILTERING_AND_SAVED_VIEWS.md · MIGRATION_AND_ROLLBACK.md

## What was completed

- **Audits**: repository + Supabase schema audit; read-only DispatchForge UX audit
  (DISPATCHFORGE_REFERENCE_AUDIT.md). No DispatchForge code, data, or Kalos specifics copied.
- **Multi-tenant foundation** (additive SQL, 5 migration files): organizations = existing
  `companies`; `organization_modules` entitlements + `org_has_module()`; `profiles.ops_role`
  (7 operations roles) + helpers; divisions; org tags + polymorphic record tags; saved_views;
  append-only `ops_activity`; `org_call_settings`; per-org counters (`next_org_number`).
  Legacy companies auto-seeded (projects/reports/files on; new modules off). New-company trigger.
- **CRM chain**: customers → customer_contacts → locations → assets, full RLS + indexes.
- **Workforce**: staff_details + staff_certifications (expiry tracking), vendors +
  vendor_contacts (insurance/license expirations, trades, coverage areas).
- **Calls module** (schema + UI): org-configurable terminology/statuses/priorities/template
  kind; list/card/board views; DispatchForge-grade rows (priority bar, badge stack, unassigned
  warning, days-open, last-update); **yellow NEW UPDATE highlight** via call_notes trigger +
  call_reads; SLA overdue/at-risk tints; needs-attention sort; detail drawer with optimistic
  inline edits, categorized notes (7 categories), note templates; required-closeout enforcement
  on completion; invoice-ready flag; inert `external_*` extension fields.
- **Module gating**: registry + `requireModule()` server guard on every new page (direct URLs
  blocked), role-aware sidebar, Settings → Modules toggle UI (owner/admin).
- **Files**: metadata table + private `org-files` bucket with per-org path RLS; library page
  with upload, filters, signed-URL downloads.
- **Invoices**: invoice-ready workflow only — drafts from invoice-ready calls, line items,
  statuses (draft/ready/sent/paid/overdue/void), print-to-PDF invoice document. No payments.
- **Reports**: /app/reports/operations — open-call aging, by status/priority/division/customer/
  vendor/staff, SLA overdue, invoice-ready count, overdue invoice $, warranty expirations ≤90d;
  headline stats deep-link to pre-filtered pages.
- **Filtering**: shared FilterBar + URL-state filters on every list page (see
  FILTERING_AND_SAVED_VIEWS.md for the per-page facet list).
- **Projects integration (links)**: `projects.customer_id/location_id/division_id` columns +
  indexes. Existing project features untouched.
- **Guide** updated (Operations Modules + Calls sections) per repo rule.
- **Checks**: `npm run build` passes (all routes compile, TS clean). New files lint clean;
  the repo's 40+ pre-existing lint errors in legacy files were left alone.

## What remains (recommended next phase, in order)

1. Saved-views picker UI in FilterBar (table + RLS already live) and tag chips/pickers on
   record pages (org_tags/record_tags already live).
2. Wire projects UI to the new customer/location/division links (edit form fields + display
   on the project page) and surface related calls on project pages.
3. Call attachments (reuse org_files with record_type='call') + required-completion-photo
   enforcement (`require_completion_photo` flag exists).
4. Org call settings UI (terminology/status/priority editor; card-field show/hide + reorder —
   schema fields `card_fields`, `required_fields`, `quick_actions` already exist).
5. Global search across operations records; export (CSV) of filtered lists.
6. Location/asset detail pages (currently managed via the customer hub); customer merge/archive.
7. Dashboard tiles for enabled modules; staff "My Calls" mobile-first view.
8. Migrate/retire the legacy Kalos-flavored Tickets module into Calls (left untouched by design).

## Migrations created (apply in order — see MIGRATION_AND_ROLLBACK.md)

1. `supabase/migrations/20260705_operations_foundation.sql`
2. `supabase/migrations/20260705_operations_crm.sql`
3. `supabase/migrations/20260705_operations_workforce.sql`
4. `supabase/migrations/20260705_operations_calls.sql`
5. `supabase/migrations/20260705_operations_files_invoices.sql`
6. Dev/staging only: `scripts/seed_demo_orgs.sql` (Demo Org A/B + isolation test script)

**⚠ The migrations have NOT been applied to any database** — this branch is code + SQL only.
Nothing changes in production until you run them (backup first per MIGRATION_AND_ROLLBACK.md).

Database changes summary: 20 new tables, 6 new functions, 2 triggers, 1 storage bucket +
3 storage policies, additive columns on `profiles` (ops_role) and `projects`
(customer_id/location_id/division_id). Zero destructive statements.

## Assumptions made

- `companies` is the organization; no separate organizations table (preserves all legacy data
  with zero migration risk).
- Legacy `profiles.role` continues to drive existing features; `ops_role` (backfilled from it)
  drives operations modules only.
- Filtering is client-side over org-scoped datasets for v1 (RLS still guards the data);
  the FilterBar contract allows moving to server-side queries without UI changes.
- Invoice PDF = print-optimized page + browser print-to-PDF (no new dependencies).
- The existing Tickets (dispatch_*) module stays as-is; the new Calls module is separate.
- Default entitlements keep legacy behavior: projects/reports/files on, new modules off.

## Risks requiring manual review

1. **`profiles_update` legacy RLS policy lets a user update their own profile row**, which
   includes the new `ops_role` column. The Staff-page action enforces owner/admin, but a
   crafted direct API call could self-elevate. Recommended hardening (apply after review):
   a trigger rejecting `ops_role`/`role`/`company_id` changes unless `ops_is_admin()`.
2. `call_notes` SELECT policy relies on `calls` RLS via `call_id IN (SELECT id FROM calls)` —
   correct but worth an EXPLAIN check at scale; add a join-based policy if slow.
3. `next_org_number` uses an upsert counter — verify the returned number under concurrent
   inserts in staging (xmax-based branch).
4. Client-side filtering caps calls/files at 500 rows; move heavy orgs server-side.
5. Existing lint debt (43 errors in legacy files) predates this branch — untouched.

## Commands

```bash
# Setup / dev
cd ~/Desktop/ganttic
npm install          # no new dependencies were added
npm run dev          # http://localhost:3000

# Checks
npm run build        # passes on this branch
npm run lint         # legacy errors pre-exist; new operations files are clean

# Migrations: paste each file into the Supabase SQL editor in order (see MIGRATION_AND_ROLLBACK.md)
# Demo orgs + isolation verification (dev/staging only): scripts/seed_demo_orgs.sql
```

There is no automated test suite in this repo; verification is the SQL checklist in
`scripts/seed_demo_orgs.sql` + MULTI_TENANT_SECURITY.md and manual UI passes.

## Git

```bash
# Review everything on the branch
git log --oneline pre-operations-platform..fable/phaseforge-operations-foundation
git diff pre-operations-platform..fable/phaseforge-operations-foundation --stat

# Milestone commits (oldest → newest)
# ab5c862 docs: audits + plan
# 69cfa26 feat(db): multi-tenant foundation
# 550bace feat(db): customers/contacts/locations/assets
# 67ee3c3 feat(db): staff/certs/vendors
# 635f690 feat(db): calls schema
# 6603624 feat(db): files/invoices/project links
# 8d9e2df feat: module entitlements + gated nav
# fcd7f9c feat: Customers UI
# ed15739 feat: Staff + Vendors UI
# 0a5db3f feat: Calls UI
# 8576ec0 feat: Files/Invoices/Reports UI
# (final docs/guide commit follows this file)

# Revert the ENTIRE branch (nothing merged, nothing lost):
git checkout main                        # branch simply remains unmerged; or delete your local copy later

# Revert ONE milestone while keeping the rest (on the branch):
git revert --no-edit <commit-sha>        # e.g. git revert --no-edit 0a5db3f

# Merge safely after review (no direct pushes to main happened):
git checkout main
git pull origin main
git merge --no-ff fable/phaseforge-operations-foundation
npm run build                            # verify before pushing
git push origin main

# Escape hatch if a merge goes wrong BEFORE pushing:
git merge --abort                        # during conflicts
git reset --keep pre-operations-platform # after a bad local merge commit
```

## Final quality checklist status

- Existing login/projects/Gantt/tasks/phases/punch/warranties/attachments: **untouched code
  paths**; build passes; no legacy table/column modified destructively.
- Legacy data → default org: automatic (companies are the orgs; module rows seeded).
- Org A ↔ Org B isolation: enforced by RLS on every new table; verification script provided
  (run after applying migrations).
- Module access beyond navigation: `requireModule()` + `org_has_module()` in RLS.
- Calls create/assign/update/filter/complete, card templates, yellow unread alerts: built.
- Invoice PDF without payments: built (print-to-PDF).
- No live integrations, no AI providers, no secrets in code, no destructive DB actions: **confirmed**.
