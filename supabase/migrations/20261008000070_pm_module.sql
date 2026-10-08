-- Preventative Maintenance module (ALDI refrigeration PMs).
--
-- A permanent store directory, one PM record per store per quarter, a
-- versioned digital checklist, readings, materials, deficiencies, and an
-- activity trail. Nothing here touches projects, phases, schedules, or any
-- other existing table.
--
-- Who can do what is enforced here, not only in the UI:
--   Administrator  workspace/ops owner or admin        everything
--   Coordinator    manager, dispatcher, project_manager stores, PMs, jobs, materials, schedules
--   Technician     a pm_techs row linked to their login  the PMs assigned to them
--   Read only      everyone else in the company          view
--
-- Three kinds of value are protected from being typed by hand:
--   * the calculated progress counters on pm_cycles
--   * the statuses that have rules behind them (field_complete, completed)
--   * published checklist templates, which history depends on
-- Those are only written by the server after it has validated the change
-- (service role), or by the triggers in this file.

-- ─── Role helpers ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION phaseforge.pm_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'phaseforge' AS $$
  SELECT phaseforge.ops_is_admin() OR coalesce(phaseforge.get_my_role(), '') IN ('owner', 'admin')
$$;

CREATE OR REPLACE FUNCTION phaseforge.pm_is_coordinator() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'phaseforge' AS $$
  SELECT phaseforge.pm_is_admin() OR phaseforge.ops_is_manager() OR coalesce(phaseforge.get_my_role(), '') = 'manager'
$$;

-- True for the server (service role), migrations, and this file's own
-- triggers. False for anyone calling with their own login.
CREATE OR REPLACE FUNCTION phaseforge.pm_trusted() RETURNS boolean
LANGUAGE sql VOLATILE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
                  'postgres') NOT IN ('anon', 'authenticated')
      OR coalesce(current_setting('phaseforge.pm_internal', true), '') = '1'
$$;

-- ─── Technicians ─────────────────────────────────────────────────────────────
-- The people PMs are assigned to. A technician can exist before they have a
-- login ("Alex" on the store sheet); linking profile_id later is what gives
-- that person access to their PMs.
CREATE TABLE IF NOT EXISTS phaseforge.pm_techs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  profile_id uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES phaseforge.employees(id) ON DELETE SET NULL,
  phone text,
  email text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pm_techs_company_name_key ON phaseforge.pm_techs (company_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS pm_techs_profile_idx ON phaseforge.pm_techs (profile_id) WHERE profile_id IS NOT NULL;

-- ─── Stores ──────────────────────────────────────────────────────────────────
-- Permanent. A store's id never changes, whatever happens to job numbers.
CREATE TABLE IF NOT EXISTS phaseforge.pm_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  store_number text NOT NULL CHECK (length(btrim(store_number)) > 0),
  address text,
  city text,
  county text,
  state text,
  postal_code text,
  region text,
  facility_manager text,
  fm_phone text,
  fm_email text,
  store_phone text,
  contact_notes text,
  primary_tech_id uuid REFERENCES phaseforge.pm_techs(id) ON DELETE SET NULL,
  secondary_tech_id uuid REFERENCES phaseforge.pm_techs(id) ON DELETE SET NULL,
  -- Which refrigeration system the store runs. Decides which checklist items
  -- apply. NULL = not recorded yet, so nothing is hidden.
  system_type text CHECK (system_type IN ('HFC', 'CO2', 'R-290')),
  refrigerant text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pm_stores_company_number_key ON phaseforge.pm_stores (company_id, lower(btrim(store_number)));
CREATE INDEX IF NOT EXISTS pm_stores_company_active_idx ON phaseforge.pm_stores (company_id, is_active);
CREATE INDEX IF NOT EXISTS pm_stores_primary_tech_idx ON phaseforge.pm_stores (primary_tech_id);

-- ─── Store equipment ─────────────────────────────────────────────────────────
-- What is actually installed at a store. Circuits and compressors listed here
-- become the rows of the data entry tables; with none listed, the template's
-- default rows are used.
CREATE TABLE IF NOT EXISTS phaseforge.pm_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES phaseforge.pm_stores(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('circuit', 'compressor', 'hvac_compressor', 'condenser', 'rack', 'walk_in', 'case', 'hvac_unit', 'spot_merchandiser', 'other')),
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  manufacturer text,
  model text,
  serial_number text,
  refrigerant text,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pm_equipment_store_idx ON phaseforge.pm_equipment (store_id, kind, sort_order);

-- ─── Checklist templates (versioned) ─────────────────────────────────────────
-- One version per quarter per revision. A published version is frozen: a PM
-- keeps pointing at the version it was done on, so revising the checklist
-- can never rewrite history.
CREATE TABLE IF NOT EXISTS phaseforge.pm_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  quarter smallint NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  version integer NOT NULL DEFAULT 1,
  revision_label text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'retired')),
  notes text,
  -- The data entry tables (superheat, oil levels, electrical, HVAC) as JSON.
  data_tables jsonb NOT NULL DEFAULT '[]'::jsonb,
  cloned_from uuid REFERENCES phaseforge.pm_template_versions(id) ON DELETE SET NULL,
  created_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  published_at timestamptz,
  UNIQUE (company_id, quarter, version)
);
-- At most one live checklist per quarter.
CREATE UNIQUE INDEX IF NOT EXISTS pm_template_one_active_idx
  ON phaseforge.pm_template_versions (company_id, quarter) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS phaseforge.pm_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES phaseforge.pm_template_versions(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  section_label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  -- The PM ID printed on the ALDI sheet, e.g. COND1.
  code text NOT NULL,
  -- ALL, HFC, HFC/CO2, CO2, R-290. Empty means it applies everywhere.
  applicability text NOT NULL DEFAULT 'ALL',
  description text NOT NULL,
  requires_photo boolean NOT NULL DEFAULT false,
  requires_note boolean NOT NULL DEFAULT false,
  -- A single labelled value on the item itself (receiver level, battery level).
  measure_label text,
  measure_unit text,
  requires_measure boolean NOT NULL DEFAULT false,
  -- [{ "table": "electrical", "column": null }] : readings this item needs.
  reading_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The sheet says a failure needs an FOPM proposal.
  fopm_on_fail boolean NOT NULL DEFAULT false,
  hint text,
  UNIQUE (version_id, code)
);
CREATE INDEX IF NOT EXISTS pm_template_items_version_idx ON phaseforge.pm_template_items (version_id, sort_order);

-- ─── Store exclusions ────────────────────────────────────────────────────────
-- "This check never applies at this store." Keyed by the PM ID, not the item
-- row, so it carries across checklist revisions.
CREATE TABLE IF NOT EXISTS phaseforge.pm_store_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES phaseforge.pm_stores(id) ON DELETE CASCADE,
  item_code text NOT NULL,
  equipment_id uuid REFERENCES phaseforge.pm_equipment(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  created_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, item_code)
);

