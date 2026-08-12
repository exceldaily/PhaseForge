-- Per-project toggle: whether the project board card shows a quick "Punch List" button.
-- Additive, defaults to true (button shows unless turned off).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS show_punch_on_card boolean DEFAULT true;
