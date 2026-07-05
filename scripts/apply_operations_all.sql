-- ============================================================================
-- PhaseForge Operations — FULL APPLY SCRIPT (run in Supabase SQL editor)
-- Generated from supabase/migrations/20260705_operations_*.sql on branch
-- fable/phaseforge-operations-foundation. Additive only, safe to re-run.
-- BACK UP FIRST (see MIGRATION_AND_ROLLBACK.md). Run this whole file at once.
-- ============================================================================


-- ####################################################################
-- ## FILE: supabase/migrations/20260705_operations_foundation.sql
-- ####################################################################

-- ============================================================================
-- PhaseForge Operations — Multi-tenant foundation (ADDITIVE ONLY)
-- Organizations = existing public.companies rows. Everything here hangs off
-- company_id and never alters or removes existing data.
--
-- Rollback: see MIGRATION_AND_ROLLBACK.md (drops only objects created here).
-- ============================================================================

-- ─── 1. Operations roles ────────────────────────────────────────────────────
-- Additive column; legacy profiles.role keeps driving all existing features.
-- ops_role values: owner | admin | dispatcher | project_manager | billing | staff | read_only

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ops_role text;

UPDATE public.profiles SET ops_role = CASE role
    WHEN 'owner'   THEN 'owner'
    WHEN 'admin'   THEN 'admin'
    WHEN 'manager' THEN 'project_manager'
    WHEN 'member'  THEN 'staff'
    ELSE 'read_only'
  END
WHERE ops_role IS NULL;

CREATE OR REPLACE FUNCTION public.get_my_ops_role()
RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT ops_role FROM public.profiles WHERE id = auth.uid()),
    'read_only'
  )
$$;
GRANT EXECUTE ON FUNCTION public.get_my_ops_role() TO authenticated, anon;

-- Convenience predicates used across operations RLS policies
CREATE OR REPLACE FUNCTION public.ops_is_manager()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$ SELECT public.get_my_ops_role() IN ('owner','admin','dispatcher','project_manager') $$;
GRANT EXECUTE ON FUNCTION public.ops_is_manager() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.ops_is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$ SELECT public.get_my_ops_role() IN ('owner','admin') $$;
GRANT EXECUTE ON FUNCTION public.ops_is_admin() TO authenticated, anon;

-- ─── 2. Module entitlements ─────────────────────────────────────────────────
-- Module keys: customers | staff | vendors | calls | projects | files | invoices | reports

CREATE TABLE IF NOT EXISTS public.organization_modules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  module_key  text NOT NULL,
  enabled     boolean NOT NULL DEFAULT false,
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by  uuid REFERENCES public.profiles(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_org_modules_company ON public.organization_modules(company_id);

ALTER TABLE public.organization_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_modules_select" ON public.organization_modules FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "org_modules_insert" ON public.organization_modules FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.ops_is_admin());
CREATE POLICY "org_modules_update" ON public.organization_modules FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.ops_is_admin());
CREATE POLICY "org_modules_delete" ON public.organization_modules FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.ops_is_admin());

CREATE OR REPLACE FUNCTION public.org_has_module(p_module text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT enabled FROM public.organization_modules
      WHERE company_id = public.get_my_company_id() AND module_key = p_module),
    false
  )
$$;
GRANT EXECUTE ON FUNCTION public.org_has_module(text) TO authenticated, anon;

-- Legacy seeding: every existing company keeps projects + reports behavior it already had.
INSERT INTO public.organization_modules (company_id, module_key, enabled)
SELECT c.id, m.key, m.key IN ('projects','reports','files')
FROM public.companies c
CROSS JOIN (VALUES ('customers'),('staff'),('vendors'),('calls'),('projects'),
                   ('files'),('invoices'),('reports')) AS m(key)
ON CONFLICT (company_id, module_key) DO NOTHING;

-- New companies get the same defaults automatically.
CREATE OR REPLACE FUNCTION public.seed_org_modules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.organization_modules (company_id, module_key, enabled)
  SELECT NEW.id, m.key, m.key IN ('projects','reports','files')
  FROM (VALUES ('customers'),('staff'),('vendors'),('calls'),('projects'),
               ('files'),('invoices'),('reports')) AS m(key)
  ON CONFLICT (company_id, module_key) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_org_modules ON public.companies;
CREATE TRIGGER trg_seed_org_modules
AFTER INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.seed_org_modules();

