-- 131: Every Admin stores a complete permission set (F-239, F-245).
--
-- The app resolves an Admin's permissions as the Admin defaults overlaid with
-- what is stored (packages/authz buildPermissionContext). check_admin_permission
-- reads the stored key alone and treats a missing one as false. So an Admin
-- with no stored set (every User promoted to Admin, every Admin invited with
-- the standard set) was shown Edit and Publish and refused them by the
-- database, and RLS hid drafts and recurring shifts from them.
--
-- A trigger now stores what the app resolves, whoever writes the row: web and
-- mobile promotion, change_user_role, invitation acceptance and the Gridmaster
-- functions alike.
--   - An Admin's set is the defaults, overlaid with the stored keys it knows
--     that hold a boolean, with canViewSchedule and canViewStaff on and
--     canManageOrgSettings off, then each view permission its Edit implies.
--   - Anyone else stores NULL, so a later promotion starts from the defaults
--     rather than a set from an earlier stint nobody reviewed again.
-- Unknown keys are dropped. A key added to the app later needs a migration
-- that adds it to admin_default_permissions and backfills, or the database
-- reads it as false while the app reads its default.
--
-- The backfill rewrites only rows whose stored set changes. It is nobody's
-- permission change, so the trigger that records one is off for it, and so is
-- updated_at, which would otherwise refuse open editors' next save as changed
-- elsewhere.
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

-- The set an Admin holds, from whatever is stored; the same rule as
-- buildPermissionContext and VIEW_IMPLICATIONS.
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

  v_set := v_set
    || '{"canViewSchedule": true, "canViewStaff": true, "canManageOrgSettings": false}'::JSONB;

  RETURN v_set || jsonb_build_object(
    'canViewEmployeeDetails',
      (v_set ->> 'canViewEmployeeDetails')::BOOLEAN OR (v_set ->> 'canManageEmployees')::BOOLEAN,
    'canViewFocusAreas',
      (v_set ->> 'canViewFocusAreas')::BOOLEAN OR (v_set ->> 'canManageFocusAreas')::BOOLEAN,
    'canViewScheduleDefinitions',
      (v_set ->> 'canViewScheduleDefinitions')::BOOLEAN
      OR (v_set ->> 'canManageScheduleDefinitions')::BOOLEAN,
    'canViewIndicatorTypes',
      (v_set ->> 'canViewIndicatorTypes')::BOOLEAN OR (v_set ->> 'canManageIndicatorTypes')::BOOLEAN,
    'canViewCoverageRequirements',
      (v_set ->> 'canViewCoverageRequirements')::BOOLEAN
      OR (v_set ->> 'canManageCoverageRequirements')::BOOLEAN,
    'canViewRecurringShifts',
      (v_set ->> 'canViewRecurringShifts')::BOOLEAN OR (v_set ->> 'canManageRecurringShifts')::BOOLEAN,
    'canViewOrgLabels',
      (v_set ->> 'canViewOrgLabels')::BOOLEAN OR (v_set ->> 'canManageOrgLabels')::BOOLEAN,
    'canViewDashboardAnalytics',
      (v_set ->> 'canViewDashboardAnalytics')::BOOLEAN
      OR (v_set ->> 'canEditShifts')::BOOLEAN
      OR (v_set ->> 'canManageEmployees')::BOOLEAN
      OR (v_set ->> 'canPublishSchedule')::BOOLEAN
      OR (v_set ->> 'canApproveShiftRequests')::BOOLEAN
  );
END;
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

-- Only the trigger calls these, on writes that are server-only (memberships
-- take no writes from a signed-in client), so nobody else needs them.
REVOKE ALL ON FUNCTION public.admin_default_permissions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_admin_permissions(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_default_permissions() TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_admin_permissions(JSONB) TO service_role;
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
