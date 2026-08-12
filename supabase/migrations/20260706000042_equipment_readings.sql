SET search_path TO phaseforge, extensions;

-- ============================================================================
-- PhaseForge Operations — Equipment readings / service history (ADDITIVE)
-- Techs record trade-specific readings (HVAC pressures, electrical amps, ...)
-- against an asset, optionally from a call. Photos attach via org_files with
-- record_type = 'asset_reading'. Reading field sets are per-trade, with
-- sensible defaults in code and per-org overrides in reading_templates.
-- ============================================================================

CREATE TABLE IF NOT EXISTS phaseforge.asset_readings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  asset_id       uuid NOT NULL REFERENCES phaseforge.assets(id) ON DELETE CASCADE,
  call_id        uuid REFERENCES phaseforge.calls(id) ON DELETE SET NULL,
  trade_category text,                                -- hvac | refrigeration | electrical | plumbing | general
  readings       jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { "suction_psi": "68", "supply_temp_f": "54", ... }
  notes          text,
  recorded_by    uuid REFERENCES phaseforge.profiles(id),
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_readings_asset   ON phaseforge.asset_readings(asset_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_readings_call    ON phaseforge.asset_readings(call_id);
CREATE INDEX IF NOT EXISTS idx_asset_readings_company ON phaseforge.asset_readings(company_id, recorded_at DESC);

ALTER TABLE phaseforge.asset_readings ENABLE ROW LEVEL SECURITY;

-- Everyone in the org with the customers module can view service history.
CREATE POLICY "asset_readings_select" ON phaseforge.asset_readings FOR SELECT
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('customers'));

-- Any active role that works calls can record readings (incl. staff/technicians).
CREATE POLICY "asset_readings_insert" ON phaseforge.asset_readings FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('customers')
    AND recorded_by = auth.uid()
    AND phaseforge.get_my_ops_role() IN ('owner','admin','dispatcher','project_manager','staff'));

-- Author can correct their own entry; managers can correct any.
CREATE POLICY "asset_readings_update" ON phaseforge.asset_readings FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.org_has_module('customers')
    AND (phaseforge.ops_is_manager() OR recorded_by = auth.uid()));

CREATE POLICY "asset_readings_delete" ON phaseforge.asset_readings FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_admin());

-- ─── Per-org reading template overrides (defaults live in code) ─────────────

CREATE TABLE IF NOT EXISTS phaseforge.reading_templates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  trade_category text NOT NULL,
  name           text NOT NULL,
  fields         jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{ "key","label","unit","type" }]
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, trade_category, name)
);

CREATE INDEX IF NOT EXISTS idx_reading_templates_company ON phaseforge.reading_templates(company_id, trade_category);

ALTER TABLE phaseforge.reading_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reading_templates_select" ON phaseforge.reading_templates FOR SELECT
  USING (company_id = phaseforge.get_my_company_id());
CREATE POLICY "reading_templates_insert" ON phaseforge.reading_templates FOR INSERT
  WITH CHECK (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_manager());
CREATE POLICY "reading_templates_update" ON phaseforge.reading_templates FOR UPDATE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_manager());
CREATE POLICY "reading_templates_delete" ON phaseforge.reading_templates FOR DELETE
  USING (company_id = phaseforge.get_my_company_id() AND phaseforge.ops_is_admin());
