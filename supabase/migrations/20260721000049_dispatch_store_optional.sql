SET search_path TO phaseforge, extensions;

-- Dispatch calls: store becomes optional (customer-only calls) and calls carry
-- their own customer_id. Adds per-org hiding of optional built-in form fields
-- (rack/circuit/case). APPLIED LIVE 2026-07-21.

ALTER TABLE phaseforge.dispatch_service_calls ALTER COLUMN store_id DROP NOT NULL;
ALTER TABLE phaseforge.dispatch_service_calls
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES phaseforge.customers(id) ON DELETE SET NULL;
UPDATE phaseforge.dispatch_service_calls c SET customer_id = s.customer_id
  FROM phaseforge.dispatch_stores s WHERE c.store_id = s.id AND c.customer_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_dp_calls_customer ON phaseforge.dispatch_service_calls(customer_id);

CREATE TABLE IF NOT EXISTS phaseforge.dispatch_company_settings (
  company_id uuid PRIMARY KEY REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  hidden_builtin_fields text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE phaseforge.dispatch_company_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dp_settings_all" ON phaseforge.dispatch_company_settings;
CREATE POLICY "dp_settings_all" ON phaseforge.dispatch_company_settings FOR ALL
  USING (company_id = phaseforge.get_my_company_id())
  WITH CHECK (company_id = phaseforge.get_my_company_id());
