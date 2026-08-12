SET search_path TO phaseforge, extensions;

-- Add super-admin flag to profiles table
ALTER TABLE profiles ADD COLUMN is_super_admin boolean DEFAULT false;
CREATE INDEX idx_profiles_super_admin ON profiles(is_super_admin);

-- Create table for admin action audit trail
CREATE TABLE admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  target_email text,
  changes jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: rows are filtered at application level
CREATE POLICY "admin_audit_logs_select" ON admin_audit_logs FOR SELECT
  USING (true);
