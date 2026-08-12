SET search_path TO phaseforge, extensions;

-- Add the assigned_trade column to phases.
-- The app reads/writes this field (trade/role assignment as free text),
-- but it was never added to the database, causing all phase saves to fail
-- with: "Could not find the 'assigned_trade' column of 'phases' in the schema cache".

alter table phaseforge.phases
  add column if not exists assigned_trade text;