-- ─── 3. Divisions ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.divisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#6366f1',
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_divisions_company ON public.divisions(company_id);

ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "divisions_select" ON public.divisions FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "divisions_write" ON public.divisions FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.ops_is_admin());
CREATE POLICY "divisions_update" ON public.divisions FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.ops_is_admin());
CREATE POLICY "divisions_delete" ON public.divisions FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.ops_is_admin());

-- ─── 4. Organization tags + polymorphic tag links ───────────────────────────

CREATE TABLE IF NOT EXISTS public.org_tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#64748b',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_org_tags_company ON public.org_tags(company_id);

ALTER TABLE public.org_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_tags_select" ON public.org_tags FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "org_tags_insert" ON public.org_tags FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.ops_is_manager());
CREATE POLICY "org_tags_update" ON public.org_tags FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.ops_is_manager());
CREATE POLICY "org_tags_delete" ON public.org_tags FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.ops_is_admin());

-- record_type values: customer | location | asset | staff | vendor | call | project | file | invoice
CREATE TABLE IF NOT EXISTS public.record_tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tag_id      uuid NOT NULL REFERENCES public.org_tags(id) ON DELETE CASCADE,
  record_type text NOT NULL,
  record_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tag_id, record_type, record_id)
);

CREATE INDEX IF NOT EXISTS idx_record_tags_record  ON public.record_tags(record_type, record_id);
CREATE INDEX IF NOT EXISTS idx_record_tags_company ON public.record_tags(company_id);

ALTER TABLE public.record_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "record_tags_select" ON public.record_tags FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "record_tags_insert" ON public.record_tags FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "record_tags_delete" ON public.record_tags FOR DELETE
  USING (company_id = public.get_my_company_id());

-- ─── 5. Saved views ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.saved_views (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE, -- NULL = shared org view
  page_key    text NOT NULL,      -- customers | locations | assets | staff | vendors | calls | files | invoices | projects | reports
  name        text NOT NULL,
  filters     jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_views_lookup ON public.saved_views(company_id, page_key);

ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved_views_select" ON public.saved_views FOR SELECT
  USING (company_id = public.get_my_company_id() AND (user_id IS NULL OR user_id = auth.uid()));
CREATE POLICY "saved_views_insert" ON public.saved_views FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id()
    AND (user_id = auth.uid() OR (user_id IS NULL AND public.ops_is_manager())));
CREATE POLICY "saved_views_update" ON public.saved_views FOR UPDATE
  USING (company_id = public.get_my_company_id()
    AND (user_id = auth.uid() OR (user_id IS NULL AND public.ops_is_manager())));
CREATE POLICY "saved_views_delete" ON public.saved_views FOR DELETE
  USING (company_id = public.get_my_company_id()
    AND (user_id = auth.uid() OR (user_id IS NULL AND public.ops_is_manager())));

-- ─── 6. Operations activity log (shared timeline for all operations records) ─

