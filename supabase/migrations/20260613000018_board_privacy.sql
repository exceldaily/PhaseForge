SET search_path TO phaseforge, extensions;

-- ============================================================
-- Migration: Board privacy (creation-time visibility selector)
-- Adds an explicit is_private flag so a board can be restricted to just its
-- creator (plus owners/admins), independent of team links. Visibility model:
--   • owners/admins                  → see every board
--   • the board's creator            → always sees their own board
--   • is_private = false AND no teams → visible to all org members (default)
--   • board linked to your team       → team members see it
-- "Specific teams" privacy continues to work via board_teams (unchanged);
-- the only new state is is_private = true with no teams ("Just me").
-- Safe: ADDITIVE — new column defaults false, so existing boards keep their
-- current company-wide visibility.
-- ============================================================

ALTER TABLE boards
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION get_accessible_board_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT b.id
  FROM boards b
  WHERE b.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      -- Owners and admins see everything
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner','admin')
      -- The creator always sees (and can manage) the board they made
      OR b.created_by = auth.uid()
      -- Not private and not team-restricted = visible to all org members
      OR (
        b.is_private = false
        AND NOT EXISTS (SELECT 1 FROM board_teams bt WHERE bt.board_id = b.id)
      )
      -- Board is linked to one of the user's teams
      OR EXISTS (
        SELECT 1 FROM board_teams bt
        JOIN team_members tm ON tm.team_id = bt.team_id
        WHERE bt.board_id = b.id AND tm.profile_id = auth.uid()
      )
    )
$$;
