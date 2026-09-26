-- 055: Impersonation and force logout need fresh proof in the database (F-75).
--
-- start_impersonation and force_logout_user are granted to authenticated and
-- authorize a Gridmaster with is_gridmaster() alone, so a stale or stolen
-- Gridmaster token could start an impersonation (with its in-app notices but
-- without the route's audit row and email notice) or sign anyone out through
-- the data API. Both are rare, deliberate actions with no editing flow to
-- interrupt, so they take the 051 guard; the routes already ask for the same
-- proof with the same token. end_impersonation stays open so a session can
-- always be ended. The schedule, publish and request functions are unchanged
-- on purpose: fresh proof there would interrupt impersonated editing.

-- From 002_functions_triggers.sql, with the guard added.
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
    'Account access notice',
    'A platform administrator is currently reviewing your account for support purposes.',
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
    'Impersonation session started',
    'A platform administrator has started an impersonation session in your organization.',
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

-- From 002_functions_triggers.sql, with the guard added.
CREATE OR REPLACE FUNCTION public.force_logout_user(p_target_user_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- A recent sign-in here too, not only in the route, so a stale or stolen
  -- Gridmaster token cannot act as someone else or sign anyone out through
  -- the data API.
  IF public.is_gridmaster() AND NOT public.caller_has_fresh_proof() THEN
    RAISE EXCEPTION 'STEP_UP_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Only gridmaster can force-logout users';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  DELETE FROM public.user_sessions WHERE user_id = p_target_user_id;

  INSERT INTO public.jwt_refresh_locks (user_id, locked_until, reason)
    VALUES (p_target_user_id, NOW() + INTERVAL '5 minutes', 'force_logout')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '5 minutes', reason = 'force_logout';

  INSERT INTO public.role_change_log (
    target_user_id, changed_by_id, from_role, to_role, change_type, idempotency_key
  ) VALUES (
    p_target_user_id, auth.uid(), 'n/a', 'n/a', 'role_change',
    'logout-' || p_target_user_id || '-' || extract(epoch from NOW())::TEXT
  );
END;
$$;
