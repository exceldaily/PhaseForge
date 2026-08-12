SET search_path TO phaseforge, extensions;

-- Gmail intake config for Dispatch boards

-- card_fields stores per-board field customization as JSONB
ALTER TABLE phaseforge.dispatch_boards ADD COLUMN IF NOT EXISTS card_fields jsonb;

-- gmail_label is the Gmail label name users apply to emails they want ingested
-- e.g. 'Dispatch/Sprouts' or 'Dispatch/ALDI'
ALTER TABLE phaseforge.dispatch_boards ADD COLUMN IF NOT EXISTS gmail_label text;

-- gmail_default_column_id: which column new email-created cards land in
ALTER TABLE phaseforge.dispatch_boards ADD COLUMN IF NOT EXISTS gmail_default_column_id uuid REFERENCES phaseforge.dispatch_columns(id) ON DELETE SET NULL;

-- ─── dispatch_gmail_config ───────────────────────────────────────────────────
-- One row per company; stores the OAuth tokens for the Gmail account to poll.

CREATE TABLE IF NOT EXISTS phaseforge.dispatch_gmail_config (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  gmail_account    text NOT NULL,
  refresh_token    text NOT NULL,
  access_token     text,
  token_expires_at timestamptz,
  last_synced_at   timestamptz,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE phaseforge.dispatch_gmail_config ENABLE ROW LEVEL SECURITY;

-- Only owners/admins can manage Gmail config
CREATE POLICY "dispatch_gmail_config_select" ON phaseforge.dispatch_gmail_config FOR SELECT
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch()
    AND phaseforge.get_my_role() IN ('owner','admin'));

CREATE POLICY "dispatch_gmail_config_upsert" ON phaseforge.dispatch_gmail_config FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch()
    AND phaseforge.get_my_role() IN ('owner','admin'));

CREATE POLICY "dispatch_gmail_config_update" ON phaseforge.dispatch_gmail_config FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.company_has_dispatch()
    AND phaseforge.get_my_role() IN ('owner','admin'));

NOTIFY pgrst, 'reload schema';