-- ─── Quarterly PM records ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS phaseforge.pm_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES phaseforge.pm_stores(id) ON DELETE RESTRICT,
  year smallint NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  quarter smallint NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  -- The current Kalos job number. NULL until it arrives. History of every
  -- number this PM has carried lives in pm_job_numbers.
  job_number text,
  sc_work_order text,
  job_received_date date,
  priority text CHECK (priority IN ('P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7')),
  due_date date,
  tech_id uuid REFERENCES phaseforge.pm_techs(id) ON DELETE SET NULL,
  helper_tech_id uuid REFERENCES phaseforge.pm_techs(id) ON DELETE SET NULL,
  scheduled_date date,
  actual_start date,
  actual_end date,
  -- The lifecycle. Blockers (filters, parts, return visit) are separate flags
  -- below, because a PM can be in progress and waiting on filters at once.
  status text NOT NULL DEFAULT 'awaiting_job_number' CHECK (status IN (
    'awaiting_job_number', 'job_received', 'not_scheduled', 'scheduled', 'in_progress',
    'field_complete', 'pending_documentation', 'submitted', 'completed', 'on_hold', 'cancelled')),
  status_note text,
  return_visit_needed boolean NOT NULL DEFAULT false,
  return_visit_note text,
  tech_notes text,
  coordinator_notes text,
  -- Closeout details from the bottom of the ALDI sheet.
  service_provider text,
  time_in text,
  time_out text,
  fm_spot_checked boolean,
  -- The checklist this PM is being done on, fixed once work starts.
  template_version_id uuid REFERENCES phaseforge.pm_template_versions(id) ON DELETE RESTRICT,
  layout jsonb,
  last_item_id uuid REFERENCES phaseforge.pm_template_items(id) ON DELETE SET NULL,
  -- Calculated. Never typed: see pm_cycles_guard.
  checklist_total integer NOT NULL DEFAULT 0,
  checklist_done integer NOT NULL DEFAULT 0,
  docs_total integer NOT NULL DEFAULT 0,
  docs_done integer NOT NULL DEFAULT 0,
  open_deficiencies integer NOT NULL DEFAULT 0,
  blocking_deficiencies integer NOT NULL DEFAULT 0,
  waiting_filters boolean NOT NULL DEFAULT false,
  waiting_parts boolean NOT NULL DEFAULT false,
  -- Closeout trail.
  field_completed_at timestamptz,
  field_completed_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  submitted_on date,
  submitted_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  closed_at timestamptz,
  closed_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  completion_override_reason text,
  created_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One PM per store per quarter. This is what stops accidental duplicates.
  UNIQUE (store_id, year, quarter)
);
CREATE INDEX IF NOT EXISTS pm_cycles_company_quarter_idx ON phaseforge.pm_cycles (company_id, year, quarter);
CREATE INDEX IF NOT EXISTS pm_cycles_company_status_idx ON phaseforge.pm_cycles (company_id, status);
CREATE INDEX IF NOT EXISTS pm_cycles_job_number_idx ON phaseforge.pm_cycles (company_id, job_number) WHERE job_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS pm_cycles_tech_idx ON phaseforge.pm_cycles (tech_id, status);
CREATE INDEX IF NOT EXISTS pm_cycles_helper_idx ON phaseforge.pm_cycles (helper_tech_id) WHERE helper_tech_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pm_cycles_due_idx ON phaseforge.pm_cycles (company_id, due_date) WHERE due_date IS NOT NULL;

-- Every job number a PM has ever carried. Entering a new number retires the
-- old row instead of overwriting it.
CREATE TABLE IF NOT EXISTS phaseforge.pm_job_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  pm_id uuid NOT NULL REFERENCES phaseforge.pm_cycles(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES phaseforge.pm_stores(id) ON DELETE CASCADE,
  job_number text NOT NULL,
  received_date date,
  is_current boolean NOT NULL DEFAULT true,
  entered_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz
);
CREATE INDEX IF NOT EXISTS pm_job_numbers_pm_idx ON phaseforge.pm_job_numbers (pm_id, entered_at DESC);
CREATE INDEX IF NOT EXISTS pm_job_numbers_number_idx ON phaseforge.pm_job_numbers (company_id, job_number);
CREATE INDEX IF NOT EXISTS pm_job_numbers_store_idx ON phaseforge.pm_job_numbers (store_id, entered_at DESC);

-- May the caller work on this PM? Coordinators always; a technician while it
-- is assigned to them and not closed out.
CREATE OR REPLACE FUNCTION phaseforge.pm_can_work(p_pm uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'phaseforge' AS $$
  SELECT EXISTS (
    SELECT 1 FROM pm_cycles c
    WHERE c.id = p_pm AND c.company_id = phaseforge.get_my_company_id()
      AND (phaseforge.pm_is_coordinator()
        OR (c.status NOT IN ('completed', 'cancelled')
            AND EXISTS (SELECT 1 FROM pm_techs t
                        WHERE t.profile_id = auth.uid() AND t.is_active
                          AND t.id IN (c.tech_id, c.helper_tech_id))))
  )
$$;

-- ─── Checklist responses, readings, attachments ──────────────────────────────
CREATE TABLE IF NOT EXISTS phaseforge.pm_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  pm_id uuid NOT NULL REFERENCES phaseforge.pm_cycles(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES phaseforge.pm_template_items(id) ON DELETE RESTRICT,
  -- NULL = not inspected yet.
  result text CHECK (result IN ('pass', 'fail', 'na')),
  measure_value text,
  note text,
  na_reason text,
  inspected_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  inspected_at timestamptz,
  -- Bumped on every save. A save that arrives with a stale rev is a conflict.
  rev integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pm_id, item_id),
  -- A manual "not applicable" always says why.
  CHECK (result IS DISTINCT FROM 'na' OR length(btrim(coalesce(na_reason, ''))) > 0)
);
CREATE INDEX IF NOT EXISTS pm_responses_pm_idx ON phaseforge.pm_responses (pm_id);

CREATE TABLE IF NOT EXISTS phaseforge.pm_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  pm_id uuid NOT NULL REFERENCES phaseforge.pm_cycles(id) ON DELETE CASCADE,
  table_key text NOT NULL,
  row_key text NOT NULL,
  col_key text NOT NULL,
  -- Text on purpose: the field writes "1/2", "Full", "SHORT TO GROUND".
  value text NOT NULL,
  updated_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pm_id, table_key, row_key, col_key)
);
CREATE INDEX IF NOT EXISTS pm_readings_pm_idx ON phaseforge.pm_readings (pm_id);