CREATE TABLE IF NOT EXISTS public.ops_activity (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES public.profiles(id),
  actor_name  text,
  record_type text NOT NULL,
  record_id   uuid NOT NULL,
  action      text NOT NULL,          -- created | updated | status_changed | note_added | assigned | file_added | ...
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_activity_record  ON public.ops_activity(record_type, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_activity_company ON public.ops_activity(company_id, created_at DESC);

ALTER TABLE public.ops_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops_activity_select" ON public.ops_activity FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "ops_activity_insert" ON public.ops_activity FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());
-- No update/delete policies: activity log is append-only for org members.

-- ─── 7. Organization call settings (terminology, statuses, card template) ────

CREATE TABLE IF NOT EXISTS public.org_call_settings (
  company_id     uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  terminology    text NOT NULL DEFAULT 'Calls',           -- Calls | Work Orders | Service Requests | Jobs
  template_kind  text NOT NULL DEFAULT 'commercial',      -- commercial | residential | construction
  statuses       jsonb NOT NULL DEFAULT '[
    {"key":"open","label":"Open","closed":false},
    {"key":"assigned","label":"Assigned","closed":false},
    {"key":"in_progress","label":"In Progress","closed":false},
    {"key":"waiting_vendor","label":"Waiting on Vendor","closed":false},
    {"key":"waiting_parts","label":"Waiting on Parts","closed":false},
    {"key":"waiting_customer","label":"Waiting on Customer","closed":false},
    {"key":"waiting_quote","label":"Waiting on Quote","closed":false},
    {"key":"follow_up","label":"Follow-Up Required","closed":false},
    {"key":"completed","label":"Completed","closed":true},
    {"key":"closed","label":"Closed","closed":true},
    {"key":"cancelled","label":"Cancelled","closed":true}
  ]'::jsonb,
  priorities     jsonb NOT NULL DEFAULT '[
    {"key":"low","label":"Low","color":"#94a3b8"},
    {"key":"normal","label":"Normal","color":"#38bdf8"},
    {"key":"high","label":"High","color":"#fb923c"},
    {"key":"emergency","label":"Emergency","color":"#ef4444"}
  ]'::jsonb,
  card_fields    jsonb NOT NULL DEFAULT '["customer","location","priority","status","assigned","due","sla","invoice_ready","unread"]'::jsonb,
  required_fields          jsonb NOT NULL DEFAULT '[]'::jsonb,  -- field keys required at creation
  required_closeout_fields jsonb NOT NULL DEFAULT '[]'::jsonb,  -- field keys required before completion
  require_completion_photo boolean NOT NULL DEFAULT false,
  default_view   text NOT NULL DEFAULT 'list',                  -- list | card | board
  use_divisions  boolean NOT NULL DEFAULT true,
  quick_actions  jsonb NOT NULL DEFAULT '["assign","status","note"]'::jsonb,
  -- Future external-system extension points (inert; no live integration)
  external_system_enabled boolean NOT NULL DEFAULT false,
  external_system_name    text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_call_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_call_settings_select" ON public.org_call_settings FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "org_call_settings_insert" ON public.org_call_settings FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.ops_is_admin());
CREATE POLICY "org_call_settings_update" ON public.org_call_settings FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.ops_is_admin());

-- ─── 8. Per-organization number sequences (calls, invoices) ──────────────────

CREATE TABLE IF NOT EXISTS public.org_counters (
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  counter_key text NOT NULL,           -- call | invoice
  next_value  bigint NOT NULL DEFAULT 1,
  PRIMARY KEY (company_id, counter_key)
);

ALTER TABLE public.org_counters ENABLE ROW LEVEL SECURITY;
-- No direct client access; consumed via SECURITY DEFINER function below.

CREATE OR REPLACE FUNCTION public.next_org_number(p_key text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company uuid := public.get_my_company_id();
  v_next bigint;
BEGIN
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No company for current user';
  END IF;
  INSERT INTO public.org_counters (company_id, counter_key, next_value)
  VALUES (v_company, p_key, 2)
  ON CONFLICT (company_id, counter_key)
  DO UPDATE SET next_value = public.org_counters.next_value + 1
  RETURNING CASE WHEN xmax = 0 THEN 1 ELSE next_value - 1 END INTO v_next;
  RETURN v_next;
END;
$$;
GRANT EXECUTE ON FUNCTION public.next_org_number(text) TO authenticated;


-- ####################################################################
-- ## FILE: supabase/migrations/20260705_operations_crm.sql
-- ####################################################################

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


-- ####################################################################
-- ## FILE: supabase/migrations/20260705_operations_workforce.sql
-- ####################################################################

-- ============================================================================
-- PhaseForge Operations — Staff details + Vendors (ADDITIVE)
-- Staff = org members (profiles) with an operations detail record.
-- Vendors = external companies the org dispatches work to.
-- Requires: 20260705_operations_foundation.sql
-- ============================================================================

-- ─── staff_details (1:1 with profiles, org-scoped operational data) ─────────

CREATE TABLE IF NOT EXISTS public.staff_details (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  division_id   uuid REFERENCES public.divisions(id) ON DELETE SET NULL,
  phone         text,
  employment_status text NOT NULL DEFAULT 'active',   -- active | on_leave | inactive | terminated
  skills        text[] NOT NULL DEFAULT '{}',
  notes         text,
  -- Future integration placeholders (inert)
  external_tech_mapping text,       -- e.g. future ServiceChannel technician id
  payroll_reference     text,       -- e.g. future payroll/timekeeping id
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_details_company  ON public.staff_details(company_id);
CREATE INDEX IF NOT EXISTS idx_staff_details_profile  ON public.staff_details(profile_id);
CREATE INDEX IF NOT EXISTS idx_staff_details_division ON public.staff_details(division_id);

ALTER TABLE public.staff_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_details_select" ON public.staff_details FOR SELECT
  USING (company_id = public.get_my_company_id() AND public.org_has_module('staff'));
CREATE POLICY "staff_details_insert" ON public.staff_details FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.org_has_module('staff')
    AND (public.ops_is_admin() OR profile_id = auth.uid()));
CREATE POLICY "staff_details_update" ON public.staff_details FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('staff')
    AND (public.ops_is_admin() OR profile_id = auth.uid()));
