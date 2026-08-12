CREATE SCHEMA IF NOT EXISTS phaseforge;
SET search_path TO phaseforge, extensions;

-- ============================================================
-- GANTTIC — Supabase Schema
-- Paste this entire file into: Supabase Dashboard > SQL Editor > Run
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- COMPANIES
-- ============================================================
CREATE TABLE companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  logo_url    TEXT,
  plan        TEXT DEFAULT 'free',
  created_by  UUID,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id   UUID REFERENCES companies(id) ON DELETE SET NULL,
  full_name    TEXT NOT NULL DEFAULT '',
  avatar_url   TEXT,
  role         TEXT NOT NULL DEFAULT 'viewer',
  job_title    TEXT,
  email        TEXT NOT NULL DEFAULT '',
  is_active    BOOLEAN DEFAULT true,
  invited_by   UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION phaseforge.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO phaseforge.profiles (id, email, full_name, company_id, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    CASE
      WHEN new.raw_user_meta_data->>'company_id' IS NOT NULL
      THEN (new.raw_user_meta_data->>'company_id')::UUID
      ELSE NULL
    END,
    'owner'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE phaseforge.handle_new_user();

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  customer_name   TEXT,
  job_location    TEXT,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  project_manager UUID REFERENCES profiles(id) ON DELETE SET NULL,
  superintendent  UUID,
  status          TEXT DEFAULT 'planning',
  priority        TEXT DEFAULT 'medium',
  notes           TEXT,
  color           TEXT DEFAULT '#6366f1',
  tags            TEXT[] DEFAULT '{}',
  is_archived     BOOLEAN DEFAULT false,
  created_by      UUID REFERENCES profiles(id),
  updated_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- PROJECT MEMBERS
-- ============================================================
CREATE TABLE project_members (
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  profile_id  UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role        TEXT DEFAULT 'member',
  PRIMARY KEY (project_id, profile_id)
);

-- ============================================================
-- PHASES
-- ============================================================
CREATE TABLE phases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  assigned_to   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status        TEXT DEFAULT 'not_started',
  color         TEXT,
  notes         TEXT,
  sort_order    INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- PHASE DEPENDENCIES
-- ============================================================
CREATE TABLE phase_dependencies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id        UUID NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  depends_on_id   UUID NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  type            TEXT DEFAULT 'finish_to_start',
  lag_days        INT DEFAULT 0,
  UNIQUE(phase_id, depends_on_id)
);

-- ============================================================
-- COMMENTS
-- ============================================================
CREATE TABLE comments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
  phase_id     UUID REFERENCES phases(id) ON DELETE CASCADE,
  author_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ATTACHMENTS (placeholder)
-- ============================================================
CREATE TABLE attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
  phase_id     UUID REFERENCES phases(id) ON DELETE CASCADE,
  uploaded_by  UUID NOT NULL REFERENCES profiles(id),
  file_name    TEXT NOT NULL,
  file_url     TEXT NOT NULL,
  file_size    INT,
  mime_type    TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ACTIVITY LOGS
-- ============================================================
CREATE TABLE activity_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
  phase_id     UUID REFERENCES phases(id) ON DELETE SET NULL,
  actor_id     UUID NOT NULL REFERENCES profiles(id),
  action       TEXT NOT NULL,
  payload      JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INVITATIONS
-- ============================================================
CREATE TABLE invitations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'viewer',
  token        TEXT UNIQUE NOT NULL,
  invited_by   UUID REFERENCES profiles(id),
  expires_at   TIMESTAMPTZ NOT NULL,
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's company_id
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- COMPANIES: users see their own company
CREATE POLICY "company_select" ON companies FOR SELECT
  USING (id = get_my_company_id());
CREATE POLICY "company_insert" ON companies FOR INSERT
  WITH CHECK (true);
CREATE POLICY "company_update" ON companies FOR UPDATE
  USING (id = get_my_company_id());

-- PROFILES: users see their company members
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (company_id = get_my_company_id() OR id = auth.uid());
CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  USING (id = auth.uid());

-- PROJECTS: company-scoped
CREATE POLICY "projects_select" ON projects FOR SELECT
  USING (company_id = get_my_company_id());
CREATE POLICY "projects_insert" ON projects FOR INSERT
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "projects_update" ON projects FOR UPDATE
  USING (company_id = get_my_company_id());
CREATE POLICY "projects_delete" ON projects FOR DELETE
  USING (company_id = get_my_company_id());

-- PHASES: via project company
CREATE POLICY "phases_select" ON phases FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()));
CREATE POLICY "phases_insert" ON phases FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()));
CREATE POLICY "phases_update" ON phases FOR UPDATE
  USING (project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()));
CREATE POLICY "phases_delete" ON phases FOR DELETE
  USING (project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()));

-- PHASE DEPENDENCIES
CREATE POLICY "phase_dep_select" ON phase_dependencies FOR SELECT
  USING (phase_id IN (SELECT id FROM phases WHERE project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())));
CREATE POLICY "phase_dep_insert" ON phase_dependencies FOR INSERT
  WITH CHECK (phase_id IN (SELECT id FROM phases WHERE project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())));
CREATE POLICY "phase_dep_delete" ON phase_dependencies FOR DELETE
  USING (phase_id IN (SELECT id FROM phases WHERE project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())));

-- INVITATIONS
CREATE POLICY "invitations_select" ON invitations FOR SELECT
  USING (company_id = get_my_company_id());
CREATE POLICY "invitations_insert" ON invitations FOR INSERT
  WITH CHECK (company_id = get_my_company_id());

-- COMMENTS
CREATE POLICY "comments_select" ON comments FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()));
CREATE POLICY "comments_insert" ON comments FOR INSERT
  WITH CHECK (author_id = auth.uid());

-- ACTIVITY LOGS
CREATE POLICY "logs_select" ON activity_logs FOR SELECT
  USING (company_id = get_my_company_id());
CREATE POLICY "logs_insert" ON activity_logs FOR INSERT
  WITH CHECK (company_id = get_my_company_id());

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_projects_company ON projects(company_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_phases_project ON phases(project_id);
CREATE INDEX idx_phases_dates ON phases(start_date, end_date);
CREATE INDEX idx_profiles_company ON profiles(company_id);
CREATE INDEX idx_activity_company ON activity_logs(company_id);
