-- Calendar: free-standing events people put on the company calendar.
-- Project work on the calendar is NOT stored here: those are the project's
-- own phases rows, so the calendar, the project page, and the Gantt can
-- never disagree. This table holds everything that is not a phase (a
-- safety meeting, an inspection at 2 PM).
--
-- Wall-clock dates and times with no time zone, because "Oct 12, 7 AM at
-- the job" means the same thing to everyone reading it. No start_time
-- means an all-day event. The super (team) carries the label color, stored
-- on superintendents.default_color; the division is copied from the super at
-- write time so filtering by division never needs a join and still works
-- after a super is removed.
CREATE TABLE IF NOT EXISTS phaseforge.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  project_id uuid REFERENCES phaseforge.projects(id) ON DELETE SET NULL,
  superintendent_id uuid REFERENCES phaseforge.superintendents(id) ON DELETE SET NULL,
  division text,
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  start_date date NOT NULL,
  end_date date NOT NULL,
  start_time time,
  end_time time,
  notes text,
  color text,
  created_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (start_time IS NOT NULL OR end_time IS NULL)
);

CREATE INDEX IF NOT EXISTS calendar_events_company_start_idx
  ON phaseforge.calendar_events (company_id, start_date);
CREATE INDEX IF NOT EXISTS calendar_events_company_end_idx
  ON phaseforge.calendar_events (company_id, end_date);
CREATE INDEX IF NOT EXISTS calendar_events_project_idx
  ON phaseforge.calendar_events (project_id);

CREATE TRIGGER calendar_events_updated BEFORE UPDATE ON phaseforge.calendar_events
  FOR EACH ROW EXECUTE FUNCTION phaseforge.quotes_set_updated_at();

ALTER TABLE phaseforge.calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY calendar_events_select ON phaseforge.calendar_events FOR SELECT
  USING (company_id = phaseforge.get_my_company_id());
CREATE POLICY calendar_events_write ON phaseforge.calendar_events FOR ALL
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_manager())
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_manager());

GRANT SELECT, INSERT, UPDATE, DELETE ON phaseforge.calendar_events TO authenticated;
