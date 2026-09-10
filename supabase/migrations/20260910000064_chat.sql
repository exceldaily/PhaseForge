SET search_path TO phaseforge, extensions;

-- ============================================================================
-- Chat: trade-oriented spaces (General, one per trade, one per project,
-- direct messages) plus a company-wide "Project updates" feed that project
-- channels can post into. @Trade pings everyone who lists that trade on
-- their profile; @Name pings a person; @everyone pings the company.
-- ============================================================================

ALTER TABLE phaseforge.profiles ADD COLUMN IF NOT EXISTS trades text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS phaseforge.chat_channels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('general', 'updates', 'trade', 'project', 'direct')),
  name        text NOT NULL,
  trade       text,
  project_id  uuid REFERENCES phaseforge.projects(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  archived    boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_channels_kind ON phaseforge.chat_channels(company_id, kind) WHERE kind IN ('general', 'updates');
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_channels_trade ON phaseforge.chat_channels(company_id, lower(trade)) WHERE kind = 'trade';
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_channels_project ON phaseforge.chat_channels(company_id, project_id) WHERE kind = 'project';
CREATE INDEX IF NOT EXISTS idx_chat_channels_company ON phaseforge.chat_channels(company_id, archived);

CREATE TABLE IF NOT EXISTS phaseforge.chat_channel_members (
  channel_id   uuid NOT NULL REFERENCES phaseforge.chat_channels(id) ON DELETE CASCADE,
  profile_id   uuid NOT NULL REFERENCES phaseforge.profiles(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_members_profile ON phaseforge.chat_channel_members(profile_id);

CREATE TABLE IF NOT EXISTS phaseforge.chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  channel_id  uuid NOT NULL REFERENCES phaseforge.chat_channels(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES phaseforge.profiles(id) ON DELETE CASCADE,
  body        text NOT NULL,
  kind        text NOT NULL DEFAULT 'message' CHECK (kind IN ('message', 'update')),
  -- For an update mirrored into the Project updates feed: where it came from.
  project_id  uuid REFERENCES phaseforge.projects(id) ON DELETE SET NULL,
  source_message_id uuid REFERENCES phaseforge.chat_messages(id) ON DELETE SET NULL,
  mentions    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  edited_at   timestamptz,
  deleted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON phaseforge.chat_messages(channel_id, created_at DESC);
ALTER TABLE phaseforge.chat_messages REPLICA IDENTITY FULL;

-- A channel is visible to everyone in the company except direct messages,
-- which only their members see.
CREATE OR REPLACE FUNCTION phaseforge.chat_channel_visible(cid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = phaseforge AS $$
  SELECT EXISTS (
    SELECT 1 FROM phaseforge.chat_channels c
    WHERE c.id = cid AND c.company_id = phaseforge.get_my_company_id()
      AND (c.kind <> 'direct' OR EXISTS (
        SELECT 1 FROM phaseforge.chat_channel_members m WHERE m.channel_id = c.id AND m.profile_id = auth.uid()))
  )
$$;

ALTER TABLE phaseforge.chat_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_channels_select ON phaseforge.chat_channels;
CREATE POLICY chat_channels_select ON phaseforge.chat_channels FOR SELECT
  USING (phaseforge.chat_channel_visible(id));
DROP POLICY IF EXISTS chat_channels_insert ON phaseforge.chat_channels;
CREATE POLICY chat_channels_insert ON phaseforge.chat_channels FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id());
DROP POLICY IF EXISTS chat_channels_update ON phaseforge.chat_channels;
CREATE POLICY chat_channels_update ON phaseforge.chat_channels FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id() AND (created_by = auth.uid() OR phaseforge.ops_is_manager()));

ALTER TABLE phaseforge.chat_channel_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_members_select ON phaseforge.chat_channel_members;
CREATE POLICY chat_members_select ON phaseforge.chat_channel_members FOR SELECT
  USING (company_id = phaseforge.get_my_company_id());
DROP POLICY IF EXISTS chat_members_insert ON phaseforge.chat_channel_members;
CREATE POLICY chat_members_insert ON phaseforge.chat_channel_members FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id());
DROP POLICY IF EXISTS chat_members_update ON phaseforge.chat_channel_members;
CREATE POLICY chat_members_update ON phaseforge.chat_channel_members FOR UPDATE
  USING (profile_id = auth.uid());
DROP POLICY IF EXISTS chat_members_delete ON phaseforge.chat_channel_members;
CREATE POLICY chat_members_delete ON phaseforge.chat_channel_members FOR DELETE
  USING (profile_id = auth.uid());

ALTER TABLE phaseforge.chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_messages_select ON phaseforge.chat_messages;
CREATE POLICY chat_messages_select ON phaseforge.chat_messages FOR SELECT
  USING (phaseforge.chat_channel_visible(channel_id));
DROP POLICY IF EXISTS chat_messages_insert ON phaseforge.chat_messages;
CREATE POLICY chat_messages_insert ON phaseforge.chat_messages FOR INSERT
  WITH CHECK (author_id = auth.uid() AND company_id = phaseforge.get_my_company_id() AND phaseforge.chat_channel_visible(channel_id));
DROP POLICY IF EXISTS chat_messages_update ON phaseforge.chat_messages;
CREATE POLICY chat_messages_update ON phaseforge.chat_messages FOR UPDATE
  USING (author_id = auth.uid() OR phaseforge.ops_is_manager());

-- Live updates in the browser.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'phaseforge' AND tablename = 'chat_messages') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE phaseforge.chat_messages;
    END IF;
  END IF;
END $$;
