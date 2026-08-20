SET search_path TO phaseforge, extensions;

-- Applied live 2026-08-22 (phaseforge_project_trade).
-- Global trade/division filter: each project can belong to a trade
-- (Refrigeration, HVAC, Electrical…). The org-wide switcher in the top bar
-- (business/enterprise plans) scopes Projects, Gantt, Dashboard, Boards and
-- Change Orders to one trade. Existing Kalos projects backfilled to
-- 'Refrigeration'.
ALTER TABLE phaseforge.projects ADD COLUMN IF NOT EXISTS trade text;
CREATE INDEX IF NOT EXISTS idx_projects_trade ON phaseforge.projects(company_id, trade);
