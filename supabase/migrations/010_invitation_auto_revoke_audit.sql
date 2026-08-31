-- Sharpen revoke_invitation_on_email_change() so it (a) doesn't revoke a
-- still-valid pending invitation when the employee's contact email is
-- merely being backfilled to the SAME address the invitation already
-- targets, and (b) writes an audit_log row for every invitation it does
-- revoke, so the auto-revoke is no longer a silent side effect.
CREATE OR REPLACE FUNCTION public.revoke_invitation_on_email_change()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    WITH revoked AS (
      UPDATE public.invitations
      SET revoked_at = NOW()
      WHERE employee_id = OLD.id
        AND accepted_at IS NULL
        AND revoked_at IS NULL
        AND expires_at >= NOW()
        AND lower(btrim(email)) IS DISTINCT FROM lower(btrim(COALESCE(NEW.email, '')))
      RETURNING id, org_id, email
    )
    INSERT INTO public.audit_log (org_id, actor_id, actor_email, action, resource_type, resource_id, details)
    SELECT
      org_id, NULL, NULL, 'invitation.auto_revoked', 'invitation', id::TEXT,
      jsonb_build_object(
        'reason', 'employee_email_changed',
        'employee_id', OLD.id,
        'old_email', OLD.email,
        'new_email', NEW.email,
        'invitation_email', email
      )
    FROM revoked;
  END IF;
  RETURN NEW;
END;
$$;
