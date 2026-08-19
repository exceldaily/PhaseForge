SET search_path TO phaseforge, extensions;

-- ============================================================================
-- Change Order Control Center (ADDITIVE)
--
-- Integrates with EXISTING projects: a project opts into CO tracking via
-- projects.co_tracking_enabled (no duplicate project records, disabling later
-- preserves history). One master record per CO; revisions, customer-portal
-- submissions and an insert-only event timeline hang off it. Documents reuse
-- org_files (record_type 'change_order' | 'co_revision' | 'co_submission').
-- Stage keys are text against a code-side registry so future admins can add
-- per-company workflow config without a schema change.
-- ============================================================================

ALTER TABLE phaseforge.projects ADD COLUMN IF NOT EXISTS co_tracking_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE phaseforge.projects ADD COLUMN IF NOT EXISTS original_contract_value numeric(14,2);

-- ─── change_orders (master record) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS phaseforge.change_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES phaseforge.projects(id) ON DELETE CASCADE,
  co_number       bigint NOT NULL,                  -- per-org sequence (next_org_number 'change_order')
  co_label        text NOT NULL,                    -- "CO-26-00431" (display id)
  title           text NOT NULL,
  description     text,

  stage           text NOT NULL DEFAULT 'potential',
  stage_entered_at timestamptz NOT NULL DEFAULT now(),
  owner_id        uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,  -- INTERNAL owner (never null while open, enforced in app)
  waiting_on      text,                             -- external party (customer) when in an external stage
  next_action     text,
  due_date        date,
  follow_up_date  date,
  priority        text NOT NULL DEFAULT 'medium',   -- low|medium|high|critical

  -- Denormalized context (auto-filled from the project; overridable)
  customer_name   text,
  store_number    text,
  portal          text,                             -- e.g. ServiceChannel, Verisae

  -- Money (negative allowed: deductive/credit COs)
  requested_amount numeric(14,2),
  current_amount   numeric(14,2),
  approved_amount  numeric(14,2),
  potential_cost   numeric(14,2),

  -- Customer approval
  approved_date    date,
  approved_by_name text,
  approval_reference text,
  approval_notes   text,

  -- Latest customer submission snapshot (full history in co_submissions)
  submitted_date   timestamptz,
  submitted_by     uuid REFERENCES phaseforge.profiles(id),
  tracking_number  text,
  confirmation_number text,
  no_confirmation  boolean NOT NULL DEFAULT false,  -- "portal gave no confirmation #"
  no_confirmation_by uuid REFERENCES phaseforge.profiles(id),

  -- Billing
  billing_status  text NOT NULL DEFAULT 'not_ready',  -- not_ready|ready|submitted|billed|paid
  invoice_number  text,
  invoice_date    date,
  billed_amount   numeric(14,2),

  revision_number int NOT NULL DEFAULT 1,
  tags            text[] NOT NULL DEFAULT '{}',

  archived_at     timestamptz,                      -- soft delete for financial records
  closed_at       timestamptz,

  created_by      uuid REFERENCES phaseforge.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES phaseforge.profiles(id),

  UNIQUE (company_id, co_number),
  CONSTRAINT co_submitted_after_created CHECK (submitted_date IS NULL OR submitted_date >= created_at)
);

CREATE INDEX IF NOT EXISTS idx_co_company_stage  ON phaseforge.change_orders(company_id, stage) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_co_project        ON phaseforge.change_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_co_owner          ON phaseforge.change_orders(owner_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_co_follow_up      ON phaseforge.change_orders(company_id, follow_up_date) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_co_billing        ON phaseforge.change_orders(company_id, billing_status) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_co_company_created ON phaseforge.change_orders(company_id, created_at DESC);

ALTER TABLE phaseforge.change_orders ENABLE ROW LEVEL SECURITY;

-- Everyone in the org can view; managers+ write; the current internal owner
-- may also update their own CO (handoffs, next action, submission details).
CREATE POLICY "co_select" ON phaseforge.change_orders FOR SELECT
  USING (company_id = phaseforge.get_my_company_id());
CREATE POLICY "co_insert" ON phaseforge.change_orders FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id()
    AND phaseforge.get_my_role() IN ('owner','admin','manager'));
