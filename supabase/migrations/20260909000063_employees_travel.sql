SET search_path TO phaseforge, extensions;

-- ============================================================================
-- Employees directory + travel distance groundwork
--
-- employees: the company's people, whether or not they have a PhaseForge
-- login. profile_id links the ones who do. schedule_name is the short name
-- that appears on the weekly schedule roster ("Jose", "John M"), which is the
-- join key between an employee and the names on schedule rows.
--
-- Home coordinates and job coordinates feed the "is this job 2+ hours from
-- home" check that drives lodging.
-- ============================================================================

CREATE TABLE IF NOT EXISTS phaseforge.employees (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  name              text NOT NULL,
  schedule_name     text,
  email             text,
  phone             text,
  address           text,
  latitude          double precision,
  longitude         double precision,
  geocoded_at       timestamptz,
  geocode_error     text,
  superintendent_id uuid REFERENCES phaseforge.superintendents(id) ON DELETE SET NULL,
  profile_id        uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  invited_at        timestamptz,
  is_active         boolean NOT NULL DEFAULT true,
  notes             text,
  sort_order        integer NOT NULL DEFAULT 0,
  created_by        uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employees_company ON phaseforge.employees(company_id, superintendent_id);
CREATE INDEX IF NOT EXISTS idx_employees_profile ON phaseforge.employees(profile_id);

ALTER TABLE phaseforge.employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employees_select ON phaseforge.employees;
CREATE POLICY employees_select ON phaseforge.employees FOR SELECT
  USING (company_id = phaseforge.get_my_company_id());
DROP POLICY IF EXISTS employees_insert ON phaseforge.employees;
CREATE POLICY employees_insert ON phaseforge.employees FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_manager());
DROP POLICY IF EXISTS employees_update ON phaseforge.employees;
CREATE POLICY employees_update ON phaseforge.employees FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_manager());
DROP POLICY IF EXISTS employees_delete ON phaseforge.employees;
CREATE POLICY employees_delete ON phaseforge.employees FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_manager());

-- Jobs in the schedule directory get an address so the job# on the weekly
-- schedule resolves to a place on the map.
ALTER TABLE phaseforge.schedule_directory ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE phaseforge.schedule_directory ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE phaseforge.schedule_directory ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE phaseforge.schedule_directory ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;
ALTER TABLE phaseforge.schedule_directory ADD COLUMN IF NOT EXISTS geocode_error text;

-- Per-guest drive time from home to the job, computed when the stay is
-- generated or on demand. Shape: { computedAt, jobLat, jobLng, guests: [...] }.
ALTER TABLE phaseforge.lodging_stays ADD COLUMN IF NOT EXISTS travel jsonb;
