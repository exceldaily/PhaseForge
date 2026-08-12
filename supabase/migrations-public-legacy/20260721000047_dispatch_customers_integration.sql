-- Integrate Dispatch with the shared operations customers table: one customer
-- list drives both the Customers page and Dispatch. APPLIED LIVE 2026-07-21.
-- dispatch_customers was empty (created same day) and is dropped.

CREATE OR REPLACE FUNCTION public.dispatch_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = public.get_my_company_id()
      AND (COALESCE(c.dispatch_enabled, false)
           OR c.plan IN ('individual', 'pro', 'business', 'enterprise'))
  )
$$;
REVOKE EXECUTE ON FUNCTION public.dispatch_allowed() FROM anon;

ALTER POLICY customers_select ON public.customers
  USING (company_id = public.get_my_company_id()
         AND (public.org_has_module('customers') OR public.dispatch_allowed()));
ALTER POLICY customers_insert ON public.customers
  WITH CHECK (company_id = public.get_my_company_id()
              AND (public.org_has_module('customers') OR public.dispatch_allowed())
              AND public.ops_is_manager());
ALTER POLICY customers_update ON public.customers
  USING (company_id = public.get_my_company_id()
         AND (public.org_has_module('customers') OR public.dispatch_allowed())
         AND public.ops_is_manager());
ALTER POLICY customers_delete ON public.customers
  USING (company_id = public.get_my_company_id()
         AND (public.org_has_module('customers') OR public.dispatch_allowed())
         AND public.ops_is_admin());

ALTER TABLE public.dispatch_stores DROP CONSTRAINT IF EXISTS dispatch_stores_customer_id_fkey;
ALTER TABLE public.dispatch_stores ADD CONSTRAINT dispatch_stores_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE public.dispatch_priority_levels DROP CONSTRAINT IF EXISTS dispatch_priority_levels_customer_id_fkey;
ALTER TABLE public.dispatch_priority_levels ADD CONSTRAINT dispatch_priority_levels_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

DROP TABLE IF EXISTS public.dispatch_customers;
