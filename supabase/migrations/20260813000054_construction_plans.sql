SET search_path TO phaseforge, extensions;

-- ============================================================================
-- Construction Plans / Drawings system (ADDITIVE)
--
-- Model: Project → plan_sets → plan_sheets → plan_revisions.
--   The SHEET is the persistent drawing identity ("A1.01 First Floor Plan").
--   The REVISION is a version of that sheet; exactly one is CURRENT.
-- Files live in the private `project-attachments` bucket under
--   plans/<project_id>/<sheet_id>/<revision_id>/(sheet.pdf|thumb.webp)
-- and are uploaded directly from the browser (user JWT + storage RLS), so
-- large plan sets never pass through a server action.
-- ============================================================================

-- ─── plan_sets (drawing packages: Permit, Bid, Construction, As-Built…) ─────
CREATE TABLE IF NOT EXISTS phaseforge.plan_sets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES phaseforge.projects(id) ON DELETE CASCADE,
  name        text NOT NULL,
  set_type    text NOT NULL DEFAULT 'construction',  -- permit|bid|construction|as_built|addendum|shop|other
  issue_date  date,
  created_by  uuid REFERENCES phaseforge.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plan_sets_project ON phaseforge.plan_sets(project_id);
CREATE INDEX IF NOT EXISTS idx_plan_sets_company ON phaseforge.plan_sets(company_id);

-- ─── plan_sheets (persistent drawing identity) ──────────────────────────────
CREATE TABLE IF NOT EXISTS phaseforge.plan_sheets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES phaseforge.projects(id) ON DELETE CASCADE,
  set_id        uuid REFERENCES phaseforge.plan_sets(id) ON DELETE SET NULL,
  sheet_number  text NOT NULL,                     -- "A1.01"
  title         text NOT NULL DEFAULT '',          -- "FIRST FLOOR PLAN"
  discipline    text NOT NULL DEFAULT 'Other',     -- free text; UI seeds standard list
  drawing_type  text,                              -- plan|elevation|section|detail|schedule|notes|cover|other
  building      text,
  floor         text,
  area          text,
  tags          text[] NOT NULL DEFAULT '{}',
  sort_order    integer NOT NULL DEFAULT 0,
  is_archived   boolean NOT NULL DEFAULT false,
  current_revision_id uuid,                        -- FK added below (circular)
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, sheet_number)
);
CREATE INDEX IF NOT EXISTS idx_plan_sheets_project    ON phaseforge.plan_sheets(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_plan_sheets_company    ON phaseforge.plan_sheets(company_id);
CREATE INDEX IF NOT EXISTS idx_plan_sheets_discipline ON phaseforge.plan_sheets(project_id, discipline);

-- ─── plan_revisions (versions of a sheet; one CURRENT each) ─────────────────
CREATE TABLE IF NOT EXISTS phaseforge.plan_revisions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  sheet_id       uuid NOT NULL REFERENCES phaseforge.plan_sheets(id) ON DELETE CASCADE,
  revision_label text NOT NULL DEFAULT '0',        -- "0","1","2","A"…
  revision_date  date,
  status         text NOT NULL DEFAULT 'current',  -- current | superseded
  pdf_path       text NOT NULL,                    -- storage path of the single-sheet vector PDF
  thumb_path     text,                             -- storage path of the webp thumbnail
  page_width     real,                             -- PDF points, for aspect + measurement
  page_height    real,
  file_size      bigint,
  extracted_text text,                             -- title-block + page text for search
  source_file_name   text,                         -- original uploaded filename
  source_page_number integer,                      -- page within the original file
  scale_calibration  jsonb,                        -- { pointsPerUnit, unit } once calibrated
  uploaded_by    uuid REFERENCES phaseforge.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plan_revisions_sheet   ON phaseforge.plan_revisions(sheet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plan_revisions_company ON phaseforge.plan_revisions(company_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'plan_sheets_current_revision_fk'
  ) THEN
    ALTER TABLE phaseforge.plan_sheets
      ADD CONSTRAINT plan_sheets_current_revision_fk
      FOREIGN KEY (current_revision_id) REFERENCES phaseforge.plan_revisions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── plan_markups (vector annotation layer; never mutates the PDF) ──────────
CREATE TABLE IF NOT EXISTS phaseforge.plan_markups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL REFERENCES phaseforge.plan_revisions(id) ON DELETE CASCADE,
  scope       text NOT NULL DEFAULT 'personal',    -- personal | project
  user_id     uuid NOT NULL REFERENCES phaseforge.profiles(id) ON DELETE CASCADE,
  elements    jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{id,type,points,color,text,…}] normalized 0..1 coords
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (revision_id, scope, user_id)
);
CREATE INDEX IF NOT EXISTS idx_plan_markups_revision ON phaseforge.plan_markups(revision_id);

