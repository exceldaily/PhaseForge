SET search_path TO phaseforge, extensions;

-- Dispatch Module — organization-gated service dispatch / ticket tracking
-- dispatch_enabled on companies is false by default; set per-org to unlock

ALTER TABLE phaseforge.companies ADD COLUMN IF NOT EXISTS dispatch_enabled boolean NOT NULL DEFAULT false;

-- ─── Helper: check if current user's company has dispatch enabled ─────────────

CREATE OR REPLACE FUNCTION phaseforge.company_has_dispatch()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = phaseforge
AS $$
  SELECT COALESCE(
    (SELECT dispatch_enabled FROM phaseforge.companies WHERE id = phaseforge.get_my_company_id()),
    false
  )
$$;

ALTER FUNCTION phaseforge.company_has_dispatch() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION phaseforge.company_has_dispatch() TO authenticated, anon;

-- ─── dispatch_boards ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phaseforge.dispatch_boards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_by  uuid REFERENCES phaseforge.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_boards_company ON phaseforge.dispatch_boards(company_id);

ALTER TABLE phaseforge.dispatch_boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispatch_boards_select" ON phaseforge.dispatch_boards FOR SELECT
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch());

CREATE POLICY "dispatch_boards_insert" ON phaseforge.dispatch_boards FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch()
    AND phaseforge.get_my_role() IN ('owner','admin','manager'));

CREATE POLICY "dispatch_boards_update" ON phaseforge.dispatch_boards FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch()
    AND phaseforge.get_my_role() IN ('owner','admin','manager'));

CREATE POLICY "dispatch_boards_delete" ON phaseforge.dispatch_boards FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch()
    AND phaseforge.get_my_role() IN ('owner','admin'));

-- ─── dispatch_columns ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phaseforge.dispatch_columns (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id   uuid NOT NULL REFERENCES phaseforge.dispatch_boards(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  name       text NOT NULL,
  color      text NOT NULL DEFAULT '#94a3b8',
  sort_order integer NOT NULL DEFAULT 0,
  is_done    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_columns_board    ON phaseforge.dispatch_columns(board_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_columns_company  ON phaseforge.dispatch_columns(company_id);

ALTER TABLE phaseforge.dispatch_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispatch_columns_select" ON phaseforge.dispatch_columns FOR SELECT
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch());

CREATE POLICY "dispatch_columns_insert" ON phaseforge.dispatch_columns FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch()
    AND phaseforge.get_my_role() IN ('owner','admin','manager'));

CREATE POLICY "dispatch_columns_update" ON phaseforge.dispatch_columns FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch()
    AND phaseforge.get_my_role() IN ('owner','admin','manager'));

CREATE POLICY "dispatch_columns_delete" ON phaseforge.dispatch_columns FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch()
    AND phaseforge.get_my_role() IN ('owner','admin'));

-- ─── dispatch_vendors ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phaseforge.dispatch_vendors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  name       text NOT NULL,
  email      text,
  phone      text,
  notes      text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_vendors_company ON phaseforge.dispatch_vendors(company_id);

ALTER TABLE phaseforge.dispatch_vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispatch_vendors_select" ON phaseforge.dispatch_vendors FOR SELECT
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch());

CREATE POLICY "dispatch_vendors_insert" ON phaseforge.dispatch_vendors FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch()
    AND phaseforge.get_my_role() IN ('owner','admin','manager'));

CREATE POLICY "dispatch_vendors_update" ON phaseforge.dispatch_vendors FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch()
    AND phaseforge.get_my_role() IN ('owner','admin','manager'));

CREATE POLICY "dispatch_vendors_delete" ON phaseforge.dispatch_vendors FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch()
    AND phaseforge.get_my_role() IN ('owner','admin'));

-- ─── dispatch_cards ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phaseforge.dispatch_cards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  board_id    uuid NOT NULL REFERENCES phaseforge.dispatch_boards(id) ON DELETE CASCADE,
  column_id   uuid REFERENCES phaseforge.dispatch_columns(id) ON DELETE SET NULL,

  -- Service call fields (initial Kalos refrigeration template)
  store             text,
  urgency           text NOT NULL DEFAULT 'medium',  -- low | medium | high | critical
  date_started      date,
  sc_number         text,
  kalos_job_number  text,
  eta_scheduled     timestamptz,
  rack_circuit_case text,
  description       text,
  part_ordered      boolean NOT NULL DEFAULT false,
  who_ordered       text,
  notes             text,

  -- Assignment
  assigned_to  uuid REFERENCES phaseforge.profiles(id),
  vendor_id    uuid REFERENCES phaseforge.dispatch_vendors(id),
  vendor_email text,

  -- Gmail / email integration (prepared for future automation)
  gmail_thread_id   text UNIQUE,
  last_gmail_msg_id text,
  last_email_date   timestamptz,
  email_sender      text,
  email_subject     text,

  -- Workflow
  needs_review boolean NOT NULL DEFAULT false,
  source       text NOT NULL DEFAULT 'manual',  -- manual | email | import
  closed_at    timestamptz,

  -- Audit
  created_by uuid REFERENCES phaseforge.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_cards_board   ON phaseforge.dispatch_cards(board_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_cards_column  ON phaseforge.dispatch_cards(column_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_cards_company ON phaseforge.dispatch_cards(company_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_cards_gmail   ON phaseforge.dispatch_cards(gmail_thread_id) WHERE gmail_thread_id IS NOT NULL;

ALTER TABLE phaseforge.dispatch_cards ENABLE ROW LEVEL SECURITY;

-- All org members can view/create/update cards (dispatch is team-wide within an org)
CREATE POLICY "dispatch_cards_select" ON phaseforge.dispatch_cards FOR SELECT
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch());

CREATE POLICY "dispatch_cards_insert" ON phaseforge.dispatch_cards FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch());

CREATE POLICY "dispatch_cards_update" ON phaseforge.dispatch_cards FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch());

CREATE POLICY "dispatch_cards_delete" ON phaseforge.dispatch_cards FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch()
    AND phaseforge.get_my_role() IN ('owner','admin','manager'));

-- ─── dispatch_activity_logs ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phaseforge.dispatch_activity_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id      uuid NOT NULL REFERENCES phaseforge.dispatch_cards(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,

  actor_type   text NOT NULL DEFAULT 'user',  -- user | system | vendor | email
  actor_id     uuid REFERENCES phaseforge.profiles(id),
  actor_name   text,

  -- activity_type values: card_created | status_changed | field_changed |
  --   note_added | email_received | vendor_forwarded | eta_updated |
  --   part_ordered | card_closed | card_reopened | review_flagged | review_cleared
  activity_type text NOT NULL,
  message       text NOT NULL,

  old_value  text,
  new_value  text,
  field_name text,

  -- Email metadata for email-sourced events
  email_message_id text,
  email_sender     text,
  email_subject    text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_activity_card    ON phaseforge.dispatch_activity_logs(card_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_activity_company ON phaseforge.dispatch_activity_logs(company_id);

ALTER TABLE phaseforge.dispatch_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispatch_activity_select" ON phaseforge.dispatch_activity_logs FOR SELECT
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch());

CREATE POLICY "dispatch_activity_insert" ON phaseforge.dispatch_activity_logs FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch());

CREATE POLICY "dispatch_activity_delete" ON phaseforge.dispatch_activity_logs FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch()
    AND phaseforge.get_my_role() IN ('owner','admin'));

NOTIFY pgrst, 'reload schema';
