-- Per-user state for DERIVED alerts (overdue / due-soon phases & projects).
-- These alerts are computed fresh from project/phase data on web + mobile; this
-- table just remembers which ones the user dismissed or starred, so the choice
-- persists across reloads AND across devices (web <-> mobile).
--
-- alert_key matches the computed alert id used on both platforms:
--   proj-overdue-<projectId> | phase-overdue-<phaseId> | phase-soon-<phaseId>

CREATE TABLE IF NOT EXISTS alert_states (
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  alert_key  TEXT NOT NULL,
  starred    BOOLEAN NOT NULL DEFAULT false,
  dismissed  BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, alert_key)
);

ALTER TABLE alert_states ENABLE ROW LEVEL SECURITY;

-- Users fully manage their own alert states.
CREATE POLICY "Users manage own alert states"
  ON alert_states FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
