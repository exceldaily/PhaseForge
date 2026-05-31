-- Run this in Supabase SQL Editor to add new project fields

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS superintendent TEXT,
  ADD COLUMN IF NOT EXISTS subcontractors TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS permit_status TEXT DEFAULT 'not_required';

-- permit_status values: not_required | pending | submitted | approved | denied

-- Optional: store company kanban column config
CREATE TABLE IF NOT EXISTS company_settings (
  company_id  UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  kanban_columns JSONB DEFAULT '[]',
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_select" ON company_settings FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "settings_upsert" ON company_settings FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "settings_update" ON company_settings FOR UPDATE USING (company_id = get_my_company_id());
