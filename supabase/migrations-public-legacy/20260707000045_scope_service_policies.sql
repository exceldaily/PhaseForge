-- Scope always-true "service role" policies to service_role only (they were
-- accidental grants to authenticated/anon: any signed-in user could INSERT
-- into billing_history / notifications / preferences). service_role bypasses
-- RLS, so behavior for legitimate server-side writes is unchanged.
ALTER POLICY "Service role can insert billing history" ON public.billing_history TO service_role;
ALTER POLICY "Service role can update billing history" ON public.billing_history TO service_role;
ALTER POLICY "Service role can insert notification preferences" ON public.notification_preferences TO service_role;
ALTER POLICY "Service role insert notifications" ON public.notifications TO service_role;
ALTER POLICY "Service role can insert preferences" ON public.user_preferences TO service_role;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.initialize_notification_preferences() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.initialize_user_preferences() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_board(uuid, uuid, uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_accessible_board_ids() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_company_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_team_ids() FROM anon;
