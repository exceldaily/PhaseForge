SET search_path TO phaseforge, extensions;

-- Punch List module: field/QA issues attached to a project.
-- Additive only. Does not touch existing tables.

CREATE TABLE IF NOT EXISTS punch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  number int,                              -- per-project sequential number for the report
  title text,
  issue_description text NOT NULL,
  issue_photo_path text NOT NULL,          -- storage path (private; served via signed URL)
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  due_date date,
  location text,
  category text,                           -- trade / category
  priority text DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',     -- open | in_progress | needs_review | completed
  completion_description text,
  completion_photo_path text,
  completed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_punch_items_project ON punch_items(project_id);
CREATE INDEX IF NOT EXISTS idx_punch_items_assigned ON punch_items(assigned_to);

ALTER TABLE punch_items ENABLE ROW LEVEL SECURITY;

-- Read: any member of the owning company
CREATE POLICY "punch read" ON punch_items FOR SELECT
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Insert: company members (server action sets created_by = self)
CREATE POLICY "punch insert" ON punch_items FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Update: company members (server action further restricts to assignee / owner / admin / manager)
CREATE POLICY "punch update" ON punch_items FOR UPDATE
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Delete: owners / admins only
CREATE POLICY "punch delete" ON punch_items FOR DELETE
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
  ));
