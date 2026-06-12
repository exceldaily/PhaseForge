-- Create project_attachments table
CREATE TABLE IF NOT EXISTS public.project_attachments (
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

-- Enable RLS
ALTER TABLE public.project_attachments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Allow service role (server actions) to manage all attachments
CREATE POLICY "Service role can manage attachments"
  ON public.project_attachments
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Users can read attachments from projects in their company
CREATE POLICY "Users can read project attachments"
  ON public.project_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.profiles pr ON pr.company_id = p.company_id
      WHERE p.id = project_attachments.project_id
      AND pr.id = auth.uid()
    )
  );
