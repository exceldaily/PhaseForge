SET search_path TO phaseforge, extensions;

-- A standalone responsibility can be waiting on someone too, the same way a
-- case can. Additive; nothing else changes.
ALTER TABLE phaseforge.sc_tasks ADD COLUMN IF NOT EXISTS waiting_on text;
ALTER TABLE phaseforge.sc_tasks ADD COLUMN IF NOT EXISTS description text;
CREATE INDEX IF NOT EXISTS sc_tasks_owner_emp_idx ON phaseforge.sc_tasks (owner_employee_id) WHERE owner_employee_id IS NOT NULL;
