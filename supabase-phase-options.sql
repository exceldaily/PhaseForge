-- Shared saved phase type and trade / role options for each company

CREATE TABLE IF NOT EXISTS company_phase_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('phase_type', 'trade')),
  value TEXT NOT NULL,
  normalized_value TEXT GENERATED ALWAYS AS (
    lower(regexp_replace(btrim(value), '[[:space:]]+', ' ', 'g'))
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, kind, normalized_value)
);

ALTER TABLE company_phase_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_phase_options_select" ON company_phase_options;
CREATE POLICY "company_phase_options_select" ON company_phase_options
  FOR SELECT
  USING (company_id = get_my_company_id());

DROP POLICY IF EXISTS "company_phase_options_insert" ON company_phase_options;
CREATE POLICY "company_phase_options_insert" ON company_phase_options
  FOR INSERT
  WITH CHECK (company_id = get_my_company_id());

DROP POLICY IF EXISTS "company_phase_options_update" ON company_phase_options;
CREATE POLICY "company_phase_options_update" ON company_phase_options
  FOR UPDATE
  USING (company_id = get_my_company_id());

DROP POLICY IF EXISTS "company_phase_options_delete" ON company_phase_options;
CREATE POLICY "company_phase_options_delete" ON company_phase_options
  FOR DELETE
  USING (company_id = get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_company_phase_options_company_kind
  ON company_phase_options(company_id, kind);
