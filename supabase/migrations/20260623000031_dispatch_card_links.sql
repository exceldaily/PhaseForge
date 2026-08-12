SET search_path TO phaseforge, extensions;

-- Per-card manual hyperlinks for dispatch fields.
-- Example: { "sc_number": "https://...", "kalos_job_number": "https://..." }

ALTER TABLE phaseforge.dispatch_cards
  ADD COLUMN IF NOT EXISTS card_links jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN phaseforge.dispatch_cards.card_links IS
  'Manual per-card field hyperlinks keyed by dispatch card field key.';

NOTIFY pgrst, 'reload schema';