CREATE POLICY "staff_details_delete" ON public.staff_details FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('staff')
    AND public.ops_is_admin());

-- ─── staff_certifications ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.staff_certifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES public.staff_details(id) ON DELETE CASCADE,
  name        text NOT NULL,               -- EPA 608, OSHA 30, Journeyman Electrician, ...
  issuer      text,
  number      text,
  issued_on   date,
  expires_on  date,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_certs_staff   ON public.staff_certifications(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_certs_expires ON public.staff_certifications(company_id, expires_on);

ALTER TABLE public.staff_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_certs_select" ON public.staff_certifications FOR SELECT
  USING (company_id = public.get_my_company_id() AND public.org_has_module('staff'));
CREATE POLICY "staff_certs_write" ON public.staff_certifications FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.org_has_module('staff')
    AND public.ops_is_manager());
CREATE POLICY "staff_certs_update" ON public.staff_certifications FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('staff')
    AND public.ops_is_manager());
CREATE POLICY "staff_certs_delete" ON public.staff_certifications FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('staff')
    AND public.ops_is_manager());

-- ─── vendors ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vendors (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name             text NOT NULL,
  status           text NOT NULL DEFAULT 'active',    -- active | inactive | do_not_use
  trade_categories text[] NOT NULL DEFAULT '{}',
  coverage_areas   text[] NOT NULL DEFAULT '{}',      -- regions / cities / states served
  phone            text,
  email            text,
  website          text,
  address          text,
  insurance_expires date,
  license_expires   date,
  license_number    text,
  notes            text,
  performance_notes text,
  created_by       uuid REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendors_company  ON public.vendors(company_id);
CREATE INDEX IF NOT EXISTS idx_vendors_status   ON public.vendors(company_id, status);
CREATE INDEX IF NOT EXISTS idx_vendors_insurance ON public.vendors(company_id, insurance_expires);
CREATE INDEX IF NOT EXISTS idx_vendors_license   ON public.vendors(company_id, license_expires);

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendors_select" ON public.vendors FOR SELECT
  USING (company_id = public.get_my_company_id() AND public.org_has_module('vendors'));
CREATE POLICY "vendors_insert" ON public.vendors FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.org_has_module('vendors')
    AND public.ops_is_manager());
CREATE POLICY "vendors_update" ON public.vendors FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('vendors')
    AND public.ops_is_manager());
CREATE POLICY "vendors_delete" ON public.vendors FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('vendors')
    AND public.ops_is_admin());

-- ─── vendor_contacts ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vendor_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vendor_id   uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  name        text NOT NULL,
  title       text,
  email       text,
  phone       text,
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_contacts_vendor ON public.vendor_contacts(vendor_id);

ALTER TABLE public.vendor_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendor_contacts_select" ON public.vendor_contacts FOR SELECT
  USING (company_id = public.get_my_company_id() AND public.org_has_module('vendors'));
CREATE POLICY "vendor_contacts_write" ON public.vendor_contacts FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.org_has_module('vendors')
    AND public.ops_is_manager());
CREATE POLICY "vendor_contacts_update" ON public.vendor_contacts FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('vendors')
    AND public.ops_is_manager());
CREATE POLICY "vendor_contacts_delete" ON public.vendor_contacts FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('vendors')
    AND public.ops_is_manager());


-- ####################################################################
-- ## FILE: supabase/migrations/20260705_operations_calls.sql
-- ####################################################################

