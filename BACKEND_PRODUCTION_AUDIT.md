# Backend Production Audit

Branch `fable/backend-hardening`. Source of truth: live Supabase advisors (security lints run
against the production PhaseForge project) + code inspection. Sibling docs:
SUPABASE_SECURITY_AND_RLS_AUDIT.md · PERFORMANCE_AND_QUERY_AUDIT.md · FILE_LIFECYCLE_AND_DELETION.md.

## Findings by severity

### Critical — fixed this sprint (applied to live DB)

1. **Users could self-elevate roles.** Legacy `profiles_update` policy allows any user to
   update their own row — including `ops_role`, `role`, `company_id`, `is_super_admin` via a
   crafted REST call. *Fix:* `protect_profile_privileges` BEFORE UPDATE trigger — those four
   columns now require org-admin (and `is_super_admin` requires an existing super admin).
2. **Admin role changes silently failed.** The same self-only policy meant an admin changing a
   *member's* role on the Staff page updated 0 rows with no error. *Fix:* new
   `profiles_update_admin` policy (org-scoped, admin-only) + the trigger above governing
   sensitive columns. User impact before fix: role dropdown appeared to work but nothing saved.

### High — fixed this sprint

3. **Customer records couldn't be edited or deleted (reported bug).** Root cause: UI gap —
   `updateCustomer` existed but only notes had an edit surface; no delete action existed at
   all. *Fix:* Edit modal (name/status/type/phone/email/billing/division), admin-only Delete
   with cascade-explaining confirmation, `deleteCustomer` server action (RLS re-enforced).
4. **`companies` INSERT policy was `WITH CHECK (true)`** — anonymous API clients could insert
   junk companies. *Fix:* now requires `auth.uid() IS NOT NULL` (signup happens post-auth, so
   the flow is unaffected).
5. **Internal SECURITY DEFINER functions callable by `anon`** (default PUBLIC EXECUTE):
   `get_my_ops_role`, `ops_is_admin/manager`, `org_has_module`, `next_org_number`, trigger
   functions, etc. *Fix:* revoked from `anon`/`public`; trigger-only functions revoked from
   `authenticated` too.

### Medium — fixed this sprint

6. **Mutable `search_path` on 5 legacy SECURITY DEFINER functions** (advisor 0011; search-path
   hijack hardening). *Fix:* `ALTER FUNCTION … SET search_path = public`.

### Medium — documented, NOT changed (manual review required)

7. **Service-role-named INSERT/UPDATE policies with `true`** on `billing_history`,
   `notifications`, `notification_preferences`, `user_preferences`. The service role bypasses
   RLS, so these policies actually grant *authenticated users* unrestricted inserts. Left
   untouched because in-app notification creation may rely on them — scoping them without a
   full trace of every insert path risks breaking notifications/billing webhooks. Next sprint:
   trace writers, then scope `TO service_role` or add proper checks.
8. **Leaked-password protection disabled** (Supabase Auth). Manual dashboard step:
   Auth → Providers → Password → enable "Leaked password protection".
9. **RLS-enabled-no-policy tables** — `attachments` (legacy, 0 rows), `project_members`
   (0 rows), `org_counters` (by design: only reachable through `next_org_number`). Deny-all
   is the intended state; documented so nobody "fixes" it by adding permissive policies.

### Low / cleanup (documented)

10. `anon` can still EXECUTE legacy functions (`get_my_company_id`, `get_my_role`,
    `can_access_board`, `handle_new_user`…). Left as-is: revoking risks breaking PostgREST
    policy evaluation for any pre-auth surface; the functions leak nothing (return NULL
    without a session). Candidate for the next hardening pass with staging verification.
11. No automated test infra existed. *Fix:* vitest added (dev-only) + 8 unit tests on the
    trade-reading templates and maps-URL helpers. CRUD/RLS integration tests need a seeded
    staging project — documented in PRODUCTION_READINESS_CHECKLIST.md.
12. Legacy `attachments` table unused by current UI — retire in a future schema-cleanup sprint.

## Stack facts (verified)

Next.js 16 App Router; Supabase via `@supabase/ssr` (anon key only in frontend — no
service-role key anywhere in `src/`); server actions re-check module + role before writes;
all operations tables org-scoped with RLS; storage buckets private with per-org path policies;
`npm run build` + `npm run lint` + `npm test` all pass on this branch.
