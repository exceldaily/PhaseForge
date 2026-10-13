SET search_path TO phaseforge, extensions;

-- An unchanged work order seen again in a later export no longer gets an
-- observation row: the work order's last_seen_at / last_import_id already
-- record the sighting, and the previous observation holds the identical raw
-- row. History therefore only contains first sightings and changes.

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

    -- History holds first sightings and changes only; an unchanged sighting is recorded by last_seen_at.
    IF kind <> 'unchanged' THEN
      INSERT INTO phaseforge.sc_observations (company_id, work_order_id, import_id, observed_at, kind, status, status_ext, scheduled_date, original_eta, technicians, assignee, nte, changes, flags, raw)
      VALUES (imp.company_id, wo_id, p_import, ts, kind,
        cols->>'status', cols->>'status_ext', (cols->>'scheduled_date')::date, (cols->>'original_eta')::date,
        coalesce((SELECT array_agg(x) FROM jsonb_array_elements_text(coalesce(cols->'technicians', '[]'::jsonb)) x), '{}'),
        cols->>'assignee', (cols->>'nte')::numeric, coalesce(r->'changes', '[]'::jsonb),
        coalesce((SELECT array_agg(x) FROM jsonb_array_elements_text(coalesce(r->'flags', '[]'::jsonb)) x), '{}'),
        coalesce(r->'raw', '{}'::jsonb));
    END IF;

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
