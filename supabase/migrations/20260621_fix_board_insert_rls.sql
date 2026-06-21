-- Mobile (user/anon session) cannot create boards: the boards_insert and
-- board_columns_insert RLS policies check the caller's role via an INLINE
-- subquery on `profiles` -- `(SELECT role FROM profiles WHERE id = auth.uid())`.
-- That subquery runs UNDER RLS inside the INSERT WITH CHECK and returns NULL in
-- that context, so the check fails ("new row violates row-level security policy
-- for table boards"). The web never hit this because it inserts boards with the
-- service-role client (bypasses RLS).
--
-- get_my_company_id() works because it is SECURITY DEFINER. Mirror that for the
-- role check with get_my_role(), then rebuild the board policies to use it.
-- Additive + idempotent (drop-then-create); does not change behavior for web.

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$ SELECT role FROM profiles WHERE id = auth.uid() $$;

-- ── boards ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "boards_insert" ON boards;
CREATE POLICY "boards_insert" ON boards FOR INSERT
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'manager')
  );

DROP POLICY IF EXISTS "boards_update" ON boards;
CREATE POLICY "boards_update" ON boards FOR UPDATE
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin')
  );

DROP POLICY IF EXISTS "boards_delete" ON boards;
CREATE POLICY "boards_delete" ON boards FOR DELETE
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin')
  );

-- ── board_columns ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "board_columns_insert" ON board_columns;
CREATE POLICY "board_columns_insert" ON board_columns FOR INSERT
  WITH CHECK (
    board_id IN (SELECT get_accessible_board_ids())
    AND get_my_role() IN ('owner', 'admin', 'manager')
  );

DROP POLICY IF EXISTS "board_columns_update" ON board_columns;
CREATE POLICY "board_columns_update" ON board_columns FOR UPDATE
  USING (
    board_id IN (SELECT get_accessible_board_ids())
    AND get_my_role() IN ('owner', 'admin', 'manager')
  );

DROP POLICY IF EXISTS "board_columns_delete" ON board_columns;
CREATE POLICY "board_columns_delete" ON board_columns FOR DELETE
  USING (
    board_id IN (SELECT get_accessible_board_ids())
    AND get_my_role() IN ('owner', 'admin')
  );
