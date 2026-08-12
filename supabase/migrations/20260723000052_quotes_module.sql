SET search_path TO phaseforge, extensions;

-- Quotes module: tech RFQ form intake → vendor quote outreach → reply tracking.
-- Ported from InboxFlow, re-scoped to PhaseForge companies. Emails send from
-- EACH USER'S OWN Gmail (per-user OAuth), never a shared org account.

CREATE OR REPLACE FUNCTION phaseforge.quotes_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Per-user Gmail connection used ONLY for sending quote inquiries the user
-- explicitly composes, reading their signature, and checking vendor replies.
-- Tokens are AES-256-GCM encrypted (GOOGLE_TOKEN_ENC_KEY) and RLS-locked to
-- the owner: not even org admins can read another member's tokens.
CREATE TABLE IF NOT EXISTS phaseforge.user_gmail_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES phaseforge.profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  account_email text,
  access_token_enc text NOT NULL,
  refresh_token_enc text,
  access_token_expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  email_signature text,          -- HTML signature appended to outgoing quotes
  is_active boolean NOT NULL DEFAULT true,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The vendor list quote inquiries go out to (company-shared).
CREATE TABLE IF NOT EXISTS phaseforge.quote_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  trade_type text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, email)
);

-- One row per tech RFQ form (attached PDF or pasted text).
CREATE TABLE IF NOT EXISTS phaseforge.quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'intake'
    CHECK (status IN ('intake', 'ready', 'sent', 'quoted', 'closed')),
  po_number text,
  order_type text,
  trade text,
  tech_name text,
  job_number text,
  store_number text,
  request_type text,
  items_text text NOT NULL DEFAULT '',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Per-vendor outreach on a quote: what went out (and from whom), what came back.
CREATE TABLE IF NOT EXISTS phaseforge.quote_vendor_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  quote_request_id uuid NOT NULL REFERENCES phaseforge.quote_requests(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES phaseforge.quote_vendors(id) ON DELETE CASCADE,
  sent_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'replied')),
  gmail_message_id text,
  gmail_thread_id text,
  sent_at timestamptz,
  replied_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quote_request_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS quote_vendors_company_idx ON phaseforge.quote_vendors (company_id);
CREATE INDEX IF NOT EXISTS quote_requests_company_status_idx ON phaseforge.quote_requests (company_id, status);
CREATE INDEX IF NOT EXISTS quote_sends_company_idx ON phaseforge.quote_vendor_sends (company_id);
CREATE INDEX IF NOT EXISTS quote_sends_quote_idx ON phaseforge.quote_vendor_sends (quote_request_id);

CREATE TRIGGER user_gmail_accounts_updated BEFORE UPDATE ON phaseforge.user_gmail_accounts
  FOR EACH ROW EXECUTE FUNCTION phaseforge.quotes_set_updated_at();
CREATE TRIGGER quote_vendors_updated BEFORE UPDATE ON phaseforge.quote_vendors
  FOR EACH ROW EXECUTE FUNCTION phaseforge.quotes_set_updated_at();
CREATE TRIGGER quote_requests_updated BEFORE UPDATE ON phaseforge.quote_requests
  FOR EACH ROW EXECUTE FUNCTION phaseforge.quotes_set_updated_at();
CREATE TRIGGER quote_vendor_sends_updated BEFORE UPDATE ON phaseforge.quote_vendor_sends
  FOR EACH ROW EXECUTE FUNCTION phaseforge.quotes_set_updated_at();

ALTER TABLE phaseforge.user_gmail_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE phaseforge.quote_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE phaseforge.quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE phaseforge.quote_vendor_sends ENABLE ROW LEVEL SECURITY;

-- Tokens: strictly personal.
CREATE POLICY "uga_own" ON phaseforge.user_gmail_accounts FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Quotes data: shared across the company.
CREATE POLICY "qv_company" ON phaseforge.quote_vendors FOR ALL
  USING (company_id = phaseforge.get_my_company_id()) WITH CHECK (company_id = phaseforge.get_my_company_id());
CREATE POLICY "qr_company" ON phaseforge.quote_requests FOR ALL
  USING (company_id = phaseforge.get_my_company_id()) WITH CHECK (company_id = phaseforge.get_my_company_id());
CREATE POLICY "qvs_company" ON phaseforge.quote_vendor_sends FOR ALL
  USING (company_id = phaseforge.get_my_company_id()) WITH CHECK (company_id = phaseforge.get_my_company_id());
