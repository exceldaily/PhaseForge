SET search_path TO phaseforge, extensions;

-- ============================================================================
-- ServiceChannel: operational data kept separate from imported data
--
-- Additive. Nothing here changes existing work orders, cases, notes, or
-- imports. New columns on sc_cases hold what the export cannot tell us and a
-- person records by hand (appointment, parts, approval, condition, contact).
-- sc_store_customers maps store numbers to customers because the export has
-- no customer field. The commit function now records a conflict instead of
-- overwriting a customer a person set.
-- ============================================================================

ALTER TABLE phaseforge.sc_work_orders ADD COLUMN IF NOT EXISTS customer_source text;
ALTER TABLE phaseforge.sc_work_orders ADD COLUMN IF NOT EXISTS conflicts jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE phaseforge.sc_cases ADD COLUMN IF NOT EXISTS action_owner_profile_id uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL;
ALTER TABLE phaseforge.sc_cases ADD COLUMN IF NOT EXISTS action_owner_name text;
ALTER TABLE phaseforge.sc_cases ADD COLUMN IF NOT EXISTS owner_assigned_at timestamptz;
ALTER TABLE phaseforge.sc_cases ADD COLUMN IF NOT EXISTS waiting_on text;
ALTER TABLE phaseforge.sc_cases ADD COLUMN IF NOT EXISTS external_ack_by text;
ALTER TABLE phaseforge.sc_cases ADD COLUMN IF NOT EXISTS external_ack_recorded_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL;
ALTER TABLE phaseforge.sc_cases ADD COLUMN IF NOT EXISTS external_ack_recorded_name text;
ALTER TABLE phaseforge.sc_cases ADD COLUMN IF NOT EXISTS external_ack_at timestamptz;
ALTER TABLE phaseforge.sc_cases ADD COLUMN IF NOT EXISTS appointment_on date;
ALTER TABLE phaseforge.sc_cases ADD COLUMN IF NOT EXISTS parts_expected_on date;
ALTER TABLE phaseforge.sc_cases ADD COLUMN IF NOT EXISTS parts_received_on date;
ALTER TABLE phaseforge.sc_cases ADD COLUMN IF NOT EXISTS approval_status text;
ALTER TABLE phaseforge.sc_cases ADD COLUMN IF NOT EXISTS equipment_condition text;
ALTER TABLE phaseforge.sc_cases ADD COLUMN IF NOT EXISTS condition_verified_at timestamptz;
ALTER TABLE phaseforge.sc_cases ADD COLUMN IF NOT EXISTS customer_contact_name text;
ALTER TABLE phaseforge.sc_cases ADD COLUMN IF NOT EXISTS next_contact_on date;
ALTER TABLE phaseforge.sc_cases DROP CONSTRAINT IF EXISTS sc_cases_waiting_on_check;
ALTER TABLE phaseforge.sc_cases ADD CONSTRAINT sc_cases_waiting_on_check CHECK (waiting_on IS NULL OR waiting_on IN ('technician', 'estimating', 'service_manager', 'customer', 'parts', 'billing'));
ALTER TABLE phaseforge.sc_cases DROP CONSTRAINT IF EXISTS sc_cases_approval_status_check;
ALTER TABLE phaseforge.sc_cases ADD CONSTRAINT sc_cases_approval_status_check CHECK (approval_status IS NULL OR approval_status IN ('pending', 'approved', 'declined'));

CREATE TABLE IF NOT EXISTS phaseforge.sc_store_customers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  store_number   text NOT NULL CHECK (length(btrim(store_number)) > 0),
  customer_name  text NOT NULL CHECK (length(btrim(customer_name)) > 0),
  customer_id    uuid REFERENCES phaseforge.customers(id) ON DELETE SET NULL,
  note           text,
  created_by     uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_name   text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, store_number)
);

