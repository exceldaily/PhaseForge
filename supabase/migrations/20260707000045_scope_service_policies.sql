SET search_path TO phaseforge, extensions;

-- Scope always-true "service role" policies to service_role only (they were
-- accidental grants to authenticated/anon: any signed-in user could INSERT
-- into billing_history / notifications / preferences). service_role bypasses
-- RLS, so behavior for legitimate server-side writes is unchanged.
ALTER POLICY "Service role can insert billing history" ON phaseforge.billing_history TO service_role;
ALTER POLICY "Service role can update billing history" ON phaseforge.billing_history TO service_role;
ALTER POLICY "Service role can insert notification preferences" ON phaseforge.notification_preferences TO service_role;
ALTER POLICY "Service role insert notifications" ON phaseforge.notifications TO service_role;
ALTER POLICY "Service role can insert preferences" ON phaseforge.user_preferences TO service_role;
REVOKE EXECUTE ON FUNCTION phaseforge.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION phaseforge.initialize_notification_preferences() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION phaseforge.initialize_user_preferences() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION phaseforge.can_access_board(uuid, uuid, uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION phaseforge.get_accessible_board_ids() FROM anon;
REVOKE EXECUTE ON FUNCTION phaseforge.get_my_company_id() FROM anon;
REVOKE EXECUTE ON FUNCTION phaseforge.get_my_role() FROM anon;
REVOKE EXECUTE ON FUNCTION phaseforge.get_my_team_ids() FROM anon;
