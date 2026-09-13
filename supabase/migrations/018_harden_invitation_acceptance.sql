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
