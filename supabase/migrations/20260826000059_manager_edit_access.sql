-- Managers can edit company data, and a missing ops_role no longer means
-- read-only.
--
-- Two separate faults were locking people out, and the second one hit even
-- OWNERS:
--
--  1. get_my_ops_role() returned 'read_only' whenever ops_role was NULL. Every
--     ops-gated policy (the whole scheduler included) is written as
--     ops_is_manager(), so anyone who had never been given a second, separate
--     ops_role could not insert, update, or delete a schedule row — while the
--     app's own check looked at the workspace role and happily showed them the
--     buttons. Writes failed silently. It now falls back to the workspace role,
--     mirroring defaultOpsRole() in src/lib/operations/server.ts.
--
--  2. Policies that gate on the workspace role listed only owner and admin for
--     deletes and a few updates, so a manager had to be promoted to owner just
--     to delete a punch item or a board.
--
-- Deliberately NOT changed: invites, invoices, and board_teams (who can see a
-- board) stay owner/admin, because they hand out access or move money.

CREATE OR REPLACE FUNCTION phaseforge.get_my_ops_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'phaseforge'
AS $function$
  SELECT COALESCE(
    (SELECT ops_role FROM phaseforge.profiles WHERE id = auth.uid()),
    (SELECT CASE role
       WHEN 'owner'   THEN 'owner'
       WHEN 'admin'   THEN 'admin'
       WHEN 'manager' THEN 'project_manager'
       ELSE 'read_only'
     END FROM phaseforge.profiles WHERE id = auth.uid()),
    'read_only'
  )
$function$;

-- ── Punch items: the delete Brad asked about ────────────────────────────────
DROP POLICY IF EXISTS "punch delete" ON phaseforge.punch_items;
CREATE POLICY "punch delete" ON phaseforge.punch_items FOR DELETE
  USING (company_id IN (
    SELECT company_id FROM phaseforge.profiles
    WHERE id = auth.uid() AND role = ANY (ARRAY['owner','admin','manager'])
  ));

-- ── Boards ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS boards_delete ON phaseforge.boards;
CREATE POLICY boards_delete ON phaseforge.boards FOR DELETE
  USING (company_id = phaseforge.get_my_company_id()
    AND phaseforge.get_my_role() = ANY (ARRAY['owner','admin','manager']));

DROP POLICY IF EXISTS boards_update ON phaseforge.boards;
CREATE POLICY boards_update ON phaseforge.boards FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id()
    AND phaseforge.get_my_role() = ANY (ARRAY['owner','admin','manager']));

DROP POLICY IF EXISTS board_columns_delete ON phaseforge.board_columns;
CREATE POLICY board_columns_delete ON phaseforge.board_columns FOR DELETE
  USING (board_id IN (SELECT phaseforge.get_accessible_board_ids())
    AND phaseforge.get_my_role() = ANY (ARRAY['owner','admin','manager']));

-- ── Plans ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS plan_sets_delete ON phaseforge.plan_sets;
CREATE POLICY plan_sets_delete ON phaseforge.plan_sets FOR DELETE
  USING (company_id = phaseforge.get_my_company_id()
    AND phaseforge.get_my_role() = ANY (ARRAY['owner','admin','manager']));

DROP POLICY IF EXISTS plan_sheets_delete ON phaseforge.plan_sheets;
CREATE POLICY plan_sheets_delete ON phaseforge.plan_sheets FOR DELETE
  USING (company_id = phaseforge.get_my_company_id()
    AND phaseforge.get_my_role() = ANY (ARRAY['owner','admin','manager']));

DROP POLICY IF EXISTS plan_revisions_delete ON phaseforge.plan_revisions;
CREATE POLICY plan_revisions_delete ON phaseforge.plan_revisions FOR DELETE
  USING (company_id = phaseforge.get_my_company_id()
    AND phaseforge.get_my_role() = ANY (ARRAY['owner','admin','manager']));

DROP POLICY IF EXISTS plan_pins_delete ON phaseforge.plan_pins;
CREATE POLICY plan_pins_delete ON phaseforge.plan_pins FOR DELETE
  USING (company_id = phaseforge.get_my_company_id()
    AND (created_by = auth.uid()
      OR phaseforge.get_my_role() = ANY (ARRAY['owner','admin','manager'])));

DROP POLICY IF EXISTS plan_pin_comments_delete ON phaseforge.plan_pin_comments;
CREATE POLICY plan_pin_comments_delete ON phaseforge.plan_pin_comments FOR DELETE
  USING (company_id = phaseforge.get_my_company_id()
    AND (author_id = auth.uid()
      OR phaseforge.get_my_role() = ANY (ARRAY['owner','admin','manager'])));

-- ── Teams (crew resourcing, not access control) ─────────────────────────────
DROP POLICY IF EXISTS "Owners/admins manage teams" ON phaseforge.teams;
CREATE POLICY "Managers+ manage teams" ON phaseforge.teams FOR ALL
  USING (company_id = (SELECT company_id FROM phaseforge.profiles WHERE id = auth.uid())
    AND (SELECT role FROM phaseforge.profiles WHERE id = auth.uid())
        = ANY (ARRAY['owner','admin','manager']));

DROP POLICY IF EXISTS "Owners/admins manage team_members" ON phaseforge.team_members;
CREATE POLICY "Managers+ manage team_members" ON phaseforge.team_members FOR ALL
  USING (EXISTS (
      SELECT 1 FROM phaseforge.teams
      WHERE teams.id = team_members.team_id
        AND teams.company_id = (SELECT company_id FROM phaseforge.profiles WHERE id = auth.uid()))
    AND (SELECT role FROM phaseforge.profiles WHERE id = auth.uid())
        = ANY (ARRAY['owner','admin','manager']));

-- ── Scheduler: deleting a crew team was admin-only ──────────────────────────
DROP POLICY IF EXISTS superintendents_delete ON phaseforge.superintendents;
CREATE POLICY superintendents_delete ON phaseforge.superintendents FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_manager());

-- ── Dispatch deletes ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS dispatch_boards_delete ON phaseforge.dispatch_boards;
CREATE POLICY dispatch_boards_delete ON phaseforge.dispatch_boards FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch()
    AND phaseforge.get_my_role() = ANY (ARRAY['owner','admin','manager']));

DROP POLICY IF EXISTS dispatch_columns_delete ON phaseforge.dispatch_columns;
CREATE POLICY dispatch_columns_delete ON phaseforge.dispatch_columns FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch()
    AND phaseforge.get_my_role() = ANY (ARRAY['owner','admin','manager']));

DROP POLICY IF EXISTS dispatch_vendors_delete ON phaseforge.dispatch_vendors;
CREATE POLICY dispatch_vendors_delete ON phaseforge.dispatch_vendors FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch()
    AND phaseforge.get_my_role() = ANY (ARRAY['owner','admin','manager']));

DROP POLICY IF EXISTS dispatch_activity_delete ON phaseforge.dispatch_activity_logs;
CREATE POLICY dispatch_activity_delete ON phaseforge.dispatch_activity_logs FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch()
    AND phaseforge.get_my_role() = ANY (ARRAY['owner','admin','manager']));
