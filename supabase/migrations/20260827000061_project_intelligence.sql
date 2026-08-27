-- Project intelligence foundation: universal relationships, universal
-- activity timeline, and schedule baselines.
--
-- Design notes, so future changes do not fight this:
--
-- * activity_logs is the ONE timeline write path going forward. It already
--   held project edit history (action + payload of {field:{from,to}}), so it
--   is extended, not replaced. Module-specific histories that predate it
--   (co_events, plan_activity) keep their single write path and are UNIONed
--   into the read model instead of being double-written.
-- * item_links is deliberately generic (source/target type+id) so new entity
--   types cost a CHECK-constraint edit, not a new table. FK-derived
--   relations (a CO's project, a phase's project) are NOT copied in here;
--   the Related UI merges them at read time. This table is only for
--   connections the schema does not already know.
-- * Baselines snapshot phase names and dates because phases get renamed and
--   deleted; a baseline that dangled off live rows would rot.

-- ── Universal activity timeline ─────────────────────────────────────────────
ALTER TABLE phaseforge.activity_logs
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS entity_label text,
  ADD COLUMN IF NOT EXISTS reason text;

CREATE INDEX IF NOT EXISTS activity_logs_project_time_idx
  ON phaseforge.activity_logs (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_entity_idx
  ON phaseforge.activity_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_company_time_idx
  ON phaseforge.activity_logs (company_id, created_at DESC);

-- ── Universal relationships ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS phaseforge.item_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN
    ('project','phase','change_order','punch_item','plan_sheet','quote_request','quote_pricing','file','dispatch_card','call')),
  source_id uuid NOT NULL,
  target_type text NOT NULL CHECK (target_type IN
    ('project','phase','change_order','punch_item','plan_sheet','quote_request','quote_pricing','file','dispatch_card','call')),
  target_id uuid NOT NULL,
  link_type text NOT NULL DEFAULT 'related_to' CHECK (link_type IN
    ('related_to','caused_by','impacts','generated_from','blocked_by','resolves','schedule_impact','cost_impact','follow_up_to','attached_to')),
  created_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- An item cannot relate to itself.
  CHECK (NOT (source_type = target_type AND source_id = target_id))
);

-- The same pair with the same meaning exists once, regardless of direction of
-- entry: the action layer normalizes direction for symmetric types.
CREATE UNIQUE INDEX IF NOT EXISTS item_links_unique_idx
  ON phaseforge.item_links (company_id, source_type, source_id, target_type, target_id, link_type);
CREATE INDEX IF NOT EXISTS item_links_source_idx
  ON phaseforge.item_links (source_type, source_id);
CREATE INDEX IF NOT EXISTS item_links_target_idx
  ON phaseforge.item_links (target_type, target_id);

ALTER TABLE phaseforge.item_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY item_links_select ON phaseforge.item_links FOR SELECT
  USING (company_id = phaseforge.get_my_company_id());
CREATE POLICY item_links_write ON phaseforge.item_links FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id()
    AND phaseforge.get_my_role() = ANY (ARRAY['owner','admin','manager']));
CREATE POLICY item_links_delete ON phaseforge.item_links FOR DELETE
  USING (company_id = phaseforge.get_my_company_id()
    AND phaseforge.get_my_role() = ANY (ARRAY['owner','admin','manager']));

-- ── Schedule baselines ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS phaseforge.schedule_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES phaseforge.projects(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Baseline',
  project_start date,
  project_end date,
  created_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Only one ACTIVE baseline per project; superseded ones keep their history.
  is_active boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS schedule_baselines_active_idx
  ON phaseforge.schedule_baselines (project_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS schedule_baselines_project_idx
  ON phaseforge.schedule_baselines (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS phaseforge.schedule_baseline_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id uuid NOT NULL REFERENCES phaseforge.schedule_baselines(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  -- Snapshot, deliberately NOT a foreign key: the live phase may be renamed
  -- or deleted after the baseline is cut, and the baseline must not change.
  phase_id uuid NOT NULL,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_milestone boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS schedule_baseline_phases_idx
  ON phaseforge.schedule_baseline_phases (baseline_id);

ALTER TABLE phaseforge.schedule_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE phaseforge.schedule_baseline_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY baselines_select ON phaseforge.schedule_baselines FOR SELECT
  USING (company_id = phaseforge.get_my_company_id());
CREATE POLICY baselines_write ON phaseforge.schedule_baselines FOR ALL
  USING (company_id = phaseforge.get_my_company_id()
    AND phaseforge.get_my_role() = ANY (ARRAY['owner','admin','manager']))
  WITH CHECK (company_id = phaseforge.get_my_company_id()
    AND phaseforge.get_my_role() = ANY (ARRAY['owner','admin','manager']));

CREATE POLICY baseline_phases_select ON phaseforge.schedule_baseline_phases FOR SELECT
  USING (company_id = phaseforge.get_my_company_id());
CREATE POLICY baseline_phases_write ON phaseforge.schedule_baseline_phases FOR ALL
  USING (company_id = phaseforge.get_my_company_id()
    AND phaseforge.get_my_role() = ANY (ARRAY['owner','admin','manager']))
  WITH CHECK (company_id = phaseforge.get_my_company_id()
    AND phaseforge.get_my_role() = ANY (ARRAY['owner','admin','manager']));

-- ── Aggregate helpers for board / command center ────────────────────────────
-- One query returns per-project rollups so the board never runs N+1.
CREATE INDEX IF NOT EXISTS punch_items_project_status_idx
  ON phaseforge.punch_items (project_id, status);
CREATE INDEX IF NOT EXISTS change_orders_project_stage_idx
  ON phaseforge.change_orders (project_id, stage);
CREATE INDEX IF NOT EXISTS phases_project_idx
  ON phaseforge.phases (project_id, status);
CREATE INDEX IF NOT EXISTS phase_dependencies_phase_idx
  ON phaseforge.phase_dependencies (phase_id);
CREATE INDEX IF NOT EXISTS phase_dependencies_depends_idx
  ON phaseforge.phase_dependencies (depends_on_id);
