SET search_path TO phaseforge, extensions;

-- Integrate Dispatch with the shared operations customers table: one customer
-- list drives both the Customers page and Dispatch. APPLIED LIVE 2026-07-21.
-- dispatch_customers was empty (created same day) and is dropped.

CREATE OR REPLACE FUNCTION phaseforge.dispatch_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'phaseforge'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM phaseforge.companies c
    WHERE c.id = phaseforge.get_my_company_id()
      AND (COALESCE(c.dispatch_enabled, false)
           OR c.plan IN ('individual', 'pro', 'business', 'enterprise'))
  )
$$;
REVOKE EXECUTE ON FUNCTION phaseforge.dispatch_allowed() FROM anon;

ALTER POLICY customers_select ON phaseforge.customers
  USING (company_id = phaseforge.get_my_company_id()
         AND (phaseforge.org_has_module('customers') OR phaseforge.dispatch_allowed()));
ALTER POLICY customers_insert ON phaseforge.customers
  WITH CHECK (company_id = phaseforge.get_my_company_id()
              AND (phaseforge.org_has_module('customers') OR phaseforge.dispatch_allowed())
              AND phaseforge.ops_is_manager());
ALTER POLICY customers_update ON phaseforge.customers
  USING (company_id = phaseforge.get_my_company_id()
         AND (phaseforge.org_has_module('customers') OR phaseforge.dispatch_allowed())
         AND phaseforge.ops_is_manager());
ALTER POLICY customers_delete ON phaseforge.customers
  USING (company_id = phaseforge.get_my_company_id()
         AND (phaseforge.org_has_module('customers') OR phaseforge.dispatch_allowed())
         AND phaseforge.ops_is_admin());

ALTER TABLE phaseforge.dispatch_stores DROP CONSTRAINT IF EXISTS dispatch_stores_customer_id_fkey;
ALTER TABLE phaseforge.dispatch_stores ADD CONSTRAINT dispatch_stores_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES phaseforge.customers(id) ON DELETE SET NULL;
ALTER TABLE phaseforge.dispatch_priority_levels DROP CONSTRAINT IF EXISTS dispatch_priority_levels_customer_id_fkey;
ALTER TABLE phaseforge.dispatch_priority_levels ADD CONSTRAINT dispatch_priority_levels_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES phaseforge.customers(id) ON DELETE CASCADE;

DROP TABLE IF EXISTS phaseforge.dispatch_customers;
