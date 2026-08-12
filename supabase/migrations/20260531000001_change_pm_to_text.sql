SET search_path TO phaseforge, extensions;

-- Allow project_manager and superintendent to store custom names (text) instead of UUID
-- This enables users to add PMs/Superintendents without them being registered team members

-- Drop the foreign key constraint that requires project_manager to be a UUID
ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_project_manager_fkey;

-- Change columns from UUID to TEXT to allow custom names
ALTER TABLE projects
  ALTER COLUMN project_manager TYPE text USING COALESCE(project_manager::text, ''),
  ALTER COLUMN superintendent TYPE text USING COALESCE(superintendent::text, '');
