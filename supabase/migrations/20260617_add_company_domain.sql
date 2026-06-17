-- Add domain column to companies table for duplicate prevention
ALTER TABLE companies ADD COLUMN domain TEXT UNIQUE;

-- Backfill domain from owner's email domain
UPDATE companies c
SET domain = LOWER(SUBSTRING(p.email FROM POSITION('@' IN p.email) + 1))
FROM profiles p
WHERE p.id = c.created_by AND c.domain IS NULL;

-- Create index for fast lookups
CREATE INDEX idx_companies_domain ON companies(domain) WHERE domain IS NOT NULL;
