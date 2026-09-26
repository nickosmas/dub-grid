-- 054: A Gridmaster's direct table writes need fresh proof (F-74).
--
-- The gridmaster_all_* policies, and the Gridmaster insert and update policies
-- on impersonation_sessions, audit_log and role_change_log, let a Gridmaster's
-- token insert, update or delete organization data through the data API with
-- no recent sign-in. No application path writes these tables with a
-- Gridmaster's own token (impersonated edits run through the service role or
-- SECURITY DEFINER functions, which bypass RLS), so each table gets restrictive
-- write policies that refuse a Gridmaster without caller_has_fresh_proof().
-- Restrictive policies are ANDed with the permissive ones, so every other
-- caller is judged exactly as before, and reads are untouched.
--
-- Postgres checks EXECUTE on a policy's functions for every caller the policy
-- applies to, so the proof check (private since 051) is reached through a
-- boolean helper granted to authenticated; it reveals only whether the caller
-- is a Gridmaster with fresh proof. The policies call it as a scalar subquery,
-- so it runs once per statement rather than once per row.
--
-- CREATE POLICY locks each table briefly; the timeout makes the apply fail
-- fast rather than queue reads behind a long-running query (retry it).
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.gridmaster_write_allowed()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT NOT public.is_gridmaster() OR public.caller_has_fresh_proof();
$$;

REVOKE ALL ON FUNCTION public.gridmaster_write_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gridmaster_write_allowed() TO authenticated;

DO $$
DECLARE
  target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'absence_types',
    'audit_log',
    'certifications',
    'cookie_consents',
    'coverage_requirements',
    'departments',
    'employees',
    'focus_areas',
    'impersonation_sessions',
    'indicator_types',
    'invitations',
    'job_shift_overrides',
    'jobs',
    'mobile_device_tokens',
    'notification_preferences',
    'notifications',
    'organization_memberships',
    'organization_roles',
    'organizations',
    'platform_feature_flags',
    'profile_change_requests',
    'profiles',
    'publish_history',
    'recurring_shifts',
    'recurring_shifts_draft_sessions',
    'role_change_log',
    'schedule_cell_segments',
    'schedule_cell_snapshots',
    'schedule_cells',
    'schedule_draft_sessions',
    'schedule_notes',
    'schedule_publish_changes',
    'shift_categories',
    'shift_series',
    'subscriptions',
    'terms_acceptances'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS gridmaster_fresh_insert ON public.%I', target);
    EXECUTE format('DROP POLICY IF EXISTS gridmaster_fresh_update ON public.%I', target);
    EXECUTE format('DROP POLICY IF EXISTS gridmaster_fresh_delete ON public.%I', target);
    EXECUTE format(
      'CREATE POLICY gridmaster_fresh_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((SELECT public.gridmaster_write_allowed()))',
      target
    );
    EXECUTE format(
      'CREATE POLICY gridmaster_fresh_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING ((SELECT public.gridmaster_write_allowed())) WITH CHECK ((SELECT public.gridmaster_write_allowed()))',
      target
    );
    EXECUTE format(
      'CREATE POLICY gridmaster_fresh_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING ((SELECT public.gridmaster_write_allowed()))',
      target
    );
  END LOOP;
END;
$$;
