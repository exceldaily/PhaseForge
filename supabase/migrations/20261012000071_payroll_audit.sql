SET search_path TO phaseforge, extensions;

-- ============================================================================
-- Payroll Travel Audit
--
-- A read-only auditing assistant. A local browser worker reads Kalos payroll
-- timesheets through the signed-in browser and sends the page text here; the
-- server parses it, reconciles travel entries against road drive times, and
-- stores findings for an administrator to review. Nothing here ever writes to
-- Kalos, and nothing in this file touches projects, schedules, or PM tables.
--
-- Access: owners and admins only (SELECT). All writes go through the server
-- with the service role after it has checked who is asking, so there are no
-- INSERT/UPDATE/DELETE policies on purpose.
--
-- Employee home addresses are never copied in here. Findings carry a label
-- ("Home" / "Job 241480"), never an address or a home coordinate.
-- ============================================================================

CREATE OR REPLACE FUNCTION phaseforge.payroll_audit_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'phaseforge' AS $$
  SELECT phaseforge.ops_is_admin() OR coalesce(phaseforge.get_my_role(), '') IN ('owner', 'admin')
$$;

-- The Kalos employee id is the stable key for exclusions and matching; the
-- name on a timesheet is not. Filled the first time a timesheet is matched.
ALTER TABLE phaseforge.employees ADD COLUMN IF NOT EXISTS kalos_employee_id text;
CREATE INDEX IF NOT EXISTS idx_employees_kalos_id ON phaseforge.employees (company_id, kalos_employee_id) WHERE kalos_employee_id IS NOT NULL;

-- ─── Settings ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phaseforge.payroll_audit_settings (
  company_id               uuid PRIMARY KEY REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  tolerance_minutes        integer NOT NULL DEFAULT 45 CHECK (tolerance_minutes BETWEEN 0 AND 600),
  -- Kalos subtracts a "travel policy deduction" from some travel entries. Off:
  -- compare the paid duration shown on the timesheet. On: add the deduction back.
  include_policy_deduction boolean NOT NULL DEFAULT false,
  timezone                 text NOT NULL DEFAULT 'America/New_York',
  schedule_enabled         boolean NOT NULL DEFAULT false,
  schedule_days_back       integer NOT NULL DEFAULT 7 CHECK (schedule_days_back BETWEEN 1 AND 31),
  notify_new_flags         boolean NOT NULL DEFAULT true,
  -- The worker key is derived on the server from a master secret, this
  -- company id, and this number. Bumping it retires the old key.
  worker_key_version       integer NOT NULL DEFAULT 1,
  worker_last_seen         timestamptz,
  worker_name              text,
  worker_state             text,
  updated_by               uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- ─── Exclusions ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phaseforge.payroll_audit_exclusions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  employee_name      text NOT NULL CHECK (length(btrim(employee_name)) > 0),
  kalos_employee_id  text,
  note               text,
  created_by         uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payroll_audit_exclusions_name_key ON phaseforge.payroll_audit_exclusions (company_id, lower(btrim(employee_name)));
CREATE UNIQUE INDEX IF NOT EXISTS payroll_audit_exclusions_kalos_key ON phaseforge.payroll_audit_exclusions (company_id, kalos_employee_id) WHERE kalos_employee_id IS NOT NULL;

-- ─── Runs ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phaseforge.payroll_audit_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  trigger           text NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual', 'scheduled')),
  range_start       date NOT NULL,
  range_end         date NOT NULL,
  requested_by      uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  retry_of          uuid REFERENCES phaseforge.payroll_audit_runs(id) ON DELETE SET NULL,
  cancel_requested  boolean NOT NULL DEFAULT false,
  phase             text,
  progress_current  integer NOT NULL DEFAULT 0,
  progress_total    integer NOT NULL DEFAULT 0,
  message           text,
  stats             jsonb NOT NULL DEFAULT '{}'::jsonb,
  error             text,
  error_code        text,
  queued_at         timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz,
  completed_at      timestamptz,
  heartbeat_at      timestamptz,
  CHECK (range_end >= range_start)
);
CREATE INDEX IF NOT EXISTS payroll_audit_runs_company_idx ON phaseforge.payroll_audit_runs (company_id, queued_at DESC);
-- One active run per company: the worker is single-threaded on purpose.
CREATE UNIQUE INDEX IF NOT EXISTS payroll_audit_runs_one_active ON phaseforge.payroll_audit_runs (company_id) WHERE status IN ('queued', 'running');

-- ─── Timesheet entries (source evidence) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS phaseforge.payroll_audit_entries (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  entry_key                text NOT NULL,
  kalos_employee_id        text NOT NULL,
  employee_name            text NOT NULL,
  week_start               date NOT NULL,
  work_date                date NOT NULL,
  job_number               text,
  kalos_entry_status       text,
  class_code               text,
  class_name               text,
  is_travel                boolean NOT NULL DEFAULT false,
  start_at                 timestamptz NOT NULL,
  end_at                   timestamptz NOT NULL,
  start_text               text NOT NULL,
  end_text                 text NOT NULL,
  hours                    numeric(6, 2),
  policy_deduction_minutes integer NOT NULL DEFAULT 0,
  brief_desc               text,
  system_notes             text,
  date_submitted           date,
  run_id                   uuid REFERENCES phaseforge.payroll_audit_runs(id) ON DELETE SET NULL,
  first_seen_at            timestamptz NOT NULL DEFAULT now(),
  last_seen_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, entry_key)
);
CREATE INDEX IF NOT EXISTS payroll_audit_entries_emp_idx ON phaseforge.payroll_audit_entries (company_id, kalos_employee_id, start_at);
CREATE INDEX IF NOT EXISTS payroll_audit_entries_week_idx ON phaseforge.payroll_audit_entries (company_id, week_start);

