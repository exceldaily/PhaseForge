-- Drop table if it exists (in case of previous failed migration)
DROP TABLE IF EXISTS public.project_attachments CASCADE;

-- Create project_attachments table
CREATE TABLE public.project_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_type TEXT,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_project_attachments_project_id ON public.project_attachments(project_id);
CREATE INDEX idx_project_attachments_uploaded_at ON public.project_attachments(uploaded_at DESC);

-- Disable RLS for now - authorization is handled in server actions
ALTER TABLE public.project_attachments DISABLE ROW LEVEL SECURITY;
