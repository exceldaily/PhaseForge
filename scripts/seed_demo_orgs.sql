-- ============================================================================
-- DEV/STAGING ONLY — Demo Organization A & B seed + isolation verification
-- Do NOT run against production. Run in the Supabase SQL editor of a dev project.
-- ============================================================================

-- 1. Demo organizations
INSERT INTO public.companies (id, name, slug, plan) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Demo Organization A', 'demo-org-a', 'pro'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Demo Organization B', 'demo-org-b', 'pro')
ON CONFLICT (id) DO NOTHING;
-- (organization_modules rows are auto-seeded by trg_seed_org_modules)

-- 2. Enable all modules for both demo orgs
UPDATE public.organization_modules SET enabled = true
WHERE company_id IN ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002');

-- 3. Sample data for Org A
INSERT INTO public.customers (id, company_id, name, status, customer_type) VALUES
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Acme Grocery Group', 'active', 'commercial')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.locations (id, company_id, customer_id, name, location_number, city, state) VALUES
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-1111-0000-0000-000000000001', 'Acme Store 42', '42', 'Orlando', 'FL')
ON CONFLICT (id) DO NOTHING;

-- 4. Sample data for Org B
INSERT INTO public.customers (id, company_id, name, status, customer_type) VALUES
  ('bbbbbbbb-1111-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'Beta Facilities LLC', 'active', 'commercial')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- ISOLATION VERIFICATION (run each block as a user in the respective org)
-- Create one test user per org (Supabase Auth), set profiles.company_id, then:
--
-- As Org A user:
--   SELECT count(*) FROM customers;             -- expect 1 (only Acme)
--   SELECT count(*) FROM customers
--     WHERE company_id = 'bbbbbbbb-0000-0000-0000-000000000002'; -- expect 0
--   UPDATE customers SET name = 'hacked'
--     WHERE id = 'bbbbbbbb-1111-0000-0000-000000000001';          -- expect 0 rows
--   INSERT INTO customers (company_id, name)
--     VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'x');       -- expect RLS error
--
-- As Org B user: mirror the checks against Org A ids.
--
-- Module enforcement:
--   UPDATE organization_modules SET enabled = false
--     WHERE company_id = <org A> AND module_key = 'calls';
--   SELECT count(*) FROM calls;                  -- as Org A user: expect 0 rows (module gate)
--   Visiting /app/calls as Org A user must redirect to the dashboard.
--
-- Role enforcement (as ops_role = 'staff' user in Org A):
--   SELECT count(*) FROM calls;                  -- only assigned/created calls
--   SELECT count(*) FROM invoices;               -- expect 0 (no billing access)
-- ============================================================================
