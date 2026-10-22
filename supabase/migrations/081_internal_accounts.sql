-- 081: Internal (QA) accounts are hidden from client organizations.
--
-- Seeded QA accounts are members, with staff records, of every organization,
-- real clients included, so clients saw them as staff. profiles.is_internal
-- marks such an account. A Gridmaster, the service role and other internal
-- accounts still see internal people (the QA suites read their own fixtures);
-- every other caller does not.
--
-- Restrictive SELECT policies hide internal rows on employees, memberships
-- and profiles, which also keeps them out of Realtime payloads. Most
-- organization reads run through the service role, which bypasses RLS and is
-- treated as able to see; those routes filter by the viewer themselves.
-- The policies read the hidden ids once per statement through a scalar
-- subquery. A caller can learn those UUIDs by calling the helper, and nothing
-- else about them.
--
-- The backfill marks today's @dubgrid.test accounts. From here on the flag is
-- the only rule, and only a Gridmaster (or the service role) can change it.
SET lock_timeout = '5s';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.is_internal IS
  'Internal (QA) account: hidden from organization members who are not internal or a Gridmaster.';

UPDATE public.profiles AS profile
SET is_internal = TRUE
FROM auth.users AS account
WHERE account.id = profile.id
  AND lower(account.email) LIKE '%@dubgrid.test'
  AND NOT profile.is_internal;

CREATE OR REPLACE FUNCTION public.caller_sees_internal()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
    OR public.is_gridmaster()
    OR EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = auth.uid()
        AND profile.is_internal
        AND profile.deactivated_at IS NULL
    );
$$;

REVOKE ALL ON FUNCTION public.caller_sees_internal() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hidden_internal_user_ids()
RETURNS UUID[]
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT CASE
    WHEN public.caller_sees_internal() THEN '{}'::UUID[]
    ELSE COALESCE(
      (SELECT array_agg(profile.id) FROM public.profiles AS profile WHERE profile.is_internal),
      '{}'::UUID[]
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.hidden_internal_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hidden_internal_user_ids() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_profile_is_internal()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.is_internal IS DISTINCT FROM
       (CASE WHEN TG_OP = 'INSERT' THEN FALSE ELSE OLD.is_internal END)
     AND COALESCE(auth.jwt() ->> 'role', '') IN ('authenticated', 'anon')
     AND NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Only a Gridmaster can change whether an account is internal'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_profile_is_internal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_is_internal_guard ON public.profiles;
CREATE TRIGGER profiles_is_internal_guard
  BEFORE INSERT OR UPDATE OF is_internal ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_is_internal();

DROP POLICY IF EXISTS internal_hidden_select ON public.employees;
CREATE POLICY internal_hidden_select ON public.employees
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (user_id IS NULL OR NOT user_id = ANY ((SELECT public.hidden_internal_user_ids())::UUID[]));

DROP POLICY IF EXISTS internal_hidden_select ON public.organization_memberships;
CREATE POLICY internal_hidden_select ON public.organization_memberships
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT user_id = ANY ((SELECT public.hidden_internal_user_ids())::UUID[]));

DROP POLICY IF EXISTS internal_hidden_select ON public.profiles;
CREATE POLICY internal_hidden_select ON public.profiles
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT id = ANY ((SELECT public.hidden_internal_user_ids())::UUID[]));

