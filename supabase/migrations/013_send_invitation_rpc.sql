-- Migration: send_invitation RPC for invite-only registration
-- Requirements: 5.2, 5.6

-- Create send_invitation function
-- This function allows admins to send invitations to new users
-- It cleans up expired invites for the same email/org before creating a new one
CREATE OR REPLACE FUNCTION public.send_invitation(
  p_email    TEXT,
  p_role     TEXT,
  p_org_id   UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite org_invitations;
BEGIN
  -- Clean up expired invites for the same email/org
  -- This allows re-inviting someone whose previous invite expired
  DELETE FROM org_invitations
   WHERE org_id = p_org_id
     AND email = p_email
     AND accepted_at IS NULL
     AND expires_at < NOW();

  -- Insert new invite with 72-hour expiry (default from table definition)
  INSERT INTO org_invitations (org_id, invited_by, email, role_to_assign)
    VALUES (p_org_id, auth.uid(), p_email, p_role)
  RETURNING * INTO v_invite;

  -- Return token and expiry for the caller to send to the invitee
  RETURN jsonb_build_object(
    'token', v_invite.token,
    'expires_at', v_invite.expires_at
  );
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.send_invitation(TEXT, TEXT, UUID) IS 'Creates an organization invitation. Cleans up expired invites for the same email/org first. Returns token and expires_at.';
