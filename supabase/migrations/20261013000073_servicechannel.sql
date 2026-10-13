SET search_path TO phaseforge, extensions;

-- ============================================================================
-- ServiceChannel Performance Command Center
--
-- Work orders arrive as downloaded ServiceChannel exports (CSV/XLSX). Each
-- import is previewed, then committed in ONE transaction by sc_commit_import.
-- ServiceChannel stays the system of record for official status and scores:
--   * sc_work_orders holds the last observed official values, never guesses
--   * sc_observations keeps every observation with the raw row, so any value
--     can be traced to the file it came from
--   * sc_cases / sc_tasks / sc_events are PhaseForge's own follow-up, and an
--     import never overwrites them
--   * sc_metric_entries holds official scores typed in with their date, view,
--     filters and period; nothing here computes a score from work orders
--
-- A work order missing from a later export is never completed or deleted;
-- its observation_state says why it is missing.
--
-- Access: the organization owner only (SELECT). The server writes with the
-- service role after checking the caller.
-- ============================================================================

CREATE OR REPLACE FUNCTION phaseforge.sc_is_owner() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'phaseforge' AS $$
  SELECT EXISTS (
    SELECT 1 FROM phaseforge.profiles p
    WHERE p.id = auth.uid() AND (p.role = 'owner' OR p.ops_role = 'owner')
  )
$$;

-- ─── Imports ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phaseforge.sc_import_mappings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (length(btrim(name)) > 0),
  -- sorted, lowercased header list; the same export layout matches again
  signature     text NOT NULL,
  mapping       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by    uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS phaseforge.sc_imports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  kind          text NOT NULL DEFAULT 'work_orders' CHECK (kind IN ('work_orders', 'cleanup_workbook', 'scores')),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'committed', 'failed', 'discarded')),
  source_name   text,
  file_hash     text,
  headers       text[] NOT NULL DEFAULT '{}',
  mapping       jsonb NOT NULL DEFAULT '{}'::jsonb,
  mapping_id    uuid REFERENCES phaseforge.sc_import_mappings(id) ON DELETE SET NULL,
  -- What the person filtered the export to: { statuses, subscribers, callDateFrom, callDateTo, note }
  coverage      jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count     integer NOT NULL DEFAULT 0,
  -- Draft only: the normalized rows and the previewed plan. Cleared on commit;
  -- the raw rows live on in sc_observations.
  rows          jsonb,
  plan          jsonb,
  stats         jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings      jsonb NOT NULL DEFAULT '[]'::jsonb,
  error         text,
  created_by    uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  committed_by  uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  committed_at  timestamptz
);
CREATE INDEX IF NOT EXISTS sc_imports_company_idx ON phaseforge.sc_imports (company_id, created_at DESC);

-- ─── Work orders (official, as last observed) ────────────────────────────────

CREATE TABLE IF NOT EXISTS phaseforge.sc_work_orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  tracking_number     text NOT NULL CHECK (length(btrim(tracking_number)) > 0),
  wo_number           text,
  po_number           text,
  customer_name       text,
  store_label         text,
  store_number        text,
  store_city          text,
  store_state         text,
  region              text,
  district            text,
  trade               text,
  category            text,
  priority            text,
  area                text,
  equipment           text,
  problem_type        text,
  problem_code        text,
  tag_id              text,
  problem_description text,
  submitted_by        text,
  call_date           date,
  scheduled_date      date,
  original_eta        date,
  reassign_date       date,
  reassign_time       text,
  status              text,
  status_ext          text,
  resolution          text,
  nte                 numeric(12, 2),
  currency            text,
  assignee            text,
  date_assigned       date,
  technicians         text[] NOT NULL DEFAULT '{}',
  timezone            text,
  notes_raw           text,
  -- PhaseForge's own links. Set by people or by matching, never by an import row.
  kalos_job_number    text,
  customer_id         uuid REFERENCES phaseforge.customers(id) ON DELETE SET NULL,
  location_id         uuid REFERENCES phaseforge.locations(id) ON DELETE SET NULL,
  call_id             uuid REFERENCES phaseforge.calls(id) ON DELETE SET NULL,
  -- Observation bookkeeping
  first_import_id     uuid REFERENCES phaseforge.sc_imports(id) ON DELETE SET NULL,
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_import_id      uuid REFERENCES phaseforge.sc_imports(id) ON DELETE SET NULL,
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  observation_state   text NOT NULL DEFAULT 'observed' CHECK (observation_state IN (
                        'observed', 'not_in_latest', 'outside_window', 'needs_verification', 'manually_verified')),
  verified_at         timestamptz,
  verified_by         uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  verified_note       text,
  reopen_count        integer NOT NULL DEFAULT 0,
  unsat_count         integer NOT NULL DEFAULT 0,
  last_reopened_at    timestamptz,
  last_unsat_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, tracking_number)
);
CREATE INDEX IF NOT EXISTS sc_work_orders_list_idx ON phaseforge.sc_work_orders (company_id, status, status_ext);
CREATE INDEX IF NOT EXISTS sc_work_orders_store_idx ON phaseforge.sc_work_orders (company_id, store_number);
CREATE INDEX IF NOT EXISTS sc_work_orders_call_date_idx ON phaseforge.sc_work_orders (company_id, call_date DESC);