-- ─── Materials ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS phaseforge.pm_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  pm_id uuid NOT NULL REFERENCES phaseforge.pm_cycles(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES phaseforge.pm_stores(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'part' CHECK (category IN ('filter', 'part', 'other')),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  part_number text,
  quantity numeric(10, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_label text,
  equipment_id uuid REFERENCES phaseforge.pm_equipment(id) ON DELETE SET NULL,
  item_id uuid REFERENCES phaseforge.pm_template_items(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  requested_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'needed' CHECK (status IN (
    'needed', 'pending_approval', 'approved', 'ordered', 'partially_received',
    'received', 'installed', 'cancelled', 'backordered')),
  ordered_date date,
  vendor text,
  po_number text,
  eta_date date,
  received_date date,
  installed_date date,
  notes text,
  updated_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pm_materials_pm_idx ON phaseforge.pm_materials (pm_id);
CREATE INDEX IF NOT EXISTS pm_materials_company_status_idx ON phaseforge.pm_materials (company_id, status);

-- ─── Deficiencies ────────────────────────────────────────────────────────────
-- Belong to the store first, the PM second: they stay visible after the PM is
-- closed and can be tied to a later repair job without reopening it.
CREATE TABLE IF NOT EXISTS phaseforge.pm_deficiencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES phaseforge.pm_stores(id) ON DELETE CASCADE,
  pm_id uuid REFERENCES phaseforge.pm_cycles(id) ON DELETE SET NULL,
  item_id uuid REFERENCES phaseforge.pm_template_items(id) ON DELETE SET NULL,
  item_code text,
  equipment_id uuid REFERENCES phaseforge.pm_equipment(id) ON DELETE SET NULL,
  equipment_label text,
  description text NOT NULL CHECK (length(btrim(description)) > 0),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  recommended_repair text,
  proposal_required boolean NOT NULL DEFAULT false,
  proposal_submitted_date date,
  proposal_status text NOT NULL DEFAULT 'not_required' CHECK (proposal_status IN ('not_required', 'needed', 'submitted', 'approved', 'declined')),
  return_visit_required boolean NOT NULL DEFAULT false,
  -- True only when the PM inspection itself cannot be finished until this is
  -- dealt with. A repair that follows the PM leaves this false.
  affects_pm boolean NOT NULL DEFAULT false,
  followup_job_number text,
  repair_status text NOT NULL DEFAULT 'open' CHECK (repair_status IN (
    'open', 'proposal_pending', 'approved', 'scheduled', 'in_progress', 'repaired', 'declined', 'deferred', 'closed')),
  resolved_on date,
  resolution_note text,
  created_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pm_deficiencies_store_idx ON phaseforge.pm_deficiencies (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pm_deficiencies_pm_idx ON phaseforge.pm_deficiencies (pm_id);
CREATE INDEX IF NOT EXISTS pm_deficiencies_company_status_idx ON phaseforge.pm_deficiencies (company_id, repair_status);

CREATE TABLE IF NOT EXISTS phaseforge.pm_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES phaseforge.pm_stores(id) ON DELETE CASCADE,
  pm_id uuid REFERENCES phaseforge.pm_cycles(id) ON DELETE CASCADE,
  item_id uuid REFERENCES phaseforge.pm_template_items(id) ON DELETE SET NULL,
  deficiency_id uuid REFERENCES phaseforge.pm_deficiencies(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo', 'document', 'source')),
  path text NOT NULL,
  name text NOT NULL,
  mime text,
  size_bytes integer,
  width integer,
  height integer,
  caption text,
  uploaded_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pm_attachments_pm_idx ON phaseforge.pm_attachments (pm_id, item_id);
CREATE INDEX IF NOT EXISTS pm_attachments_deficiency_idx ON phaseforge.pm_attachments (deficiency_id) WHERE deficiency_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pm_attachments_store_idx ON phaseforge.pm_attachments (store_id);

-- Every generated PM report is kept. A new one is a new version.
CREATE TABLE IF NOT EXISTS phaseforge.pm_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  pm_id uuid NOT NULL REFERENCES phaseforge.pm_cycles(id) ON DELETE CASCADE,
  version integer NOT NULL,
  path text NOT NULL,
  size_bytes integer,
  checklist_done integer,
  checklist_total integer,
  generated_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pm_id, version)
);

-- ─── Activity, settings, imports ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS phaseforge.pm_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  store_id uuid REFERENCES phaseforge.pm_stores(id) ON DELETE CASCADE,
  pm_id uuid REFERENCES phaseforge.pm_cycles(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pm_activity_pm_idx ON phaseforge.pm_activity (pm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pm_activity_store_idx ON phaseforge.pm_activity (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pm_activity_company_idx ON phaseforge.pm_activity (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS phaseforge.pm_settings (
  company_id uuid PRIMARY KEY REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  completion_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  notify jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Imports are staged, reviewed, then committed. The rows wait here in between.
CREATE TABLE IF NOT EXISTS phaseforge.pm_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('stores', 'job_numbers', 'pm_records')),
  source text,
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'committed', 'discarded')),
  result jsonb,
  created_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  committed_at timestamptz
);
CREATE INDEX IF NOT EXISTS pm_import_batches_company_idx ON phaseforge.pm_import_batches (company_id, status, created_at DESC);

-- So the same overdue or blocked alert is not sent twice.
CREATE TABLE IF NOT EXISTS phaseforge.pm_alert_log (
  dedupe_key text PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Triggers: timestamps ────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pm_techs', 'pm_stores', 'pm_equipment', 'pm_materials', 'pm_deficiencies'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON phaseforge.%I', t || '_updated', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON phaseforge.%I FOR EACH ROW EXECUTE FUNCTION phaseforge.quotes_set_updated_at()', t || '_updated', t);
  END LOOP;
END $$;

-- ─── Triggers: the PM record ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION phaseforge.pm_cycles_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'phaseforge' AS $$
DECLARE
  v_trusted boolean := phaseforge.pm_trusted();
  v_company uuid;
BEGIN
  NEW.job_number := nullif(btrim(NEW.job_number), '');
  NEW.sc_work_order := nullif(btrim(NEW.sc_work_order), '');

  IF TG_OP = 'INSERT' THEN
    SELECT company_id INTO v_company FROM pm_stores WHERE id = NEW.store_id;
    IF v_company IS NULL OR v_company <> NEW.company_id THEN
      RAISE EXCEPTION 'That store does not belong to this company.';
    END IF;
    IF NOT v_trusted THEN
      NEW.checklist_total := 0; NEW.checklist_done := 0; NEW.docs_total := 0; NEW.docs_done := 0;
      NEW.open_deficiencies := 0; NEW.blocking_deficiencies := 0;
      NEW.waiting_filters := false; NEW.waiting_parts := false;
      IF NEW.status NOT IN ('awaiting_job_number', 'job_received', 'not_scheduled', 'scheduled', 'on_hold') THEN
        NEW.status := 'awaiting_job_number';
      END IF;
      IF auth.uid() IS NOT NULL THEN NEW.created_by := auth.uid(); NEW.updated_by := auth.uid(); END IF;
      IF NEW.job_number IS NOT NULL AND NEW.job_received_date IS NULL THEN NEW.job_received_date := current_date; END IF;
    END IF;
    IF NEW.status IN ('awaiting_job_number', 'job_received', 'not_scheduled') THEN
      NEW.status := CASE
        WHEN NEW.scheduled_date IS NOT NULL THEN 'scheduled'
        WHEN NEW.job_number IS NULL THEN 'awaiting_job_number'
        WHEN NEW.status = 'not_scheduled' THEN 'not_scheduled'
        ELSE 'job_received' END;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT v_trusted THEN
    IF (NEW.checklist_total, NEW.checklist_done, NEW.docs_total, NEW.docs_done, NEW.open_deficiencies,
        NEW.blocking_deficiencies, NEW.waiting_filters, NEW.waiting_parts)
       IS DISTINCT FROM
       (OLD.checklist_total, OLD.checklist_done, OLD.docs_total, OLD.docs_done, OLD.open_deficiencies,
        OLD.blocking_deficiencies, OLD.waiting_filters, OLD.waiting_parts) THEN
      RAISE EXCEPTION 'Progress is calculated from the checklist and cannot be typed in.';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('field_complete', 'completed') THEN
      RAISE EXCEPTION 'Field complete and Completed are set from the PM itself, once its checks pass.';
    END IF;
    IF (NEW.store_id, NEW.year, NEW.quarter) IS DISTINCT FROM (OLD.store_id, OLD.year, OLD.quarter)
       AND NOT phaseforge.pm_is_admin() THEN
      RAISE EXCEPTION 'Only an administrator can move a PM to another store or quarter.';
    END IF;
    IF auth.uid() IS NOT NULL THEN NEW.updated_by := auth.uid(); END IF;
  END IF;

  IF NEW.template_version_id IS DISTINCT FROM OLD.template_version_id
     AND EXISTS (SELECT 1 FROM pm_responses r WHERE r.pm_id = NEW.id) THEN
    RAISE EXCEPTION 'This PM already has checklist answers on its current checklist version.';
  END IF;

  -- The parts of the lifecycle that follow from the facts.
  IF NEW.job_number IS NOT NULL AND OLD.job_number IS NULL THEN
    IF NEW.status = 'awaiting_job_number' THEN NEW.status := 'job_received'; END IF;
    IF NEW.job_received_date IS NULL THEN NEW.job_received_date := current_date; END IF;
  ELSIF NEW.job_number IS NULL AND OLD.job_number IS NOT NULL AND NEW.status = 'job_received' THEN
    NEW.status := 'awaiting_job_number';
  END IF;
  IF NEW.scheduled_date IS NOT NULL AND OLD.scheduled_date IS NULL
     AND NEW.status IN ('awaiting_job_number', 'job_received', 'not_scheduled') THEN
    NEW.status := 'scheduled';
  ELSIF NEW.scheduled_date IS NULL AND OLD.scheduled_date IS NOT NULL AND NEW.status = 'scheduled' THEN
    NEW.status := CASE WHEN NEW.job_number IS NULL THEN 'awaiting_job_number' ELSE 'not_scheduled' END;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pm_cycles_guard ON phaseforge.pm_cycles;
CREATE TRIGGER pm_cycles_guard BEFORE INSERT OR UPDATE ON phaseforge.pm_cycles
  FOR EACH ROW EXECUTE FUNCTION phaseforge.pm_cycles_guard();

-- The audit trail for the PM record. Runs for every write path, so a change
-- to a job number, status, date, or assignment is always recorded with who
-- made it.
CREATE OR REPLACE FUNCTION phaseforge.pm_cycles_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'phaseforge' AS $$
DECLARE
  v_actor uuid := coalesce(auth.uid(), NEW.updated_by, NEW.created_by);
  v_tech text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO pm_activity (company_id, store_id, pm_id, actor_id, action, detail)
    VALUES (NEW.company_id, NEW.store_id, NEW.id, v_actor, 'pm_created',
            jsonb_build_object('year', NEW.year, 'quarter', NEW.quarter));
    IF NEW.job_number IS NOT NULL THEN
      INSERT INTO pm_job_numbers (company_id, pm_id, store_id, job_number, received_date, entered_by)
      VALUES (NEW.company_id, NEW.id, NEW.store_id, NEW.job_number, NEW.job_received_date, v_actor);
      INSERT INTO pm_activity (company_id, store_id, pm_id, actor_id, action, detail)
      VALUES (NEW.company_id, NEW.store_id, NEW.id, v_actor, 'job_number_entered', jsonb_build_object('to', NEW.job_number));
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.job_number IS DISTINCT FROM OLD.job_number THEN
    UPDATE pm_job_numbers SET is_current = false, superseded_at = now() WHERE pm_id = NEW.id AND is_current;
    IF NEW.job_number IS NOT NULL THEN
      INSERT INTO pm_job_numbers (company_id, pm_id, store_id, job_number, received_date, entered_by)
      VALUES (NEW.company_id, NEW.id, NEW.store_id, NEW.job_number, NEW.job_received_date, v_actor);
    END IF;
    INSERT INTO pm_activity (company_id, store_id, pm_id, actor_id, action, detail)
    VALUES (NEW.company_id, NEW.store_id, NEW.id, v_actor,
            CASE WHEN OLD.job_number IS NULL THEN 'job_number_entered'
                 WHEN NEW.job_number IS NULL THEN 'job_number_cleared' ELSE 'job_number_changed' END,
            jsonb_build_object('from', OLD.job_number, 'to', NEW.job_number));
  END IF;
  IF NEW.sc_work_order IS DISTINCT FROM OLD.sc_work_order THEN
    INSERT INTO pm_activity (company_id, store_id, pm_id, actor_id, action, detail)
    VALUES (NEW.company_id, NEW.store_id, NEW.id, v_actor, 'work_order_changed', jsonb_build_object('from', OLD.sc_work_order, 'to', NEW.sc_work_order));
  END IF;
  IF NEW.tech_id IS DISTINCT FROM OLD.tech_id THEN
    SELECT name INTO v_tech FROM pm_techs WHERE id = NEW.tech_id;
    INSERT INTO pm_activity (company_id, store_id, pm_id, actor_id, action, detail)
    VALUES (NEW.company_id, NEW.store_id, NEW.id, v_actor, 'assigned', jsonb_build_object('to', v_tech));
  END IF;
  IF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date THEN
    INSERT INTO pm_activity (company_id, store_id, pm_id, actor_id, action, detail)
    VALUES (NEW.company_id, NEW.store_id, NEW.id, v_actor,
            CASE WHEN OLD.scheduled_date IS NULL THEN 'scheduled' WHEN NEW.scheduled_date IS NULL THEN 'unscheduled' ELSE 'rescheduled' END,
            jsonb_build_object('from', OLD.scheduled_date, 'to', NEW.scheduled_date));
  END IF;
  IF NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO pm_activity (company_id, store_id, pm_id, actor_id, action, detail)
    VALUES (NEW.company_id, NEW.store_id, NEW.id, v_actor, 'due_changed',
            jsonb_build_object('due_from', OLD.due_date, 'due_to', NEW.due_date, 'priority_from', OLD.priority, 'priority_to', NEW.priority));
  END IF;
  IF NEW.actual_start IS DISTINCT FROM OLD.actual_start OR NEW.actual_end IS DISTINCT FROM OLD.actual_end
     OR NEW.job_received_date IS DISTINCT FROM OLD.job_received_date OR NEW.submitted_on IS DISTINCT FROM OLD.submitted_on THEN
    INSERT INTO pm_activity (company_id, store_id, pm_id, actor_id, action, detail)
    VALUES (NEW.company_id, NEW.store_id, NEW.id, v_actor, 'dates_changed', jsonb_strip_nulls(jsonb_build_object(
      'start', CASE WHEN NEW.actual_start IS DISTINCT FROM OLD.actual_start THEN jsonb_build_object('from', OLD.actual_start, 'to', NEW.actual_start) END,
      'end', CASE WHEN NEW.actual_end IS DISTINCT FROM OLD.actual_end THEN jsonb_build_object('from', OLD.actual_end, 'to', NEW.actual_end) END,
      'received', CASE WHEN NEW.job_received_date IS DISTINCT FROM OLD.job_received_date THEN jsonb_build_object('from', OLD.job_received_date, 'to', NEW.job_received_date) END,
      'submitted', CASE WHEN NEW.submitted_on IS DISTINCT FROM OLD.submitted_on THEN jsonb_build_object('from', OLD.submitted_on, 'to', NEW.submitted_on) END)));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO pm_activity (company_id, store_id, pm_id, actor_id, action, detail)
    VALUES (NEW.company_id, NEW.store_id, NEW.id, v_actor,
            CASE NEW.status WHEN 'field_complete' THEN 'field_completed' WHEN 'submitted' THEN 'submitted'
                            WHEN 'completed' THEN 'closed' WHEN 'in_progress' THEN
                              CASE WHEN OLD.status IN ('field_complete', 'pending_documentation', 'submitted', 'completed') THEN 'reopened' ELSE 'started' END
                            ELSE 'status_changed' END,
            jsonb_strip_nulls(jsonb_build_object('from', OLD.status, 'to', NEW.status, 'note', NEW.status_note,
                                                 'override', CASE WHEN NEW.status = 'completed' THEN NEW.completion_override_reason END)));
  END IF;
  IF NEW.return_visit_needed IS DISTINCT FROM OLD.return_visit_needed THEN
    INSERT INTO pm_activity (company_id, store_id, pm_id, actor_id, action, detail)
    VALUES (NEW.company_id, NEW.store_id, NEW.id, v_actor,
            CASE WHEN NEW.return_visit_needed THEN 'return_visit_needed' ELSE 'return_visit_cleared' END,
            jsonb_strip_nulls(jsonb_build_object('note', NEW.return_visit_note)));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pm_cycles_audit ON phaseforge.pm_cycles;
CREATE TRIGGER pm_cycles_audit AFTER INSERT OR UPDATE ON phaseforge.pm_cycles
  FOR EACH ROW EXECUTE FUNCTION phaseforge.pm_cycles_audit();

-- ─── Triggers: materials ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION phaseforge.pm_materials_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'phaseforge' AS $$
DECLARE v_store uuid; v_company uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT store_id, company_id INTO v_store, v_company FROM pm_cycles WHERE id = NEW.pm_id;
    IF v_company IS NULL OR v_company <> NEW.company_id THEN RAISE EXCEPTION 'That PM does not belong to this company.'; END IF;
    NEW.store_id := v_store;
    IF NOT phaseforge.pm_trusted() THEN
      IF auth.uid() IS NOT NULL THEN NEW.requested_by := coalesce(NEW.requested_by, auth.uid()); NEW.updated_by := auth.uid(); END IF;
      IF NOT phaseforge.pm_is_coordinator() THEN
        -- A technician asks. Ordering details are the coordinator's.
        NEW.status := 'needed'; NEW.requested_by := auth.uid();
        NEW.ordered_date := NULL; NEW.vendor := NULL; NEW.po_number := NULL;
        NEW.eta_date := NULL; NEW.received_date := NULL; NEW.installed_date := NULL;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT phaseforge.pm_trusted() THEN
    IF auth.uid() IS NOT NULL THEN NEW.updated_by := auth.uid(); END IF;
    IF NOT phaseforge.pm_is_coordinator() THEN
      IF (NEW.pm_id, NEW.store_id, NEW.vendor, NEW.po_number, NEW.ordered_date, NEW.eta_date, NEW.received_date, NEW.requested_by)
         IS DISTINCT FROM
         (OLD.pm_id, OLD.store_id, OLD.vendor, OLD.po_number, OLD.ordered_date, OLD.eta_date, OLD.received_date, OLD.requested_by) THEN
        RAISE EXCEPTION 'Ordering and delivery details are updated by a coordinator.';
      END IF;
      IF NEW.status IS DISTINCT FROM OLD.status
         AND NOT (OLD.status = 'needed' AND NEW.status = 'cancelled' AND OLD.requested_by = auth.uid())
         AND NOT (OLD.status IN ('received', 'partially_received') AND NEW.status = 'installed') THEN
        RAISE EXCEPTION 'A technician can cancel their own open request or mark received material installed.';
      END IF;
      IF OLD.status <> 'needed' AND (NEW.name, NEW.part_number, NEW.quantity, NEW.category)
         IS DISTINCT FROM (OLD.name, OLD.part_number, OLD.quantity, OLD.category) THEN
        RAISE EXCEPTION 'This request is already being handled. Ask a coordinator to change it.';
      END IF;
    END IF;
  END IF;
  IF NEW.status = 'installed' AND NEW.installed_date IS NULL THEN NEW.installed_date := current_date; END IF;
  IF NEW.status IN ('received', 'installed') AND NEW.received_date IS NULL AND OLD.status NOT IN ('received', 'installed') THEN
    NEW.received_date := current_date;
  END IF;
  IF NEW.status = 'ordered' AND NEW.ordered_date IS NULL THEN NEW.ordered_date := current_date; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pm_materials_guard ON phaseforge.pm_materials;
CREATE TRIGGER pm_materials_guard BEFORE INSERT OR UPDATE ON phaseforge.pm_materials
  FOR EACH ROW EXECUTE FUNCTION phaseforge.pm_materials_guard();

-- Keep the PM's "waiting on" flags and the trail in step with its materials.
CREATE OR REPLACE FUNCTION phaseforge.pm_materials_after() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'phaseforge' AS $$
DECLARE
  v_pm uuid := coalesce(NEW.pm_id, OLD.pm_id);
  v_actor uuid;
BEGIN
  PERFORM set_config('phaseforge.pm_internal', '1', true);
  UPDATE pm_cycles c SET
    waiting_filters = EXISTS (SELECT 1 FROM pm_materials m WHERE m.pm_id = c.id AND m.category = 'filter' AND m.status NOT IN ('installed', 'cancelled')),
    waiting_parts = EXISTS (SELECT 1 FROM pm_materials m WHERE m.pm_id = c.id AND m.category <> 'filter' AND m.status NOT IN ('installed', 'cancelled'))
  WHERE c.id = v_pm;
  PERFORM set_config('phaseforge.pm_internal', '', true);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  v_actor := coalesce(auth.uid(), NEW.updated_by, NEW.requested_by);
  IF TG_OP = 'INSERT' THEN
    INSERT INTO pm_activity (company_id, store_id, pm_id, actor_id, action, detail)
    VALUES (NEW.company_id, NEW.store_id, NEW.pm_id, v_actor, 'material_requested',
            jsonb_build_object('material_id', NEW.id, 'name', NEW.name, 'quantity', NEW.quantity, 'category', NEW.category));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO pm_activity (company_id, store_id, pm_id, actor_id, action, detail)
    VALUES (NEW.company_id, NEW.store_id, NEW.pm_id, v_actor, 'material_status',
            jsonb_build_object('material_id', NEW.id, 'name', NEW.name, 'category', NEW.category, 'from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pm_materials_after ON phaseforge.pm_materials;
CREATE TRIGGER pm_materials_after AFTER INSERT OR UPDATE OR DELETE ON phaseforge.pm_materials
  FOR EACH ROW EXECUTE FUNCTION phaseforge.pm_materials_after();

-- ─── Triggers: deficiencies ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION phaseforge.pm_deficiencies_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'phaseforge' AS $$
DECLARE v_store uuid; v_company uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.pm_id IS NOT NULL THEN
      SELECT store_id, company_id INTO v_store, v_company FROM pm_cycles WHERE id = NEW.pm_id;
      IF v_company IS NULL OR v_company <> NEW.company_id THEN RAISE EXCEPTION 'That PM does not belong to this company.'; END IF;
      NEW.store_id := v_store;
    ELSE
      SELECT company_id INTO v_company FROM pm_stores WHERE id = NEW.store_id;
      IF v_company IS NULL OR v_company <> NEW.company_id THEN RAISE EXCEPTION 'That store does not belong to this company.'; END IF;
    END IF;
    IF NOT phaseforge.pm_trusted() THEN
      IF auth.uid() IS NOT NULL THEN NEW.created_by := auth.uid(); NEW.updated_by := auth.uid(); END IF;
      IF NOT phaseforge.pm_is_coordinator() THEN
        NEW.repair_status := 'open'; NEW.followup_job_number := NULL; NEW.proposal_submitted_date := NULL;
        NEW.proposal_status := CASE WHEN NEW.proposal_required THEN 'needed' ELSE 'not_required' END;
      END IF;
    END IF;
    IF NEW.proposal_required AND NEW.proposal_status = 'not_required' THEN NEW.proposal_status := 'needed'; END IF;
    RETURN NEW;
  END IF;

  IF NOT phaseforge.pm_trusted() THEN
    IF auth.uid() IS NOT NULL THEN NEW.updated_by := auth.uid(); END IF;
    IF NOT phaseforge.pm_is_coordinator()
       AND (NEW.store_id, NEW.pm_id, NEW.proposal_status, NEW.proposal_submitted_date, NEW.followup_job_number, NEW.repair_status)
           IS DISTINCT FROM
           (OLD.store_id, OLD.pm_id, OLD.proposal_status, OLD.proposal_submitted_date, OLD.followup_job_number, OLD.repair_status) THEN
      RAISE EXCEPTION 'Proposal and repair status are updated by a coordinator.';
    END IF;
  END IF;
  IF NEW.repair_status IN ('repaired', 'closed') AND NEW.resolved_on IS NULL THEN NEW.resolved_on := current_date; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pm_deficiencies_guard ON phaseforge.pm_deficiencies;
CREATE TRIGGER pm_deficiencies_guard BEFORE INSERT OR UPDATE ON phaseforge.pm_deficiencies
  FOR EACH ROW EXECUTE FUNCTION phaseforge.pm_deficiencies_guard();

CREATE OR REPLACE FUNCTION phaseforge.pm_deficiencies_after() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'phaseforge' AS $$
DECLARE
  v_actor uuid;
  v_pm uuid;
BEGIN
  PERFORM set_config('phaseforge.pm_internal', '1', true);
  FOREACH v_pm IN ARRAY ARRAY[CASE WHEN TG_OP <> 'INSERT' THEN OLD.pm_id END, CASE WHEN TG_OP <> 'DELETE' THEN NEW.pm_id END] LOOP
    IF v_pm IS NOT NULL THEN
      UPDATE pm_cycles c SET
        open_deficiencies = (SELECT count(*) FROM pm_deficiencies d WHERE d.pm_id = c.id AND d.repair_status NOT IN ('repaired', 'closed', 'declined')),
        blocking_deficiencies = (SELECT count(*) FROM pm_deficiencies d WHERE d.pm_id = c.id AND d.affects_pm AND d.repair_status NOT IN ('repaired', 'closed', 'declined'))
      WHERE c.id = v_pm;
    END IF;
  END LOOP;
  PERFORM set_config('phaseforge.pm_internal', '', true);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  v_actor := coalesce(auth.uid(), NEW.updated_by, NEW.created_by);
  IF TG_OP = 'INSERT' THEN
    INSERT INTO pm_activity (company_id, store_id, pm_id, actor_id, action, detail)
    VALUES (NEW.company_id, NEW.store_id, NEW.pm_id, v_actor, 'deficiency_identified',
            jsonb_strip_nulls(jsonb_build_object('deficiency_id', NEW.id, 'item', NEW.item_code, 'severity', NEW.severity, 'text', left(NEW.description, 160))));
  ELSE
    IF NEW.repair_status IS DISTINCT FROM OLD.repair_status OR NEW.proposal_status IS DISTINCT FROM OLD.proposal_status THEN
      INSERT INTO pm_activity (company_id, store_id, pm_id, actor_id, action, detail)
      VALUES (NEW.company_id, NEW.store_id, NEW.pm_id, v_actor, 'deficiency_status', jsonb_strip_nulls(jsonb_build_object(
        'deficiency_id', NEW.id, 'item', NEW.item_code,
        'repair', CASE WHEN NEW.repair_status IS DISTINCT FROM OLD.repair_status THEN jsonb_build_object('from', OLD.repair_status, 'to', NEW.repair_status) END,
        'proposal', CASE WHEN NEW.proposal_status IS DISTINCT FROM OLD.proposal_status THEN jsonb_build_object('from', OLD.proposal_status, 'to', NEW.proposal_status) END)));
    END IF;
    IF NEW.followup_job_number IS DISTINCT FROM OLD.followup_job_number THEN
      INSERT INTO pm_activity (company_id, store_id, pm_id, actor_id, action, detail)
      VALUES (NEW.company_id, NEW.store_id, NEW.pm_id, v_actor, 'deficiency_linked',
              jsonb_build_object('deficiency_id', NEW.id, 'item', NEW.item_code, 'from', OLD.followup_job_number, 'to', NEW.followup_job_number));
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pm_deficiencies_after ON phaseforge.pm_deficiencies;
CREATE TRIGGER pm_deficiencies_after AFTER INSERT OR UPDATE OR DELETE ON phaseforge.pm_deficiencies
  FOR EACH ROW EXECUTE FUNCTION phaseforge.pm_deficiencies_after();

-- ─── Triggers: checklist answers ─────────────────────────────────────────────
-- Who answered and when lives on the row. A changed answer is a correction,
-- and corrections are kept in the trail.
CREATE OR REPLACE FUNCTION phaseforge.pm_responses_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'phaseforge' AS $$
DECLARE v_company uuid; v_version uuid; v_item_version uuid; v_code text; v_store uuid;
BEGIN
  SELECT company_id, template_version_id, store_id INTO v_company, v_version, v_store FROM pm_cycles WHERE id = NEW.pm_id;
  SELECT version_id, code INTO v_item_version, v_code FROM pm_template_items WHERE id = NEW.item_id;
  IF v_company IS NULL OR v_company <> NEW.company_id THEN RAISE EXCEPTION 'That PM does not belong to this company.'; END IF;
  IF v_item_version IS DISTINCT FROM v_version THEN RAISE EXCEPTION 'That check is not on this PM''s checklist.'; END IF;
  IF auth.uid() IS NOT NULL THEN NEW.updated_by := auth.uid(); END IF;
  NEW.updated_at := now();
  IF NEW.result IS DISTINCT FROM 'na' THEN NEW.na_reason := NULL; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.rev := 1;
    IF NEW.result IS NOT NULL THEN
      NEW.inspected_at := coalesce(NEW.inspected_at, now());
      NEW.inspected_by := coalesce(NEW.inspected_by, auth.uid(), NEW.updated_by);
    END IF;
    RETURN NEW;
  END IF;
  NEW.rev := OLD.rev + 1;
  IF NEW.result IS DISTINCT FROM OLD.result THEN
    IF NEW.result IS NULL THEN NEW.inspected_at := NULL; NEW.inspected_by := NULL;
    ELSE NEW.inspected_at := now(); NEW.inspected_by := coalesce(auth.uid(), NEW.updated_by);
    END IF;
    IF OLD.result IS NOT NULL THEN
      INSERT INTO pm_activity (company_id, store_id, pm_id, actor_id, action, detail)
      VALUES (NEW.company_id, v_store, NEW.pm_id, coalesce(auth.uid(), NEW.updated_by), 'check_corrected',
              jsonb_strip_nulls(jsonb_build_object('item', v_code, 'from', OLD.result, 'to', NEW.result, 'reason', NEW.na_reason)));
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pm_responses_guard ON phaseforge.pm_responses;
CREATE TRIGGER pm_responses_guard BEFORE INSERT OR UPDATE ON phaseforge.pm_responses
  FOR EACH ROW EXECUTE FUNCTION phaseforge.pm_responses_guard();

-- ─── Triggers: templates ─────────────────────────────────────────────────────
-- A published checklist is frozen. Revising means cloning to a new draft.
CREATE OR REPLACE FUNCTION phaseforge.pm_template_items_freeze() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'phaseforge' AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM pm_template_versions WHERE id = coalesce(NEW.version_id, OLD.version_id);
  IF v_status IS NOT NULL AND v_status <> 'draft' AND NOT phaseforge.pm_trusted() THEN
    RAISE EXCEPTION 'A published checklist cannot be edited. Start a new revision from it instead.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pm_template_items_freeze ON phaseforge.pm_template_items;
CREATE TRIGGER pm_template_items_freeze BEFORE INSERT OR UPDATE OR DELETE ON phaseforge.pm_template_items
  FOR EACH ROW EXECUTE FUNCTION phaseforge.pm_template_items_freeze();

CREATE OR REPLACE FUNCTION phaseforge.pm_template_versions_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'phaseforge' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' AND NOT phaseforge.pm_trusted()
     AND (NEW.data_tables, NEW.quarter, NEW.version) IS DISTINCT FROM (OLD.data_tables, OLD.quarter, OLD.version) THEN
    RAISE EXCEPTION 'A published checklist cannot be edited. Start a new revision from it instead.';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' AND NEW.status = 'draft' THEN
    RAISE EXCEPTION 'A published checklist cannot go back to draft. Start a new revision from it instead.';
  END IF;
  -- Publishing replaces whichever checklist was live for that quarter.
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status <> 'active') THEN
    UPDATE pm_template_versions SET status = 'retired'
     WHERE company_id = NEW.company_id AND quarter = NEW.quarter AND status = 'active' AND id <> NEW.id;
    NEW.published_at := coalesce(NEW.published_at, now());
    NEW.published_by := coalesce(NEW.published_by, auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pm_template_versions_guard ON phaseforge.pm_template_versions;
CREATE TRIGGER pm_template_versions_guard BEFORE INSERT OR UPDATE ON phaseforge.pm_template_versions
  FOR EACH ROW EXECUTE FUNCTION phaseforge.pm_template_versions_guard();

-- ─── Row level security ──────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pm_techs', 'pm_stores', 'pm_equipment', 'pm_template_versions', 'pm_template_items',
                           'pm_store_exclusions', 'pm_cycles', 'pm_job_numbers', 'pm_responses', 'pm_readings',
                           'pm_materials', 'pm_deficiencies', 'pm_attachments', 'pm_reports', 'pm_activity',
                           'pm_settings', 'pm_import_batches', 'pm_alert_log'] LOOP
    EXECUTE format('ALTER TABLE phaseforge.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON phaseforge.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON phaseforge.%I TO service_role', t);
  END LOOP;
  -- Everyone in the company can read. (pm_alert_log has no policy: server only.)
  FOREACH t IN ARRAY ARRAY['pm_techs', 'pm_stores', 'pm_equipment', 'pm_template_versions', 'pm_template_items',
                           'pm_store_exclusions', 'pm_cycles', 'pm_job_numbers', 'pm_responses', 'pm_readings',
                           'pm_materials', 'pm_deficiencies', 'pm_attachments', 'pm_reports', 'pm_activity',
                           'pm_settings'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON phaseforge.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON phaseforge.%I FOR SELECT USING (company_id = phaseforge.get_my_company_id())', t || '_select', t);
  END LOOP;
  -- Coordinators manage the directory.
  FOREACH t IN ARRAY ARRAY['pm_techs', 'pm_stores', 'pm_equipment', 'pm_store_exclusions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON phaseforge.%I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON phaseforge.%I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON phaseforge.%I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON phaseforge.%I FOR INSERT WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.pm_is_coordinator())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON phaseforge.%I FOR UPDATE USING (company_id = phaseforge.get_my_company_id() AND phaseforge.pm_is_coordinator()) WITH CHECK (company_id = phaseforge.get_my_company_id())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON phaseforge.%I FOR DELETE USING (company_id = phaseforge.get_my_company_id() AND phaseforge.pm_is_coordinator())', t || '_delete', t);
  END LOOP;
  -- Administrators own the checklist templates and the rules.
  FOREACH t IN ARRAY ARRAY['pm_template_versions', 'pm_template_items', 'pm_settings'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON phaseforge.%I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON phaseforge.%I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON phaseforge.%I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON phaseforge.%I FOR INSERT WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.pm_is_admin())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON phaseforge.%I FOR UPDATE USING (company_id = phaseforge.get_my_company_id() AND phaseforge.pm_is_admin()) WITH CHECK (company_id = phaseforge.get_my_company_id())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON phaseforge.%I FOR DELETE USING (company_id = phaseforge.get_my_company_id() AND phaseforge.pm_is_admin())', t || '_delete', t);
  END LOOP;
  -- Field work: anyone who may work the PM.
  FOREACH t IN ARRAY ARRAY['pm_responses', 'pm_readings'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON phaseforge.%I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON phaseforge.%I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON phaseforge.%I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON phaseforge.%I FOR INSERT WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.pm_can_work(pm_id))', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON phaseforge.%I FOR UPDATE USING (company_id = phaseforge.get_my_company_id() AND phaseforge.pm_can_work(pm_id)) WITH CHECK (company_id = phaseforge.get_my_company_id())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON phaseforge.%I FOR DELETE USING (company_id = phaseforge.get_my_company_id() AND phaseforge.pm_can_work(pm_id))', t || '_delete', t);
  END LOOP;
END $$;

-- PM records: coordinators write them. Technicians change theirs through the
-- server, which checks pm_can_work() first.
DROP POLICY IF EXISTS pm_cycles_insert ON phaseforge.pm_cycles;
DROP POLICY IF EXISTS pm_cycles_update ON phaseforge.pm_cycles;
DROP POLICY IF EXISTS pm_cycles_delete ON phaseforge.pm_cycles;
CREATE POLICY pm_cycles_insert ON phaseforge.pm_cycles FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.pm_is_coordinator());
CREATE POLICY pm_cycles_update ON phaseforge.pm_cycles FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.pm_is_coordinator())
  WITH CHECK (company_id = phaseforge.get_my_company_id());
CREATE POLICY pm_cycles_delete ON phaseforge.pm_cycles FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.pm_is_admin());

-- Materials and deficiencies: a technician can raise them on their PM; the
-- guard triggers above limit what they can change afterwards.
DROP POLICY IF EXISTS pm_materials_insert ON phaseforge.pm_materials;
DROP POLICY IF EXISTS pm_materials_update ON phaseforge.pm_materials;
DROP POLICY IF EXISTS pm_materials_delete ON phaseforge.pm_materials;
CREATE POLICY pm_materials_insert ON phaseforge.pm_materials FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.pm_can_work(pm_id));
CREATE POLICY pm_materials_update ON phaseforge.pm_materials FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.pm_can_work(pm_id))
  WITH CHECK (company_id = phaseforge.get_my_company_id());
CREATE POLICY pm_materials_delete ON phaseforge.pm_materials FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.pm_is_coordinator());

DROP POLICY IF EXISTS pm_deficiencies_insert ON phaseforge.pm_deficiencies;
DROP POLICY IF EXISTS pm_deficiencies_update ON phaseforge.pm_deficiencies;
DROP POLICY IF EXISTS pm_deficiencies_delete ON phaseforge.pm_deficiencies;
CREATE POLICY pm_deficiencies_insert ON phaseforge.pm_deficiencies FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id()
              AND (phaseforge.pm_is_coordinator() OR (pm_id IS NOT NULL AND phaseforge.pm_can_work(pm_id))));
