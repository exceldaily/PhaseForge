-- Storage RLS for punch photos, so the MOBILE app (user/anon session, no
-- service-role key) can upload and read punch-list photos in the shared
-- private `project-attachments` bucket. The web app uses the service-role
-- client and bypasses these, so it is unaffected.
--
-- Scope: authenticated users may INSERT/SELECT objects under
-- punch-items/<project_id>/... only for projects in their own company.
-- get_my_company_id() already exists and is used by other policies.

CREATE POLICY "punch photos read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-attachments'
    AND (storage.foldername(name))[1] = 'punch-items'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM projects WHERE company_id = get_my_company_id()
    )
  );

CREATE POLICY "punch photos insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-attachments'
    AND (storage.foldername(name))[1] = 'punch-items'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM projects WHERE company_id = get_my_company_id()
    )
  );
