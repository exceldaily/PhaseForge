SET search_path TO phaseforge, extensions;

-- ============================================================
-- Migration: Board-level project privacy
-- Projects on a team-restricted board are only visible to members of the
-- linked teams (owners/admins always see everything, via
-- get_accessible_board_ids). Projects not on any board stay company-wide.
-- Phases inherit automatically: their policies subquery the projects table,
-- which now applies this filter.
-- ============================================================

DROP POLICY IF EXISTS "projects_select" ON projects;
CREATE POLICY "projects_select" ON projects FOR SELECT
  USING (
    company_id = get_my_company_id()
    AND (board_id IS NULL OR board_id IN (SELECT get_accessible_board_ids()))
  );

DROP POLICY IF EXISTS "projects_insert" ON projects;
CREATE POLICY "projects_insert" ON projects FOR INSERT
  WITH CHECK (
    company_id = get_my_company_id()
    AND (board_id IS NULL OR board_id IN (SELECT get_accessible_board_ids()))
  );

DROP POLICY IF EXISTS "projects_update" ON projects;
CREATE POLICY "projects_update" ON projects FOR UPDATE
  USING (
    company_id = get_my_company_id()
    AND (board_id IS NULL OR board_id IN (SELECT get_accessible_board_ids()))
  );

DROP POLICY IF EXISTS "projects_delete" ON projects;
CREATE POLICY "projects_delete" ON projects FOR DELETE
  USING (
    company_id = get_my_company_id()
    AND (board_id IS NULL OR board_id IN (SELECT get_accessible_board_ids()))
  );