CREATE POLICY "co_update" ON phaseforge.change_orders FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id()
    AND (phaseforge.get_my_role() IN ('owner','admin','manager') OR owner_id = auth.uid()));
-- No DELETE policy: financially important records archive (archived_at), never hard-delete.

-- ─── co_revisions (versioned amounts on ONE master CO) ──────────────────────
CREATE TABLE IF NOT EXISTS phaseforge.co_revisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  co_id           uuid NOT NULL REFERENCES phaseforge.change_orders(id) ON DELETE CASCADE,
  revision_number int NOT NULL,
  amount          numeric(14,2),
  reason          text,
  description     text,
  customer_feedback text,
  created_by      uuid REFERENCES phaseforge.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (co_id, revision_number)
);
CREATE INDEX IF NOT EXISTS idx_co_revisions_co ON phaseforge.co_revisions(co_id, revision_number DESC);

ALTER TABLE phaseforge.co_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "co_rev_select" ON phaseforge.co_revisions FOR SELECT
  USING (company_id = phaseforge.get_my_company_id());
CREATE POLICY "co_rev_insert" ON phaseforge.co_revisions FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id()
    AND (phaseforge.get_my_role() IN ('owner','admin','manager')
         OR co_id IN (SELECT id FROM phaseforge.change_orders WHERE owner_id = auth.uid())));

-- ─── co_submissions (each push into a customer portal) ──────────────────────
CREATE TABLE IF NOT EXISTS phaseforge.co_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  co_id           uuid NOT NULL REFERENCES phaseforge.change_orders(id) ON DELETE CASCADE,
  revision_id     uuid REFERENCES phaseforge.co_revisions(id) ON DELETE SET NULL,
  portal          text,
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  submitted_by    uuid REFERENCES phaseforge.profiles(id),
  amount          numeric(14,2),
  tracking_number text,
  confirmation_number text,
  no_confirmation boolean NOT NULL DEFAULT false,
  no_confirmation_by uuid REFERENCES phaseforge.profiles(id),
  status          text NOT NULL DEFAULT 'awaiting',  -- awaiting|approved|revision_requested|rejected
  customer_contact text,
  last_checked_at timestamptz,
  last_checked_by uuid REFERENCES phaseforge.profiles(id),
  next_follow_up  date,
  notes           text
);
CREATE INDEX IF NOT EXISTS idx_co_submissions_co ON phaseforge.co_submissions(co_id, submitted_at DESC);

ALTER TABLE phaseforge.co_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "co_sub_select" ON phaseforge.co_submissions FOR SELECT
  USING (company_id = phaseforge.get_my_company_id());
CREATE POLICY "co_sub_write" ON phaseforge.co_submissions FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id()
    AND (phaseforge.get_my_role() IN ('owner','admin','manager')
         OR co_id IN (SELECT id FROM phaseforge.change_orders WHERE owner_id = auth.uid())));
CREATE POLICY "co_sub_update" ON phaseforge.co_submissions FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id()
    AND (phaseforge.get_my_role() IN ('owner','admin','manager')
         OR co_id IN (SELECT id FROM phaseforge.change_orders WHERE owner_id = auth.uid())));

-- ─── co_events (permanent, insert-only audit timeline) ──────────────────────
CREATE TABLE IF NOT EXISTS phaseforge.co_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  co_id       uuid NOT NULL REFERENCES phaseforge.change_orders(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES phaseforge.profiles(id),
  event_type  text NOT NULL,   -- created|stage_change|owner_change|amount_change|revision|submission|tracking|approval|rejection|billing|follow_up|note|archive|restore
  field       text,
  old_value   text,
  new_value   text,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_co_events_co ON phaseforge.co_events(co_id, created_at);

ALTER TABLE phaseforge.co_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "co_events_select" ON phaseforge.co_events FOR SELECT
  USING (company_id = phaseforge.get_my_company_id());
-- History cannot be rewritten: INSERT only, actor must be the caller.
CREATE POLICY "co_events_insert" ON phaseforge.co_events FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND actor_id = auth.uid());
