SET search_path TO phaseforge, extensions;

-- Applied live 2026-08-12 (phaseforge_projects_drift_columns).
-- These columns existed on the old dedicated project only via dashboard edits
-- (never captured in a migration), so the schema-move baseline lacked them and
-- updateProject failed with PGRST204. The app writes both from ProjectForm.
ALTER TABLE phaseforge.projects ADD COLUMN IF NOT EXISTS subcontractors text[] NOT NULL DEFAULT '{}';
ALTER TABLE phaseforge.projects ADD COLUMN IF NOT EXISTS permit_status text DEFAULT 'not_required';
