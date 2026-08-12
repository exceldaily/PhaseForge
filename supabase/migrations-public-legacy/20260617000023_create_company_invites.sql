-- Create company_invites table for pending email invites
CREATE TABLE company_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, expired
  token TEXT UNIQUE NOT NULL, -- random token for signup link
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(company_id, email) -- one invite per email per company
);

-- RLS: Users can only see invites for their company
ALTER TABLE company_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see invites for their company"
  ON company_invites FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Company owners can create invites"
  ON company_invites FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'owner'
  ));

CREATE POLICY "Only owners can update invite status"
  ON company_invites FOR UPDATE
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'owner'
  ));

-- Index for fast lookups by token (used during signup)
CREATE INDEX idx_company_invites_token ON company_invites(token);
CREATE INDEX idx_company_invites_email ON company_invites(email, status);
