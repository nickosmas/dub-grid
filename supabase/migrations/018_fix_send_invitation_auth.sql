-- Migration: 018_fix_send_invitation_auth.sql
-- Purpose: Fix privilege escalation in send_invitation RPC
--
-- Bug: The function is SECURITY DEFINER (bypasses RLS) but contained zero
-- authorization checks. Any authenticated user could call send_invitation()
-- to create invitations for any org with any role.
--
-- Fix: Add an authorization gate requiring the caller to be a gridmaster
-- or an admin within the target organization.

CREATE OR REPLACE FUNCTION public.send_invitation(
  p_email    TEXT,
  p_role     TEXT,
  p_org_id   UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite org_invitations;
BEGIN
  -- Authorization: only gridmasters or admins of the target org may invite
  IF NOT (
    public.is_gridmaster()
    OR (
      public.caller_org_id() = p_org_id
      AND public.caller_org_role()::TEXT = 'admin'
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only org admins can send invitations';
  END IF;

  -- Clean up expired invites for the same email/org
  DELETE FROM org_invitations
   WHERE org_id = p_org_id
     AND email = p_email
     AND accepted_at IS NULL
     AND expires_at < NOW();

  -- Insert new invite with 72-hour expiry (default from table definition)
  INSERT INTO org_invitations (org_id, invited_by, email, role_to_assign)
    VALUES (p_org_id, auth.uid(), p_email, p_role)
  RETURNING * INTO v_invite;

  RETURN jsonb_build_object(
    'token', v_invite.token,
    'expires_at', v_invite.expires_at
  );
END;
$$;

COMMENT ON FUNCTION public.send_invitation(TEXT, TEXT, UUID) IS
  'Creates an org invitation. Requires caller to be gridmaster or org admin. '
  'Cleans up expired invites for the same email/org first. Returns token and expires_at.';
