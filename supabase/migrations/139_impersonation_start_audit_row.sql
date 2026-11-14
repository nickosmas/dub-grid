-- 139: Starting an impersonation writes its own audit row (F-201).
--
-- The route wrote impersonation.started after start_impersonation returned, so
-- a Gridmaster calling the function directly through the data API, with fresh
-- proof, started a session that the organization's activity log never showed.
-- The function now writes the row in the same transaction as the session; the
-- route no longer writes one. Redefined from 057 with only the insert added.

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

  -- Written here so a direct call through the data API leaves the same record
  -- as the route, which used to write it after this returned (F-201).
  INSERT INTO audit_log (
    org_id, actor_id, actor_email, action, resource_type, resource_id, details,
    ip_address, user_agent
  )
  VALUES (
    v_target_org_id,
    v_caller_id,
    v_caller_email,
    'impersonation.started',
    'impersonation_session',
    v_session.session_id::text,
    jsonb_build_object(
      'initiated_by', 'gridmaster',
      'targetUserId', p_target_user_id,
      'justification', trim(p_justification)
    ),
    p_ip_address,
    p_user_agent
  );

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