-- ============================================================================
-- PhaseForge Operations — Calls / Work Orders (ADDITIVE)
-- Generalized from the DispatchForge UX reference (see DISPATCHFORGE_REFERENCE_AUDIT.md).
-- No Kalos data, no live external integrations — external_* columns are inert.
-- Requires: foundation + crm + workforce migrations.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.calls (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  call_number    bigint NOT NULL,                  -- per-org sequence via next_org_number('call')
  title          text NOT NULL,
  description    text,
  customer_id    uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  location_id    uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  asset_id       uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  division_id    uuid REFERENCES public.divisions(id) ON DELETE SET NULL,
  project_id     uuid REFERENCES public.projects(id) ON DELETE SET NULL,

  priority       text NOT NULL DEFAULT 'normal',   -- key into org_call_settings.priorities
  status         text NOT NULL DEFAULT 'open',     -- key into org_call_settings.statuses

  assigned_staff_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  vendor_id         uuid REFERENCES public.vendors(id) ON DELETE SET NULL,

  due_date       date,
  sla_at         timestamptz,                      -- SLA target date/time
  appointment_start timestamptz,                   -- residential appointment window
  appointment_end   timestamptz,
  completed_at   timestamptz,
  closed_at      timestamptz,

  invoice_ready  boolean NOT NULL DEFAULT false,
  invoice_id     uuid,                             -- FK added in invoices migration

  completion_notes  text,
  service_type      text,                          -- residential template: service type
  estimate_status   text,                          -- residential: none | requested | sent | approved
  payment_status    text,                          -- residential: none | unpaid | paid (informational only)

  source         text NOT NULL DEFAULT 'manual',   -- manual | import (future: email, api)

  -- Unread/update alert mechanics (yellow highlight): compare against call_reads
  last_note_at      timestamptz,
  last_activity_at  timestamptz NOT NULL DEFAULT now(),

  -- Future external-system extension points (inert placeholders; no live integration)
  external_enabled        boolean NOT NULL DEFAULT false,
  external_work_order_id  text,
  external_tracking_number text,
  external_link           text,
  external_status         text,
  external_tech_name      text,
  external_updated_at     timestamptz,
  external_has_new_note   boolean NOT NULL DEFAULT false,
  external_has_attachment boolean NOT NULL DEFAULT false,
  external_checkin_state  text,

  created_by     uuid REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, call_number)
);

CREATE INDEX IF NOT EXISTS idx_calls_company        ON public.calls(company_id);
CREATE INDEX IF NOT EXISTS idx_calls_status         ON public.calls(company_id, status);
CREATE INDEX IF NOT EXISTS idx_calls_priority       ON public.calls(company_id, priority);
CREATE INDEX IF NOT EXISTS idx_calls_customer       ON public.calls(customer_id);
CREATE INDEX IF NOT EXISTS idx_calls_location       ON public.calls(location_id);
CREATE INDEX IF NOT EXISTS idx_calls_asset          ON public.calls(asset_id);
CREATE INDEX IF NOT EXISTS idx_calls_division       ON public.calls(division_id);
CREATE INDEX IF NOT EXISTS idx_calls_project        ON public.calls(project_id);
CREATE INDEX IF NOT EXISTS idx_calls_assigned_staff ON public.calls(assigned_staff_id);
CREATE INDEX IF NOT EXISTS idx_calls_vendor         ON public.calls(vendor_id);
CREATE INDEX IF NOT EXISTS idx_calls_due            ON public.calls(company_id, due_date);
CREATE INDEX IF NOT EXISTS idx_calls_sla            ON public.calls(company_id, sla_at);
CREATE INDEX IF NOT EXISTS idx_calls_created        ON public.calls(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_invoice_ready  ON public.calls(company_id, invoice_ready) WHERE invoice_ready;

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- Staff/read-only see only their own or assigned calls; dispatcher+ and billing see all org calls.
CREATE POLICY "calls_select" ON public.calls FOR SELECT
  USING (company_id = public.get_my_company_id() AND public.org_has_module('calls')
    AND (
      public.get_my_ops_role() IN ('owner','admin','dispatcher','project_manager','billing')
      OR assigned_staff_id = auth.uid()
      OR created_by = auth.uid()
    ));

CREATE POLICY "calls_insert" ON public.calls FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.org_has_module('calls')
    AND public.get_my_ops_role() IN ('owner','admin','dispatcher','project_manager','staff'));

-- Staff may update calls assigned to them (status/notes/completion); managers update any.
CREATE POLICY "calls_update" ON public.calls FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('calls')
    AND (public.ops_is_manager() OR assigned_staff_id = auth.uid()));

CREATE POLICY "calls_delete" ON public.calls FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('calls')
    AND public.ops_is_admin());

-- ─── call_notes (categorized timeline, mirrors DispatchForge note categories) ─

