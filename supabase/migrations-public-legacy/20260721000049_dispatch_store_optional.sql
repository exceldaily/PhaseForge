-- Dispatch calls: store becomes optional (customer-only calls) and calls carry
-- their own customer_id. Adds per-org hiding of optional built-in form fields
-- (rack/circuit/case). APPLIED LIVE 2026-07-21.

ALTER TABLE public.dispatch_service_calls ALTER COLUMN store_id DROP NOT NULL;
ALTER TABLE public.dispatch_service_calls
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
UPDATE public.dispatch_service_calls c SET customer_id = s.customer_id
  FROM public.dispatch_stores s WHERE c.store_id = s.id AND c.customer_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_dp_calls_customer ON public.dispatch_service_calls(customer_id);

CREATE TABLE IF NOT EXISTS public.dispatch_company_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  hidden_builtin_fields text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dispatch_company_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dp_settings_all" ON public.dispatch_company_settings;
CREATE POLICY "dp_settings_all" ON public.dispatch_company_settings FOR ALL
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
