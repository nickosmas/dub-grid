-- Harden the direct PostgREST authorization boundary.
--
-- Access tokens remain cryptographically valid until expiry. App Route
-- Handlers additionally consult Redis revocation markers, while direct
-- user-scoped Supabase queries are cut off by removing the tracked session row.
-- The access-token hook creates that row when the token is minted.

CREATE OR REPLACE FUNCTION public.is_gridmaster()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.id = auth.uid()
      AND profile.platform_role = 'gridmaster'
      AND profile.deactivated_at IS NULL
      AND (
        NULLIF(auth.jwt() ->> 'session_id', '')::UUID IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.user_sessions AS session
          WHERE session.user_id = auth.uid()
            AND session.supabase_session_id =
              NULLIF(auth.jwt() ->> 'session_id', '')::UUID
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.caller_org_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT claimed.org_id
  FROM (
    SELECT
      NULLIF(auth.jwt() ->> 'org_id', '')::UUID AS org_id,
      NULLIF(auth.jwt() ->> 'session_id', '')::UUID AS session_id
  ) AS claimed
  JOIN public.profiles AS profile
    ON profile.id = auth.uid()
   AND profile.deactivated_at IS NULL
  JOIN public.organization_memberships AS membership
    ON membership.user_id = auth.uid()
   AND membership.org_id = claimed.org_id
   AND membership.archived_at IS NULL
  JOIN public.organizations AS organization
    ON organization.id = claimed.org_id
   AND organization.archived_at IS NULL
   AND organization.suspended_at IS NULL
  WHERE claimed.org_id IS NOT NULL
    AND (
      claimed.session_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.user_sessions AS session
        WHERE session.user_id = auth.uid()
          AND session.supabase_session_id = claimed.session_id
      )
    );
$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default, and the historical baseline
-- also granted authenticated direct access to every existing function. Remove
-- anonymous execution across the schema and require every future RPC to opt in.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Only these SECURITY DEFINER entry points are intentionally callable by an
-- authenticated PostgREST client. Policy helpers are included because RLS
-- evaluates them as the caller; all other privileged functions are internal,
-- trigger-only, or service-role operations.
DO $authorization_grants$
DECLARE
  routine RECORD;
  authenticated_entry_points CONSTANT TEXT[] := ARRAY[
    'accept_invitation',
    'assign_org_role_by_email',
    'caller_org_id',
    'caller_org_role',
    'cancel_shift_request',
    'change_user_role',
    'check_admin_permission',
    'claim_shift_request',
    'complete_onboarding',
    'create_shift_request',
    'create_shift_series',
    'delete_schedule_cell_draft',
    'delete_shift_series',
    'demote_gridmaster_account',
    'end_impersonation',
    'force_logout_user',
    'get_all_users_with_profiles',
    'get_audit_log',
    'get_gridmaster_accounts',
    'get_impersonation_history',
    'get_my_organizations',
    'get_notification_facets',
    'get_notifications',
    'get_org_directory',
    'get_org_users',
    'get_publish_history',
    'get_schedule_last_viewed',
    'get_tenant_stats',
    'get_unread_notification_count',
    'import_previous_schedule',
    'is_gridmaster',
    'is_own_sandbox_org',
    'mark_all_notifications_read',
    'mark_all_notifications_read_with_unread_count',
    'mark_notification_read',
    'mark_notification_read_with_unread_count',
    'move_shift',
    'mutate_notifications_with_unread_count',
    'promote_gridmaster_by_email',
    'publish_schedule',
    'remove_focus_area_from_employees',
    'resolve_shift_request',
    'respond_to_shift_request',
    'send_invitation',
    'set_gridmaster_account_deactivated',
    'set_job_shift_overrides',
    'start_impersonation',
    'start_trial_for_org',
    'switch_org',
    'update_schedule_last_viewed',
    'update_series_all_shifts',
    'upsert_recurring_shift',
    'volunteer_for_open_shift',
    'write_schedule_cell_snapshot'
  ];
BEGIN
  FOR routine IN
    SELECT procedure.oid, procedure.proname
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.prosecdef
  LOOP
    IF routine.proname = ANY(authenticated_entry_points) THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO authenticated',
        routine.oid::regprocedure
      );
    ELSE
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION %s FROM authenticated',
        routine.oid::regprocedure
      );
    END IF;
  END LOOP;
END;
$authorization_grants$;
