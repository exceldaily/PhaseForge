-- ============================================================================
-- PhaseForge Operations — Multi-tenant foundation (ADDITIVE ONLY)
-- Organizations = existing public.companies rows. Everything here hangs off
-- company_id and never alters or removes existing data.
--
-- Rollback: see MIGRATION_AND_ROLLBACK.md (drops only objects created here).
-- ============================================================================

-- ─── 1. Operations roles ────────────────────────────────────────────────────
-- Additive column; legacy profiles.role keeps driving all existing features.
-- ops_role values: owner | admin | dispatcher | project_manager | billing | staff | read_only

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ops_role text;

UPDATE public.profiles SET ops_role = CASE role
    WHEN 'owner'   THEN 'owner'
    WHEN 'admin'   THEN 'admin'
    WHEN 'manager' THEN 'project_manager'
    WHEN 'member'  THEN 'staff'
    ELSE 'read_only'
  END
WHERE ops_role IS NULL;

CREATE OR REPLACE FUNCTION public.get_my_ops_role()
RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT ops_role FROM public.profiles WHERE id = auth.uid()),
    'read_only'
  )
$$;
GRANT EXECUTE ON FUNCTION public.get_my_ops_role() TO authenticated, anon;

-- Convenience predicates used across operations RLS policies
CREATE OR REPLACE FUNCTION public.ops_is_manager()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$ SELECT public.get_my_ops_role() IN ('owner','admin','dispatcher','project_manager') $$;
GRANT EXECUTE ON FUNCTION public.ops_is_manager() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.ops_is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$ SELECT public.get_my_ops_role() IN ('owner','admin') $$;
GRANT EXECUTE ON FUNCTION public.ops_is_admin() TO authenticated, anon;

-- ─── 2. Module entitlements ─────────────────────────────────────────────────
-- Module keys: customers | staff | vendors | calls | projects | files | invoices | reports

CREATE TABLE IF NOT EXISTS public.organization_modules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  module_key  text NOT NULL,
  enabled     boolean NOT NULL DEFAULT false,
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by  uuid REFERENCES public.profiles(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_org_modules_company ON public.organization_modules(company_id);

ALTER TABLE public.organization_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_modules_select" ON public.organization_modules FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "org_modules_insert" ON public.organization_modules FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.ops_is_admin());
CREATE POLICY "org_modules_update" ON public.organization_modules FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.ops_is_admin());
CREATE POLICY "org_modules_delete" ON public.organization_modules FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.ops_is_admin());

CREATE OR REPLACE FUNCTION public.org_has_module(p_module text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT enabled FROM public.organization_modules
      WHERE company_id = public.get_my_company_id() AND module_key = p_module),
    false
  )
$$;
GRANT EXECUTE ON FUNCTION public.org_has_module(text) TO authenticated, anon;

-- Legacy seeding: every existing company keeps projects + reports behavior it already had.
INSERT INTO public.organization_modules (company_id, module_key, enabled)
SELECT c.id, m.key, m.key IN ('projects','reports','files')
FROM public.companies c
CROSS JOIN (VALUES ('customers'),('staff'),('vendors'),('calls'),('projects'),
                   ('files'),('invoices'),('reports')) AS m(key)
ON CONFLICT (company_id, module_key) DO NOTHING;

-- New companies get the same defaults automatically.
CREATE OR REPLACE FUNCTION public.seed_org_modules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.organization_modules (company_id, module_key, enabled)
  SELECT NEW.id, m.key, m.key IN ('projects','reports','files')
  FROM (VALUES ('customers'),('staff'),('vendors'),('calls'),('projects'),
               ('files'),('invoices'),('reports')) AS m(key)
  ON CONFLICT (company_id, module_key) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_org_modules ON public.companies;
CREATE TRIGGER trg_seed_org_modules
AFTER INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.seed_org_modules();

-- ─── 3. Divisions ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.divisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#6366f1',
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_divisions_company ON public.divisions(company_id);

ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "divisions_select" ON public.divisions FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "divisions_write" ON public.divisions FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.ops_is_admin());
CREATE POLICY "divisions_update" ON public.divisions FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.ops_is_admin());
CREATE POLICY "divisions_delete" ON public.divisions FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.ops_is_admin());

-- ─── 4. Organization tags + polymorphic tag links ───────────────────────────

CREATE TABLE IF NOT EXISTS public.org_tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#64748b',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_org_tags_company ON public.org_tags(company_id);

ALTER TABLE public.org_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_tags_select" ON public.org_tags FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "org_tags_insert" ON public.org_tags FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.ops_is_manager());
CREATE POLICY "org_tags_update" ON public.org_tags FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.ops_is_manager());
CREATE POLICY "org_tags_delete" ON public.org_tags FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.ops_is_admin());

-- record_type values: customer | location | asset | staff | vendor | call | project | file | invoice
CREATE TABLE IF NOT EXISTS public.record_tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tag_id      uuid NOT NULL REFERENCES public.org_tags(id) ON DELETE CASCADE,
  record_type text NOT NULL,
  record_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tag_id, record_type, record_id)
);

CREATE INDEX IF NOT EXISTS idx_record_tags_record  ON public.record_tags(record_type, record_id);
CREATE INDEX IF NOT EXISTS idx_record_tags_company ON public.record_tags(company_id);

ALTER TABLE public.record_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "record_tags_select" ON public.record_tags FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "record_tags_insert" ON public.record_tags FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "record_tags_delete" ON public.record_tags FOR DELETE
  USING (company_id = public.get_my_company_id());

