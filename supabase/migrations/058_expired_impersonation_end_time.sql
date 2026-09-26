-- 058: An impersonation ended as expired keeps its expiry as its end time (F-79).
--
-- A Gridmaster's sign-out ends their unended impersonations, and one that
-- timed out days earlier is ended as 'expired'. end_impersonation stamped
-- now(), so history showed it lasting until the sign-out, where the lazy
-- cleanup in get_impersonation_history records ended_at = expires_at. Only
-- the end time changes: an 'expired' end records the earlier of now and the
-- expiry; every other reason still records now.

-- From 057_impersonation_notice_wording.sql, with only ended_at changed.
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