CREATE OR REPLACE FUNCTION public.get_org_users(p_org_id UUID)
RETURNS TABLE (
  id                UUID,
  email             TEXT,
  first_name        TEXT,
  last_name         TEXT,
  platform_role     public.platform_role,
  org_role          public.org_role,
  admin_permissions JSONB,
  created_at        TIMESTAMPTZ,
  last_sign_in_at   TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ,
  department_ids    BIGINT[],
  dept_admin_ids    BIGINT[]
)
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT (
    public.is_gridmaster()
    OR (
      public.caller_org_id() = p_org_id
      AND public.caller_org_role() = 'super_admin'
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT p.id, u.email::TEXT, p.first_name, p.last_name, p.platform_role,
    cm.org_role, cm.admin_permissions, p.created_at,
    u.last_sign_in_at, cm.updated_at, cm.department_ids, cm.dept_admin_ids
  FROM public.organization_memberships cm
  JOIN public.profiles p ON p.id = cm.user_id
  JOIN auth.users u ON u.id = cm.user_id
  WHERE cm.org_id = p_org_id
    AND cm.archived_at IS NULL
    AND p.platform_role <> 'gridmaster'
    AND (public.caller_sees_internal() OR NOT p.is_internal)
  ORDER BY u.email ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_users(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_org_directory(
  p_org_id UUID,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  person_id               TEXT,
  source                  TEXT,
  employee_id             UUID,
  employee_number         INTEGER,
  user_id                 UUID,
  first_name              TEXT,
  last_name               TEXT,
  email                   TEXT,
  phone                   TEXT,
  employee_status         TEXT,
  org_role                TEXT,
  has_app_access          BOOLEAN,
  focus_area_ids          BIGINT[],
  certification_id        BIGINT,
  role_ids                BIGINT[],
  seniority               INTEGER,
  last_sign_in_at         TIMESTAMPTZ,
  invitation_status       TEXT,
  scheduled_department_ids BIGINT[],
  scheduled_dept_admin_ids BIGINT[],
  management_department_ids BIGINT[],
  management_dept_admin_ids BIGINT[],
  membership_updated_at TIMESTAMPTZ,
  membership_admin_permissions JSONB
)
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_hidden UUID[] := public.hidden_internal_user_ids();
BEGIN
  IF NOT (
    -- Trusted backend path: API routes authorize the caller via
    -- requireOrgPermissions, then invoke this through the service-role client
    -- (where auth.uid()/JWT org claims are absent). Direct authenticated callers
    -- must still be a gridmaster or a super_admin/admin of the target org.
    (auth.jwt() ->> 'role') = 'service_role'
    OR public.is_gridmaster()
    OR (
      public.caller_org_id() = p_org_id
      AND public.caller_org_role() IN ('super_admin', 'admin')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY

  -- All employees, enriched with management membership or pending employee-linked invite.
  SELECT
    e.id::TEXT AS person_id,
    'employee'::TEXT AS source,
    e.id AS employee_id,
    e.employee_number,
    e.user_id AS user_id,
    e.first_name,
    e.last_name,
    COALESCE(NULLIF(e.email, ''), au.email::TEXT, emp_inv.email, '') AS email,
    COALESCE(NULLIF(e.phone, ''), cm.phone, emp_inv.phone, '') AS phone,
    e.status::TEXT AS employee_status,
    COALESCE(cm.org_role::TEXT, emp_inv.role_to_assign::TEXT, NULL) AS org_role,
    (cm.user_id IS NOT NULL) AS has_app_access,
    e.focus_area_ids,
    e.certification_id,
    e.role_ids,
    e.seniority,
    au.last_sign_in_at,
    emp_inv.invitation_status,
    COALESCE(e.department_ids, '{}'::BIGINT[]) AS scheduled_department_ids,
    COALESCE(e.dept_admin_ids, '{}'::BIGINT[]) AS scheduled_dept_admin_ids,
    COALESCE(cm.department_ids, emp_inv.department_ids, '{}'::BIGINT[]) AS management_department_ids,
    COALESCE(cm.dept_admin_ids, emp_inv.dept_admin_ids, '{}'::BIGINT[]) AS management_dept_admin_ids,
    cm.updated_at AS membership_updated_at,
    cm.admin_permissions AS membership_admin_permissions
  FROM public.employees e
  LEFT JOIN public.organization_memberships cm
    ON cm.user_id = e.user_id AND cm.org_id = p_org_id AND cm.archived_at IS NULL
  LEFT JOIN auth.users au
    ON au.id = e.user_id
  LEFT JOIN LATERAL (
    SELECT
      inv.email,
      COALESCE(inv.phone, '') AS phone,
      inv.role_to_assign,
      inv.department_ids,
      inv.dept_admin_ids,
      CASE
        WHEN inv.expires_at < NOW() THEN 'expired'
        ELSE 'pending'
      END AS invitation_status
    FROM public.invitations inv
    WHERE inv.employee_id = e.id
      AND inv.org_id = p_org_id
      AND inv.accepted_at IS NULL
      AND inv.revoked_at IS NULL
    ORDER BY inv.created_at DESC
    LIMIT 1
  ) emp_inv ON TRUE
  WHERE e.org_id = p_org_id
    AND e.archived_at IS NULL
    AND (e.user_id IS NULL OR NOT e.user_id = ANY (v_hidden))

  UNION ALL

  -- Active org members without a linked employee.
  SELECT
    ('u:' || cm2.user_id::TEXT) AS person_id,
    'user_only'::TEXT AS source,
    NULL::UUID AS employee_id,
    NULL::INTEGER AS employee_number,
    cm2.user_id AS user_id,
    p.first_name,
    p.last_name,
    au2.email::TEXT AS email,
    COALESCE(cm2.phone, '') AS phone,
    NULL::TEXT AS employee_status,
    cm2.org_role::TEXT AS org_role,
    TRUE AS has_app_access,
    '{}'::BIGINT[] AS focus_area_ids,
    NULL::BIGINT AS certification_id,
    '{}'::BIGINT[] AS role_ids,
    NULL::INTEGER AS seniority,
    au2.last_sign_in_at,
    NULL::TEXT AS invitation_status,
    '{}'::BIGINT[] AS scheduled_department_ids,
    '{}'::BIGINT[] AS scheduled_dept_admin_ids,
    cm2.department_ids AS management_department_ids,
    cm2.dept_admin_ids AS management_dept_admin_ids,
    cm2.updated_at AS membership_updated_at,
    cm2.admin_permissions AS membership_admin_permissions
  FROM public.organization_memberships cm2
  JOIN public.profiles p ON p.id = cm2.user_id
  JOIN auth.users au2 ON au2.id = cm2.user_id
  WHERE cm2.org_id = p_org_id
    AND cm2.archived_at IS NULL
    AND NOT cm2.user_id = ANY (v_hidden)
    AND NOT EXISTS (
      SELECT 1 FROM public.employees emp
      WHERE emp.user_id = cm2.user_id
        AND emp.org_id = p_org_id
    )

  UNION ALL

  -- Pending app-only invitations with management assignments.
  SELECT
    ('inv:' || inv3.id::TEXT) AS person_id,
    'pending_invite'::TEXT AS source,
    NULL::UUID AS employee_id,
    NULL::INTEGER AS employee_number,
    NULL::UUID AS user_id,
    COALESCE(inv3.first_name, '') AS first_name,
    COALESCE(inv3.last_name, '') AS last_name,
    inv3.email,
    COALESCE(inv3.phone, '') AS phone,
    NULL::TEXT AS employee_status,
    inv3.role_to_assign::TEXT AS org_role,
    FALSE AS has_app_access,
    '{}'::BIGINT[] AS focus_area_ids,
    NULL::BIGINT AS certification_id,
    '{}'::BIGINT[] AS role_ids,
    NULL::INTEGER AS seniority,
    NULL::TIMESTAMPTZ AS last_sign_in_at,
    CASE WHEN inv3.expires_at < NOW() THEN 'expired' ELSE 'pending' END AS invitation_status,
    '{}'::BIGINT[] AS scheduled_department_ids,
    '{}'::BIGINT[] AS scheduled_dept_admin_ids,
    inv3.department_ids AS management_department_ids,
    inv3.dept_admin_ids AS management_dept_admin_ids,
    NULL::TIMESTAMPTZ AS membership_updated_at,
    NULL::JSONB AS membership_admin_permissions
  FROM public.invitations inv3
  WHERE inv3.org_id = p_org_id
    AND inv3.employee_id IS NULL
    AND inv3.accepted_at IS NULL
    AND inv3.revoked_at IS NULL

  ORDER BY seniority NULLS LAST, first_name, last_name
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_directory(UUID, INT, INT) TO authenticated;


RESET lock_timeout;
