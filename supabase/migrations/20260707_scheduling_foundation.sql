-- ============================================================================
-- Scheduling & Calendar foundation (ADDITIVE ONLY)
-- Superintendent directory, SCH schedule labels w/ calendar mappings,
-- per-org Google Calendar connections (tokens server-side only),
-- event links w/ revision tracking, inbound pending-change review queue,
-- structured job location + job number + quick links on projects.
-- ============================================================================

-- ─── Superintendent directory ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.superintendents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name           text NOT NULL,
  email          text,
  phone          text,
  company_name   text,
  is_active      boolean NOT NULL DEFAULT true,
  default_color  text,
  gcal_email     text,               -- Google Calendar attendee/routing email
  gcal_calendar_id text,             -- default destination calendar (Superintendent mode)
  default_label_ids uuid[] NOT NULL DEFAULT '{}',  -- default SCH labels
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_superintendents_company ON public.superintendents(company_id, is_active);
ALTER TABLE public.superintendents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superintendents_select" ON public.superintendents FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "superintendents_write" ON public.superintendents FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.ops_is_manager());
CREATE POLICY "superintendents_update" ON public.superintendents FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.ops_is_manager());
CREATE POLICY "superintendents_delete" ON public.superintendents FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.ops_is_admin());

-- ─── SCH schedule labels (mappings, not just visual tags) ────────────────────
CREATE TABLE IF NOT EXISTS public.schedule_labels (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name           text NOT NULL,                 -- e.g. "SCH - John Smith"
  color          text NOT NULL DEFAULT '#6366f1',
  gcal_calendar_id text,                        -- optional destination calendar
  gcal_color_id  text,                          -- Google event colorId (1-11)
  gcal_attendee_email text,                     -- optional attendee to add
  board_marker   text,                          -- optional short card marker
  superintendent_id uuid REFERENCES public.superintendents(id) ON DELETE SET NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
CREATE INDEX IF NOT EXISTS idx_schedule_labels_company ON public.schedule_labels(company_id, is_active);
ALTER TABLE public.schedule_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedule_labels_select" ON public.schedule_labels FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "schedule_labels_write" ON public.schedule_labels FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.ops_is_manager());
CREATE POLICY "schedule_labels_update" ON public.schedule_labels FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.ops_is_manager());
CREATE POLICY "schedule_labels_delete" ON public.schedule_labels FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.ops_is_admin());

-- ─── Google Calendar connection (per org; tokens NEVER reach the browser) ────
CREATE TABLE IF NOT EXISTS public.gcal_connections (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connected_by   uuid REFERENCES public.profiles(id),
  account_email  text,
  -- AES-256-GCM ciphertext (base64) of refresh token; key = GOOGLE_TOKEN_ENC_KEY env
  refresh_token_enc text,
  access_token_enc  text,
  access_token_expires_at timestamptz,
  target_calendar_id   text,                    -- selected calendar
  target_calendar_name text,
  routing_mode   text NOT NULL DEFAULT 'shared',  -- shared | superintendent
  is_active      boolean NOT NULL DEFAULT true,
  last_sync_at   timestamptz,
  last_success_at timestamptz,
  last_error     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);
ALTER TABLE public.gcal_connections ENABLE ROW LEVEL SECURITY;
-- Admins can see connection STATUS. Token columns are still returned by RLS
-- select for admins; server actions must NEVER select the *_enc columns for
-- display, and the anon/browser client never holds the decryption key, so
-- ciphertext is useless client-side. Writes are admin-only.
CREATE POLICY "gcal_connections_select" ON public.gcal_connections FOR SELECT
  USING (company_id = public.get_my_company_id() AND public.ops_is_admin());
CREATE POLICY "gcal_connections_write" ON public.gcal_connections FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.ops_is_admin());
CREATE POLICY "gcal_connections_update" ON public.gcal_connections FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.ops_is_admin());
CREATE POLICY "gcal_connections_delete" ON public.gcal_connections FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.ops_is_admin());

-- ─── Linked calendar events (phase ↔ Google event) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.gcal_event_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id  uuid NOT NULL REFERENCES public.gcal_connections(id) ON DELETE CASCADE,
  project_id     uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_id       uuid REFERENCES public.phases(id) ON DELETE CASCADE,
  gcal_calendar_id text NOT NULL,
  gcal_event_id  text NOT NULL,
  sync_enabled   boolean NOT NULL DEFAULT true,
  pf_revision    integer NOT NULL DEFAULT 1,    -- bumped on each PF-side push
  gcal_etag      text,                          -- last seen Google etag
  gcal_updated_at timestamptz,                  -- last seen Google updated time
  last_pushed_at timestamptz,
  last_pulled_at timestamptz,
  status         text NOT NULL DEFAULT 'linked',  -- linked | detached | event_deleted | error
  last_error     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, gcal_event_id)
);
CREATE INDEX IF NOT EXISTS idx_gcal_links_phase ON public.gcal_event_links(phase_id);
CREATE INDEX IF NOT EXISTS idx_gcal_links_company ON public.gcal_event_links(company_id, status);
ALTER TABLE public.gcal_event_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcal_links_select" ON public.gcal_event_links FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "gcal_links_write" ON public.gcal_event_links FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.ops_is_manager());
CREATE POLICY "gcal_links_update" ON public.gcal_event_links FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.ops_is_manager());
CREATE POLICY "gcal_links_delete" ON public.gcal_event_links FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.ops_is_manager());

-- ─── Inbound change review queue (Google → PhaseForge, non-date fields) ──────
CREATE TABLE IF NOT EXISTS public.gcal_pending_changes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  link_id        uuid NOT NULL REFERENCES public.gcal_event_links(id) ON DELETE CASCADE,
  change_type    text NOT NULL,                 -- title | location | description | deleted | conflict
  gcal_value     jsonb NOT NULL DEFAULT '{}'::jsonb,
  pf_value       jsonb NOT NULL DEFAULT '{}'::jsonb,
  status         text NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected
  resolved_by    uuid REFERENCES public.profiles(id),
  resolved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gcal_pending_company ON public.gcal_pending_changes(company_id, status);
ALTER TABLE public.gcal_pending_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcal_pending_select" ON public.gcal_pending_changes FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "gcal_pending_write" ON public.gcal_pending_changes FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "gcal_pending_update" ON public.gcal_pending_changes FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.ops_is_manager());

-- ─── Project fields: job number, structured location, quick links, SCH ──────
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS job_number text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS store_site_id text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS superintendent_id uuid REFERENCES public.superintendents(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS formatted_address text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS place_id text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS maps_url text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS quick_links jsonb NOT NULL DEFAULT '[]'::jsonb;  -- [{label,url,kind}]
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS schedule_label_ids uuid[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_projects_job_number ON public.projects(company_id, job_number);
CREATE INDEX IF NOT EXISTS idx_projects_superintendent ON public.projects(superintendent_id);

-- ─── Phase fields: sync + overrides ──────────────────────────────────────────
ALTER TABLE public.phases ADD COLUMN IF NOT EXISTS sync_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.phases ADD COLUMN IF NOT EXISTS superintendent_id uuid REFERENCES public.superintendents(id) ON DELETE SET NULL;
ALTER TABLE public.phases ADD COLUMN IF NOT EXISTS schedule_label_ids uuid[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_phases_superintendent ON public.phases(superintendent_id);

-- Per-phase calendar skip days (e.g. {FR,SA,SU} = phase not shown Fri-Sun)
ALTER TABLE public.phases ADD COLUMN IF NOT EXISTS gcal_skip_days text[] NOT NULL DEFAULT '{}';
