-- DispatchForge port: service-call dispatch system, company-scoped.
-- APPLIED LIVE 2026-07-21. Fresh tables; old dispatch_* (Tickets) untouched.

CREATE OR REPLACE FUNCTION public.dispatch_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.dispatch_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispatch_priority_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.dispatch_customers(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  severity text NOT NULL DEFAULT 'normal',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispatch_techs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  company text,
  email text,
  phone text,
  trade_type text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispatch_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.dispatch_customers(id) ON DELETE SET NULL,
  store_number text NOT NULL,
  store_name text NOT NULL,
  address text, city text, state text,
  main_tech_id uuid REFERENCES public.dispatch_techs(id) ON DELETE SET NULL,
  store_manager text, district_manager text,
  google_maps_url text, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, store_number)
);

CREATE TABLE IF NOT EXISTS public.dispatch_service_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.dispatch_stores(id) ON DELETE CASCADE,
  service_call_number text NOT NULL,
  tracking_url text,
  internal_job_number text,
  internal_job_url text,
  urgency text NOT NULL DEFAULT 'normal',
  priority_level_id uuid REFERENCES public.dispatch_priority_levels(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  next_action text NOT NULL DEFAULT 'none',
  date_started timestamptz NOT NULL DEFAULT now(),
  eta_scheduled timestamptz,
  scheduled_date timestamptz,
  rack_circuit_case text,
  description text NOT NULL,
  manager_note text,
  assigned_vendor_id uuid REFERENCES public.dispatch_techs(id) ON DELETE SET NULL,
  part_status text NOT NULL DEFAULT 'none',
  proposal_status text NOT NULL DEFAULT 'none',
  completed_date timestamptz,
  nte numeric(10,2),
  needs_acknowledgment boolean NOT NULL DEFAULT false,
  custom_fields jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispatch_call_vendors (
  call_id uuid NOT NULL REFERENCES public.dispatch_service_calls(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.dispatch_techs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (call_id, vendor_id)
);

CREATE TABLE IF NOT EXISTS public.dispatch_call_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.dispatch_service_calls(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note_category text NOT NULL DEFAULT 'internal_note',
  note_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispatch_call_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.dispatch_service_calls(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  previous_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Org-defined extra fields on the New Service Call card ("fillable blanks").
CREATE TABLE IF NOT EXISTS public.dispatch_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dp_stores_org ON public.dispatch_stores(company_id);
CREATE INDEX IF NOT EXISTS idx_dp_techs_org ON public.dispatch_techs(company_id);
CREATE INDEX IF NOT EXISTS idx_dp_calls_org ON public.dispatch_service_calls(company_id);
CREATE INDEX IF NOT EXISTS idx_dp_calls_store ON public.dispatch_service_calls(store_id);
CREATE INDEX IF NOT EXISTS idx_dp_calls_status ON public.dispatch_service_calls(status);
CREATE INDEX IF NOT EXISTS idx_dp_notes_call ON public.dispatch_call_notes(call_id);
CREATE INDEX IF NOT EXISTS idx_dp_activity_call ON public.dispatch_call_activity(call_id);

DROP TRIGGER IF EXISTS trg_dispatch_calls_updated ON public.dispatch_service_calls;
CREATE TRIGGER trg_dispatch_calls_updated
  BEFORE UPDATE ON public.dispatch_service_calls
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_set_updated_at();

ALTER TABLE public.dispatch_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_priority_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_techs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_service_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_call_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_call_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_call_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_form_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_customers_all" ON public.dispatch_customers FOR ALL
  USING (company_id = public.get_my_company_id()) WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "dp_levels_all" ON public.dispatch_priority_levels FOR ALL
  USING (company_id = public.get_my_company_id()) WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "dp_techs_all" ON public.dispatch_techs FOR ALL
  USING (company_id = public.get_my_company_id()) WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "dp_stores_all" ON public.dispatch_stores FOR ALL
  USING (company_id = public.get_my_company_id()) WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "dp_calls_all" ON public.dispatch_service_calls FOR ALL
  USING (company_id = public.get_my_company_id()) WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "dp_call_vendors_all" ON public.dispatch_call_vendors FOR ALL
  USING (call_id IN (SELECT id FROM public.dispatch_service_calls WHERE company_id = public.get_my_company_id()))
  WITH CHECK (call_id IN (SELECT id FROM public.dispatch_service_calls WHERE company_id = public.get_my_company_id()));
CREATE POLICY "dp_call_notes_all" ON public.dispatch_call_notes FOR ALL
  USING (call_id IN (SELECT id FROM public.dispatch_service_calls WHERE company_id = public.get_my_company_id()))
  WITH CHECK (call_id IN (SELECT id FROM public.dispatch_service_calls WHERE company_id = public.get_my_company_id()));
CREATE POLICY "dp_call_activity_select" ON public.dispatch_call_activity FOR SELECT
  USING (call_id IN (SELECT id FROM public.dispatch_service_calls WHERE company_id = public.get_my_company_id()));
CREATE POLICY "dp_call_activity_insert" ON public.dispatch_call_activity FOR INSERT
  WITH CHECK (call_id IN (SELECT id FROM public.dispatch_service_calls WHERE company_id = public.get_my_company_id()));
CREATE POLICY "dp_form_fields_all" ON public.dispatch_form_fields FOR ALL
  USING (company_id = public.get_my_company_id()) WITH CHECK (company_id = public.get_my_company_id());
