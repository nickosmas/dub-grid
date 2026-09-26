-- 060: Leaving an impersonation by visiting /gridmaster is audited (F-33).
--
-- The middleware ends the session with reason 'navigation' when a Gridmaster
-- visits /gridmaster while impersonating, and records nothing: it has no
-- service-role writer, by design. The portal's end and sign-out both write an
-- 'impersonation.ended' row from their routes, so the function writes one only
-- for a 'navigation' end it actually performed.

-- From 058_expired_impersonation_end_time.sql, with only the audit insert added.
CREATE OR REPLACE FUNCTION public.end_impersonation(
  p_session_id UUID,
  p_reason TEXT DEFAULT 'manual'
)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_target_user_id UUID;
  v_target_org_id  UUID;
  v_caller_id      UUID;
  v_caller_email   TEXT;
BEGIN
  v_caller_id := auth.uid();
  SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;

  -- Soft-delete: update instead of delete
  UPDATE impersonation_sessions
     SET ended_at = CASE WHEN p_reason = 'expired' THEN LEAST(now(), expires_at) ELSE now() END,
         end_reason = p_reason
   WHERE session_id = p_session_id
     AND gridmaster_id = v_caller_id
     AND ended_at IS NULL
  RETURNING target_user_id, target_org_id INTO v_target_user_id, v_target_org_id;

  -- Notify the target user that the impersonation ended (scoped to target org).
  -- Explicit channel/category (see start_impersonation for rationale).
  IF v_target_user_id IS NOT NULL THEN
    -- The /gridmaster escape ends a session from the middleware, which writes
    -- no audit row of its own; every other end is recorded by its route.
    IF p_reason = 'navigation' THEN
      INSERT INTO audit_log (org_id, actor_id, actor_email, action, resource_type, resource_id, details)
      VALUES (
        v_target_org_id,
        v_caller_id,
        v_caller_email,
        'impersonation.ended',
        'impersonation_session',
        p_session_id::text,
        jsonb_build_object('initiated_by', 'gridmaster', 'reason', 'navigation', 'trigger', 'escape')
      );
    END IF;

    INSERT INTO notifications (user_id, org_id, type, channel, category, title, message, metadata)
    VALUES (
      v_target_user_id,
      v_target_org_id,
      'impersonation_end',
      'in_app',
      'security',
      'DubGrid support has left your account',
      'DubGrid support has finished using your account.',
      jsonb_build_object(
        'session_id', p_session_id,
        'end_reason', p_reason,
        'gridmaster_id', v_caller_id,
        'gridmaster_email', v_caller_email
      )
    );

    -- Parity with start_impersonation: notify org super_admins so they see
    -- both the start and end of any impersonation in their org.
    INSERT INTO notifications (user_id, org_id, type, channel, category, title, message, metadata)
    SELECT
      cm.user_id,
      v_target_org_id,
      'impersonation_end',
      'in_app',
      'security',
      'DubGrid support session ended',
      'DubGrid support has finished using a member''s account in your organization.',
      jsonb_build_object(
        'session_id', p_session_id,
        'end_reason', p_reason,
        'target_user_id', v_target_user_id,
        'gridmaster_id', v_caller_id,
        'gridmaster_email', v_caller_email
      )
    FROM organization_memberships cm
    WHERE cm.org_id = v_target_org_id
      AND cm.org_role = 'super_admin'
      AND cm.archived_at IS NULL
      AND cm.user_id <> v_target_user_id;
  END IF;
END;
$$;
