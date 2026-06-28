-- Optional photo attachment per checklist item.
-- Additive, nullable — existing items keep working.
ALTER TABLE phase_checklists ADD COLUMN IF NOT EXISTS photo_path text;

-- Storage RLS for checklist photos. Stored under
-- checklist-items/<phase_id>/... in the shared project-attachments bucket.
-- Checks through phases → projects → caller's company.

CREATE POLICY "checklist photos read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-attachments'
    AND (storage.foldername(name))[1] = 'checklist-items'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM phases
      WHERE project_id IN (
        SELECT id FROM projects WHERE company_id = get_my_company_id()
      )
    )
  );

CREATE POLICY "checklist photos insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-attachments'
    AND (storage.foldername(name))[1] = 'checklist-items'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM phases
      WHERE project_id IN (
        SELECT id FROM projects WHERE company_id = get_my_company_id()
      )
    )
  );

CREATE POLICY "checklist photos delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-attachments'
    AND (storage.foldername(name))[1] = 'checklist-items'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM phases
      WHERE project_id IN (
        SELECT id FROM projects WHERE company_id = get_my_company_id()
      )
    )
  );
