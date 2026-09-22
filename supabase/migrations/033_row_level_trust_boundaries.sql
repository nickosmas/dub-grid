-- Audit findings F-04, F-05 and F-06 (2026-09-21 full-project audit): three
-- rules the routes enforce that the row-level layer did not. Each hunk is
-- independent; nothing in the application changes shape.

-- F-04: an admin holding canManageEmployees could insert an invitation for
-- the super_admin tier straight through the data API, and acceptance handed
-- out whatever the row carried. The policy now applies the same ceiling as
-- the create route, and accept_invitation checks the inviter still holds
-- the tier at acceptance time. The function is restated from 018 with that
-- one guard added; later migrations copy from here.

DROP POLICY IF EXISTS "invitations_insert" ON public.invitations;

CREATE POLICY "invitations_insert"
  ON public.invitations FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.caller_org_id()
    AND (
      public.caller_org_role()::TEXT = 'super_admin'
      OR (
        public.caller_org_role()::TEXT = 'admin'
        AND public.check_admin_permission('canManageEmployees')
      )
    )
    AND (
      role_to_assign <> 'super_admin'
      OR public.caller_org_role()::TEXT = 'super_admin'
    )
  );

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token UUID)
RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_invite          public.invitations;
  v_uid             UUID := auth.uid();
  v_user_email      TEXT;
  v_emp_first_name  TEXT;
  v_emp_last_name   TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_invite
  FROM public.invitations
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND
    OR v_invite.accepted_at IS NOT NULL
    OR v_invite.revoked_at IS NOT NULL
    OR v_invite.expires_at < NOW()
  THEN
    RAISE EXCEPTION 'INVITATION_INVALID';
  END IF;

  SELECT email::TEXT INTO v_user_email
  FROM auth.users
  WHERE id = v_uid;

  IF v_user_email IS NULL OR lower(v_user_email) <> lower(v_invite.email) THEN
    RAISE EXCEPTION 'INVITATION_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations
    WHERE id = v_invite.org_id AND archived_at IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM public.organization_memberships
    WHERE user_id = v_uid AND org_id = v_invite.org_id
  ) THEN
    RAISE EXCEPTION 'INVITATION_INVALID';
  END IF;

  IF v_invite.employee_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.employees
      WHERE id = v_invite.employee_id
        AND org_id = v_invite.org_id
        AND archived_at IS NULL
        AND user_id IS NULL
    ) THEN
      RAISE EXCEPTION 'INVITATION_INVALID';
    END IF;

    UPDATE public.employees
    SET user_id = v_uid, updated_at = NOW()
    WHERE id = v_invite.employee_id
      AND org_id = v_invite.org_id
      AND archived_at IS NULL
      AND user_id IS NULL;

    UPDATE public.employees e
    SET first_name = COALESCE(p.first_name, e.first_name),
        last_name = COALESCE(p.last_name, e.last_name),
        updated_at = NOW()
    FROM public.profiles p
    WHERE e.id = v_invite.employee_id
      AND e.org_id = v_invite.org_id
      AND p.id = v_uid
      AND (p.first_name IS NOT NULL OR p.last_name IS NOT NULL);

    SELECT first_name, last_name INTO v_emp_first_name, v_emp_last_name
    FROM public.employees
    WHERE id = v_invite.employee_id AND org_id = v_invite.org_id;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM public.employees
      WHERE org_id = v_invite.org_id
        AND user_id = v_uid
        AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'INVITATION_INVALID';
    END IF;

    v_emp_first_name := v_invite.first_name;
    v_emp_last_name := v_invite.last_name;

    INSERT INTO public.employees (
      org_id, user_id, first_name, last_name, phone,
      department_ids, dept_admin_ids, employment_type, status, seniority
    ) VALUES (
      v_invite.org_id, v_uid, v_invite.first_name, v_invite.last_name,
      COALESCE(v_invite.phone, ''),
      v_invite.department_ids, v_invite.dept_admin_ids, 'full_time', 'active',
      COALESCE((
        SELECT MAX(seniority)
        FROM public.employees
        WHERE org_id = v_invite.org_id
      ), 0) + 1
    );
  END IF;

  INSERT INTO public.profiles (id, org_id, platform_role, first_name, last_name)
  VALUES (v_uid, v_invite.org_id, 'none', v_emp_first_name, v_emp_last_name)
  ON CONFLICT (id) DO UPDATE
    SET org_id = COALESCE(profiles.org_id, EXCLUDED.org_id),
        first_name = COALESCE(profiles.first_name, EXCLUDED.first_name),
        last_name = COALESCE(profiles.last_name, EXCLUDED.last_name),
        updated_at = NOW();

  -- A super-admin invitation is honoured only while its inviter can still
  -- hand that tier out. The route refuses to create one from a lower tier,
  -- and the row policy now does too; this covers a row written before a
  -- demotion, so a stale invitation cannot outrank the person who sent it.
  IF v_invite.role_to_assign = 'super_admin' AND NOT (
    EXISTS (
      SELECT 1
      FROM public.profiles inviter
      WHERE inviter.id = v_invite.invited_by
        AND inviter.platform_role = 'gridmaster'
        AND inviter.deactivated_at IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.organization_memberships inviter
      WHERE inviter.user_id = v_invite.invited_by
        AND inviter.org_id = v_invite.org_id
        AND inviter.org_role = 'super_admin'
        AND inviter.archived_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'INVITATION_INVALID';
  END IF;

  PERFORM set_config('app.allow_role_change', 'true', true);

  INSERT INTO public.organization_memberships (
    user_id, org_id, org_role, department_ids, dept_admin_ids, phone
  ) VALUES (
    v_uid, v_invite.org_id, v_invite.role_to_assign,
    v_invite.department_ids, v_invite.dept_admin_ids, v_invite.phone
  );

  UPDATE public.profiles
  SET org_id = v_invite.org_id, updated_at = NOW()
  WHERE id = v_uid AND org_id IS NULL;

  UPDATE public.invitations
  SET accepted_at = NOW()
  WHERE id = v_invite.id;

  INSERT INTO public.jwt_refresh_locks (user_id, locked_until, reason)
  VALUES (v_uid, NOW() + INTERVAL '2 seconds', 'invitation_accepted')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '2 seconds',
        reason = 'invitation_accepted';

  RETURN jsonb_build_object(
    'status', 'accepted',
    'invitation_id', v_invite.id,
    'org_id', v_invite.org_id,
    'role', v_invite.role_to_assign::TEXT,
    'org_slug', (
      SELECT slug FROM public.organizations WHERE id = v_invite.org_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_invitation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invitation(UUID) TO authenticated;

-- F-05: admin_profiles_update gates rows, not columns, so an organization
-- admin could set platform-wide account controls on a profile that may hold
-- memberships elsewhere. Those columns are written only by gridmaster
-- routes, the auth hook and the cron jobs, all through the service role or
-- supabase_auth_admin, which keep their privileges. The 004 table-level
-- grant covers every column, and a column-level revoke cannot narrow it, so
-- the table privilege goes and only the member-editable columns come back.
-- The row policy still decides whose profile an admin may touch.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (first_name, last_name, updated_at, version, terms_accepted_at, terms_version)
  ON public.profiles TO authenticated;

-- F-06: own_sessions_only was FOR ALL, so a client whose session row had
-- been deleted to revoke it could insert the row again and pass the
-- session checks in is_gridmaster and caller_org_id. Every writer of this
-- table is server-side through the service role (track-session, the
-- sessions routes, revocation, account deletion) or a definer function; the
-- one browser helper had no caller and is removed with this migration.
-- Members keep reading their own rows for the Settings device list.
DROP POLICY IF EXISTS "own_sessions_only" ON public.user_sessions;

CREATE POLICY "own_sessions_select"
  ON public.user_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
