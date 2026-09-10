SET search_path TO phaseforge, extensions;

-- Photos on chat messages: [{ path, name, type, size, width, height }] in the
-- project-attachments bucket under chat/<company>/<channel>/.
ALTER TABLE phaseforge.chat_messages ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