-- ─── 5. Saved views ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.saved_views (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE, -- NULL = shared org view
  page_key    text NOT NULL,      -- customers | locations | assets | staff | vendors | calls | files | invoices | projects | reports
  name        text NOT NULL,
  filters     jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_views_lookup ON public.saved_views(company_id, page_key);

ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved_views_select" ON public.saved_views FOR SELECT
  USING (company_id = public.get_my_company_id() AND (user_id IS NULL OR user_id = auth.uid()));
CREATE POLICY "saved_views_insert" ON public.saved_views FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id()
    AND (user_id = auth.uid() OR (user_id IS NULL AND public.ops_is_manager())));
CREATE POLICY "saved_views_update" ON public.saved_views FOR UPDATE
  USING (company_id = public.get_my_company_id()
    AND (user_id = auth.uid() OR (user_id IS NULL AND public.ops_is_manager())));
CREATE POLICY "saved_views_delete" ON public.saved_views FOR DELETE
  USING (company_id = public.get_my_company_id()
    AND (user_id = auth.uid() OR (user_id IS NULL AND public.ops_is_manager())));

-- ─── 6. Operations activity log (shared timeline for all operations records) ─

CREATE TABLE IF NOT EXISTS public.ops_activity (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES public.profiles(id),
  actor_name  text,
  record_type text NOT NULL,
  record_id   uuid NOT NULL,
  action      text NOT NULL,          -- created | updated | status_changed | note_added | assigned | file_added | ...
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_activity_record  ON public.ops_activity(record_type, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_activity_company ON public.ops_activity(company_id, created_at DESC);

ALTER TABLE public.ops_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops_activity_select" ON public.ops_activity FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "ops_activity_insert" ON public.ops_activity FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());
-- No update/delete policies: activity log is append-only for org members.

-- ─── 7. Organization call settings (terminology, statuses, card template) ────

CREATE TABLE IF NOT EXISTS public.org_call_settings (
  company_id     uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  terminology    text NOT NULL DEFAULT 'Calls',           -- Calls | Work Orders | Service Requests | Jobs
  template_kind  text NOT NULL DEFAULT 'commercial',      -- commercial | residential | construction
  statuses       jsonb NOT NULL DEFAULT '[
    {"key":"open","label":"Open","closed":false},
    {"key":"assigned","label":"Assigned","closed":false},
    {"key":"in_progress","label":"In Progress","closed":false},
    {"key":"waiting_vendor","label":"Waiting on Vendor","closed":false},
    {"key":"waiting_parts","label":"Waiting on Parts","closed":false},
    {"key":"waiting_customer","label":"Waiting on Customer","closed":false},
    {"key":"waiting_quote","label":"Waiting on Quote","closed":false},
    {"key":"follow_up","label":"Follow-Up Required","closed":false},
    {"key":"completed","label":"Completed","closed":true},
    {"key":"closed","label":"Closed","closed":true},
    {"key":"cancelled","label":"Cancelled","closed":true}
  ]'::jsonb,
  priorities     jsonb NOT NULL DEFAULT '[
    {"key":"low","label":"Low","color":"#94a3b8"},
    {"key":"normal","label":"Normal","color":"#38bdf8"},
    {"key":"high","label":"High","color":"#fb923c"},
    {"key":"emergency","label":"Emergency","color":"#ef4444"}
  ]'::jsonb,
  card_fields    jsonb NOT NULL DEFAULT '["customer","location","priority","status","assigned","due","sla","invoice_ready","unread"]'::jsonb,
  required_fields          jsonb NOT NULL DEFAULT '[]'::jsonb,  -- field keys required at creation
  required_closeout_fields jsonb NOT NULL DEFAULT '[]'::jsonb,  -- field keys required before completion
  require_completion_photo boolean NOT NULL DEFAULT false,
  default_view   text NOT NULL DEFAULT 'list',                  -- list | card | board
  use_divisions  boolean NOT NULL DEFAULT true,
  quick_actions  jsonb NOT NULL DEFAULT '["assign","status","note"]'::jsonb,
  -- Future external-system extension points (inert; no live integration)
  external_system_enabled boolean NOT NULL DEFAULT false,
  external_system_name    text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_call_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_call_settings_select" ON public.org_call_settings FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "org_call_settings_insert" ON public.org_call_settings FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.ops_is_admin());
CREATE POLICY "org_call_settings_update" ON public.org_call_settings FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.ops_is_admin());

-- ─── 8. Per-organization number sequences (calls, invoices) ──────────────────

CREATE TABLE IF NOT EXISTS public.org_counters (
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  counter_key text NOT NULL,           -- call | invoice
  next_value  bigint NOT NULL DEFAULT 1,
  PRIMARY KEY (company_id, counter_key)
);

ALTER TABLE public.org_counters ENABLE ROW LEVEL SECURITY;
-- No direct client access; consumed via SECURITY DEFINER function below.

CREATE OR REPLACE FUNCTION public.next_org_number(p_key text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company uuid := public.get_my_company_id();
  v_next bigint;
BEGIN
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No company for current user';
  END IF;
  INSERT INTO public.org_counters (company_id, counter_key, next_value)
  VALUES (v_company, p_key, 2)
  ON CONFLICT (company_id, counter_key)
  DO UPDATE SET next_value = public.org_counters.next_value + 1
  RETURNING CASE WHEN xmax = 0 THEN 1 ELSE next_value - 1 END INTO v_next;
  RETURN v_next;
END;
$$;
GRANT EXECUTE ON FUNCTION public.next_org_number(text) TO authenticated;
