-- 057: In-app impersonation notices read as the emails do (F-38).
--
-- The emails say "DubGrid support is using your account"; the in-app notices
-- still said "A platform administrator is currently reviewing your account",
-- so one event read two ways. Both functions are redefined from their newest
-- definitions with only the notice titles and messages changed. No person is
-- named, as with the emails.

-- From 055_impersonation_and_force_logout_need_fresh_proof.sql, with the notice text changed.
CREATE OR REPLACE FUNCTION public.start_impersonation(
  p_target_user_id UUID,
  p_justification TEXT,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_target_org_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_session impersonation_sessions;
  v_target_org_id UUID;
  v_caller_id UUID;
  v_caller_email TEXT;
  v_active_count INTEGER;
BEGIN
  -- A recent sign-in here too, not only in the route, so a stale or stolen
  -- Gridmaster token cannot act as someone else or sign anyone out through
  -- the data API.
  IF public.is_gridmaster() AND NOT public.caller_has_fresh_proof() THEN
    RAISE EXCEPTION 'STEP_UP_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Only gridmaster can impersonate users';
  END IF;

  v_caller_id := auth.uid();
  SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;

  -- Self-impersonation prevention (defense in depth with CHECK constraint)
  IF v_caller_id = p_target_user_id THEN
    RAISE EXCEPTION 'Cannot impersonate yourself';
  END IF;

  -- Validate justification (10–500 characters for meaningful reason)
  IF p_justification IS NULL OR length(trim(p_justification)) < 10 OR length(p_justification) > 500 THEN
    RAISE EXCEPTION 'Justification must be between 10 and 500 characters';
  END IF;

  -- Multi-level impersonation prevention: block if caller already has an active session
  SELECT count(*) INTO v_active_count
  FROM impersonation_sessions
  WHERE gridmaster_id = v_caller_id
    AND ended_at IS NULL
    AND expires_at > now();

  IF v_active_count > 0 THEN
    RAISE EXCEPTION 'Cannot start a new impersonation while another session is active. End the current session first.';
  END IF;

  -- Resolve target org: use explicit param if provided, else fall back to profile
  IF p_target_org_id IS NOT NULL THEN
    -- Validate that the target user has a membership in the specified org
    IF NOT EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE user_id = p_target_user_id AND org_id = p_target_org_id
    ) THEN
      RAISE EXCEPTION 'Target user does not belong to the specified organization';
    END IF;
    v_target_org_id := p_target_org_id;
  ELSE
    SELECT org_id INTO v_target_org_id
    FROM profiles WHERE id = p_target_user_id;
  END IF;

  IF v_target_org_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found or has no organization';
  END IF;

  INSERT INTO impersonation_sessions (
    gridmaster_id, target_user_id, target_org_id,
    justification, ip_address, user_agent
  )
  VALUES (
    v_caller_id, p_target_user_id, v_target_org_id,
    trim(p_justification), p_ip_address, p_user_agent
  )
  RETURNING * INTO v_session;

  -- Notify the target user about the impersonation (scoped to target org).
  -- Explicit channel/category so the email-prefs lookup in sendNotification
  -- (keyed on category) resolves correctly if anyone wires impersonation to
  -- the email path later. Category 'security' is in the default-email-on set.
  INSERT INTO notifications (user_id, org_id, type, channel, category, title, message, metadata)
  VALUES (
    p_target_user_id,
    v_target_org_id,
    'impersonation_start',
    'in_app',
    'security',
    'DubGrid support is using your account',
    'DubGrid support is using your account to help with a support request. You''ll get another notice when they finish.',
    jsonb_build_object(
      'session_id', v_session.session_id,
      'expires_at', v_session.expires_at,
      'justification', trim(p_justification),
      'gridmaster_id', v_caller_id,
      'gridmaster_email', v_caller_email
    )
  );

  -- Notify all org super_admins about the impersonation (security transparency).
  -- Excludes the target user (already notified above) to avoid duplicate notifications.
  INSERT INTO notifications (user_id, org_id, type, channel, category, title, message, metadata)
  SELECT
    cm.user_id,
    v_target_org_id,
    'impersonation_start',
    'in_app',
    'security',
    'DubGrid support started a session',
    'DubGrid support is using a member''s account in your organization.',
    jsonb_build_object(
      'session_id', v_session.session_id,
      'expires_at', v_session.expires_at,
      'justification', trim(p_justification),
      'target_user_id', p_target_user_id,
      'gridmaster_id', v_caller_id,
      'gridmaster_email', v_caller_email
    )
  FROM organization_memberships cm
  WHERE cm.org_id = v_target_org_id
    AND cm.org_role = 'super_admin'
    AND cm.archived_at IS NULL
    AND cm.user_id <> p_target_user_id;

  RETURN jsonb_build_object('session_id', v_session.session_id, 'expires_at', v_session.expires_at);
END;
$$;

-- From 002_functions_triggers.sql, with the notice text changed.
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
     SET ended_at = now(),
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
