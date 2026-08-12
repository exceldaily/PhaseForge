SET search_path TO phaseforge, extensions;

-- ── Project ↔ Team assignment ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_teams (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_id    UUID NOT NULL REFERENCES teams(id)    ON DELETE CASCADE,
  PRIMARY KEY (project_id, team_id)
);

ALTER TABLE project_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members read project_teams"
  ON project_teams FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_teams.project_id
        AND p.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Managers+ manage project_teams"
  ON project_teams FOR ALL
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner','admin','manager')
  );

-- ── Rename viewer → member ────────────────────────────────────────────────────
-- Safe: only touches rows where role is still 'viewer'
UPDATE profiles SET role = 'member' WHERE role = 'viewer';
