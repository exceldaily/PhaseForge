-- Weekly crew schedules (replaces the Google Sheets weekly tabs).
CREATE TABLE IF NOT EXISTS public.schedule_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  superintendent_id uuid NOT NULL REFERENCES public.superintendents(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  title text NOT NULL,
  job_number text,
  shift_label text,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_schedule_jobs_lookup ON public.schedule_jobs(company_id, superintendent_id, week_start);
ALTER TABLE public.schedule_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedule_jobs_select" ON public.schedule_jobs FOR SELECT USING (company_id = public.get_my_company_id());
CREATE POLICY "schedule_jobs_insert" ON public.schedule_jobs FOR INSERT WITH CHECK (company_id = public.get_my_company_id() AND public.ops_is_manager());
CREATE POLICY "schedule_jobs_update" ON public.schedule_jobs FOR UPDATE USING (company_id = public.get_my_company_id() AND public.ops_is_manager());
CREATE POLICY "schedule_jobs_delete" ON public.schedule_jobs FOR DELETE USING (company_id = public.get_my_company_id() AND public.ops_is_manager());

CREATE TABLE IF NOT EXISTS public.schedule_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  schedule_job_id uuid NOT NULL REFERENCES public.schedule_jobs(id) ON DELETE CASCADE,
  day smallint NOT NULL CHECK (day BETWEEN 0 AND 6),
  techs text[] NOT NULL DEFAULT '{}',
  UNIQUE (schedule_job_id, day)
);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_job ON public.schedule_assignments(schedule_job_id);
ALTER TABLE public.schedule_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedule_assignments_select" ON public.schedule_assignments FOR SELECT USING (company_id = public.get_my_company_id());
CREATE POLICY "schedule_assignments_insert" ON public.schedule_assignments FOR INSERT WITH CHECK (company_id = public.get_my_company_id() AND public.ops_is_manager());
CREATE POLICY "schedule_assignments_update" ON public.schedule_assignments FOR UPDATE USING (company_id = public.get_my_company_id() AND public.ops_is_manager());
CREATE POLICY "schedule_assignments_delete" ON public.schedule_assignments FOR DELETE USING (company_id = public.get_my_company_id() AND public.ops_is_manager());

-- Team roster: the crew names available for quick-tap scheduling
ALTER TABLE public.superintendents ADD COLUMN IF NOT EXISTS roster text[] NOT NULL DEFAULT '{}';

-- Per-company job link pattern for schedules ({job} replaced by job number)
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS schedule_job_url_template text;

-- Division grouping for schedule teams (e.g. Refrigeration, Plumbing)
ALTER TABLE public.superintendents ADD COLUMN IF NOT EXISTS division text;

-- Persistent project/job directory shown beside the weekly schedules
CREATE TABLE IF NOT EXISTS public.schedule_directory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  job_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_schedule_directory_company ON public.schedule_directory(company_id);
ALTER TABLE public.schedule_directory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedule_directory_select" ON public.schedule_directory FOR SELECT USING (company_id = public.get_my_company_id());
CREATE POLICY "schedule_directory_insert" ON public.schedule_directory FOR INSERT WITH CHECK (company_id = public.get_my_company_id() AND public.ops_is_manager());
CREATE POLICY "schedule_directory_update" ON public.schedule_directory FOR UPDATE USING (company_id = public.get_my_company_id() AND public.ops_is_manager());
CREATE POLICY "schedule_directory_delete" ON public.schedule_directory FOR DELETE USING (company_id = public.get_my_company_id() AND public.ops_is_manager());
