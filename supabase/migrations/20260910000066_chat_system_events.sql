SET search_path TO phaseforge, extensions;

-- System posts in chat: change order moves, board card moves, and weekly
-- schedules. kind 'system' marks them; event holds the structured card
-- (type, labels, links, schedule rows) and body keeps a plain-text version
-- for previews and notifications.
ALTER TABLE phaseforge.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_kind_check;
ALTER TABLE phaseforge.chat_messages ADD CONSTRAINT chat_messages_kind_check CHECK (kind IN ('message', 'update', 'system'));
ALTER TABLE phaseforge.chat_messages ADD COLUMN IF NOT EXISTS event jsonb;
