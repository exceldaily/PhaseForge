-- Allow project_manager and superintendent to store custom names (text) instead of UUID
-- This enables users to add PMs/Superintendents without them being registered team members

ALTER TABLE projects
  ALTER COLUMN project_manager TYPE text USING project_manager::text,
  ALTER COLUMN superintendent TYPE text USING superintendent::text;
