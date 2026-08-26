-- Quote pricing (the "Pricing" section of Quotes).
--
-- The existing quote_requests flow ends when vendors reply. This picks up
-- there: read the vendor's quote PDF, keep its line items as COST, add labor /
-- travel / other expenses, and apply a markup to reach the price the customer
-- is given. Costs and sell prices are never collapsed into one number, so the
-- margin on a bid stays visible after the fact.

CREATE TABLE IF NOT EXISTS phaseforge.quote_pricings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES phaseforge.profiles(id) ON DELETE SET NULL,
  -- Optional link back to the RFQ this quote answers; a pricing sheet can also
  -- stand alone for work that never went through the request flow.
  quote_request_id uuid REFERENCES phaseforge.quote_requests(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES phaseforge.quote_vendors(id) ON DELETE SET NULL,
  project_id uuid REFERENCES phaseforge.projects(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Untitled quote',
  vendor_name text,
  quote_number text,
  job_number text,
  customer_name text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'won', 'lost')),
  default_markup_pct numeric(7,3) NOT NULL DEFAULT 20,
  tax_pct numeric(7,3) NOT NULL DEFAULT 0,
  -- What the vendor's own PDF said, kept for reconciliation against our lines.
  source_file_name text,
  source_total numeric(14,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS phaseforge.quote_price_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES phaseforge.companies(id) ON DELETE CASCADE,
  pricing_id uuid NOT NULL REFERENCES phaseforge.quote_pricings(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'material'
    CHECK (kind IN ('material', 'labor', 'travel', 'other')),
  description text NOT NULL DEFAULT '',
  qty numeric(14,4) NOT NULL DEFAULT 1,
  unit text,
  unit_cost numeric(14,4) NOT NULL DEFAULT 0,
  -- NULL means "use the sheet's default markup", which is what makes changing
  -- the default re-price every untouched line at once.
  markup_pct numeric(7,3),
  taxable boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quote_pricings_company_idx ON phaseforge.quote_pricings (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quote_pricings_request_idx ON phaseforge.quote_pricings (quote_request_id);
CREATE INDEX IF NOT EXISTS quote_price_lines_pricing_idx ON phaseforge.quote_price_lines (pricing_id, sort_order);

CREATE TRIGGER quote_pricings_updated BEFORE UPDATE ON phaseforge.quote_pricings
  FOR EACH ROW EXECUTE FUNCTION phaseforge.quotes_set_updated_at();
CREATE TRIGGER quote_price_lines_updated BEFORE UPDATE ON phaseforge.quote_price_lines
  FOR EACH ROW EXECUTE FUNCTION phaseforge.quotes_set_updated_at();

ALTER TABLE phaseforge.quote_pricings ENABLE ROW LEVEL SECURITY;
ALTER TABLE phaseforge.quote_price_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qp_company" ON phaseforge.quote_pricings FOR ALL
  USING (company_id = phaseforge.get_my_company_id()) WITH CHECK (company_id = phaseforge.get_my_company_id());
CREATE POLICY "qpl_company" ON phaseforge.quote_price_lines FOR ALL
  USING (company_id = phaseforge.get_my_company_id()) WITH CHECK (company_id = phaseforge.get_my_company_id());
