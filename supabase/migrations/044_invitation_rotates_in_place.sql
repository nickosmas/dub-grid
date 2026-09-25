-- Feature 41a2: re-issuing an invitation keeps the invitation.
--
-- replace_pending_invitation_access revoked the pending row and inserted a
-- successor, so an invitation changed identity whenever its access was
-- re-issued: a new id, and an audit trail reading as a revoke plus a create.
-- The resend path in the same route already rotates in place, updating the
-- token and expiry on the row under an optimistic check. Rotation adopts that
-- shape, so there is one way to re-issue an invitation instead of two.
--
-- token and expires_at are set to DEFAULT rather than computed here, so the
-- fixed 72-hour absolute expiry and the token source stay defined once, on the
-- column. 41a1's inviter check stays exactly where it was: a role change must
-- keep passing inviter_may_grant, which is why this remains an RPC rather than
-- becoming a direct update from the route.

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

  -- The previous pair travels back so a failed dispatch can restore a usable
  -- link, which is what the resend path already does with its own rotation.
  RETURN jsonb_build_object(
    'invitation_id', v_rotated.id,
    'token', v_rotated.token,
    'expires_at', v_rotated.expires_at,
    'previous_token', v_current.token,
    'previous_expires_at', v_current.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_pending_invitation_access(UUID, UUID, TIMESTAMPTZ, TEXT, UUID, BIGINT[], BIGINT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_pending_invitation_access(UUID, UUID, TIMESTAMPTZ, TEXT, UUID, BIGINT[], BIGINT[]) TO service_role;

-- With one row there is no successor to revoke and no original to un-revoke:
-- restoring means putting the previous token and expiry back, and only while
-- the row still carries the token this rotation issued, so a later rotation or
-- an acceptance in between is never clobbered.
DROP FUNCTION IF EXISTS public.rollback_pending_invitation_access_replacement(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION public.rollback_pending_invitation_access_replacement(
  p_org_id UUID,
  p_invitation_id UUID,
  p_rotated_token UUID,
  p_previous_token UUID,
  p_previous_expires_at TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_restored public.invitations;
BEGIN
  UPDATE public.invitations
  SET token = p_previous_token,
      expires_at = p_previous_expires_at
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
    'expires_at', v_restored.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_pending_invitation_access_replacement(UUID, UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollback_pending_invitation_access_replacement(UUID, UUID, UUID, UUID, TIMESTAMPTZ) TO service_role;