CREATE TABLE IF NOT EXISTS public.call_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  call_id     uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  author_id   uuid REFERENCES public.profiles(id),
  author_name text,
  category    text NOT NULL DEFAULT 'internal',   -- internal | customer | vendor | parts | scheduling | quote | completion
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_notes_call    ON public.call_notes(call_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_notes_company ON public.call_notes(company_id);

ALTER TABLE public.call_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "call_notes_select" ON public.call_notes FOR SELECT
  USING (company_id = public.get_my_company_id() AND public.org_has_module('calls')
    AND call_id IN (SELECT id FROM public.calls));   -- inherits call visibility via calls RLS
CREATE POLICY "call_notes_insert" ON public.call_notes FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.org_has_module('calls')
    AND author_id = auth.uid());
CREATE POLICY "call_notes_delete" ON public.call_notes FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.ops_is_admin());

-- Keep calls.last_note_at / last_activity_at fresh for cheap unread checks.
CREATE OR REPLACE FUNCTION public.touch_call_on_note()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.calls
     SET last_note_at = NEW.created_at,
         last_activity_at = NEW.created_at,
         updated_at = NEW.created_at
   WHERE id = NEW.call_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_call_on_note ON public.call_notes;
CREATE TRIGGER trg_touch_call_on_note
AFTER INSERT ON public.call_notes
FOR EACH ROW EXECUTE FUNCTION public.touch_call_on_note();

-- ─── call_reads (per-user unread tracking → yellow "new update" highlight) ───

CREATE TABLE IF NOT EXISTS public.call_reads (
  call_id      uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (call_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_call_reads_user ON public.call_reads(user_id);

ALTER TABLE public.call_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "call_reads_select" ON public.call_reads FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "call_reads_upsert" ON public.call_reads FOR INSERT
  WITH CHECK (user_id = auth.uid() AND company_id = public.get_my_company_id());
CREATE POLICY "call_reads_update" ON public.call_reads FOR UPDATE
  USING (user_id = auth.uid());

-- ─── note templates (No-AI smart tools: reusable canned notes) ───────────────

CREATE TABLE IF NOT EXISTS public.note_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  division_id uuid REFERENCES public.divisions(id) ON DELETE SET NULL,
  scope       text NOT NULL DEFAULT 'call',   -- call | project | vendor | completion | quote | status_update | invoice
  name        text NOT NULL,
  body        text NOT NULL,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_note_templates_company ON public.note_templates(company_id, scope);

ALTER TABLE public.note_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "note_templates_select" ON public.note_templates FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "note_templates_insert" ON public.note_templates FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.ops_is_manager());
CREATE POLICY "note_templates_update" ON public.note_templates FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.ops_is_manager());
CREATE POLICY "note_templates_delete" ON public.note_templates FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.ops_is_manager());


-- ####################################################################
-- ## FILE: supabase/migrations/20260705_operations_files_invoices.sql
-- ####################################################################

-- ============================================================================
-- PhaseForge Operations — Files metadata + Invoice-ready workflow (ADDITIVE)
-- Files: org-scoped metadata over Supabase Storage bucket 'org-files'.
-- Invoices: draft → PDF-ready workflow only. No payments, no accounting.
-- Requires: foundation + crm + calls migrations.
-- ============================================================================

-- ─── org_files (hybrid file library + polymorphic record attachment) ─────────

CREATE TABLE IF NOT EXISTS public.org_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  storage_path text NOT NULL,        -- org-files/{company_id}/{record_type}/{uuid}-{name}
  file_name    text NOT NULL,
  mime_type    text,
  size_bytes   bigint,
  -- Polymorphic link (NULL record = company library file)
  record_type  text,                 -- customer | location | asset | call | project | vendor | invoice
  record_id    uuid,
  -- Denormalized quick-filter links
  customer_id  uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  location_id  uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  uploaded_by  uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_files_company  ON public.org_files(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_files_record   ON public.org_files(record_type, record_id);
CREATE INDEX IF NOT EXISTS idx_org_files_customer ON public.org_files(customer_id);
CREATE INDEX IF NOT EXISTS idx_org_files_uploader ON public.org_files(uploaded_by);

ALTER TABLE public.org_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_files_select" ON public.org_files FOR SELECT
  USING (company_id = public.get_my_company_id() AND public.org_has_module('files'));
CREATE POLICY "org_files_insert" ON public.org_files FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.org_has_module('files')
    AND uploaded_by = auth.uid());