CREATE TABLE IF NOT EXISTS phaseforge.sc_follow_up_templates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  title            text NOT NULL CHECK (length(btrim(title)) > 0),
  queue            text NOT NULL DEFAULT 'general',
  next_action      text NOT NULL,
  days_due         integer NOT NULL DEFAULT 2,
  waiting_on       text,
  internal_status  text,
  sort_order       integer NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, title)
);

-- A person links two work orders; the system only suggests candidates.
CREATE TABLE IF NOT EXISTS phaseforge.sc_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  work_order_id  uuid NOT NULL REFERENCES phaseforge.sc_work_orders(id) ON DELETE CASCADE,
  related_id     uuid NOT NULL REFERENCES phaseforge.sc_work_orders(id) ON DELETE CASCADE,
  relation       text NOT NULL CHECK (relation IN ('related', 'recall')),
  note           text,
  created_by     uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_name   text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_order_id, related_id)
);

CREATE TABLE IF NOT EXISTS phaseforge.sc_attachments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  work_order_id  uuid NOT NULL REFERENCES phaseforge.sc_work_orders(id) ON DELETE CASCADE,
  path           text NOT NULL,
  name           text NOT NULL,
  size           integer,
  content_type   text,
  created_by     uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_name   text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sc_attachments_wo_idx ON phaseforge.sc_attachments (work_order_id, created_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sc_store_customers', 'sc_follow_up_templates', 'sc_links', 'sc_attachments'] LOOP
    EXECUTE format('ALTER TABLE phaseforge.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON phaseforge.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON phaseforge.%I FOR SELECT USING (company_id = phaseforge.get_my_company_id() AND phaseforge.sc_is_owner())', t || '_select', t);
    EXECUTE format('GRANT SELECT ON phaseforge.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON phaseforge.%I TO service_role', t);
  END LOOP;
END $$;

-- Commit: same as before, plus customer provenance and conflict recording.
CREATE OR REPLACE FUNCTION phaseforge.sc_commit_import(p_import uuid, p_actor uuid, p_actor_name text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'phaseforge' AS $$
DECLARE
  imp         phaseforge.sc_imports%ROWTYPE;
  r           jsonb;
  m           jsonb;
  cols        jsonb;
  wo_id       uuid;
  was_new     boolean;
  kind        text;
  n_new       integer := 0;
  n_changed   integer := 0;
  n_unchanged integer := 0;
  n_reopened  integer := 0;
  n_unsat     integer := 0;
  n_missing   integer := 0;
  n_conflict  integer := 0;
  ts          timestamptz := now();
BEGIN
  SELECT * INTO imp FROM phaseforge.sc_imports WHERE id = p_import FOR UPDATE;
  IF imp.id IS NULL THEN RAISE EXCEPTION 'import not found'; END IF;
  IF imp.status <> 'draft' THEN RAISE EXCEPTION 'import is already %', imp.status; END IF;
  IF imp.plan IS NULL THEN RAISE EXCEPTION 'preview the import before committing'; END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(imp.plan->'rows', '[]'::jsonb)) LOOP
    kind := r->>'kind';
    cols := (r->'cols') || jsonb_build_object(
      'id', gen_random_uuid(), 'company_id', imp.company_id,
      'first_import_id', p_import, 'first_seen_at', ts, 'last_import_id', p_import, 'last_seen_at', ts,
      'observation_state', 'observed', 'reopen_count', 0, 'unsat_count', 0, 'conflicts', '[]'::jsonb, 'created_at', ts, 'updated_at', ts);

    INSERT INTO phaseforge.sc_work_orders
      SELECT * FROM jsonb_populate_record(NULL::phaseforge.sc_work_orders, cols)
    ON CONFLICT (company_id, tracking_number) DO UPDATE SET
      wo_number = EXCLUDED.wo_number, po_number = EXCLUDED.po_number,
      -- a customer a person set stays; an import only fills a blank, and a disagreement is recorded, not applied
      customer_name = coalesce(phaseforge.sc_work_orders.customer_name, EXCLUDED.customer_name),
      customer_source = CASE WHEN phaseforge.sc_work_orders.customer_name IS NULL AND EXCLUDED.customer_name IS NOT NULL THEN EXCLUDED.customer_source ELSE phaseforge.sc_work_orders.customer_source END,
      conflicts = CASE
        WHEN EXCLUDED.customer_name IS NOT NULL AND phaseforge.sc_work_orders.customer_name IS NOT NULL
         AND lower(EXCLUDED.customer_name) <> lower(phaseforge.sc_work_orders.customer_name)
         AND coalesce(EXCLUDED.customer_source, '') = 'import'
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(phaseforge.sc_work_orders.conflicts) c WHERE c->>'field' = 'customer_name' AND c->>'imported' = EXCLUDED.customer_name AND (c->>'resolved') IS NULL)
        THEN phaseforge.sc_work_orders.conflicts || jsonb_build_object('field', 'customer_name', 'imported', EXCLUDED.customer_name, 'kept', phaseforge.sc_work_orders.customer_name, 'keptSource', phaseforge.sc_work_orders.customer_source, 'importId', p_import, 'at', ts)
        ELSE phaseforge.sc_work_orders.conflicts END,
      store_label = EXCLUDED.store_label, store_number = EXCLUDED.store_number, store_city = EXCLUDED.store_city, store_state = EXCLUDED.store_state,
      region = EXCLUDED.region, district = EXCLUDED.district, trade = EXCLUDED.trade, category = EXCLUDED.category, priority = EXCLUDED.priority,
      area = EXCLUDED.area, equipment = EXCLUDED.equipment, problem_type = EXCLUDED.problem_type, problem_code = EXCLUDED.problem_code, tag_id = EXCLUDED.tag_id,
      problem_description = EXCLUDED.problem_description, submitted_by = EXCLUDED.submitted_by,
      call_date = EXCLUDED.call_date, scheduled_date = EXCLUDED.scheduled_date, original_eta = EXCLUDED.original_eta,
      reassign_date = EXCLUDED.reassign_date, reassign_time = EXCLUDED.reassign_time,
      status = EXCLUDED.status, status_ext = EXCLUDED.status_ext, resolution = EXCLUDED.resolution, nte = EXCLUDED.nte, currency = EXCLUDED.currency,
      assignee = EXCLUDED.assignee, date_assigned = EXCLUDED.date_assigned, technicians = EXCLUDED.technicians, timezone = EXCLUDED.timezone,
      notes_raw = EXCLUDED.notes_raw,
      customer_id = coalesce(phaseforge.sc_work_orders.customer_id, EXCLUDED.customer_id),
      location_id = coalesce(phaseforge.sc_work_orders.location_id, EXCLUDED.location_id),
      last_import_id = p_import, last_seen_at = ts, observation_state = 'observed', updated_at = ts,
      reopen_count = phaseforge.sc_work_orders.reopen_count + CASE WHEN coalesce((r->>'reopened')::boolean, false) THEN 1 ELSE 0 END,
      unsat_count = phaseforge.sc_work_orders.unsat_count + CASE WHEN coalesce((r->>'newUnsat')::boolean, false) THEN 1 ELSE 0 END,
      last_reopened_at = CASE WHEN coalesce((r->>'reopened')::boolean, false) THEN ts ELSE phaseforge.sc_work_orders.last_reopened_at END,
      last_unsat_at = CASE WHEN coalesce((r->>'newUnsat')::boolean, false) THEN ts ELSE phaseforge.sc_work_orders.last_unsat_at END
    RETURNING id, (xmax = 0) INTO wo_id, was_new;

    INSERT INTO phaseforge.sc_observations (company_id, work_order_id, import_id, observed_at, kind, status, status_ext, scheduled_date, original_eta, technicians, assignee, nte, changes, flags, raw)
    VALUES (imp.company_id, wo_id, p_import, ts, kind,
      cols->>'status', cols->>'status_ext', (cols->>'scheduled_date')::date, (cols->>'original_eta')::date,
      coalesce((SELECT array_agg(x) FROM jsonb_array_elements_text(coalesce(cols->'technicians', '[]'::jsonb)) x), '{}'),
      cols->>'assignee', (cols->>'nte')::numeric, coalesce(r->'changes', '[]'::jsonb),
      coalesce((SELECT array_agg(x) FROM jsonb_array_elements_text(coalesce(r->'flags', '[]'::jsonb)) x), '{}'),
      coalesce(r->'raw', '{}'::jsonb));

    INSERT INTO phaseforge.sc_cases (company_id, work_order_id) VALUES (imp.company_id, wo_id) ON CONFLICT (work_order_id) DO NOTHING;

    IF kind = 'new' THEN
      n_new := n_new + 1;
      INSERT INTO phaseforge.sc_events (company_id, work_order_id, import_id, kind, actor_id, actor_name, body, detail)
      VALUES (imp.company_id, wo_id, p_import, 'imported', p_actor, p_actor_name, 'First seen in ' || coalesce(imp.source_name, 'an import'), jsonb_build_object('status', cols->>'status', 'statusExt', cols->>'status_ext'));
    ELSIF kind = 'changed' THEN
      n_changed := n_changed + 1;
      INSERT INTO phaseforge.sc_events (company_id, work_order_id, import_id, kind, actor_id, actor_name, body, detail)
      VALUES (imp.company_id, wo_id, p_import, 'import_change', p_actor, p_actor_name, coalesce(r->>'summary', 'Changed in ServiceChannel'), jsonb_build_object('changes', coalesce(r->'changes', '[]'::jsonb), 'flags', coalesce(r->'flags', '[]'::jsonb)));
    ELSE
      n_unchanged := n_unchanged + 1;
    END IF;
    IF coalesce((r->>'reopened')::boolean, false) THEN n_reopened := n_reopened + 1; END IF;
    IF coalesce((r->>'newUnsat')::boolean, false) THEN n_unsat := n_unsat + 1; END IF;
  END LOOP;

  FOR m IN SELECT * FROM jsonb_array_elements(coalesce(imp.plan->'missing', '[]'::jsonb)) LOOP
    UPDATE phaseforge.sc_work_orders
       SET observation_state = m->>'state', updated_at = ts
     WHERE company_id = imp.company_id AND tracking_number = m->>'trackingNumber'
       AND observation_state IN ('observed', 'not_in_latest', 'outside_window')
       AND observation_state <> (m->>'state')
    RETURNING id INTO wo_id;
    IF wo_id IS NOT NULL THEN
      n_missing := n_missing + 1;
      INSERT INTO phaseforge.sc_events (company_id, work_order_id, import_id, kind, actor_id, actor_name, body, detail)
      VALUES (imp.company_id, wo_id, p_import, 'not_observed', p_actor, p_actor_name, coalesce(m->>'reason', 'Not present in the latest comparable export'), jsonb_build_object('state', m->>'state'));
    END IF;
    wo_id := NULL;
  END LOOP;

  SELECT count(*) INTO n_conflict FROM phaseforge.sc_work_orders w, jsonb_array_elements(w.conflicts) c
   WHERE w.company_id = imp.company_id AND c->>'importId' = p_import::text;

  UPDATE phaseforge.sc_imports
     SET status = 'committed', committed_by = p_actor, committed_at = ts, rows = NULL, plan = NULL,
         stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object(
           'new', n_new, 'changed', n_changed, 'unchanged', n_unchanged, 'reopened', n_reopened, 'newUnsat', n_unsat, 'missing', n_missing, 'conflicts', n_conflict)
   WHERE id = p_import;

  INSERT INTO phaseforge.sc_settings (company_id, last_import_id, updated_at) VALUES (imp.company_id, p_import, ts)
  ON CONFLICT (company_id) DO UPDATE SET last_import_id = p_import, updated_at = ts;

  RETURN jsonb_build_object('new', n_new, 'changed', n_changed, 'unchanged', n_unchanged, 'reopened', n_reopened, 'newUnsat', n_unsat, 'missing', n_missing, 'conflicts', n_conflict);
END $$;