-- ─── plan_pins (located comments; future link points for tasks/RFIs/punch) ──
CREATE TABLE IF NOT EXISTS phaseforge.plan_pins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  sheet_id    uuid NOT NULL REFERENCES phaseforge.plan_sheets(id) ON DELETE CASCADE,
  revision_id uuid REFERENCES phaseforge.plan_revisions(id) ON DELETE SET NULL,
  x           real NOT NULL,                       -- normalized 0..1 on the sheet
  y           real NOT NULL,
  note        text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'open',        -- open | resolved
  assigned_to uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  due_date    date,
  -- Future module connections (inert): 'task'|'rfi'|'punch_item'|'issue'|'change_order'
  linked_type text,
  linked_id   uuid,
  created_by  uuid REFERENCES phaseforge.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES phaseforge.profiles(id),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_plan_pins_sheet ON phaseforge.plan_pins(sheet_id, status);

CREATE TABLE IF NOT EXISTS phaseforge.plan_pin_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  pin_id      uuid NOT NULL REFERENCES phaseforge.plan_pins(id) ON DELETE CASCADE,
  author_id   uuid REFERENCES phaseforge.profiles(id),
  body        text NOT NULL,
  photo_path  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plan_pin_comments_pin ON phaseforge.plan_pin_comments(pin_id, created_at);

-- ─── plan_favorites / plan_views (per-user) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS phaseforge.plan_favorites (
  user_id    uuid NOT NULL REFERENCES phaseforge.profiles(id) ON DELETE CASCADE,
  sheet_id   uuid NOT NULL REFERENCES phaseforge.plan_sheets(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, sheet_id)
);

CREATE TABLE IF NOT EXISTS phaseforge.plan_views (
  user_id        uuid NOT NULL REFERENCES phaseforge.profiles(id) ON DELETE CASCADE,
  sheet_id       uuid NOT NULL REFERENCES phaseforge.plan_sheets(id) ON DELETE CASCADE,
  company_id     uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  view_state     jsonb,                            -- { zoom, cx, cy, rotation } return-to-position
  PRIMARY KEY (user_id, sheet_id)
);
CREATE INDEX IF NOT EXISTS idx_plan_views_recent ON phaseforge.plan_views(user_id, last_viewed_at DESC);

-- Per-user last visit to a project's Plans module → "what's new since I looked"
CREATE TABLE IF NOT EXISTS phaseforge.plan_module_visits (
  user_id       uuid NOT NULL REFERENCES phaseforge.profiles(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES phaseforge.projects(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  last_visit_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

-- ─── plan_activity (meaningful events only) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS phaseforge.plan_activity (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES phaseforge.projects(id) ON DELETE CASCADE,
  actor_id   uuid REFERENCES phaseforge.profiles(id),
  action     text NOT NULL,      -- uploaded|revised|superseded|archived|downloaded|deleted|restored
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plan_activity_project ON phaseforge.plan_activity(project_id, created_at DESC);

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE phaseforge.plan_sets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE phaseforge.plan_sheets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE phaseforge.plan_revisions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE phaseforge.plan_markups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE phaseforge.plan_pins          ENABLE ROW LEVEL SECURITY;
ALTER TABLE phaseforge.plan_pin_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE phaseforge.plan_favorites     ENABLE ROW LEVEL SECURITY;
ALTER TABLE phaseforge.plan_views         ENABLE ROW LEVEL SECURITY;
ALTER TABLE phaseforge.plan_module_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE phaseforge.plan_activity      ENABLE ROW LEVEL SECURITY;

-- View: every company member. Upload/manage: owner|admin|manager (matches the
-- role gate the app already uses for project file uploads).
CREATE POLICY "plan_sets_select" ON phaseforge.plan_sets FOR SELECT
  USING (company_id = phaseforge.get_my_company_id());
CREATE POLICY "plan_sets_write" ON phaseforge.plan_sets FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id()
    AND phaseforge.get_my_role() IN ('owner','admin','manager'));
CREATE POLICY "plan_sets_update" ON phaseforge.plan_sets FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id()
    AND phaseforge.get_my_role() IN ('owner','admin','manager'));
CREATE POLICY "plan_sets_delete" ON phaseforge.plan_sets FOR DELETE
  USING (company_id = phaseforge.get_my_company_id()
    AND phaseforge.get_my_role() IN ('owner','admin'));

CREATE POLICY "plan_sheets_select" ON phaseforge.plan_sheets FOR SELECT
  USING (company_id = phaseforge.get_my_company_id());
CREATE POLICY "plan_sheets_write" ON phaseforge.plan_sheets FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id()
    AND phaseforge.get_my_role() IN ('owner','admin','manager'));
CREATE POLICY "plan_sheets_update" ON phaseforge.plan_sheets FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id()
    AND phaseforge.get_my_role() IN ('owner','admin','manager'));
CREATE POLICY "plan_sheets_delete" ON phaseforge.plan_sheets FOR DELETE
  USING (company_id = phaseforge.get_my_company_id()
    AND phaseforge.get_my_role() IN ('owner','admin'));

