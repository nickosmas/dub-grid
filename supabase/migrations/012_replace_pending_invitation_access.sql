-- Replace a live pending invitation when its access level changes. The old
-- token must stop working, but the replacement row must be created in the
-- same transaction so a failed insert cannot strand the invitee without a
-- usable invitation.
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

-- Email delivery happens after the transaction above. If delivery fails, put
-- the original invitation back exactly as the active row and revoke the
-- undelivered replacement in one transaction.
CREATE OR REPLACE FUNCTION public.rollback_pending_invitation_access_replacement(
  p_org_id UUID,
  p_previous_invitation_id UUID,
  p_replacement_invitation_id UUID
) RETURNS BOOLEAN
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_previous public.invitations;
  v_replacement public.invitations;
BEGIN
  SELECT * INTO v_previous
  FROM public.invitations
  WHERE id = p_previous_invitation_id
    AND org_id = p_org_id
  FOR UPDATE;

  SELECT * INTO v_replacement
  FROM public.invitations
  WHERE id = p_replacement_invitation_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF v_previous.id IS NULL
    OR v_replacement.id IS NULL
    OR v_previous.revoked_at IS NULL
    OR v_previous.accepted_at IS NOT NULL
    OR v_replacement.revoked_at IS NOT NULL
    OR v_replacement.accepted_at IS NOT NULL
  THEN
    RETURN FALSE;
  END IF;

  UPDATE public.invitations
  SET revoked_at = NOW()
  WHERE id = v_replacement.id;

  UPDATE public.invitations
  SET revoked_at = NULL
  WHERE id = v_previous.id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_pending_invitation_access_replacement(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollback_pending_invitation_access_replacement(UUID, UUID, UUID) TO service_role;
