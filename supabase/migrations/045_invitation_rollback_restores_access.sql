-- Feature 41a2: a failed access change leaves the invitation as it was.
--
-- 044 made an access change rotate the token on the same row, but its restore
-- put back only the token and expiry. When the replacement email failed, the
-- invitee's existing link kept working with the new role, inviter and
-- departments, while the admin was told the change had not gone through. The
-- two-row design this replaced restored everything by un-revoking the
-- original, so this is a regression of that rotation, not of 41a1.
--
-- The rotation now returns the whole previous grant, taken under the same
-- row lock that authorized the change, and the restore puts all of it back.
-- replace_pending_invitation_access is restated with its body unchanged apart
-- from the returned fields, so 41a1's inviter check and tier ceiling carry
-- over verbatim.
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
  v_rotated public.invitations;
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

  -- The inviter recorded on the row is checked, not trusted: this function
  -- runs as service_role, so without this the caller's word decides who
  -- authorized a super_admin invitation.
  IF NOT public.inviter_may_grant(
    COALESCE(p_invited_by, v_current.invited_by), p_org_id, p_role
  ) THEN
    RAISE EXCEPTION 'INVITATION_TIER_DENIED';
  END IF;

  UPDATE public.invitations
  SET token = DEFAULT,
      expires_at = DEFAULT,
      role_to_assign = p_role::public.org_role,
      invited_by = COALESCE(p_invited_by, invited_by),
      department_ids = COALESCE(p_department_ids, department_ids),
      dept_admin_ids = COALESCE(p_dept_admin_ids, dept_admin_ids)
  WHERE id = v_current.id
  RETURNING * INTO v_rotated;

  RETURN jsonb_build_object(
    'invitation_id', v_rotated.id,
    'token', v_rotated.token,
    'expires_at', v_rotated.expires_at,
    'previous_token', v_current.token,
    'previous_expires_at', v_current.expires_at,
    'previous_role', v_current.role_to_assign,
    'previous_invited_by', v_current.invited_by,
    'previous_department_ids', v_current.department_ids,
    'previous_dept_admin_ids', v_current.dept_admin_ids
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_pending_invitation_access(UUID, UUID, TIMESTAMPTZ, TEXT, UUID, BIGINT[], BIGINT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_pending_invitation_access(UUID, UUID, TIMESTAMPTZ, TEXT, UUID, BIGINT[], BIGINT[]) TO service_role;

-- The grant parameters default to NULL so a caller still sending only the
-- token pair resolves here and restores what it names. Each NULL keeps the
-- current value, which is what 044's restore did for all of them.
DROP FUNCTION IF EXISTS public.rollback_pending_invitation_access_replacement(UUID, UUID, UUID, UUID, TIMESTAMPTZ);

CREATE FUNCTION public.rollback_pending_invitation_access_replacement(
  p_org_id UUID,
  p_invitation_id UUID,
  p_rotated_token UUID,
  p_previous_token UUID,
  p_previous_expires_at TIMESTAMPTZ,
  p_previous_role TEXT DEFAULT NULL,
  p_previous_invited_by UUID DEFAULT NULL,
  p_previous_department_ids BIGINT[] DEFAULT NULL,
  p_previous_dept_admin_ids BIGINT[] DEFAULT NULL
) RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_restored public.invitations;
BEGIN
  IF p_previous_role IS NOT NULL AND p_previous_role NOT IN ('admin', 'user', 'super_admin') THEN
    RAISE EXCEPTION 'Invalid invitation role';
  END IF;

  -- Only while the row still carries the token this rotation issued, so a
  -- later rotation or an acceptance in between is never clobbered.
  UPDATE public.invitations
  SET token = p_previous_token,
      expires_at = p_previous_expires_at,
      role_to_assign = COALESCE(p_previous_role::public.org_role, role_to_assign),
      invited_by = COALESCE(p_previous_invited_by, invited_by),
      department_ids = COALESCE(p_previous_department_ids, department_ids),
      dept_admin_ids = COALESCE(p_previous_dept_admin_ids, dept_admin_ids)
  WHERE id = p_invitation_id
    AND org_id = p_org_id
    AND token = p_rotated_token
    AND accepted_at IS NULL
    AND revoked_at IS NULL
  RETURNING * INTO v_restored;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('restored', FALSE);
  END IF;

  RETURN jsonb_build_object(
    'restored', TRUE,
    'invitation_id', v_restored.id,
    'token', v_restored.token,
    'expires_at', v_restored.expires_at,
    'role_to_assign', v_restored.role_to_assign
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_pending_invitation_access_replacement(UUID, UUID, UUID, UUID, TIMESTAMPTZ, TEXT, UUID, BIGINT[], BIGINT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollback_pending_invitation_access_replacement(UUID, UUID, UUID, UUID, TIMESTAMPTZ, TEXT, UUID, BIGINT[], BIGINT[]) TO service_role;
