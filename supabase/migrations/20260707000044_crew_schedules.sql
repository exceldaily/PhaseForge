SET search_path TO phaseforge, extensions;

-- Weekly crew schedules (replaces the Google Sheets weekly tabs).
CREATE TABLE IF NOT EXISTS phaseforge.schedule_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  superintendent_id uuid NOT NULL REFERENCES phaseforge.superintendents(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  title text NOT NULL,
  job_number text,
  shift_label text,
  project_id uuid REFERENCES phaseforge.projects(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_schedule_jobs_lookup ON phaseforge.schedule_jobs(company_id, superintendent_id, week_start);
ALTER TABLE phaseforge.schedule_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedule_jobs_select" ON phaseforge.schedule_jobs FOR SELECT USING (company_id = phaseforge.get_my_company_id());
CREATE POLICY "schedule_jobs_insert" ON phaseforge.schedule_jobs FOR INSERT WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_manager());
CREATE POLICY "schedule_jobs_update" ON phaseforge.schedule_jobs FOR UPDATE USING (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_manager());
CREATE POLICY "schedule_jobs_delete" ON phaseforge.schedule_jobs FOR DELETE USING (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_manager());

CREATE TABLE IF NOT EXISTS phaseforge.schedule_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  schedule_job_id uuid NOT NULL REFERENCES phaseforge.schedule_jobs(id) ON DELETE CASCADE,
  day smallint NOT NULL CHECK (day BETWEEN 0 AND 6),
  techs text[] NOT NULL DEFAULT '{}',
  UNIQUE (schedule_job_id, day)
);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_job ON phaseforge.schedule_assignments(schedule_job_id);
ALTER TABLE phaseforge.schedule_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedule_assignments_select" ON phaseforge.schedule_assignments FOR SELECT USING (company_id = phaseforge.get_my_company_id());
CREATE POLICY "schedule_assignments_insert" ON phaseforge.schedule_assignments FOR INSERT WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_manager());
CREATE POLICY "schedule_assignments_update" ON phaseforge.schedule_assignments FOR UPDATE USING (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_manager());
CREATE POLICY "schedule_assignments_delete" ON phaseforge.schedule_assignments FOR DELETE USING (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_manager());

-- Team roster: the crew names available for quick-tap scheduling
ALTER TABLE phaseforge.superintendents ADD COLUMN IF NOT EXISTS roster text[] NOT NULL DEFAULT '{}';

-- Per-company job link pattern for schedules ({job} replaced by job number)
ALTER TABLE phaseforge.companies ADD COLUMN IF NOT EXISTS schedule_job_url_template text;

-- Division grouping for schedule teams (e.g. Refrigeration, Plumbing)
ALTER TABLE phaseforge.superintendents ADD COLUMN IF NOT EXISTS division text;

-- Persistent project/job directory shown beside the weekly schedules
CREATE TABLE IF NOT EXISTS phaseforge.schedule_directory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  job_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_schedule_directory_company ON phaseforge.schedule_directory(company_id);
ALTER TABLE phaseforge.schedule_directory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedule_directory_select" ON phaseforge.schedule_directory FOR SELECT USING (company_id = phaseforge.get_my_company_id());
CREATE POLICY "schedule_directory_insert" ON phaseforge.schedule_directory FOR INSERT WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_manager());
CREATE POLICY "schedule_directory_update" ON phaseforge.schedule_directory FOR UPDATE USING (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_manager());
CREATE POLICY "schedule_directory_delete" ON phaseforge.schedule_directory FOR DELETE USING (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_manager());

-- Departments for directory projects (job numbers are per-department, so the
-- project list is scoped to the selected department). Applied live 2026-07-10;
-- pre-existing rows backfilled to 'Refrigeration'.
ALTER TABLE phaseforge.schedule_directory ADD COLUMN IF NOT EXISTS division text;
