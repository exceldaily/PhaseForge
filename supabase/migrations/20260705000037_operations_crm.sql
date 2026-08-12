SET search_path TO phaseforge, extensions;

-- ============================================================================
-- PhaseForge Operations — Customers, Contacts, Locations, Assets (ADDITIVE)
-- Central chain: Organization → Customer → Location → Asset
-- Requires: 20260705_operations_foundation.sql
-- ============================================================================

-- ─── customers ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phaseforge.customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  name          text NOT NULL,
  status        text NOT NULL DEFAULT 'active',   -- active | inactive | prospect | on_hold
  division_id   uuid REFERENCES phaseforge.divisions(id) ON DELETE SET NULL,
  customer_type text,                              -- commercial | residential | government | other
  phone         text,
  email         text,
  website       text,
  billing_address text,
  billing_status  text,                            -- current | past_due | credit_hold (informational)
  notes         text,
  last_activity_at timestamptz,
  created_by    uuid REFERENCES phaseforge.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_company  ON phaseforge.customers(company_id);
CREATE INDEX IF NOT EXISTS idx_customers_status   ON phaseforge.customers(company_id, status);
CREATE INDEX IF NOT EXISTS idx_customers_division ON phaseforge.customers(division_id);
CREATE INDEX IF NOT EXISTS idx_customers_name     ON phaseforge.customers(company_id, name);

ALTER TABLE phaseforge.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers_select" ON phaseforge.customers FOR SELECT
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('customers'));
CREATE POLICY "customers_insert" ON phaseforge.customers FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('customers')
    AND phaseforge.ops_is_manager());
CREATE POLICY "customers_update" ON phaseforge.customers FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('customers')
    AND phaseforge.ops_is_manager());
CREATE POLICY "customers_delete" ON phaseforge.customers FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('customers')
    AND phaseforge.ops_is_admin());

-- ─── customer_contacts (site + billing contacts) ────────────────────────────

CREATE TABLE IF NOT EXISTS phaseforge.customer_contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  customer_id  uuid NOT NULL REFERENCES phaseforge.customers(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON phaseforge.customer_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_company  ON phaseforge.customer_contacts(company_id);

ALTER TABLE phaseforge.customer_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_contacts_select" ON phaseforge.customer_contacts FOR SELECT
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('customers'));
CREATE POLICY "customer_contacts_insert" ON phaseforge.customer_contacts FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('customers')
    AND phaseforge.ops_is_manager());
CREATE POLICY "customer_contacts_update" ON phaseforge.customer_contacts FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('customers')
    AND phaseforge.ops_is_manager());
CREATE POLICY "customer_contacts_delete" ON phaseforge.customer_contacts FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('customers')
    AND phaseforge.ops_is_manager());

-- ─── locations ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phaseforge.locations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  customer_id     uuid NOT NULL REFERENCES phaseforge.customers(id) ON DELETE CASCADE,
  division_id     uuid REFERENCES phaseforge.divisions(id) ON DELETE SET NULL,
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
  created_by      uuid REFERENCES phaseforge.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_locations_company  ON phaseforge.locations(company_id);
CREATE INDEX IF NOT EXISTS idx_locations_customer ON phaseforge.locations(customer_id);
CREATE INDEX IF NOT EXISTS idx_locations_division ON phaseforge.locations(division_id);
CREATE INDEX IF NOT EXISTS idx_locations_city     ON phaseforge.locations(company_id, city);
CREATE INDEX IF NOT EXISTS idx_locations_state    ON phaseforge.locations(company_id, state);
CREATE INDEX IF NOT EXISTS idx_locations_number   ON phaseforge.locations(company_id, location_number);

ALTER TABLE phaseforge.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "locations_select" ON phaseforge.locations FOR SELECT
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('customers'));
CREATE POLICY "locations_insert" ON phaseforge.locations FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('customers')
    AND phaseforge.ops_is_manager());
CREATE POLICY "locations_update" ON phaseforge.locations FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('customers')
    AND phaseforge.ops_is_manager());
CREATE POLICY "locations_delete" ON phaseforge.locations FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('customers')
    AND phaseforge.ops_is_admin());

-- Late FK for customer_contacts.location_id (site contacts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'customer_contacts_location_fk'
  ) THEN
    ALTER TABLE phaseforge.customer_contacts
      ADD CONSTRAINT customer_contacts_location_fk
      FOREIGN KEY (location_id) REFERENCES phaseforge.locations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── assets / equipment ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phaseforge.assets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  customer_id      uuid NOT NULL REFERENCES phaseforge.customers(id) ON DELETE CASCADE,
  location_id      uuid NOT NULL REFERENCES phaseforge.locations(id) ON DELETE CASCADE,
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
  created_by       uuid REFERENCES phaseforge.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assets_company   ON phaseforge.assets(company_id);
CREATE INDEX IF NOT EXISTS idx_assets_customer  ON phaseforge.assets(customer_id);
CREATE INDEX IF NOT EXISTS idx_assets_location  ON phaseforge.assets(location_id);
CREATE INDEX IF NOT EXISTS idx_assets_type      ON phaseforge.assets(company_id, asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_warranty  ON phaseforge.assets(company_id, warranty_end);
CREATE INDEX IF NOT EXISTS idx_assets_status    ON phaseforge.assets(company_id, status);

ALTER TABLE phaseforge.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assets_select" ON phaseforge.assets FOR SELECT
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('customers'));
CREATE POLICY "assets_insert" ON phaseforge.assets FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('customers')
    AND phaseforge.ops_is_manager());
CREATE POLICY "assets_update" ON phaseforge.assets FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('customers')
    AND phaseforge.ops_is_manager());
CREATE POLICY "assets_delete" ON phaseforge.assets FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('customers')
    AND phaseforge.ops_is_admin());