CREATE POLICY pm_deficiencies_update ON phaseforge.pm_deficiencies FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id()
         AND (phaseforge.pm_is_coordinator() OR (pm_id IS NOT NULL AND phaseforge.pm_can_work(pm_id))))
  WITH CHECK (company_id = phaseforge.get_my_company_id());
CREATE POLICY pm_deficiencies_delete ON phaseforge.pm_deficiencies FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.pm_is_coordinator());

DROP POLICY IF EXISTS pm_attachments_insert ON phaseforge.pm_attachments;
DROP POLICY IF EXISTS pm_attachments_update ON phaseforge.pm_attachments;
DROP POLICY IF EXISTS pm_attachments_delete ON phaseforge.pm_attachments;
CREATE POLICY pm_attachments_insert ON phaseforge.pm_attachments FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id()
              AND (phaseforge.pm_is_coordinator() OR (pm_id IS NOT NULL AND phaseforge.pm_can_work(pm_id))));
CREATE POLICY pm_attachments_update ON phaseforge.pm_attachments FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id()
         AND (phaseforge.pm_is_coordinator() OR (pm_id IS NOT NULL AND phaseforge.pm_can_work(pm_id))))
  WITH CHECK (company_id = phaseforge.get_my_company_id());
CREATE POLICY pm_attachments_delete ON phaseforge.pm_attachments FOR DELETE
  USING (company_id = phaseforge.get_my_company_id()
         AND (phaseforge.pm_is_coordinator() OR (pm_id IS NOT NULL AND uploaded_by = auth.uid() AND phaseforge.pm_can_work(pm_id))));

