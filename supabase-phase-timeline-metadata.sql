ALTER TABLE public.phases
  ADD COLUMN IF NOT EXISTS percent_complete integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_milestone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_critical_path boolean NOT NULL DEFAULT false;

UPDATE public.phases
SET percent_complete = CASE
  WHEN status IN ('completed', 'skipped') THEN 100
  WHEN status IN ('in_progress', 'blocked') THEN 50
  ELSE 0
END
WHERE percent_complete IS NULL;

ALTER TABLE public.phases
  ALTER COLUMN percent_complete SET DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'phases_percent_complete_range'
  ) THEN
    ALTER TABLE public.phases
      ADD CONSTRAINT phases_percent_complete_range
      CHECK (percent_complete BETWEEN 0 AND 100);
  END IF;
END $$;
