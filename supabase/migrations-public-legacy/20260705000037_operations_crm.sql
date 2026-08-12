-- ============================================================================
-- PhaseForge Operations — Customers, Contacts, Locations, Assets (ADDITIVE)
-- Central chain: Organization → Customer → Location → Asset
-- Requires: 20260705_operations_foundation.sql
-- ============================================================================

-- ─── customers ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name          text NOT NULL,
  status        text NOT NULL DEFAULT 'active',   -- active | inactive | prospect | on_hold
  division_id   uuid REFERENCES public.divisions(id) ON DELETE SET NULL,
  customer_type text,                              -- commercial | residential | government | other
  phone         text,
  email         text,
  website       text,
  billing_address text,
  billing_status  text,                            -- current | past_due | credit_hold (informational)
  notes         text,
  last_activity_at timestamptz,
  created_by    uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_company  ON public.customers(company_id);
CREATE INDEX IF NOT EXISTS idx_customers_status   ON public.customers(company_id, status);
CREATE INDEX IF NOT EXISTS idx_customers_division ON public.customers(division_id);
CREATE INDEX IF NOT EXISTS idx_customers_name     ON public.customers(company_id, name);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers_select" ON public.customers FOR SELECT
  USING (company_id = public.get_my_company_id() AND public.org_has_module('customers'));
CREATE POLICY "customers_insert" ON public.customers FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.org_has_module('customers')
    AND public.ops_is_manager());
CREATE POLICY "customers_update" ON public.customers FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('customers')
    AND public.ops_is_manager());
CREATE POLICY "customers_delete" ON public.customers FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('customers')
    AND public.ops_is_admin());

-- ─── customer_contacts (site + billing contacts) ────────────────────────────

CREATE TABLE IF NOT EXISTS public.customer_contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id  uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  location_id  uuid,                                -- FK added after locations table below
  name         text NOT NULL,
  title        text,
  email        text,
  phone        text,
  is_billing   boolean NOT NULL DEFAULT false,
  is_primary   boolean NOT NULL DEFAULT false,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON public.customer_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_company  ON public.customer_contacts(company_id);

ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_contacts_select" ON public.customer_contacts FOR SELECT
  USING (company_id = public.get_my_company_id() AND public.org_has_module('customers'));
CREATE POLICY "customer_contacts_insert" ON public.customer_contacts FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.org_has_module('customers')
    AND public.ops_is_manager());
CREATE POLICY "customer_contacts_update" ON public.customer_contacts FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('customers')
    AND public.ops_is_manager());
CREATE POLICY "customer_contacts_delete" ON public.customer_contacts FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('customers')
    AND public.ops_is_manager());

-- ─── locations ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.locations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id     uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  division_id     uuid REFERENCES public.divisions(id) ON DELETE SET NULL,
  name            text NOT NULL,
  location_number text,                             -- store / site number
  address         text,
  city            text,
  state           text,
  postal_code     text,
  country         text,
  timezone        text,
  access_notes    text,
  site_notes      text,
  status          text NOT NULL DEFAULT 'active',   -- active | inactive
  created_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_locations_company  ON public.locations(company_id);
CREATE INDEX IF NOT EXISTS idx_locations_customer ON public.locations(customer_id);
CREATE INDEX IF NOT EXISTS idx_locations_division ON public.locations(division_id);
CREATE INDEX IF NOT EXISTS idx_locations_city     ON public.locations(company_id, city);
CREATE INDEX IF NOT EXISTS idx_locations_state    ON public.locations(company_id, state);
CREATE INDEX IF NOT EXISTS idx_locations_number   ON public.locations(company_id, location_number);

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "locations_select" ON public.locations FOR SELECT
  USING (company_id = public.get_my_company_id() AND public.org_has_module('customers'));
CREATE POLICY "locations_insert" ON public.locations FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.org_has_module('customers')
    AND public.ops_is_manager());
CREATE POLICY "locations_update" ON public.locations FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('customers')
    AND public.ops_is_manager());
CREATE POLICY "locations_delete" ON public.locations FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('customers')
    AND public.ops_is_admin());

-- Late FK for customer_contacts.location_id (site contacts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'customer_contacts_location_fk'
  ) THEN
    ALTER TABLE public.customer_contacts
      ADD CONSTRAINT customer_contacts_location_fk
      FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── assets / equipment ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.assets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id      uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  location_id      uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  asset_type       text,                            -- rack, RTU, panel, water heater, ...
  trade_category   text,                            -- hvac | refrigeration | electrical | plumbing | general
  make             text,
  model            text,
  serial_number    text,
  install_date     date,
  warranty_start   date,
  warranty_end     date,
  warranty_provider text,
  status           text NOT NULL DEFAULT 'in_service',  -- in_service | needs_attention | out_of_service | retired
  notes            text,
  created_by       uuid REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assets_company   ON public.assets(company_id);
CREATE INDEX IF NOT EXISTS idx_assets_customer  ON public.assets(customer_id);
CREATE INDEX IF NOT EXISTS idx_assets_location  ON public.assets(location_id);
CREATE INDEX IF NOT EXISTS idx_assets_type      ON public.assets(company_id, asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_warranty  ON public.assets(company_id, warranty_end);
CREATE INDEX IF NOT EXISTS idx_assets_status    ON public.assets(company_id, status);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assets_select" ON public.assets FOR SELECT
  USING (company_id = public.get_my_company_id() AND public.org_has_module('customers'));
CREATE POLICY "assets_insert" ON public.assets FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.org_has_module('customers')
    AND public.ops_is_manager());
CREATE POLICY "assets_update" ON public.assets FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('customers')
    AND public.ops_is_manager());
CREATE POLICY "assets_delete" ON public.assets FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('customers')
    AND public.ops_is_admin());
