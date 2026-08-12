SET search_path TO phaseforge, extensions;

-- Add billing fields to companies table for Stripe integration
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS billing_cycle_start DATE,
  ADD COLUMN IF NOT EXISTS billing_cycle_end DATE,
  ADD COLUMN IF NOT EXISTS billing_status TEXT DEFAULT 'active'; -- active | past_due | canceled

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_companies_stripe_customer_id
  ON companies(stripe_customer_id);

-- Create billing history table for invoice tracking
CREATE TABLE IF NOT EXISTS billing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT UNIQUE,
  amount_paid INTEGER, -- in cents
  currency TEXT DEFAULT 'usd',
  period_start DATE,
  period_end DATE,
  status TEXT, -- paid | draft | open | void | uncollectible
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for company billing history
CREATE INDEX IF NOT EXISTS idx_billing_history_company_id
  ON billing_history(company_id);

-- Add RLS policies for billing_history
ALTER TABLE billing_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company billing history"
  ON billing_history FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert billing history"
  ON billing_history FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update billing history"
  ON billing_history FOR UPDATE
  USING (true);
