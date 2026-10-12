SET search_path TO phaseforge, extensions;

-- Payroll Audit is visible to the organization owner only. The SELECT policies
-- on every payroll_audit_* table already call this function, so replacing it
-- narrows all of them at once. Admins and managers no longer read these rows
-- through their own login. (The server writes with the service role.)
--
-- The function keeps its original name so the policies need no change.

CREATE OR REPLACE FUNCTION phaseforge.payroll_audit_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'phaseforge' AS $$
  SELECT EXISTS (
    SELECT 1 FROM phaseforge.profiles p
    WHERE p.id = auth.uid() AND (p.role = 'owner' OR p.ops_role = 'owner')
  )
$$;
