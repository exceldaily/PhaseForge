SET search_path TO phaseforge, extensions;

-- ── Phase Comments ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS phase_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phase_comments_phase_id ON phase_comments(phase_id, created_at);

ALTER TABLE phase_comments ENABLE ROW LEVEL SECURITY;

-- Company members can read/write comments on phases belonging to their company
CREATE POLICY "Company members read comments"
  ON phase_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM phases ph
      JOIN projects pr ON pr.id = ph.project_id
      WHERE ph.id = phase_comments.phase_id
        AND pr.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Company members insert comments"
  ON phase_comments FOR INSERT
  WITH CHECK (
    author_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM phases ph
      JOIN projects pr ON pr.id = ph.project_id
      WHERE ph.id = phase_comments.phase_id
        AND pr.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Authors update own comments"
  ON phase_comments FOR UPDATE
  USING (author_id = auth.uid());

CREATE POLICY "Authors delete own comments"
  ON phase_comments FOR DELETE
  USING (author_id = auth.uid());

-- ── Teams ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, profile_id)
);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members read teams"
  ON teams FOR SELECT
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Owners/admins manage teams"
  ON teams FOR ALL
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()) AND
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'admin')
  );

CREATE POLICY "Company members read team_members"
  ON team_members FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM teams WHERE id = team_members.team_id
      AND company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  );

CREATE POLICY "Owners/admins manage team_members"
  ON team_members FOR ALL
  USING (
    EXISTS (SELECT 1 FROM teams WHERE id = team_members.team_id
      AND company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())) AND
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'admin')
  );
