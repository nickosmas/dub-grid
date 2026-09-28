-- 071: end_impersonation says whether it ended the session (F-26).
--
-- The portal's end route read the session, then called end_impersonation,
-- whose second call for the same session is a silent no-op. Two concurrent
-- ends both passed the read, so both wrote 'impersonation.ended' and both
-- sent the end notice. The function now returns true only when its UPDATE
-- ended the row, so the route records and announces exactly one end.
--
-- A return type cannot change in place, so the function is dropped and
-- recreated with its grants. Callers that ignore the result (the middleware's
-- /gridmaster escape, sign-out) are unaffected. The body is 060's, with only
-- the RETURN statements added.
DROP FUNCTION IF EXISTS public.end_impersonation(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.end_impersonation(
  p_session_id UUID,
  p_reason TEXT DEFAULT 'manual'
)
RETURNS BOOLEAN
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

  IF v_target_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Notify the target user that the impersonation ended (scoped to target org).
  -- Explicit channel/category (see start_impersonation for rationale).
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

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.end_impersonation(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_impersonation(UUID, TEXT) TO authenticated, service_role;
