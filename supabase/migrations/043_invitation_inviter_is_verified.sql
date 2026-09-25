-- Feature 41a1: a regular admin must never hand out the super_admin tier, and
-- an invitation must carry an inviter the database has checked.
--
-- Two gaps, both in functions the routes reach through the service client where
-- auth.uid() is NULL and RLS does not apply, so a route check was the only
-- thing standing between an admin and the super_admin tier:
--
--   1. replace_pending_invitation_access took whatever tier its caller asked
--      for and stamped whatever inviter it was handed.
--   2. send_invitation read auth.uid() for invited_by, which is NULL on the
--      service-role path, so every invitation created through the web route
--      carried no inviter. accept_invitation (033) refuses a super_admin
--      invitation whose inviter no longer holds the tier, and a NULL inviter
--      never holds it, so super_admin invitations could not be accepted at all.
--
-- Deliberately not added: a broader invitations UPDATE policy. The existing
-- invitations_revoke policy already restricts an authenticated org caller to
-- updates that leave the row revoked, which is stricter than a tier ceiling
-- would be. Adding one would widen what an admin may write, not narrow it.

-- One place for the rule acceptance already applies, so the row is checked
-- when it is written and not only when it is used.
CREATE OR REPLACE FUNCTION public.inviter_may_grant(
  p_inviter UUID,
  p_org_id  UUID,
  p_role    TEXT
) RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT p_inviter IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles inviter
        WHERE inviter.id = p_inviter
          AND inviter.platform_role = 'gridmaster'
          AND inviter.deactivated_at IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM public.organization_memberships inviter
        WHERE inviter.user_id = p_inviter
          AND inviter.org_id = p_org_id
          AND inviter.archived_at IS NULL
          AND (p_role <> 'super_admin' OR inviter.org_role = 'super_admin')
      )
    );
$$;

-- No grants: this is only ever called from inside the SECURITY DEFINER
-- functions below, which execute it with the definer's privileges. Granting it
-- to authenticated would add a function to the role's reachable surface for
-- nothing, and that surface is deliberately inventoried.
REVOKE ALL ON FUNCTION public.inviter_may_grant(UUID, UUID, TEXT) FROM PUBLIC;

-- Restated from 012 with the inviter check added; nothing else changes.
CREATE OR REPLACE FUNCTION public.replace_pending_invitation_access(
  p_org_id UUID,
  p_invitation_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_role TEXT,
  p_invited_by UUID,
  p_department_ids BIGINT[] DEFAULT NULL,
  p_dept_admin_ids BIGINT[] DEFAULT NULL
) RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_current public.invitations;
  v_replacement public.invitations;
