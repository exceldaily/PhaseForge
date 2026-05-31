ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id);

UPDATE projects
SET updated_by = created_by
WHERE updated_by IS NULL
  AND created_by IS NOT NULL;
