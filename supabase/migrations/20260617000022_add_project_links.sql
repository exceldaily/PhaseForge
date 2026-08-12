SET search_path TO phaseforge, extensions;

-- Optional reference links per project (plan sets, store info, permit portals,
-- spec sheets, etc.). Stored as an array of { label, url } objects.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS links jsonb NOT NULL DEFAULT '[]'::jsonb;