-- The trail is append only, and you can only sign your own name to it.
DROP POLICY IF EXISTS pm_activity_insert ON phaseforge.pm_activity;
CREATE POLICY pm_activity_insert ON phaseforge.pm_activity FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND actor_id = auth.uid());
REVOKE UPDATE, DELETE ON phaseforge.pm_activity FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON phaseforge.pm_job_numbers FROM authenticated;
REVOKE ALL ON phaseforge.pm_alert_log FROM authenticated;

DROP POLICY IF EXISTS pm_reports_insert ON phaseforge.pm_reports;
CREATE POLICY pm_reports_insert ON phaseforge.pm_reports FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.pm_is_coordinator());

DROP POLICY IF EXISTS pm_import_batches_all ON phaseforge.pm_import_batches;
CREATE POLICY pm_import_batches_all ON phaseforge.pm_import_batches FOR ALL
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.pm_is_coordinator())
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.pm_is_coordinator());

REVOKE ALL ON FUNCTION phaseforge.pm_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION phaseforge.pm_is_coordinator() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION phaseforge.pm_can_work(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION phaseforge.pm_is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION phaseforge.pm_is_coordinator() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION phaseforge.pm_can_work(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION phaseforge.pm_trusted() TO authenticated, service_role;

-- pm_trusted() only reads settings, so it gets an empty search_path.
ALTER FUNCTION phaseforge.pm_trusted() SET search_path TO '';
