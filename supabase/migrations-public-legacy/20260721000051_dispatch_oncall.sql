-- Dispatch: on-call rotation roster/settings + dispatch_techs.profile_id so
-- My Work can find the signed-in tech's calls. APPLIED LIVE 2026-07-21.

CREATE TABLE IF NOT EXISTS public.dispatch_on_call_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispatch_on_call_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  anchor_date date NOT NULL DEFAULT CURRENT_DATE,
  rotation_interval text NOT NULL DEFAULT 'week',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dispatch_techs
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dp_oncall_org ON public.dispatch_on_call_participants(company_id);

ALTER TABLE public.dispatch_on_call_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_on_call_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dp_oncall_participants_all" ON public.dispatch_on_call_participants;
CREATE POLICY "dp_oncall_participants_all" ON public.dispatch_on_call_participants FOR ALL
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
DROP POLICY IF EXISTS "dp_oncall_settings_all" ON public.dispatch_on_call_settings;
CREATE POLICY "dp_oncall_settings_all" ON public.dispatch_on_call_settings FOR ALL
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
