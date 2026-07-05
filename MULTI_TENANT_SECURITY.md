# Multi-Tenant Security

## Principles

1. **RLS is the source of truth.** Frontend filtering and hidden links are never the only gate.
2. Every operations table has `company_id uuid NOT NULL REFERENCES companies(id)` and RLS enabled.
3. Policies compose three predicates:
   - **Org**: `company_id = public.get_my_company_id()`
   - **Module**: `public.org_has_module('<key>')` — disabling a module cuts data access at the DB
   - **Role**: `public.get_my_ops_role()` / `ops_is_manager()` / `ops_is_admin()`

## Helper functions (SECURITY DEFINER, STABLE)

| Function | Returns |
|---|---|
| `get_my_company_id()` | caller's org id (pre-existing) |
| `get_my_ops_role()` | caller's ops role, `read_only` fallback |
| `ops_is_admin()` | role ∈ {owner, admin} |
| `ops_is_manager()` | role ∈ {owner, admin, dispatcher, project_manager} |
| `org_has_module(text)` | entitlement check for caller's org |
| `next_org_number(text)` | atomic per-org counter (calls, invoices) |

## Policy matrix (summary)

| Table | SELECT | INSERT/UPDATE | DELETE |
|---|---|---|---|
| organization_modules | org members | admin | admin |
| divisions, org_call_settings | org members | admin | admin |
| org_tags, note_templates | org members | manager | manager/admin |
| customers, locations, assets, contacts | org + module | manager | admin |
| staff_details | org + module | admin or self | admin |
| staff_certifications | org + module | manager | manager |
| vendors, vendor_contacts | org + module | manager | admin/manager |
| **calls** | managers+billing all; staff only assigned/created | staff+ create; managers or assignee update | admin |
| call_notes | via call visibility | author only | admin |
| call_reads | own rows only | own rows only | — |
| org_files | org + module | uploader | manager or uploader |
| invoices, invoice_items | owner/admin/billing/PM/dispatcher | owner/admin/billing | admin/billing |
| ops_activity | org members | org members (append-only) | none |
| saved_views | own + shared org views | own; shared views manager+ | same |

Storage: bucket `org-files` (private). Object policies require the first path segment to equal
the caller's `company_id` — cross-org reads/writes/deletes are impossible even with a known path.

## Sensitive-mutation protection

- `organization_modules`, `divisions`, `org_call_settings`: admin-only writes (RLS) + server
  action re-checks.
- `profiles.ops_role`: changed only via the Staff page server action (owner/admin check,
  self-demotion blocked). Note: the legacy `profiles_update` policy allows a user to update
  their own profile row — see Risks in FABLE_HANDOFF.md for the recommended hardening trigger.
- Invoice writes restricted to owner/admin/billing at both RLS and action level.

## Verification (repeatable)

`scripts/seed_demo_orgs.sql` seeds Demo Organization A and B (dev/staging only) and documents
step-by-step SQL checks proving:

1. Org A cannot SELECT/UPDATE/INSERT Org B rows (0 rows / RLS error).
2. Legacy users still reach their original company's data (companies were auto-seeded with
   modules; projects/reports/files enabled by default).
3. A `staff` ops_role user sees only assigned/created calls and no invoices.
4. Disabling a module removes both the page (redirect) and the data (RLS returns 0 rows),
   including direct-URL access.