-- ─── Findings ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phaseforge.payroll_audit_findings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  finding_key        text NOT NULL,
  category           text NOT NULL CHECK (category IN (
                       'excessive_travel', 'jobsite_transition', 'missing_travel', 'unexplained_gap',
                       'overlap', 'impossible_transition', 'unable_to_verify', 'unmatched_job')),
  kalos_employee_id  text,
  employee_name      text,
  work_date          date,
  travel_type        text,
  origin_label       text,
  dest_label         text,
  job_numbers        text[] NOT NULL DEFAULT '{}',
  entry_keys         text[] NOT NULL DEFAULT '{}',
  recorded_minutes   integer,
  estimated_minutes  integer,
  allowed_minutes    integer,
  excess_minutes     integer,
  route_provider     text,
  summary            text NOT NULL,
  evidence           jsonb NOT NULL DEFAULT '{}'::jsonb,
  assumptions        text[] NOT NULL DEFAULT '{}',
  review_status      text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'justified', 'correction_needed', 'resolved', 'unable_to_verify')),
  review_note        text,
  reviewed_by        uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  reviewed_at        timestamptz,
  first_run_id       uuid REFERENCES phaseforge.payroll_audit_runs(id) ON DELETE SET NULL,
  last_run_id        uuid REFERENCES phaseforge.payroll_audit_runs(id) ON DELETE SET NULL,
  -- Set when a later audit of the same dates no longer produces the finding
  -- (the timesheet was corrected). Kept, with its review history, not deleted.
  superseded_at      timestamptz,
  notified_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, finding_key)
);
CREATE INDEX IF NOT EXISTS payroll_audit_findings_list_idx ON phaseforge.payroll_audit_findings (company_id, work_date DESC);
CREATE INDEX IF NOT EXISTS payroll_audit_findings_emp_idx ON phaseforge.payroll_audit_findings (company_id, kalos_employee_id);

CREATE TABLE IF NOT EXISTS phaseforge.payroll_audit_review_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  finding_id  uuid NOT NULL REFERENCES phaseforge.payroll_audit_findings(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  actor_name  text,
  from_status text,
  to_status   text NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_audit_review_log_finding_idx ON phaseforge.payroll_audit_review_log (finding_id, created_at DESC);

-- ─── Job places typed in by hand (fixes "unmatched job") ─────────────────────

CREATE TABLE IF NOT EXISTS phaseforge.payroll_audit_job_places (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  job_number  text NOT NULL CHECK (length(btrim(job_number)) > 0),
  address     text NOT NULL,
  latitude    double precision NOT NULL,
  longitude   double precision NOT NULL,
  -- 'manual' is typed in by an administrator and always wins. Anything else
  -- is a geocode of an address found elsewhere in PhaseForge, kept so the
  -- same address is not looked up again.
  source      text NOT NULL DEFAULT 'manual',
  created_by  uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, job_number)
);

-- ─── Route cache and replay nonces (server only) ─────────────────────────────

-- Keyed by coordinates rounded to ~110 m, so a repeated pair is one lookup
-- and no row says whose house it was.
CREATE TABLE IF NOT EXISTS phaseforge.payroll_route_cache (
  route_key    text PRIMARY KEY,
  minutes      integer NOT NULL,
  miles        numeric(8, 1),
  provider     text NOT NULL,
  computed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS phaseforge.payroll_audit_nonces (
  nonce       text PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_audit_nonces_age_idx ON phaseforge.payroll_audit_nonces (created_at);

-- ─── Row level security: admins read, the server writes ──────────────────────

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'payroll_audit_settings', 'payroll_audit_exclusions', 'payroll_audit_runs', 'payroll_audit_entries',
    'payroll_audit_findings', 'payroll_audit_review_log', 'payroll_audit_job_places'
  ] LOOP
    EXECUTE format('ALTER TABLE phaseforge.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON phaseforge.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON phaseforge.%I FOR SELECT USING (company_id = phaseforge.get_my_company_id() AND phaseforge.payroll_audit_is_admin())', t || '_select', t);
  END LOOP;
END $$;

-- No policies at all: only the service role can touch these.
ALTER TABLE phaseforge.payroll_route_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE phaseforge.payroll_audit_nonces ENABLE ROW LEVEL SECURITY;

-- Table grants follow the project convention (RLS does the real gating).
GRANT SELECT ON phaseforge.payroll_audit_settings, phaseforge.payroll_audit_exclusions, phaseforge.payroll_audit_runs,
  phaseforge.payroll_audit_entries, phaseforge.payroll_audit_findings, phaseforge.payroll_audit_review_log,
  phaseforge.payroll_audit_job_places TO authenticated;
GRANT ALL ON phaseforge.payroll_audit_settings, phaseforge.payroll_audit_exclusions, phaseforge.payroll_audit_runs,
  phaseforge.payroll_audit_entries, phaseforge.payroll_audit_findings, phaseforge.payroll_audit_review_log,
  phaseforge.payroll_audit_job_places, phaseforge.payroll_route_cache, phaseforge.payroll_audit_nonces TO service_role;
