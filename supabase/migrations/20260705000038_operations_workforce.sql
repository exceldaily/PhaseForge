SET search_path TO phaseforge, extensions;

-- ============================================================================
-- PhaseForge Operations — Staff details + Vendors (ADDITIVE)
-- Staff = org members (profiles) with an operations detail record.
-- Vendors = external companies the org dispatches work to.
-- Requires: 20260705_operations_foundation.sql
-- ============================================================================

-- ─── staff_details (1:1 with profiles, org-scoped operational data) ─────────

CREATE TABLE IF NOT EXISTS phaseforge.staff_details (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  profile_id    uuid NOT NULL REFERENCES phaseforge.profiles(id) ON DELETE CASCADE,
  division_id   uuid REFERENCES phaseforge.divisions(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS idx_staff_details_company  ON phaseforge.staff_details(company_id);
CREATE INDEX IF NOT EXISTS idx_staff_details_profile  ON phaseforge.staff_details(profile_id);
CREATE INDEX IF NOT EXISTS idx_staff_details_division ON phaseforge.staff_details(division_id);

ALTER TABLE phaseforge.staff_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_details_select" ON phaseforge.staff_details FOR SELECT
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('staff'));
CREATE POLICY "staff_details_insert" ON phaseforge.staff_details FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('staff')
    AND (phaseforge.ops_is_admin() OR profile_id = auth.uid()));
CREATE POLICY "staff_details_update" ON phaseforge.staff_details FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('staff')
    AND (phaseforge.ops_is_admin() OR profile_id = auth.uid()));
CREATE POLICY "staff_details_delete" ON phaseforge.staff_details FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('staff')
    AND phaseforge.ops_is_admin());

-- ─── staff_certifications ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phaseforge.staff_certifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES phaseforge.staff_details(id) ON DELETE CASCADE,
  name        text NOT NULL,               -- EPA 608, OSHA 30, Journeyman Electrician, ...
  issuer      text,
  number      text,
  issued_on   date,
  expires_on  date,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_certs_staff   ON phaseforge.staff_certifications(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_certs_expires ON phaseforge.staff_certifications(company_id, expires_on);

ALTER TABLE phaseforge.staff_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_certs_select" ON phaseforge.staff_certifications FOR SELECT
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('staff'));
CREATE POLICY "staff_certs_write" ON phaseforge.staff_certifications FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('staff')
    AND phaseforge.ops_is_manager());
CREATE POLICY "staff_certs_update" ON phaseforge.staff_certifications FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('staff')
    AND phaseforge.ops_is_manager());
CREATE POLICY "staff_certs_delete" ON phaseforge.staff_certifications FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('staff')
    AND phaseforge.ops_is_manager());

-- ─── vendors ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phaseforge.vendors (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
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
  created_by       uuid REFERENCES phaseforge.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendors_company  ON phaseforge.vendors(company_id);
CREATE INDEX IF NOT EXISTS idx_vendors_status   ON phaseforge.vendors(company_id, status);
CREATE INDEX IF NOT EXISTS idx_vendors_insurance ON phaseforge.vendors(company_id, insurance_expires);
CREATE INDEX IF NOT EXISTS idx_vendors_license   ON phaseforge.vendors(company_id, license_expires);

ALTER TABLE phaseforge.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendors_select" ON phaseforge.vendors FOR SELECT
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('vendors'));
CREATE POLICY "vendors_insert" ON phaseforge.vendors FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('vendors')
    AND phaseforge.ops_is_manager());
CREATE POLICY "vendors_update" ON phaseforge.vendors FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('vendors')
    AND phaseforge.ops_is_manager());
CREATE POLICY "vendors_delete" ON phaseforge.vendors FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('vendors')
    AND phaseforge.ops_is_admin());

-- ─── vendor_contacts ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phaseforge.vendor_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  vendor_id   uuid NOT NULL REFERENCES phaseforge.vendors(id) ON DELETE CASCADE,
  name        text NOT NULL,
  title       text,
  email       text,
  phone       text,
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_contacts_vendor ON phaseforge.vendor_contacts(vendor_id);

ALTER TABLE phaseforge.vendor_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendor_contacts_select" ON phaseforge.vendor_contacts FOR SELECT
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('vendors'));
CREATE POLICY "vendor_contacts_write" ON phaseforge.vendor_contacts FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('vendors')
    AND phaseforge.ops_is_manager());
CREATE POLICY "vendor_contacts_update" ON phaseforge.vendor_contacts FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('vendors')
    AND phaseforge.ops_is_manager());
CREATE POLICY "vendor_contacts_delete" ON phaseforge.vendor_contacts FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('vendors')
    AND phaseforge.ops_is_manager());
