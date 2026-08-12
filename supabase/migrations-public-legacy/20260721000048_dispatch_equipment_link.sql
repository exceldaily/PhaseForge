-- Dispatch equipment integration: service calls can reference a customer's
-- asset (equipment) record; dispatch orgs can read assets + locations.
-- APPLIED LIVE 2026-07-21.

ALTER TABLE public.dispatch_service_calls
  ADD COLUMN IF NOT EXISTS asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL;

ALTER POLICY assets_select ON public.assets
  USING (company_id = public.get_my_company_id()
         AND (public.org_has_module('customers') OR public.dispatch_allowed()));
ALTER POLICY assets_insert ON public.assets
  WITH CHECK (company_id = public.get_my_company_id()
              AND (public.org_has_module('customers') OR public.dispatch_allowed())
              AND public.ops_is_manager());
ALTER POLICY locations_select ON public.locations
  USING (company_id = public.get_my_company_id()
         AND (public.org_has_module('customers') OR public.dispatch_allowed()));
ALTER POLICY locations_insert ON public.locations
  WITH CHECK (company_id = public.get_my_company_id()
              AND (public.org_has_module('customers') OR public.dispatch_allowed())
              AND public.ops_is_manager());