CREATE POLICY "plan_revisions_select" ON phaseforge.plan_revisions FOR SELECT
  USING (company_id = phaseforge.get_my_company_id());
CREATE POLICY "plan_revisions_write" ON phaseforge.plan_revisions FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id()
    AND phaseforge.get_my_role() IN ('owner','admin','manager'));
CREATE POLICY "plan_revisions_update" ON phaseforge.plan_revisions FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id()
    AND phaseforge.get_my_role() IN ('owner','admin','manager'));
CREATE POLICY "plan_revisions_delete" ON phaseforge.plan_revisions FOR DELETE
  USING (company_id = phaseforge.get_my_company_id()
    AND phaseforge.get_my_role() IN ('owner','admin'));

-- Markups: personal layer is the author's; project layer readable by all,
-- writable by managers (project markups are official communications).
CREATE POLICY "plan_markups_select" ON phaseforge.plan_markups FOR SELECT
  USING (company_id = phaseforge.get_my_company_id()
    AND (scope = 'project' OR user_id = auth.uid()));
CREATE POLICY "plan_markups_insert" ON phaseforge.plan_markups FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND user_id = auth.uid()
    AND (scope = 'personal' OR phaseforge.get_my_role() IN ('owner','admin','manager')));
CREATE POLICY "plan_markups_update" ON phaseforge.plan_markups FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id()
    AND (user_id = auth.uid()
         OR (scope = 'project' AND phaseforge.get_my_role() IN ('owner','admin','manager'))));
CREATE POLICY "plan_markups_delete" ON phaseforge.plan_markups FOR DELETE
  USING (company_id = phaseforge.get_my_company_id()
    AND (user_id = auth.uid()
         OR (scope = 'project' AND phaseforge.get_my_role() IN ('owner','admin','manager'))));

-- Pins + comments: any member creates; author or managers modify.
CREATE POLICY "plan_pins_select" ON phaseforge.plan_pins FOR SELECT
  USING (company_id = phaseforge.get_my_company_id());
CREATE POLICY "plan_pins_insert" ON phaseforge.plan_pins FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND created_by = auth.uid());
CREATE POLICY "plan_pins_update" ON phaseforge.plan_pins FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id()
    AND (created_by = auth.uid() OR assigned_to = auth.uid()
         OR phaseforge.get_my_role() IN ('owner','admin','manager')));
CREATE POLICY "plan_pins_delete" ON phaseforge.plan_pins FOR DELETE
  USING (company_id = phaseforge.get_my_company_id()
    AND (created_by = auth.uid() OR phaseforge.get_my_role() IN ('owner','admin')));

CREATE POLICY "plan_pin_comments_select" ON phaseforge.plan_pin_comments FOR SELECT
  USING (company_id = phaseforge.get_my_company_id());
CREATE POLICY "plan_pin_comments_insert" ON phaseforge.plan_pin_comments FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND author_id = auth.uid());
CREATE POLICY "plan_pin_comments_delete" ON phaseforge.plan_pin_comments FOR DELETE
  USING (company_id = phaseforge.get_my_company_id()
    AND (author_id = auth.uid() OR phaseforge.get_my_role() IN ('owner','admin')));

-- Personal rows: strictly the owner's.
CREATE POLICY "plan_favorites_all" ON phaseforge.plan_favorites FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND company_id = phaseforge.get_my_company_id());
CREATE POLICY "plan_views_all" ON phaseforge.plan_views FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND company_id = phaseforge.get_my_company_id());
CREATE POLICY "plan_module_visits_all" ON phaseforge.plan_module_visits FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND company_id = phaseforge.get_my_company_id());

CREATE POLICY "plan_activity_select" ON phaseforge.plan_activity FOR SELECT
  USING (company_id = phaseforge.get_my_company_id());
CREATE POLICY "plan_activity_insert" ON phaseforge.plan_activity FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND actor_id = auth.uid());

-- ─── Storage policies: plans/<project_id>/… in project-attachments ──────────
-- Browser uploads run as the signed-in user (large files must not pass through
-- server actions), so authenticated members need INSERT/SELECT on the plans/
-- prefix for their own company's projects. Deletes stay server-side (admin).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                 AND policyname='plans read') THEN
    CREATE POLICY "plans read" ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'project-attachments'
        AND (storage.foldername(name))[1] = 'plans'
        AND (storage.foldername(name))[2] IN (
          SELECT id::text FROM phaseforge.projects WHERE company_id = phaseforge.get_my_company_id()
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                 AND policyname='plans insert') THEN
    CREATE POLICY "plans insert" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'project-attachments'
        AND (storage.foldername(name))[1] = 'plans'
        AND (storage.foldername(name))[2] IN (
          SELECT id::text FROM phaseforge.projects WHERE company_id = phaseforge.get_my_company_id()
        )
      );
  END IF;
END $$;
