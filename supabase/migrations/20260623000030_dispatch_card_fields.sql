SET search_path TO phaseforge, extensions;

-- Board-level dispatch card field configuration.
-- Existing boards fall back in app code; this stores custom labels, visibility,
-- and optional URL templates for fields such as Tracking # and Job #.

ALTER TABLE phaseforge.dispatch_boards
  ADD COLUMN IF NOT EXISTS card_fields jsonb;

COMMENT ON COLUMN phaseforge.dispatch_boards.card_fields IS
  'Ordered dispatch card field config: [{ key, label, visible, required, link_template }]';

NOTIFY pgrst, 'reload schema';
