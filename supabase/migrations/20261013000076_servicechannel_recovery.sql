SET search_path TO phaseforge, extensions;

-- ============================================================================
-- ServiceChannel Recovery & Accountability Center
--
-- Additive only. Work orders, cases, imports, notes, and observations are not
-- touched. ServiceChannel keeps running the operations; these tables hold what
-- PhaseForge owns: internal responsibilities (tasks that may stand alone or
-- attach to a work order, a project, an investigation, or a recovery), the
-- people they are assigned to (with or without a login), customer recovery
-- records, improvement projects, and root-cause investigations.
-- ============================================================================

-- People: the existing company directory gains a department and a role so
-- responsibilities can be assigned to someone without a PhaseForge account.
ALTER TABLE phaseforge.employees ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE phaseforge.employees ADD COLUMN IF NOT EXISTS job_role text;

-- Tasks become the unit of accountability.
ALTER TABLE phaseforge.sc_tasks ALTER COLUMN work_order_id DROP NOT NULL;
ALTER TABLE phaseforge.sc_tasks ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'follow_up';
ALTER TABLE phaseforge.sc_tasks ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE phaseforge.sc_tasks ADD COLUMN IF NOT EXISTS owner_employee_id uuid REFERENCES phaseforge.employees(id) ON DELETE SET NULL;
ALTER TABLE phaseforge.sc_tasks ADD COLUMN IF NOT EXISTS external_ack_by text;
ALTER TABLE phaseforge.sc_tasks ADD COLUMN IF NOT EXISTS external_ack_recorded_name text;
ALTER TABLE phaseforge.sc_tasks ADD COLUMN IF NOT EXISTS external_ack_at timestamptz;
ALTER TABLE phaseforge.sc_tasks ADD COLUMN IF NOT EXISTS escalated_at timestamptz;
ALTER TABLE phaseforge.sc_tasks ADD COLUMN IF NOT EXISTS escalated_to text;
ALTER TABLE phaseforge.sc_tasks ADD COLUMN IF NOT EXISTS escalation_note text;
ALTER TABLE phaseforge.sc_tasks ADD COLUMN IF NOT EXISTS last_update_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE phaseforge.sc_tasks ADD COLUMN IF NOT EXISTS project_id uuid;
ALTER TABLE phaseforge.sc_tasks ADD COLUMN IF NOT EXISTS investigation_id uuid;
ALTER TABLE phaseforge.sc_tasks ADD COLUMN IF NOT EXISTS recovery_id uuid;
ALTER TABLE phaseforge.sc_tasks DROP CONSTRAINT IF EXISTS sc_tasks_kind_check;
ALTER TABLE phaseforge.sc_tasks ADD CONSTRAINT sc_tasks_kind_check CHECK (kind IN ('follow_up', 'corrective_action', 'customer_contact', 'review', 'milestone'));
CREATE INDEX IF NOT EXISTS sc_tasks_dept_idx ON phaseforge.sc_tasks (company_id, department, status);

ALTER TABLE phaseforge.sc_cases ADD COLUMN IF NOT EXISTS owner_employee_id uuid REFERENCES phaseforge.employees(id) ON DELETE SET NULL;
ALTER TABLE phaseforge.sc_cases ADD COLUMN IF NOT EXISTS action_owner_employee_id uuid REFERENCES phaseforge.employees(id) ON DELETE SET NULL;
ALTER TABLE phaseforge.sc_cases ADD COLUMN IF NOT EXISTS escalated_at timestamptz;
ALTER TABLE phaseforge.sc_cases ADD COLUMN IF NOT EXISTS escalated_to text;
ALTER TABLE phaseforge.sc_cases ADD COLUMN IF NOT EXISTS escalation_note text;

ALTER TABLE phaseforge.sc_settings ADD COLUMN IF NOT EXISTS unack_days integer NOT NULL DEFAULT 2;
ALTER TABLE phaseforge.sc_settings ADD COLUMN IF NOT EXISTS stale_days integer NOT NULL DEFAULT 3;
ALTER TABLE phaseforge.sc_settings ADD COLUMN IF NOT EXISTS review_days integer NOT NULL DEFAULT 7;
ALTER TABLE phaseforge.sc_settings ADD COLUMN IF NOT EXISTS last_score_review_at timestamptz;

-- Customer recovery: the reported concern and the verified conclusion are separate fields.
CREATE TABLE IF NOT EXISTS phaseforge.sc_recoveries (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  work_order_id         uuid REFERENCES phaseforge.sc_work_orders(id) ON DELETE SET NULL,
  tracking_number       text,
  customer_name         text,
  store_label           text,
  reporting_contact     text,
  complaint             text NOT NULL,
  approved_scope        text,
  findings              text,
  owner_profile_id      uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  owner_employee_id     uuid REFERENCES phaseforge.employees(id) ON DELETE SET NULL,
  owner_name            text,
  department            text,
  contact_date          date,
  conversation_notes    text,
  agreed_resolution     text,
  required_action       text,
  follow_up_deadline    date,
  verification_evidence text,
  outcome               text CHECK (outcome IS NULL OR outcome IN (
                          'confirmed_incomplete_repair', 'workmanship_concern', 'additional_scope_required', 'customer_misunderstanding',
                          'incorrect_sc_record', 'resolved_after_corrective_action', 'further_investigation_required')),
  status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'contacted', 'in_progress', 'pending_verification', 'closed')),
  last_update_at        timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_name          text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sc_recoveries_idx ON phaseforge.sc_recoveries (company_id, status, follow_up_deadline);

