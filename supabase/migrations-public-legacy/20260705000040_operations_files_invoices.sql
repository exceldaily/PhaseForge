-- ============================================================================
-- PhaseForge Operations — Files metadata + Invoice-ready workflow (ADDITIVE)
-- Files: org-scoped metadata over Supabase Storage bucket 'org-files'.
-- Invoices: draft → PDF-ready workflow only. No payments, no accounting.
-- Requires: foundation + crm + calls migrations.
-- ============================================================================

-- ─── org_files (hybrid file library + polymorphic record attachment) ─────────

CREATE TABLE IF NOT EXISTS public.org_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  storage_path text NOT NULL,        -- org-files/{company_id}/{record_type}/{uuid}-{name}
  file_name    text NOT NULL,
  mime_type    text,
  size_bytes   bigint,
  -- Polymorphic link (NULL record = company library file)
  record_type  text,                 -- customer | location | asset | call | project | vendor | invoice
  record_id    uuid,
  -- Denormalized quick-filter links
  customer_id  uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  location_id  uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  uploaded_by  uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_files_company  ON public.org_files(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_files_record   ON public.org_files(record_type, record_id);
CREATE INDEX IF NOT EXISTS idx_org_files_customer ON public.org_files(customer_id);
CREATE INDEX IF NOT EXISTS idx_org_files_uploader ON public.org_files(uploaded_by);

ALTER TABLE public.org_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_files_select" ON public.org_files FOR SELECT
  USING (company_id = public.get_my_company_id() AND public.org_has_module('files'));
CREATE POLICY "org_files_insert" ON public.org_files FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.org_has_module('files')
    AND uploaded_by = auth.uid());
CREATE POLICY "org_files_update" ON public.org_files FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('files')
    AND (public.ops_is_manager() OR uploaded_by = auth.uid()));
CREATE POLICY "org_files_delete" ON public.org_files FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('files')
    AND (public.ops_is_manager() OR uploaded_by = auth.uid()));

-- Storage bucket + policies (idempotent). Path convention keeps orgs isolated:
--   org-files/{company_id}/...
INSERT INTO storage.buckets (id, name, public)
VALUES ('org-files', 'org-files', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                 AND policyname='org_files_storage_select') THEN
    CREATE POLICY "org_files_storage_select" ON storage.objects FOR SELECT
      USING (bucket_id = 'org-files'
        AND (storage.foldername(name))[1] = public.get_my_company_id()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                 AND policyname='org_files_storage_insert') THEN
    CREATE POLICY "org_files_storage_insert" ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'org-files'
        AND (storage.foldername(name))[1] = public.get_my_company_id()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                 AND policyname='org_files_storage_delete') THEN
    CREATE POLICY "org_files_storage_delete" ON storage.objects FOR DELETE
      USING (bucket_id = 'org-files'
        AND (storage.foldername(name))[1] = public.get_my_company_id()::text);
  END IF;
END $$;

-- ─── invoices ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invoices (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_number     bigint NOT NULL,           -- per-org sequence via next_org_number('invoice')
  customer_id        uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  billing_contact_id uuid REFERENCES public.customer_contacts(id) ON DELETE SET NULL,
  project_id         uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'draft',  -- draft | ready | sent | paid | overdue | void
  issue_date         date,
  due_date           date,
  notes              text,
  terms              text,
  payment_reference  text,                      -- manual reference only; no processing
  currency           text NOT NULL DEFAULT 'USD',
  -- Future payment integration abstraction (inert)
  payment_provider   text,
  payment_external_id text,
  created_by         uuid REFERENCES public.profiles(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_company  ON public.invoices(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status   ON public.invoices(company_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due      ON public.invoices(company_id, due_date);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
-- Billing, admin, owner manage invoices; PM/dispatcher read; staff no access.
CREATE POLICY "invoices_select" ON public.invoices FOR SELECT
  USING (company_id = public.get_my_company_id() AND public.org_has_module('invoices')
    AND public.get_my_ops_role() IN ('owner','admin','billing','project_manager','dispatcher'));
CREATE POLICY "invoices_insert" ON public.invoices FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.org_has_module('invoices')
    AND public.get_my_ops_role() IN ('owner','admin','billing'));
CREATE POLICY "invoices_update" ON public.invoices FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('invoices')
    AND public.get_my_ops_role() IN ('owner','admin','billing'));
CREATE POLICY "invoices_delete" ON public.invoices FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('invoices')
    AND public.ops_is_admin());

-- ─── invoice_items ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id  uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity    numeric(12,2) NOT NULL DEFAULT 1,
  unit_price  numeric(12,2) NOT NULL DEFAULT 0,
  call_id     uuid REFERENCES public.calls(id) ON DELETE SET NULL,     -- source work
  project_id  uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_call    ON public.invoice_items(call_id);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice_items_select" ON public.invoice_items FOR SELECT
  USING (company_id = public.get_my_company_id() AND public.org_has_module('invoices')
    AND public.get_my_ops_role() IN ('owner','admin','billing','project_manager','dispatcher'));
CREATE POLICY "invoice_items_write" ON public.invoice_items FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.org_has_module('invoices')
    AND public.get_my_ops_role() IN ('owner','admin','billing'));
CREATE POLICY "invoice_items_update" ON public.invoice_items FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('invoices')
    AND public.get_my_ops_role() IN ('owner','admin','billing'));
CREATE POLICY "invoice_items_delete" ON public.invoice_items FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('invoices')
    AND public.get_my_ops_role() IN ('owner','admin','billing'));

-- Late FK: calls.invoice_id → invoices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'calls_invoice_fk'
  ) THEN
    ALTER TABLE public.calls
      ADD CONSTRAINT calls_invoice_fk
      FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_calls_invoice ON public.calls(invoice_id);

-- ─── project operations links (organization-enable existing projects) ────────

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.divisions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_customer ON public.projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_location ON public.projects(location_id);
CREATE INDEX IF NOT EXISTS idx_projects_division ON public.projects(division_id);
