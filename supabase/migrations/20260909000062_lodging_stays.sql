-- Crew lodging, derived from the weekly schedules.
--
-- A stay is "this crew needs beds near this job for these nights". Rows are
-- generated from a team's week (guests = everyone scheduled on the job,
-- nights = first scheduled day through the last) and then booked by hand:
-- hotel, confirmation number, rate. The schedule_job_id link is what stops
-- the same week being generated twice; it is nullable because a stay can
-- also be added by hand for work that never went through the scheduler.
CREATE TABLE IF NOT EXISTS phaseforge.lodging_stays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  superintendent_id uuid REFERENCES phaseforge.superintendents(id) ON DELETE SET NULL,
  schedule_job_id uuid REFERENCES phaseforge.schedule_jobs(id) ON DELETE SET NULL,
  project_id uuid REFERENCES phaseforge.projects(id) ON DELETE SET NULL,
  week_start date,
  title text NOT NULL,
  job_number text,
  -- Where to look for rooms: the project address when known, else typed in.
  location text,
  check_in date NOT NULL,
  check_out date NOT NULL,
  guests text[] NOT NULL DEFAULT '{}',
  hotel_name text,
  hotel_address text,
  confirmation_number text,
  nightly_rate numeric(10,2),
  notes text,
  status text NOT NULL DEFAULT 'needed' CHECK (status IN ('needed', 'booked', 'cancelled')),
  created_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out > check_in)
);

CREATE INDEX IF NOT EXISTS lodging_stays_company_checkin_idx
  ON phaseforge.lodging_stays (company_id, check_in DESC);
CREATE INDEX IF NOT EXISTS lodging_stays_job_idx
  ON phaseforge.lodging_stays (schedule_job_id);

CREATE TRIGGER lodging_stays_updated BEFORE UPDATE ON phaseforge.lodging_stays
  FOR EACH ROW EXECUTE FUNCTION phaseforge.quotes_set_updated_at();

ALTER TABLE phaseforge.lodging_stays ENABLE ROW LEVEL SECURITY;
CREATE POLICY lodging_select ON phaseforge.lodging_stays FOR SELECT
  USING (company_id = phaseforge.get_my_company_id());
CREATE POLICY lodging_write ON phaseforge.lodging_stays FOR ALL
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_manager())
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_manager());