-- Improvement projects.
CREATE TABLE IF NOT EXISTS phaseforge.sc_projects (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  name                 text NOT NULL CHECK (length(btrim(name)) > 0),
  scope_customer       text,
  department           text,
  score_category       text,
  kpi                  text,
  baseline_value       numeric(10, 2),
  baseline_period      text,
  target_value         numeric(10, 2),
  owner_profile_id     uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  owner_employee_id    uuid REFERENCES phaseforge.employees(id) ON DELETE SET NULL,
  owner_name           text,
  start_date           date,
  target_date          date,
  review_date          date,
  root_problem         text,
  action_plan          text,
  verification_method  text,
  management_notes     text,
  blockers             text,
  status               text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'on_hold', 'completed', 'cancelled')),
  last_update_at       timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_name         text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS phaseforge.sc_project_milestones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES phaseforge.sc_projects(id) ON DELETE CASCADE,
  title         text NOT NULL,
  due_date      date,
  completed_at  timestamptz,
  note          text,
  sort_order    integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS phaseforge.sc_project_kpis (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  project_id     uuid NOT NULL REFERENCES phaseforge.sc_projects(id) ON DELETE CASCADE,
  kind           text NOT NULL DEFAULT 'progress' CHECK (kind IN ('baseline', 'progress', 'result')),
  label          text NOT NULL,
  value          numeric(10, 2),
  snapshot_date  date NOT NULL,
  period_label   text,
  source         text,
  note           text,
  created_by     uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS phaseforge.sc_project_updates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  project_id   uuid NOT NULL REFERENCES phaseforge.sc_projects(id) ON DELETE CASCADE,
  body         text NOT NULL,
  author_id    uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  author_name  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS phaseforge.sc_project_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  project_id     uuid NOT NULL REFERENCES phaseforge.sc_projects(id) ON DELETE CASCADE,
  work_order_id  uuid NOT NULL REFERENCES phaseforge.sc_work_orders(id) ON DELETE CASCADE,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, work_order_id)
);

-- Root-cause investigations.
CREATE TABLE IF NOT EXISTS phaseforge.sc_investigations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  title              text NOT NULL CHECK (length(btrim(title)) > 0),
  description        text,
  customer_name      text,
  equipment          text,
  impact             text,
  evidence           text,
  suspected_cause    text,
  verified_cause     text,
  cause_class        text CHECK (cause_class IS NULL OR cause_class IN (
                       'diagnosis_failure', 'incomplete_repair', 'inadequate_testing', 'parts_issue', 'dispatch_error', 'scheduling_failure',
                       'estimating_delay', 'customer_access', 'scope_misunderstanding', 'documentation_failure', 'billing_error', 'other')),
  department         text,
  corrective_action  text,
  prevention_plan    text,
  owner_profile_id   uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  owner_employee_id  uuid REFERENCES phaseforge.employees(id) ON DELETE SET NULL,
  owner_name         text,
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'verified', 'closed')),
  verification_date  date,
  outcome            text,
  project_id         uuid REFERENCES phaseforge.sc_projects(id) ON DELETE SET NULL,
  last_update_at     timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_name       text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS phaseforge.sc_investigation_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  investigation_id  uuid NOT NULL REFERENCES phaseforge.sc_investigations(id) ON DELETE CASCADE,
  work_order_id     uuid NOT NULL REFERENCES phaseforge.sc_work_orders(id) ON DELETE CASCADE,
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (investigation_id, work_order_id)
);

-- Task links to the new records, now that they exist.
ALTER TABLE phaseforge.sc_tasks DROP CONSTRAINT IF EXISTS sc_tasks_project_fk;
ALTER TABLE phaseforge.sc_tasks ADD CONSTRAINT sc_tasks_project_fk FOREIGN KEY (project_id) REFERENCES phaseforge.sc_projects(id) ON DELETE SET NULL;
ALTER TABLE phaseforge.sc_tasks DROP CONSTRAINT IF EXISTS sc_tasks_investigation_fk;
ALTER TABLE phaseforge.sc_tasks ADD CONSTRAINT sc_tasks_investigation_fk FOREIGN KEY (investigation_id) REFERENCES phaseforge.sc_investigations(id) ON DELETE SET NULL;
ALTER TABLE phaseforge.sc_tasks DROP CONSTRAINT IF EXISTS sc_tasks_recovery_fk;
ALTER TABLE phaseforge.sc_tasks ADD CONSTRAINT sc_tasks_recovery_fk FOREIGN KEY (recovery_id) REFERENCES phaseforge.sc_recoveries(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sc_tasks_project_idx ON phaseforge.sc_tasks (project_id);
CREATE INDEX IF NOT EXISTS sc_tasks_investigation_idx ON phaseforge.sc_tasks (investigation_id);
CREATE INDEX IF NOT EXISTS sc_tasks_recovery_idx ON phaseforge.sc_tasks (recovery_id);

-- Activity on the new records shares the event table; work_order_id becomes optional.
ALTER TABLE phaseforge.sc_events ALTER COLUMN work_order_id DROP NOT NULL;
ALTER TABLE phaseforge.sc_events ADD COLUMN IF NOT EXISTS record_type text;
ALTER TABLE phaseforge.sc_events ADD COLUMN IF NOT EXISTS record_id uuid;
CREATE INDEX IF NOT EXISTS sc_events_record_idx ON phaseforge.sc_events (record_type, record_id, created_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sc_recoveries', 'sc_projects', 'sc_project_milestones', 'sc_project_kpis', 'sc_project_updates', 'sc_project_links', 'sc_investigations', 'sc_investigation_links'] LOOP
    EXECUTE format('ALTER TABLE phaseforge.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON phaseforge.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON phaseforge.%I FOR SELECT USING (company_id = phaseforge.get_my_company_id() AND phaseforge.sc_is_owner())', t || '_select', t);
    EXECUTE format('GRANT SELECT ON phaseforge.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON phaseforge.%I TO service_role', t);
  END LOOP;
END $$;