CREATE TABLE IF NOT EXISTS phaseforge.sc_observations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  work_order_id   uuid NOT NULL REFERENCES phaseforge.sc_work_orders(id) ON DELETE CASCADE,
  import_id       uuid REFERENCES phaseforge.sc_imports(id) ON DELETE SET NULL,
  observed_at     timestamptz NOT NULL DEFAULT now(),
  kind            text NOT NULL CHECK (kind IN ('new', 'changed', 'unchanged')),
  status          text,
  status_ext      text,
  scheduled_date  date,
  original_eta    date,
  technicians     text[] NOT NULL DEFAULT '{}',
  assignee        text,
  nte             numeric(12, 2),
  changes         jsonb NOT NULL DEFAULT '[]'::jsonb,
  flags           text[] NOT NULL DEFAULT '{}',
  raw             jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS sc_observations_wo_idx ON phaseforge.sc_observations (work_order_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS sc_observations_import_idx ON phaseforge.sc_observations (import_id);

-- ─── PhaseForge's own follow-up ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phaseforge.sc_cases (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  work_order_id         uuid NOT NULL UNIQUE REFERENCES phaseforge.sc_work_orders(id) ON DELETE CASCADE,
  internal_status       text NOT NULL DEFAULT 'new' CHECK (internal_status IN (
                          'new', 'needs_verification', 'assigned', 'accepted', 'in_progress', 'waiting_customer',
                          'waiting_parts', 'waiting_approval', 'blocked', 'pending_verification', 'verified_resolved')),
  owner_profile_id      uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  owner_name            text,
  department            text,
  next_action           text,
  due_date              date,
  blocker_reason        text,
  priority_override     integer,
  priority_reason       text,
  handoff_accepted_at   timestamptz,
  verified_resolved_at  timestamptz,
  verified_by           uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  last_update_at        timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sc_cases_owner_idx ON phaseforge.sc_cases (company_id, owner_profile_id, internal_status);
CREATE INDEX IF NOT EXISTS sc_cases_due_idx ON phaseforge.sc_cases (company_id, due_date);

CREATE TABLE IF NOT EXISTS phaseforge.sc_tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  work_order_id     uuid NOT NULL REFERENCES phaseforge.sc_work_orders(id) ON DELETE CASCADE,
  title             text NOT NULL CHECK (length(btrim(title)) > 0),
  queue             text NOT NULL DEFAULT 'general' CHECK (queue IN (
                      'critical', 'recovery', 'quotes', 'parts', 'maintenance', 'billing', 'verification', 'general')),
  status            text NOT NULL DEFAULT 'new' CHECK (status IN (
                      'new', 'needs_verification', 'assigned', 'accepted', 'in_progress', 'waiting_customer',
                      'waiting_parts', 'waiting_approval', 'blocked', 'pending_verification', 'verified_resolved')),
  owner_profile_id  uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  owner_name        text,
  next_action       text,
  due_date          date,
  blocker_reason    text,
  -- 'manual', or 'rule' with rule_key so an automatic task is created once
  source            text NOT NULL DEFAULT 'manual',
  rule_key          text,
  accepted_at       timestamptz,
  completed_at      timestamptz,
  verified_at       timestamptz,
  verified_by       uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_by        uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sc_tasks_wo_idx ON phaseforge.sc_tasks (work_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sc_tasks_open_idx ON phaseforge.sc_tasks (company_id, status, due_date);
CREATE UNIQUE INDEX IF NOT EXISTS sc_tasks_rule_key ON phaseforge.sc_tasks (work_order_id, rule_key) WHERE rule_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS phaseforge.sc_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  work_order_id   uuid NOT NULL REFERENCES phaseforge.sc_work_orders(id) ON DELETE CASCADE,
  import_id       uuid REFERENCES phaseforge.sc_imports(id) ON DELETE SET NULL,
  kind            text NOT NULL,
  actor_id        uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  actor_name      text,
  body            text,
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sc_events_wo_idx ON phaseforge.sc_events (work_order_id, created_at DESC);

-- ─── Official scores and measures, typed in with their provenance ────────────

CREATE TABLE IF NOT EXISTS phaseforge.sc_metric_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  measure         text NOT NULL,
  value           numeric(10, 2),
  previous_value  numeric(10, 2),
  unit            text,
  snapshot_date   date NOT NULL,
  period_label    text,
  scorecard_view  text,
  filters         text,
  eligible_count  integer,
  source          text,
  is_sample       boolean NOT NULL DEFAULT false,
  note            text,
  created_by      uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sc_metric_entries_idx ON phaseforge.sc_metric_entries (company_id, measure, snapshot_date DESC);

CREATE TABLE IF NOT EXISTS phaseforge.sc_settings (
  company_id      uuid PRIMARY KEY REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  target_overall  numeric(5, 2) NOT NULL DEFAULT 80,
  target_date     date NOT NULL DEFAULT '2027-10-13',
  last_import_id  uuid REFERENCES phaseforge.sc_imports(id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── Commit an import in one transaction ─────────────────────────────────────
--
-- The server previews first (plan = rows to upsert with their changes, plus the
-- work orders missing from this export and why). This applies that plan. If
-- anything fails, nothing is written and the import stays a draft.

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
      'observation_state', 'observed', 'reopen_count', 0, 'unsat_count', 0, 'created_at', ts, 'updated_at', ts);

    INSERT INTO phaseforge.sc_work_orders
      SELECT * FROM jsonb_populate_record(NULL::phaseforge.sc_work_orders, cols)
    ON CONFLICT (company_id, tracking_number) DO UPDATE SET
      wo_number = EXCLUDED.wo_number, po_number = EXCLUDED.po_number,
      customer_name = coalesce(EXCLUDED.customer_name, phaseforge.sc_work_orders.customer_name),
      store_label = EXCLUDED.store_label, store_number = EXCLUDED.store_number, store_city = EXCLUDED.store_city, store_state = EXCLUDED.store_state,
      region = EXCLUDED.region, district = EXCLUDED.district, trade = EXCLUDED.trade, category = EXCLUDED.category, priority = EXCLUDED.priority,
      area = EXCLUDED.area, equipment = EXCLUDED.equipment, problem_type = EXCLUDED.problem_type, problem_code = EXCLUDED.problem_code, tag_id = EXCLUDED.tag_id,
      problem_description = EXCLUDED.problem_description, submitted_by = EXCLUDED.submitted_by,
      call_date = EXCLUDED.call_date, scheduled_date = EXCLUDED.scheduled_date, original_eta = EXCLUDED.original_eta,
      reassign_date = EXCLUDED.reassign_date, reassign_time = EXCLUDED.reassign_time,
      status = EXCLUDED.status, status_ext = EXCLUDED.status_ext, resolution = EXCLUDED.resolution, nte = EXCLUDED.nte, currency = EXCLUDED.currency,
      assignee = EXCLUDED.assignee, date_assigned = EXCLUDED.date_assigned, technicians = EXCLUDED.technicians, timezone = EXCLUDED.timezone,
      notes_raw = EXCLUDED.notes_raw,
      -- links found by matching are filled in only when empty; a person's choice stays
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

  -- Work orders this export should have shown but did not. Never completed, never deleted.
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

  UPDATE phaseforge.sc_imports
     SET status = 'committed', committed_by = p_actor, committed_at = ts, rows = NULL, plan = NULL,
         stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object(
           'new', n_new, 'changed', n_changed, 'unchanged', n_unchanged, 'reopened', n_reopened, 'newUnsat', n_unsat, 'missing', n_missing)
   WHERE id = p_import;

  INSERT INTO phaseforge.sc_settings (company_id, last_import_id, updated_at) VALUES (imp.company_id, p_import, ts)
  ON CONFLICT (company_id) DO UPDATE SET last_import_id = p_import, updated_at = ts;

  RETURN jsonb_build_object('new', n_new, 'changed', n_changed, 'unchanged', n_unchanged, 'reopened', n_reopened, 'newUnsat', n_unsat, 'missing', n_missing);
END $$;

REVOKE ALL ON FUNCTION phaseforge.sc_commit_import(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION phaseforge.sc_commit_import(uuid, uuid, text) TO service_role;

-- ─── Row level security: owner reads, the server writes ──────────────────────

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sc_import_mappings', 'sc_imports', 'sc_work_orders', 'sc_observations', 'sc_cases', 'sc_tasks', 'sc_events', 'sc_metric_entries', 'sc_settings'
  ] LOOP
    EXECUTE format('ALTER TABLE phaseforge.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON phaseforge.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON phaseforge.%I FOR SELECT USING (company_id = phaseforge.get_my_company_id() AND phaseforge.sc_is_owner())', t || '_select', t);
    EXECUTE format('GRANT SELECT ON phaseforge.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON phaseforge.%I TO service_role', t);
  END LOOP;
END $$;
