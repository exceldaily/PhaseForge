-- ============================================================
-- Migration: v2 Board Architecture
-- Branch: architecture/v2-redesign
-- Safe: ADDITIVE ONLY — no existing tables or columns dropped
-- Backup tag: v1.0-mvp-complete
-- ============================================================

-- ── 1. boards ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS boards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT NOT NULL DEFAULT '#6366f1',
  sort_order  INT NOT NULL DEFAULT 0,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. board_columns ──────────────────────────────────────────────────────────
-- Replaces the hardcoded status enum for projects.
-- Each board owns 3–10 columns; constraint enforced at app layer.
CREATE TABLE IF NOT EXISTS board_columns (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id   UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#94a3b8',
  sort_order INT NOT NULL DEFAULT 0,
  is_done    BOOLEAN NOT NULL DEFAULT false,  -- terminal / "closed" column
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. board_teams ────────────────────────────────────────────────────────────
-- Controls which teams can see a board.
-- Boards with NO rows here are visible to everyone in the org.
CREATE TABLE IF NOT EXISTS board_teams (
  board_id UUID NOT NULL REFERENCES boards(id)  ON DELETE CASCADE,
  team_id  UUID NOT NULL REFERENCES teams(id)   ON DELETE CASCADE,
  PRIMARY KEY (board_id, team_id)
);

-- ── 4. Add board columns to projects (NON-DESTRUCTIVE) ────────────────────────
-- board_id        → which board this project lives in
-- board_column_id → replaces the hardcoded status string (kept for backward compat)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS board_id        UUID REFERENCES boards(id)        ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS board_column_id UUID REFERENCES board_columns(id) ON DELETE SET NULL;

-- ── 5. Add board_column_id to phases (NON-DESTRUCTIVE) ───────────────────────
ALTER TABLE phases
  ADD COLUMN IF NOT EXISTS board_column_id UUID REFERENCES board_columns(id) ON DELETE SET NULL;

-- ── 6. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_boards_company       ON boards(company_id);
CREATE INDEX IF NOT EXISTS idx_board_columns_board  ON board_columns(board_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_board_teams_board    ON board_teams(board_id);
CREATE INDEX IF NOT EXISTS idx_board_teams_team     ON board_teams(team_id);
CREATE INDEX IF NOT EXISTS idx_projects_board       ON projects(board_id);
CREATE INDEX IF NOT EXISTS idx_projects_column      ON projects(board_column_id);
CREATE INDEX IF NOT EXISTS idx_phases_column        ON phases(board_column_id);

-- ── 7. Security Definer helpers ───────────────────────────────────────────────
-- Runs without RLS — prevents recursion in policies

CREATE OR REPLACE FUNCTION get_accessible_board_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT b.id
  FROM boards b
  WHERE b.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      -- Owners and admins see everything
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner','admin')
      -- Board has no team restrictions = visible to all org members
      OR NOT EXISTS (SELECT 1 FROM board_teams bt WHERE bt.board_id = b.id)
      -- Board is linked to one of the user's teams
      OR EXISTS (
        SELECT 1 FROM board_teams bt
        JOIN team_members tm ON tm.team_id = bt.team_id
        WHERE bt.board_id = b.id AND tm.profile_id = auth.uid()
      )
    )
$$;

-- ── 8. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE boards       ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_teams   ENABLE ROW LEVEL SECURITY;

-- boards
CREATE POLICY "boards_select" ON boards FOR SELECT
  USING (id IN (SELECT get_accessible_board_ids()));

CREATE POLICY "boards_insert" ON boards FOR INSERT
  WITH CHECK (
    company_id = get_my_company_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner','admin','manager')
  );

CREATE POLICY "boards_update" ON boards FOR UPDATE
  USING (
    company_id = get_my_company_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner','admin')
  );

CREATE POLICY "boards_delete" ON boards FOR DELETE
  USING (
    company_id = get_my_company_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner','admin')
    AND is_default = false  -- can never delete the default board
  );

-- board_columns
CREATE POLICY "board_columns_select" ON board_columns FOR SELECT
  USING (board_id IN (SELECT get_accessible_board_ids()));

CREATE POLICY "board_columns_insert" ON board_columns FOR INSERT
  WITH CHECK (
    board_id IN (SELECT get_accessible_board_ids())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner','admin','manager')
  );

CREATE POLICY "board_columns_update" ON board_columns FOR UPDATE
  USING (
    board_id IN (SELECT get_accessible_board_ids())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner','admin','manager')
  );

CREATE POLICY "board_columns_delete" ON board_columns FOR DELETE
  USING (
    board_id IN (SELECT get_accessible_board_ids())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner','admin')
  );

-- board_teams (use project_id path to avoid teams recursion)
CREATE POLICY "board_teams_select" ON board_teams FOR SELECT
  USING (board_id IN (SELECT get_accessible_board_ids()));

CREATE POLICY "board_teams_insert" ON board_teams FOR INSERT
  WITH CHECK (
    board_id IN (SELECT id FROM boards WHERE company_id = get_my_company_id())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner','admin')
  );

CREATE POLICY "board_teams_delete" ON board_teams FOR DELETE
  USING (
    board_id IN (SELECT id FROM boards WHERE company_id = get_my_company_id())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner','admin')
  );

-- ── 9. Back-fill: create default board + columns for every existing company ───
DO $$
DECLARE
  rec          RECORD;
  v_board_id   UUID;
  v_col_queue  UUID;
  v_col_mob    UUID;
  v_col_prog   UUID;
  v_col_punch  UUID;
  v_col_close  UUID;
  v_col_done   UUID;
BEGIN
  FOR rec IN SELECT id FROM companies LOOP

    -- Idempotent: skip if default board already exists
    SELECT id INTO v_board_id
    FROM boards
    WHERE company_id = rec.id AND is_default = true
    LIMIT 1;

    IF v_board_id IS NULL THEN
      INSERT INTO boards (company_id, name, description, color, sort_order, is_default)
      VALUES (
        rec.id,
        'Main Board',
        'Default project workspace',
        '#6366f1',
        0,
        true
      )
      RETURNING id INTO v_board_id;
    END IF;

    -- Idempotent: skip column creation if already done
    IF EXISTS (SELECT 1 FROM board_columns WHERE board_id = v_board_id LIMIT 1) THEN
      CONTINUE;
    END IF;

    -- Create the 6 default columns
    INSERT INTO board_columns (board_id, name, color, sort_order, is_done)
      VALUES (v_board_id, 'Queue',           '#94a3b8', 0, false)
      RETURNING id INTO v_col_queue;

    INSERT INTO board_columns (board_id, name, color, sort_order, is_done)
      VALUES (v_board_id, 'Mobilization',    '#f43f5e', 1, false)
      RETURNING id INTO v_col_mob;

    INSERT INTO board_columns (board_id, name, color, sort_order, is_done)
      VALUES (v_board_id, 'In Progress',     '#f97316', 2, false)
      RETURNING id INTO v_col_prog;

    INSERT INTO board_columns (board_id, name, color, sort_order, is_done)
      VALUES (v_board_id, 'Final Punchlist', '#14b8a6', 3, false)
      RETURNING id INTO v_col_punch;

    INSERT INTO board_columns (board_id, name, color, sort_order, is_done)
      VALUES (v_board_id, 'Closeout',        '#10b981', 4, false)
      RETURNING id INTO v_col_close;

    INSERT INTO board_columns (board_id, name, color, sort_order, is_done)
      VALUES (v_board_id, 'Closed',          '#64748b', 5, true)
      RETURNING id INTO v_col_done;

    -- Back-fill projects: assign to board + map old status → column
    UPDATE projects SET
      board_id        = v_board_id,
      board_column_id = CASE status
        WHEN 'queue'                   THEN v_col_queue
        WHEN 'planning'                THEN v_col_queue
        WHEN 'on_hold'                 THEN v_col_queue
        WHEN 'mobilization'            THEN v_col_mob
        WHEN 'construction_initiated'  THEN v_col_prog
        WHEN 'pct_30'                  THEN v_col_prog
        WHEN 'pct_60'                  THEN v_col_prog
        WHEN 'pct_90'                  THEN v_col_prog
        WHEN 'active'                  THEN v_col_prog
        WHEN 'final_punchlist'         THEN v_col_punch
        WHEN 'closeout'                THEN v_col_close
        WHEN 'closed'                  THEN v_col_done
        WHEN 'completed'               THEN v_col_done
        WHEN 'cancelled'               THEN v_col_done
        ELSE v_col_queue
      END
    WHERE company_id = rec.id
      AND board_column_id IS NULL;  -- only rows not yet migrated

    -- Back-fill phases: map old status → column
    UPDATE phases SET
      board_column_id = CASE phases.status
        WHEN 'not_started' THEN v_col_queue
        WHEN 'in_progress' THEN v_col_prog
        WHEN 'blocked'     THEN v_col_prog
        WHEN 'completed'   THEN v_col_done
        WHEN 'skipped'     THEN v_col_done
        ELSE v_col_queue
      END
    WHERE project_id IN (
      SELECT id FROM projects WHERE company_id = rec.id
    )
    AND board_column_id IS NULL;

  END LOOP;
END;
$$;
