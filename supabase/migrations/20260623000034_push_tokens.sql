SET search_path TO phaseforge, extensions;

-- Push notifications: store each device's Expo push token per user so the app
-- can deliver lock-screen notifications (e.g. when a punch item is assigned).
-- Additive only. Mirrors the punch_items RLS style (inline company subquery).
--
-- The ASSIGNING device sends the push directly to Expo (no server), so it must
-- be able to READ the assignee's token — hence SELECT is scoped to the whole
-- company, while writes are restricted to the token's own user.

CREATE TABLE IF NOT EXISTS push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text,                              -- 'ios' | 'android'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- Read: any member of the owning company (so an assigner can look up the
-- assignee's token to send them a push).
DROP POLICY IF EXISTS "push_tokens read" ON push_tokens;
CREATE POLICY "push_tokens read" ON push_tokens FOR SELECT
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Insert: only your own token, in your own company.
DROP POLICY IF EXISTS "push_tokens insert" ON push_tokens;
CREATE POLICY "push_tokens insert" ON push_tokens FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Update: only your own token (refresh on app launch).
DROP POLICY IF EXISTS "push_tokens update" ON push_tokens;
CREATE POLICY "push_tokens update" ON push_tokens FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Delete: only your own token (e.g. on sign-out).
DROP POLICY IF EXISTS "push_tokens delete" ON push_tokens;
CREATE POLICY "push_tokens delete" ON push_tokens FOR DELETE
  USING (user_id = auth.uid());