CREATE POLICY "org_files_update" ON public.org_files FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('files')
    AND (public.ops_is_manager() OR uploaded_by = auth.uid()));
CREATE POLICY "org_files_delete" ON public.org_files FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('files')
    AND (public.ops_is_manager() OR uploaded_by = auth.uid()));

-- Storage bucket + policies (idempotent). Path convention keeps orgs isolated:
--   org-files/{company_id}/...
INSERT INTO storage.buckets (id, name, public)
VALUES ('org-files', 'org-files', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                 AND policyname='org_files_storage_select') THEN
    CREATE POLICY "org_files_storage_select" ON storage.objects FOR SELECT
      USING (bucket_id = 'org-files'
        AND (storage.foldername(name))[1] = public.get_my_company_id()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                 AND policyname='org_files_storage_insert') THEN
    CREATE POLICY "org_files_storage_insert" ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'org-files'
        AND (storage.foldername(name))[1] = public.get_my_company_id()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                 AND policyname='org_files_storage_delete') THEN
    CREATE POLICY "org_files_storage_delete" ON storage.objects FOR DELETE
      USING (bucket_id = 'org-files'
        AND (storage.foldername(name))[1] = public.get_my_company_id()::text);
  END IF;
END $$;

-- ─── invoices ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invoices (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_number     bigint NOT NULL,           -- per-org sequence via next_org_number('invoice')
  customer_id        uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  billing_contact_id uuid REFERENCES public.customer_contacts(id) ON DELETE SET NULL,
  project_id         uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'draft',  -- draft | ready | sent | paid | overdue | void
  issue_date         date,
  due_date           date,
  notes              text,
  terms              text,
  payment_reference  text,                      -- manual reference only; no processing
  currency           text NOT NULL DEFAULT 'USD',
  -- Future payment integration abstraction (inert)
  payment_provider   text,
  payment_external_id text,
  created_by         uuid REFERENCES public.profiles(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_company  ON public.invoices(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status   ON public.invoices(company_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due      ON public.invoices(company_id, due_date);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
-- Billing, admin, owner manage invoices; PM/dispatcher read; staff no access.
CREATE POLICY "invoices_select" ON public.invoices FOR SELECT
  USING (company_id = public.get_my_company_id() AND public.org_has_module('invoices')
    AND public.get_my_ops_role() IN ('owner','admin','billing','project_manager','dispatcher'));
CREATE POLICY "invoices_insert" ON public.invoices FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.org_has_module('invoices')
    AND public.get_my_ops_role() IN ('owner','admin','billing'));
CREATE POLICY "invoices_update" ON public.invoices FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('invoices')
    AND public.get_my_ops_role() IN ('owner','admin','billing'));
CREATE POLICY "invoices_delete" ON public.invoices FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('invoices')
    AND public.ops_is_admin());

-- ─── invoice_items ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id  uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity    numeric(12,2) NOT NULL DEFAULT 1,
  unit_price  numeric(12,2) NOT NULL DEFAULT 0,
  call_id     uuid REFERENCES public.calls(id) ON DELETE SET NULL,     -- source work
  project_id  uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_call    ON public.invoice_items(call_id);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice_items_select" ON public.invoice_items FOR SELECT
  USING (company_id = public.get_my_company_id() AND public.org_has_module('invoices')
    AND public.get_my_ops_role() IN ('owner','admin','billing','project_manager','dispatcher'));
CREATE POLICY "invoice_items_write" ON public.invoice_items FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.org_has_module('invoices')
    AND public.get_my_ops_role() IN ('owner','admin','billing'));
CREATE POLICY "invoice_items_update" ON public.invoice_items FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('invoices')
    AND public.get_my_ops_role() IN ('owner','admin','billing'));
CREATE POLICY "invoice_items_delete" ON public.invoice_items FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('invoices')
    AND public.get_my_ops_role() IN ('owner','admin','billing'));

-- Late FK: calls.invoice_id → invoices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'calls_invoice_fk'
  ) THEN
    ALTER TABLE public.calls
      ADD CONSTRAINT calls_invoice_fk
      FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_calls_invoice ON public.calls(invoice_id);

-- ─── project operations links (organization-enable existing projects) ────────

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.divisions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_customer ON public.projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_location ON public.projects(location_id);
CREATE INDEX IF NOT EXISTS idx_projects_division ON public.projects(division_id);