BEGIN
  IF p_role NOT IN ('admin', 'user', 'super_admin') THEN
    RAISE EXCEPTION 'Invalid invitation role';
  END IF;

  SELECT * INTO v_current
  FROM public.invitations
  WHERE id = p_invitation_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF v_current.accepted_at IS NOT NULL
    OR v_current.revoked_at IS NOT NULL
    OR v_current.expires_at < NOW()
  THEN
    RAISE EXCEPTION 'Invitation is no longer pending';
  END IF;

  IF v_current.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Invitation changed elsewhere';
  END IF;

  -- The inviter recorded on the replacement is checked, not trusted: this
  -- function runs as service_role, so without this the caller's word decides
  -- who authorized a super_admin invitation.
  IF NOT public.inviter_may_grant(
    COALESCE(p_invited_by, v_current.invited_by), p_org_id, p_role
  ) THEN
    RAISE EXCEPTION 'INVITATION_TIER_DENIED';
  END IF;

  UPDATE public.invitations
  SET revoked_at = NOW()
  WHERE id = v_current.id;

  INSERT INTO public.invitations (
    org_id,
    invited_by,
    email,
    role_to_assign,
    employee_id,
    first_name,
    last_name,
    phone,
    department_ids,
    dept_admin_ids
  ) VALUES (
    v_current.org_id,
    COALESCE(p_invited_by, v_current.invited_by),
    v_current.email,
    p_role::public.org_role,
    v_current.employee_id,
    v_current.first_name,
    v_current.last_name,
    v_current.phone,
    COALESCE(p_department_ids, v_current.department_ids),
    COALESCE(p_dept_admin_ids, v_current.dept_admin_ids)
  )
  RETURNING * INTO v_replacement;

  RETURN jsonb_build_object(
    'previous_invitation_id', v_current.id,
    'invitation_id', v_replacement.id,
    'token', v_replacement.token,
    'expires_at', v_replacement.expires_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.replace_pending_invitation_access(UUID, UUID, TIMESTAMPTZ, TEXT, UUID, BIGINT[], BIGINT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_pending_invitation_access(UUID, UUID, TIMESTAMPTZ, TEXT, UUID, BIGINT[], BIGINT[]) TO service_role;

-- Restated from 002 with the inviter parameter and its check; the old
-- nine-argument form is dropped so no caller can still create an
-- invitation with no inviter.
CREATE OR REPLACE FUNCTION public.send_invitation(
  p_email          TEXT,
  p_role           TEXT,
  p_org_id         UUID,
  p_employee_id    UUID DEFAULT NULL,
  p_first_name     TEXT DEFAULT NULL,
  p_last_name      TEXT DEFAULT NULL,
  p_phone          TEXT DEFAULT NULL,
  p_department_ids   BIGINT[] DEFAULT '{}',
  p_dept_admin_ids   BIGINT[] DEFAULT '{}',
  p_invited_by       UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_invite   public.invitations;
  v_caller_role TEXT;
  v_inviter  UUID;
BEGIN
  -- Trusted backend path: API routes authorize the caller via
  -- requireOrgPermissions / canManageEmployees and then invoke this RPC
  -- through the service-role client (where auth.uid() / JWT claims are
  -- absent). Direct authenticated callers still have to be a gridmaster
  -- or a super_admin of the target org.
  IF (auth.jwt() ->> 'role') <> 'service_role' AND NOT public.is_gridmaster() THEN
    v_caller_role := public.caller_org_role()::TEXT;
    IF public.caller_org_id() <> p_org_id OR v_caller_role <> 'super_admin' THEN
      RAISE EXCEPTION 'Unauthorized: only super_admin can send invitations';
    END IF;
  END IF;

  IF p_role NOT IN ('admin', 'user', 'super_admin') THEN
    RAISE EXCEPTION 'Invalid role: must be super_admin, admin, or user';
  END IF;

  -- An authenticated caller is its own inviter; the service-role path states
  -- one, because auth.uid() is NULL there and an invitation with no inviter
  -- cannot be accepted at the super_admin tier. Either way it is verified
  -- here, so the stated value is as good as a derived one.
  v_inviter := COALESCE(p_invited_by, auth.uid());
  IF NOT public.inviter_may_grant(v_inviter, p_org_id, p_role) THEN
    RAISE EXCEPTION 'INVITATION_TIER_DENIED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = p_org_id AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Organization not found or archived';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_memberships cm
    JOIN auth.users u ON u.id = cm.user_id
    WHERE cm.org_id = p_org_id AND lower(u.email::TEXT) = lower(p_email)
  ) THEN
    RAISE EXCEPTION 'User is already a member of this organization';
  END IF;

  -- Validate employee if provided
  IF p_employee_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.employees
      WHERE id = p_employee_id AND org_id = p_org_id AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Employee not found in this organization';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.employees
      WHERE id = p_employee_id AND user_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Employee already has a linked user account';
    END IF;
  END IF;

  DELETE FROM public.invitations
   WHERE org_id = p_org_id AND lower(email) = lower(p_email)
     AND (expires_at < NOW() OR revoked_at IS NOT NULL OR accepted_at IS NOT NULL);

  -- Block duplicate: an active (pending) invitation already exists for this email
  IF EXISTS (
    SELECT 1 FROM public.invitations
     WHERE org_id = p_org_id AND lower(email) = lower(p_email)
       AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at >= NOW()
  ) THEN
    RAISE EXCEPTION 'An active invitation already exists for this email';
  END IF;

  INSERT INTO public.invitations (org_id, invited_by, email, role_to_assign, employee_id, first_name, last_name, phone, department_ids, dept_admin_ids)
    VALUES (p_org_id, v_inviter, lower(p_email), p_role::public.org_role, p_employee_id, p_first_name, p_last_name, p_phone, p_department_ids, p_dept_admin_ids)
  RETURNING * INTO v_invite;

  RETURN jsonb_build_object(
    'invitation_id', v_invite.id,
    'token',         v_invite.token,
    'expires_at',    v_invite.expires_at
  );
END;
$$;
DROP FUNCTION IF EXISTS public.send_invitation(TEXT, TEXT, UUID, UUID, TEXT, TEXT, TEXT, BIGINT[], BIGINT[]);
REVOKE ALL ON FUNCTION public.send_invitation(TEXT, TEXT, UUID, UUID, TEXT, TEXT, TEXT, BIGINT[], BIGINT[], UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_invitation(TEXT, TEXT, UUID, UUID, TEXT, TEXT, TEXT, BIGINT[], BIGINT[], UUID) TO authenticated, service_role;
