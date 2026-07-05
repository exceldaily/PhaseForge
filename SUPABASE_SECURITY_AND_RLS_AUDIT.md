# Supabase Security & RLS Audit

Applied to the live PhaseForge project on 2026-07-05 as migration
`backend_hardening_profiles_functions_policies` (file:
`supabase/migrations/20260706_backend_hardening.sql`). Advisors re-run afterwards should
clear the corresponding lints.

## Changes, risk-by-risk

| # | Previous risk | New behavior | Tables/objects |
|---|---|---|---|
| 1 | Any user could set their own `ops_role`/`role`/`company_id`/`is_super_admin` via REST (self-update policy covers all columns) | BEFORE UPDATE trigger rejects changes to those 4 columns unless caller is org admin; `is_super_admin` additionally requires an existing super admin; service-role (no auth context) unaffected | `profiles` + `protect_profile_privileges()` |
| 2 | Admins could NOT update members' profiles (self-only policy) → Staff role dropdown silently no-oped | `profiles_update_admin` policy: UPDATE allowed when target row is in caller's company AND caller is admin | `profiles` |
| 3 | 5 legacy SECURITY DEFINER functions had mutable search_path (hijack vector) | `SET search_path = public` pinned | `handle_new_user`, `get_my_company_id`, `get_my_team_ids`, `initialize_user_preferences`, `initialize_notification_preferences` |
| 4 | Anonymous visitors could execute internal functions via `/rest/v1/rpc/*` | EXECUTE revoked from `anon`/`public` (and from `authenticated` for trigger-only functions) | `get_my_ops_role`, `ops_is_admin`, `ops_is_manager`, `org_has_module`, `company_has_dispatch`, `next_org_number`, `seed_org_modules`, `touch_call_on_note`, `protect_profile_privileges` |
| 5 | `companies` INSERT was `WITH CHECK (true)` — anon could insert rows | Requires `auth.uid() IS NOT NULL`; signup (post-auth) unaffected | `companies` |

## Manual test steps

1. **Self-elevation blocked:** as a `staff` user, run
   `UPDATE profiles SET ops_role='owner' WHERE id = auth.uid();` via SQL editor impersonation
   or REST → expect `Only organization admins can change roles…` error.
2. **Self-service still works:** same user updates their own `full_name` → succeeds.
3. **Admin role change works now:** as owner, Staff page → change a member's role → reload →
   value persists (was silently failing before).
4. **Anon RPC blocked:** unauthenticated
   `POST /rest/v1/rpc/get_my_ops_role` → 401/permission denied (was 200 `read_only` before).
5. **Signup unaffected:** create a fresh account end-to-end → company + profile + module rows
   all created.

## Rollback (each independent)

```sql
-- 1/2
DROP TRIGGER IF EXISTS trg_protect_profile_privileges ON public.profiles;
DROP FUNCTION IF EXISTS public.protect_profile_privileges();
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
-- 3 (reverts to unpinned; not recommended)
ALTER FUNCTION public.handle_new_user() RESET search_path;            -- etc. for the other 4
-- 4
GRANT EXECUTE ON FUNCTION public.get_my_ops_role() TO anon;           -- etc. per function
-- 5
DROP POLICY IF EXISTS "company_insert" ON public.companies;
CREATE POLICY "company_insert" ON public.companies FOR INSERT WITH CHECK (true);
```

## Explicitly NOT changed (with reasons)

- `billing_history` / `notifications` / `*_preferences` "service role" policies with
  `true` checks: real writers not fully traced; scoping blindly could break Stripe webhook
  writes or in-app notifications. Next sprint item with staging verification.
- Legacy functions still executable by `anon` (return NULL without a session; revoking could
  disrupt policy evaluation on any pre-auth path).
- Storage: `org-files` policies verified org-scoped by path; `project-attachments` flows
  verified working via the app; no changes needed.
- Leaked-password protection: **manual dashboard toggle required** (Auth → Password settings).
