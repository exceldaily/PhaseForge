-- ============================================================================
-- PhaseForge Operations — Calls / Work Orders (ADDITIVE)
-- Generalized from the DispatchForge UX reference (see DISPATCHFORGE_REFERENCE_AUDIT.md).
-- No Kalos data, no live external integrations — external_* columns are inert.
-- Requires: foundation + crm + workforce migrations.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.calls (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  call_number    bigint NOT NULL,                  -- per-org sequence via next_org_number('call')
  title          text NOT NULL,
  description    text,
  customer_id    uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  location_id    uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  asset_id       uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  division_id    uuid REFERENCES public.divisions(id) ON DELETE SET NULL,
  project_id     uuid REFERENCES public.projects(id) ON DELETE SET NULL,

  priority       text NOT NULL DEFAULT 'normal',   -- key into org_call_settings.priorities
  status         text NOT NULL DEFAULT 'open',     -- key into org_call_settings.statuses

  assigned_staff_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  vendor_id         uuid REFERENCES public.vendors(id) ON DELETE SET NULL,

  due_date       date,
  sla_at         timestamptz,                      -- SLA target date/time
  appointment_start timestamptz,                   -- residential appointment window
  appointment_end   timestamptz,
  completed_at   timestamptz,
  closed_at      timestamptz,

  invoice_ready  boolean NOT NULL DEFAULT false,
  invoice_id     uuid,                             -- FK added in invoices migration

  completion_notes  text,
  service_type      text,                          -- residential template: service type
  estimate_status   text,                          -- residential: none | requested | sent | approved
  payment_status    text,                          -- residential: none | unpaid | paid (informational only)

  source         text NOT NULL DEFAULT 'manual',   -- manual | import (future: email, api)

  -- Unread/update alert mechanics (yellow highlight): compare against call_reads
  last_note_at      timestamptz,
  last_activity_at  timestamptz NOT NULL DEFAULT now(),

  -- Future external-system extension points (inert placeholders; no live integration)
  external_enabled        boolean NOT NULL DEFAULT false,
  external_work_order_id  text,
  external_tracking_number text,
  external_link           text,
  external_status         text,
  external_tech_name      text,
  external_updated_at     timestamptz,
  external_has_new_note   boolean NOT NULL DEFAULT false,
  external_has_attachment boolean NOT NULL DEFAULT false,
  external_checkin_state  text,

  created_by     uuid REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, call_number)
);

CREATE INDEX IF NOT EXISTS idx_calls_company        ON public.calls(company_id);
CREATE INDEX IF NOT EXISTS idx_calls_status         ON public.calls(company_id, status);
CREATE INDEX IF NOT EXISTS idx_calls_priority       ON public.calls(company_id, priority);
CREATE INDEX IF NOT EXISTS idx_calls_customer       ON public.calls(customer_id);
CREATE INDEX IF NOT EXISTS idx_calls_location       ON public.calls(location_id);
CREATE INDEX IF NOT EXISTS idx_calls_asset          ON public.calls(asset_id);
CREATE INDEX IF NOT EXISTS idx_calls_division       ON public.calls(division_id);
CREATE INDEX IF NOT EXISTS idx_calls_project        ON public.calls(project_id);
CREATE INDEX IF NOT EXISTS idx_calls_assigned_staff ON public.calls(assigned_staff_id);
CREATE INDEX IF NOT EXISTS idx_calls_vendor         ON public.calls(vendor_id);
CREATE INDEX IF NOT EXISTS idx_calls_due            ON public.calls(company_id, due_date);
CREATE INDEX IF NOT EXISTS idx_calls_sla            ON public.calls(company_id, sla_at);
CREATE INDEX IF NOT EXISTS idx_calls_created        ON public.calls(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_invoice_ready  ON public.calls(company_id, invoice_ready) WHERE invoice_ready;

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- Staff/read-only see only their own or assigned calls; dispatcher+ and billing see all org calls.
CREATE POLICY "calls_select" ON public.calls FOR SELECT
  USING (company_id = public.get_my_company_id() AND public.org_has_module('calls')
    AND (
      public.get_my_ops_role() IN ('owner','admin','dispatcher','project_manager','billing')
      OR assigned_staff_id = auth.uid()
      OR created_by = auth.uid()
    ));

CREATE POLICY "calls_insert" ON public.calls FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.org_has_module('calls')
    AND public.get_my_ops_role() IN ('owner','admin','dispatcher','project_manager','staff'));

-- Staff may update calls assigned to them (status/notes/completion); managers update any.
CREATE POLICY "calls_update" ON public.calls FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('calls')
    AND (public.ops_is_manager() OR assigned_staff_id = auth.uid()));

CREATE POLICY "calls_delete" ON public.calls FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.org_has_module('calls')
    AND public.ops_is_admin());

-- ─── call_notes (categorized timeline, mirrors DispatchForge note categories) ─

CREATE TABLE IF NOT EXISTS public.call_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  call_id     uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  author_id   uuid REFERENCES public.profiles(id),
  author_name text,
  category    text NOT NULL DEFAULT 'internal',   -- internal | customer | vendor | parts | scheduling | quote | completion
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_notes_call    ON public.call_notes(call_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_notes_company ON public.call_notes(company_id);

ALTER TABLE public.call_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "call_notes_select" ON public.call_notes FOR SELECT
  USING (company_id = public.get_my_company_id() AND public.org_has_module('calls')
    AND call_id IN (SELECT id FROM public.calls));   -- inherits call visibility via calls RLS
CREATE POLICY "call_notes_insert" ON public.call_notes FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.org_has_module('calls')
    AND author_id = auth.uid());
CREATE POLICY "call_notes_delete" ON public.call_notes FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.ops_is_admin());

-- Keep calls.last_note_at / last_activity_at fresh for cheap unread checks.
CREATE OR REPLACE FUNCTION public.touch_call_on_note()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.calls
     SET last_note_at = NEW.created_at,
         last_activity_at = NEW.created_at,
         updated_at = NEW.created_at
   WHERE id = NEW.call_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_call_on_note ON public.call_notes;
CREATE TRIGGER trg_touch_call_on_note
AFTER INSERT ON public.call_notes
FOR EACH ROW EXECUTE FUNCTION public.touch_call_on_note();

-- ─── call_reads (per-user unread tracking → yellow "new update" highlight) ───

CREATE TABLE IF NOT EXISTS public.call_reads (
  call_id      uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (call_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_call_reads_user ON public.call_reads(user_id);

ALTER TABLE public.call_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "call_reads_select" ON public.call_reads FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "call_reads_upsert" ON public.call_reads FOR INSERT
  WITH CHECK (user_id = auth.uid() AND company_id = public.get_my_company_id());
CREATE POLICY "call_reads_update" ON public.call_reads FOR UPDATE
  USING (user_id = auth.uid());

-- ─── note templates (No-AI smart tools: reusable canned notes) ───────────────

CREATE TABLE IF NOT EXISTS public.note_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  division_id uuid REFERENCES public.divisions(id) ON DELETE SET NULL,
  scope       text NOT NULL DEFAULT 'call',   -- call | project | vendor | completion | quote | status_update | invoice
  name        text NOT NULL,
  body        text NOT NULL,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_note_templates_company ON public.note_templates(company_id, scope);

ALTER TABLE public.note_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "note_templates_select" ON public.note_templates FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "note_templates_insert" ON public.note_templates FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.ops_is_manager());
CREATE POLICY "note_templates_update" ON public.note_templates FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.ops_is_manager());
CREATE POLICY "note_templates_delete" ON public.note_templates FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.ops_is_manager());
