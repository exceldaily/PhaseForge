SET search_path TO phaseforge, extensions;

-- Dispatch equipment integration: service calls can reference a customer's
-- asset (equipment) record; dispatch orgs can read assets + locations.
-- APPLIED LIVE 2026-07-21.

ALTER TABLE phaseforge.dispatch_service_calls
  ADD COLUMN IF NOT EXISTS asset_id uuid REFERENCES phaseforge.assets(id) ON DELETE SET NULL;

ALTER POLICY assets_select ON phaseforge.assets
  USING (company_id = phaseforge.get_my_company_id()
         AND (phaseforge.org_has_module('customers') OR phaseforge.dispatch_allowed()));
ALTER POLICY assets_insert ON phaseforge.assets
  WITH CHECK (company_id = phaseforge.get_my_company_id()
              AND (phaseforge.org_has_module('customers') OR phaseforge.dispatch_allowed())
              AND phaseforge.ops_is_manager());
ALTER POLICY locations_select ON phaseforge.locations
  USING (company_id = phaseforge.get_my_company_id()
         AND (phaseforge.org_has_module('customers') OR phaseforge.dispatch_allowed()));
ALTER POLICY locations_insert ON phaseforge.locations
  WITH CHECK (company_id = phaseforge.get_my_company_id()
              AND (phaseforge.org_has_module('customers') OR phaseforge.dispatch_allowed())
              AND phaseforge.ops_is_manager());
