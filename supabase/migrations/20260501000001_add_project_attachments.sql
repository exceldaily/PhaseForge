SET search_path TO phaseforge, extensions;

-- Drop table if it exists (in case of previous failed migration)
DROP TABLE IF EXISTS phaseforge.project_attachments CASCADE;

-- Create project_attachments table
CREATE TABLE phaseforge.project_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES phaseforge.projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_type TEXT,
  uploaded_by UUID NOT NULL REFERENCES phaseforge.profiles(id),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_project_attachments_project_id ON phaseforge.project_attachments(project_id);
CREATE INDEX idx_project_attachments_uploaded_at ON phaseforge.project_attachments(uploaded_at DESC);

-- Disable RLS for now - authorization is handled in server actions
ALTER TABLE phaseforge.project_attachments DISABLE ROW LEVEL SECURITY;
