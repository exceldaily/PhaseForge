-- Configurable ETA row alerts: call rows turn red/yellow this many hours
-- before their ETA. APPLIED LIVE 2026-07-21.
ALTER TABLE public.dispatch_company_settings
  ADD COLUMN IF NOT EXISTS eta_red_hours integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS eta_yellow_hours integer NOT NULL DEFAULT 24;
