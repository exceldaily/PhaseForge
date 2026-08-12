SET search_path TO phaseforge, extensions;

-- SECURITY FIX: project_attachments shipped with RLS DISABLED ("authorization
-- handled in server actions"). That assumption fails for the MOBILE app and any
-- direct PostgREST call: both use the user/anon session, so with RLS off the
-- authenticated role can read/write EVERY company's attachment rows (file names,
-- paths, uploader ids) — a cross-tenant leak. Enable RLS and scope every row to
-- the caller's company via the parent project. Web server actions use the
-- service-role admin client, which bypasses RLS, so they are unaffected.
--
-- Idempotent. The table has no company_id, so we scope through projects.

ALTER TABLE phaseforge.project_attachments ENABLE ROW LEVEL SECURITY;

-- helper: project ids in the caller's company
-- (inline subquery mirrors the punch_items policy style)

DROP POLICY IF EXISTS "attachments read" ON phaseforge.project_attachments;
CREATE POLICY "attachments read" ON phaseforge.project_attachments FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "attachments insert" ON phaseforge.project_attachments;
CREATE POLICY "attachments insert" ON phaseforge.project_attachments FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND project_id IN (
      SELECT id FROM projects
      WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "attachments update" ON phaseforge.project_attachments;
CREATE POLICY "attachments update" ON phaseforge.project_attachments FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "attachments delete" ON phaseforge.project_attachments;
CREATE POLICY "attachments delete" ON phaseforge.project_attachments FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );
