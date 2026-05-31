-- Add trade/role assignment to phases
ALTER TABLE phases ADD COLUMN IF NOT EXISTS assigned_trade TEXT;
