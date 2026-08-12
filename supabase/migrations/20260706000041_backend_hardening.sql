SET search_path TO phaseforge, extensions;

-- ============================================================================
-- PhaseForge — Backend hardening (ADDITIVE; based on live Supabase advisors)
-- 1. Block self-elevation of roles/tenancy on profiles (CRITICAL)
-- 2. Pin search_path on legacy SECURITY DEFINER functions (advisor 0011)
-- 3. Revoke PUBLIC/anon EXECUTE on internal functions (advisors 0028/0029)
-- 4. Tighten companies INSERT policy (advisor 0024)
-- Rollback for each section at the bottom of SUPABASE_SECURITY_AND_RLS_AUDIT.md
-- ============================================================================

-- ─── 1. Profiles privilege-escalation guard ─────────────────────────────────
-- The legacy "profiles_update USING (id = auth.uid())" policy lets users edit
-- their own row — which now includes ops_role. This trigger makes the
-- sensitive columns immutable except for org admins / super admins, while
-- normal self-service profile edits (name, avatar, preferences) keep working.

CREATE OR REPLACE FUNCTION phaseforge.protect_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = phaseforge
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  -- No auth context = service role / internal job → allow.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (NEW.role IS DISTINCT FROM OLD.role)
     OR (NEW.ops_role IS DISTINCT FROM OLD.ops_role)
     OR (NEW.company_id IS DISTINCT FROM OLD.company_id)
     OR (NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin) THEN

    SELECT (p.role IN ('owner','admin'))
           OR (p.ops_role IN ('owner','admin'))
           OR COALESCE(p.is_super_admin, false)
      INTO v_is_admin
      FROM phaseforge.profiles p
     WHERE p.id = auth.uid();

    IF NOT COALESCE(v_is_admin, false) THEN
      RAISE EXCEPTION 'Only organization admins can change roles or company membership.';
    END IF;

    -- Nobody flips is_super_admin through the API except an existing super admin.
    IF (NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin) THEN
      IF NOT COALESCE((SELECT is_super_admin FROM phaseforge.profiles WHERE id = auth.uid()), false) THEN
        RAISE EXCEPTION 'Only a super admin can change super admin status.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileges ON phaseforge.profiles;
CREATE TRIGGER trg_protect_profile_privileges
BEFORE UPDATE ON phaseforge.profiles
FOR EACH ROW EXECUTE FUNCTION phaseforge.protect_profile_privileges();

-- ─── 1b. Let org admins update member profiles (BUG FIX) ────────────────────
-- The legacy policy only allowed self-updates (USING id = auth.uid()), so an
-- admin changing a member's ops_role on the Staff page silently updated
-- nothing. Admins may now update rows in their own company; the trigger above
-- still governs WHICH columns imply admin rights.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'phaseforge' AND tablename = 'profiles'
      AND policyname = 'profiles_update_admin'
  ) THEN
    CREATE POLICY "profiles_update_admin" ON phaseforge.profiles FOR UPDATE
      USING (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_admin());
  END IF;
END $$;

-- get_my_team_ids() was created directly in the dashboard (never captured in a
-- tracked migration) and is only referenced by hardening housekeeping below —
-- no RLS policy calls it. Reconstructed here from team_members for local dev
-- parity, mirroring get_my_company_id()'s style.
CREATE OR REPLACE FUNCTION phaseforge.get_my_team_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'phaseforge'
AS $$
  SELECT COALESCE(array_agg(team_id), '{}') FROM phaseforge.team_members WHERE profile_id = auth.uid()
$$;

-- ─── 2. Pin search_path on legacy functions (advisor: 0011) ─────────────────

ALTER FUNCTION phaseforge.handle_new_user() SET search_path = phaseforge;
ALTER FUNCTION phaseforge.get_my_company_id() SET search_path = phaseforge;
ALTER FUNCTION phaseforge.get_my_team_ids() SET search_path = phaseforge;
ALTER FUNCTION phaseforge.initialize_user_preferences() SET search_path = phaseforge;
ALTER FUNCTION phaseforge.initialize_notification_preferences() SET search_path = phaseforge;

-- ─── 3. Revoke anon/PUBLIC EXECUTE on internal functions (0028/0029) ────────
-- These are used inside RLS policies (run as the authenticated role) or by
-- triggers — anonymous visitors have no business calling them via /rest/v1/rpc.

REVOKE EXECUTE ON FUNCTION phaseforge.get_my_ops_role() FROM anon, public;
REVOKE EXECUTE ON FUNCTION phaseforge.ops_is_admin() FROM anon, public;
REVOKE EXECUTE ON FUNCTION phaseforge.ops_is_manager() FROM anon, public;
REVOKE EXECUTE ON FUNCTION phaseforge.org_has_module(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION phaseforge.company_has_dispatch() FROM anon, public;
REVOKE EXECUTE ON FUNCTION phaseforge.next_org_number(text) FROM anon, public;
-- Trigger-only functions: nobody should call these directly at all.
REVOKE EXECUTE ON FUNCTION phaseforge.seed_org_modules() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION phaseforge.touch_call_on_note() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION phaseforge.protect_profile_privileges() FROM anon, authenticated, public;

-- ─── 4. companies INSERT: require a signed-in user (advisor: 0024) ──────────
-- Signup creates the company AFTER auth, so requiring auth.uid() is safe and
-- stops anonymous API clients from inserting junk company rows.

DROP POLICY IF EXISTS "company_insert" ON phaseforge.companies;
CREATE POLICY "company_insert" ON phaseforge.companies FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
