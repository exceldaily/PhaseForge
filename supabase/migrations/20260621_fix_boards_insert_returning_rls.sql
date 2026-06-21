-- Mobile board creation can pass the INSERT policy but fail on
-- INSERT ... RETURNING because boards_select calls get_accessible_board_ids(),
-- which re-queries boards during the same statement. The new row is not in
-- that helper result yet, so PostgREST reports an RLS violation.
--
-- Keep the visibility model unchanged, but express boards_select directly
-- against the row being returned.

CREATE OR REPLACE FUNCTION public.can_access_board(
  p_board_id uuid,
  p_company_id uuid,
  p_created_by uuid,
  p_is_private boolean
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p_company_id = public.get_my_company_id()
    AND (
      public.get_my_role() IN ('owner', 'admin')
      OR p_created_by = auth.uid()
      OR (
        p_is_private = false
        AND NOT EXISTS (
          SELECT 1
          FROM public.board_teams bt
          WHERE bt.board_id = p_board_id
        )
      )
      OR EXISTS (
        SELECT 1
        FROM public.board_teams bt
        JOIN public.team_members tm ON tm.team_id = bt.team_id
        WHERE bt.board_id = p_board_id
          AND tm.profile_id = auth.uid()
      )
    )
$$;

DROP POLICY IF EXISTS "boards_select" ON public.boards;

CREATE POLICY "boards_select" ON public.boards
FOR SELECT
USING (public.can_access_board(id, company_id, created_by, is_private));

CREATE OR REPLACE FUNCTION public.get_accessible_board_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT b.id
  FROM public.boards b
  WHERE b.company_id = public.get_my_company_id()
    AND (
      public.get_my_role() IN ('owner', 'admin')
      OR b.created_by = auth.uid()
      OR (
        b.is_private = false
        AND NOT EXISTS (
          SELECT 1
          FROM public.board_teams bt
          WHERE bt.board_id = b.id
        )
      )
      OR EXISTS (
        SELECT 1
        FROM public.board_teams bt
        JOIN public.team_members tm ON tm.team_id = bt.team_id
        WHERE bt.board_id = b.id
          AND tm.profile_id = auth.uid()
      )
    )
$$;

ALTER FUNCTION public.get_my_role() OWNER TO postgres;
ALTER FUNCTION public.get_my_company_id() OWNER TO postgres;
ALTER FUNCTION public.get_accessible_board_ids() OWNER TO postgres;
ALTER FUNCTION public.can_access_board(uuid, uuid, uuid, boolean) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_my_company_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_accessible_board_ids() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_access_board(uuid, uuid, uuid, boolean) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
