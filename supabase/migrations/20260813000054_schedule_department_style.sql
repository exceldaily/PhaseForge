SET search_path TO phaseforge, extensions;

-- Applied live 2026-08-13 (phaseforge_schedule_department_style).
-- Per-department schedule style. A "department" is the superintendents.division
-- string; '' is the default/unnamed department. 'crew' = the roster-chip weekly
-- grid; 'grid' = the Startup-style jobs x days table with person+shift cells.
CREATE TABLE IF NOT EXISTS phaseforge.schedule_department_settings (
  company_id    uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  division      text NOT NULL DEFAULT '',
  style         text NOT NULL DEFAULT 'crew',
  shift_options text[] NOT NULL DEFAULT ARRAY['Days','Nights','Travel Day','As needed']::text[],
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, division)
);

ALTER TABLE phaseforge.schedule_department_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sched_dept_settings_select" ON phaseforge.schedule_department_settings;
CREATE POLICY "sched_dept_settings_select" ON phaseforge.schedule_department_settings FOR SELECT
  USING (company_id = phaseforge.get_my_company_id());
DROP POLICY IF EXISTS "sched_dept_settings_write" ON phaseforge.schedule_department_settings;
CREATE POLICY "sched_dept_settings_write" ON phaseforge.schedule_department_settings FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_manager());
DROP POLICY IF EXISTS "sched_dept_settings_update" ON phaseforge.schedule_department_settings;
CREATE POLICY "sched_dept_settings_update" ON phaseforge.schedule_department_settings FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_manager());

GRANT ALL ON phaseforge.schedule_department_settings TO anon, authenticated, service_role;

-- Grid-style cells: per (job, day) a list of {name, shift}. Crew style keeps
-- using schedule_assignments.techs; grid style uses this jsonb column instead.
ALTER TABLE phaseforge.schedule_assignments
  ADD COLUMN IF NOT EXISTS cell_entries jsonb NOT NULL DEFAULT '[]'::jsonb;
