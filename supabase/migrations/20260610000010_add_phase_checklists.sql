SET search_path TO phaseforge, extensions;

-- ============================================================
-- Migration: Add phase checklists and reminder notes
-- ============================================================

-- ── 1. Phase checklists table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS phase_checklists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id    UUID NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Add reminder_notes column to phases ──────────────────────────
ALTER TABLE phases
  ADD COLUMN IF NOT EXISTS reminder_notes TEXT;

-- ── 3. Indexes ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_phase_checklists_phase ON phase_checklists(phase_id);
CREATE INDEX IF NOT EXISTS idx_phase_checklists_sort ON phase_checklists(phase_id, sort_order);

-- ── 4. RLS for phase_checklists ─────────────────────────────────────
ALTER TABLE phase_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phase_checklists_select" ON phase_checklists FOR SELECT
  USING (phase_id IN (SELECT id FROM phases WHERE project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())));

CREATE POLICY "phase_checklists_insert" ON phase_checklists FOR INSERT
  WITH CHECK (phase_id IN (SELECT id FROM phases WHERE project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())));

CREATE POLICY "phase_checklists_update" ON phase_checklists FOR UPDATE
  USING (phase_id IN (SELECT id FROM phases WHERE project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())));

CREATE POLICY "phase_checklists_delete" ON phase_checklists FOR DELETE
  USING (phase_id IN (SELECT id FROM phases WHERE project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())));
