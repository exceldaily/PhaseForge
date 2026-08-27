-- Shift-note colours, and row highlighting on the Startup grid.
--
-- shift_options stays a text[] of names so nothing that reads it has to
-- change; the colours ride alongside in a name -> hex map. A name with no
-- entry falls back to the keyword palette the app has always used, so every
-- existing department keeps the exact colours it has today.
ALTER TABLE phaseforge.schedule_department_settings
  ADD COLUMN IF NOT EXISTS shift_colors jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Per-row highlight on a week's job. NULL means no highlight.
ALTER TABLE phaseforge.schedule_jobs
  ADD COLUMN IF NOT EXISTS highlight_color text;
