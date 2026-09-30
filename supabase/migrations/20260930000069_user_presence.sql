-- When each person last used the site.
--
-- Supabase Auth only records the last SIGN-IN, and sessions last for weeks,
-- so that date badly understates real use. This table holds a heartbeat:
-- the app pings while someone is actually clicking around, at most every few
-- minutes, and the row keeps the latest time and the page they were on.
--
-- It is a table of its own (not a column on profiles) so the heartbeat never
-- fires the profile triggers or touches profile rows. Nobody writes to it
-- directly: touch_presence() stamps the time on the server, so a person
-- cannot set their own "last seen" to anything but now.
CREATE TABLE IF NOT EXISTS phaseforge.user_presence (
  profile_id uuid PRIMARY KEY REFERENCES phaseforge.profiles(id) ON DELETE CASCADE,
  company_id uuid REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_path text
);

CREATE INDEX IF NOT EXISTS user_presence_company_idx
  ON phaseforge.user_presence (company_id, last_seen_at DESC);

ALTER TABLE phaseforge.user_presence ENABLE ROW LEVEL SECURITY;
-- The only direct read: your own row. Everything else goes through
-- member_activity(), which checks who is asking.
CREATE POLICY user_presence_own ON phaseforge.user_presence FOR SELECT
  USING (profile_id = auth.uid());
GRANT SELECT ON phaseforge.user_presence TO authenticated;

CREATE OR REPLACE FUNCTION phaseforge.touch_presence(p_path text DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'phaseforge'
AS $$
  INSERT INTO user_presence (profile_id, company_id, last_seen_at, last_path)
  SELECT p.id, p.company_id, now(), left(p_path, 200)
  FROM profiles p WHERE p.id = auth.uid()
  ON CONFLICT (profile_id) DO UPDATE
    SET last_seen_at = now(),
        last_path = coalesce(excluded.last_path, user_presence.last_path),
        company_id = excluded.company_id
$$;

-- Last activity for the people the caller may see: their own company when
-- they are its owner or admin, or everyone (p_all) for a super admin.
CREATE OR REPLACE FUNCTION phaseforge.member_activity(p_all boolean DEFAULT false)
RETURNS TABLE (profile_id uuid, last_seen_at timestamptz, last_path text, last_sign_in_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'phaseforge'
AS $$
  SELECT p.id, up.last_seen_at, up.last_path, u.last_sign_in_at
  FROM profiles p
  LEFT JOIN user_presence up ON up.profile_id = p.id
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE EXISTS (
    SELECT 1 FROM profiles me
    WHERE me.id = auth.uid()
      AND (
        (p_all AND me.is_super_admin)
        OR (me.company_id = p.company_id AND (me.role IN ('owner', 'admin') OR me.is_super_admin))
      )
  )
$$;

REVOKE ALL ON FUNCTION phaseforge.touch_presence(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION phaseforge.member_activity(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION phaseforge.touch_presence(text) TO authenticated;
GRANT EXECUTE ON FUNCTION phaseforge.member_activity(boolean) TO authenticated;
