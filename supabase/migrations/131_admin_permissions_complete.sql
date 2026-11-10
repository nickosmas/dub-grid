-- 131: Every Admin stores a complete permission set (F-239, F-245).
--
-- The app resolves an Admin's permissions as the Admin defaults overlaid with
-- what is stored, then turns on each view permission an Edit implies
-- (packages/authz buildPermissionContext). check_admin_permission read the
-- stored key alone and treated a missing one as false. So an Admin with no
-- stored set (every User promoted to Admin, every Admin invited with the
-- standard set) was shown Edit and Publish and refused them by the database,
-- and RLS hid drafts and recurring shifts from them.
--
-- A trigger now stores a complete set, whoever writes the row: web and mobile
-- promotion, change_user_role, invitation acceptance and the Gridmaster
-- functions alike.
--   - An Admin's set is the defaults, overlaid with the stored keys it knows
--     that hold a boolean, with canViewSchedule and canViewStaff on and
--     canManageOrgSettings off, as the editor's buildInitialPermissions starts.
--   - Anyone else stores NULL, so a later promotion starts from the defaults
--     rather than a set from an earlier stint nobody reviewed again.
-- Unknown keys are dropped. A key added to the app later needs a migration
-- that adds it to admin_default_permissions and backfills, or the database
-- reads it as false while the app reads its default.
--
-- The views an Edit implies are applied when check_admin_permission reads the
-- set, as the app applies them, not stored: the editor keeps each view switch
-- as its own choice, so turning the Edit off later drops the view with it.
--
-- The backfill rewrites only rows whose stored set changes. It is nobody's
-- permission change, so the trigger that records one is off for it, and so is
-- updated_at, which would otherwise refuse open editors' next save as changed
-- elsewhere. Like 061, it relies on the migration running in one transaction,
-- so a failure leaves both triggers on.
SET lock_timeout = '5s';

-- Must equal ADMIN_DEFAULT_PERMS in packages/authz/src/permission-sets.ts
-- (admin-permissions-complete.integration.test.ts compares them).
CREATE OR REPLACE FUNCTION public.admin_default_permissions()
RETURNS JSONB
LANGUAGE SQL IMMUTABLE
SET search_path = ''
AS $$
  SELECT '{
    "canViewSchedule": true,
    "canEditShifts": true,
    "canPublishSchedule": true,
    "canApplyRecurringSchedule": true,
    "canEditNotes": true,
    "canViewRecurringShifts": true,
    "canManageRecurringShifts": true,
    "canManageShiftSeries": true,
    "canViewStaff": true,
    "canViewEmployeeDetails": false,
    "canManageEmployees": false,
    "canViewFocusAreas": false,
    "canManageFocusAreas": false,
    "canViewScheduleDefinitions": false,
    "canManageScheduleDefinitions": false,
    "canViewIndicatorTypes": false,
    "canManageIndicatorTypes": false,
    "canManageOrgSettings": false,
    "canViewOrgLabels": false,
    "canManageOrgLabels": false,
    "canViewCoverageRequirements": false,
    "canManageCoverageRequirements": false,
    "canApproveShiftRequests": false,
    "canViewDashboardAnalytics": false,
    "canViewReports": true
  }'::JSONB;
$$;

-- The set an Admin stores, from whatever is stored; buildInitialPermissions in
-- packages/authz/src/permission-modules.ts.
CREATE OR REPLACE FUNCTION public.complete_admin_permissions(p_stored JSONB)
RETURNS JSONB
LANGUAGE PLPGSQL IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_set JSONB := public.admin_default_permissions();
  v_key TEXT;
BEGIN
  IF jsonb_typeof(p_stored) = 'object' THEN
    FOR v_key IN SELECT jsonb_object_keys(v_set) LOOP
      IF jsonb_typeof(p_stored -> v_key) = 'boolean' THEN
        v_set := jsonb_set(v_set, ARRAY[v_key], p_stored -> v_key);
      END IF;
    END LOOP;
  END IF;

  RETURN v_set
    || '{"canViewSchedule": true, "canViewStaff": true, "canManageOrgSettings": false}'::JSONB;
END;
$$;

-- The set an Admin holds: the stored set with each view its Edit implies, the
-- rule buildPermissionContext applies through VIEW_IMPLICATIONS. RLS reads it
-- once per row, so it merges rather than walking the keys: the trigger keeps
-- every stored set complete, and a value is granted only when it is true.
CREATE OR REPLACE FUNCTION public.resolve_admin_permissions(p_stored JSONB)
RETURNS JSONB
LANGUAGE PLPGSQL IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_set JSONB := public.admin_default_permissions()
    || CASE WHEN jsonb_typeof(p_stored) = 'object' THEN p_stored ELSE '{}'::JSONB END
    || '{"canViewSchedule": true, "canViewStaff": true, "canManageOrgSettings": false}'::JSONB;
