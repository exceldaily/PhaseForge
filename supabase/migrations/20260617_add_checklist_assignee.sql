-- Allow assigning a checklist item to a teammate. Additive + nullable, so
-- existing items keep working and unassigned stays the default.
ALTER TABLE phase_checklists
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL;