BEGIN
  RETURN v_set || jsonb_build_object(
    'canViewEmployeeDetails',
      v_set -> 'canViewEmployeeDetails' = 'true' OR v_set -> 'canManageEmployees' = 'true',
    'canViewFocusAreas',
      v_set -> 'canViewFocusAreas' = 'true' OR v_set -> 'canManageFocusAreas' = 'true',
    'canViewScheduleDefinitions',
      v_set -> 'canViewScheduleDefinitions' = 'true'
      OR v_set -> 'canManageScheduleDefinitions' = 'true',
    'canViewIndicatorTypes',
      v_set -> 'canViewIndicatorTypes' = 'true' OR v_set -> 'canManageIndicatorTypes' = 'true',
    'canViewCoverageRequirements',
      v_set -> 'canViewCoverageRequirements' = 'true'
      OR v_set -> 'canManageCoverageRequirements' = 'true',
    'canViewRecurringShifts',
      v_set -> 'canViewRecurringShifts' = 'true' OR v_set -> 'canManageRecurringShifts' = 'true',
    'canViewOrgLabels',
      v_set -> 'canViewOrgLabels' = 'true' OR v_set -> 'canManageOrgLabels' = 'true',
    'canViewDashboardAnalytics',
      v_set -> 'canViewDashboardAnalytics' = 'true'
      OR v_set -> 'canEditShifts' = 'true'
      OR v_set -> 'canManageEmployees' = 'true'
      OR v_set -> 'canPublishSchedule' = 'true'
      OR v_set -> 'canApproveShiftRequests' = 'true'
  );
END;
$$;

-- 002's body, reading the resolved set rather than the raw key.
CREATE OR REPLACE FUNCTION public.check_admin_permission(p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    public.is_gridmaster()
    OR public.caller_org_role()::TEXT = 'super_admin'
    OR (
      public.caller_org_role()::TEXT = 'admin'
      AND COALESCE(
        (SELECT public.resolve_admin_permissions(cm.admin_permissions) -> p_permission = 'true'::JSONB
         FROM public.organization_memberships cm
         WHERE cm.user_id = auth.uid() AND cm.org_id = public.caller_org_id()),
        FALSE
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.complete_membership_admin_permissions()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SET search_path = ''
AS $$
BEGIN
  IF NEW.org_role::TEXT = 'admin' THEN
    NEW.admin_permissions := public.complete_admin_permissions(NEW.admin_permissions);
  ELSE
    NEW.admin_permissions := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Only the trigger and check_admin_permission (which runs as its owner) call
-- these, and memberships take no writes from a signed-in client.
REVOKE ALL ON FUNCTION public.admin_default_permissions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_admin_permissions(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_admin_permissions(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_default_permissions() TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_admin_permissions(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_admin_permissions(JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.complete_membership_admin_permissions() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_memberships_complete_admin_permissions ON public.organization_memberships;
CREATE TRIGGER trg_memberships_complete_admin_permissions
  BEFORE INSERT OR UPDATE OF org_role, admin_permissions ON public.organization_memberships
  FOR EACH ROW EXECUTE FUNCTION public.complete_membership_admin_permissions();

ALTER TABLE public.organization_memberships DISABLE TRIGGER trg_log_permission_change;
ALTER TABLE public.organization_memberships DISABLE TRIGGER trigger_org_memberships_updated_at;

UPDATE public.organization_memberships
SET admin_permissions = admin_permissions
WHERE admin_permissions IS DISTINCT FROM CASE
    WHEN org_role::TEXT = 'admin' THEN public.complete_admin_permissions(admin_permissions)
    ELSE NULL
  END;

ALTER TABLE public.organization_memberships ENABLE TRIGGER trigger_org_memberships_updated_at;
ALTER TABLE public.organization_memberships ENABLE TRIGGER trg_log_permission_change;

-- F-252: assign_org_role_by_email let any Admin, with no permission switch on,
-- set a member's role to User through the data API, demoting a Super Admin or
-- reviving an archived membership, and add any account to their organization
-- without an invitation. Only the Gridmaster portal calls it, so only a
-- Gridmaster may. 051's body, with that check in place of the tier checks.
CREATE OR REPLACE FUNCTION public.assign_org_role_by_email(
  p_email    TEXT,
  p_org_id   UUID,
  p_org_role public.org_role DEFAULT 'user'
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  target_user_id UUID;
BEGIN
  -- A Gridmaster's grant needs a recent sign-in here too, not only in the
  -- route, so a stale or stolen token cannot grant through the data API.
  IF public.is_gridmaster() AND NOT public.caller_has_fresh_proof() THEN
    RAISE EXCEPTION 'STEP_UP_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Unauthorized: insufficient permissions' USING ERRCODE = '42501';
  END IF;
  IF p_email IS NULL OR p_email !~ '^\S+@\S+\.\S+$' THEN
    RAISE EXCEPTION 'Invalid email format';
  END IF;

  SELECT id INTO target_user_id FROM auth.users WHERE lower(email::TEXT) = lower(p_email);

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', p_email;
  END IF;

  INSERT INTO public.profiles (id, org_id, platform_role)
  VALUES (target_user_id, p_org_id, 'none')
  ON CONFLICT (id) DO UPDATE
    SET org_id = COALESCE(profiles.org_id, EXCLUDED.org_id),
        updated_at = NOW();

  PERFORM set_config('app.allow_role_change', 'true', true);

  -- Reviving an archived membership runs through guard_terminated_membership,
  -- so a terminated account still cannot be let back in this way.
  INSERT INTO public.organization_memberships (user_id, org_id, org_role)
  VALUES (target_user_id, p_org_id, p_org_role)
  ON CONFLICT (user_id, org_id) DO UPDATE
    SET org_role = EXCLUDED.org_role,
        archived_at = NULL,
        archived_by = NULL,
        updated_at = NOW();
END;
$$;
