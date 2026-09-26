-- 051: A Gridmaster's grant needs fresh proof in the database (F-60).
--
-- The routes ask a Gridmaster for a recent sign-in before every grant (41d3,
-- 41d4), but the grant functions are granted to authenticated, so a
-- Gridmaster's token could call them through the data API and make anyone a
-- Super Admin or a Gridmaster without it. caller_has_fresh_proof() applies the
-- routes' rule (evaluateSensitiveActionAssurance in packages/authz): TOTP at
-- aal2 when the caller has a verified TOTP factor, otherwise password, with
-- the newest matching amr timestamp at most 300 seconds old and at most 30
-- seconds ahead; a malformed amr list proves nothing. The five grant functions
-- are redefined from their newest definitions with only the guard added, so a
-- Gridmaster without fresh proof is refused and every other caller is
-- unaffected. The routes pass the same assured token, so no application path
-- changes.

CREATE OR REPLACE FUNCTION public.caller_has_fresh_proof()
RETURNS BOOLEAN
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_claims JSONB := auth.jwt();
  v_amr JSONB;
  v_method TEXT;
  v_at BIGINT;
  v_now BIGINT := floor(extract(epoch FROM now()))::BIGINT;
BEGIN
  IF v_claims IS NULL OR COALESCE(v_claims ->> 'aal', '') NOT IN ('aal1', 'aal2') THEN
    RETURN FALSE;
  END IF;

  v_amr := v_claims -> 'amr';
  IF jsonb_typeof(v_amr) IS DISTINCT FROM 'array' OR jsonb_array_length(v_amr) = 0 THEN
    RETURN FALSE;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_amr) AS entry
    WHERE jsonb_typeof(entry) IS DISTINCT FROM 'object'
       OR jsonb_typeof(entry -> 'method') IS DISTINCT FROM 'string'
       OR entry ->> 'method' = ''
       OR jsonb_typeof(entry -> 'timestamp') IS DISTINCT FROM 'number'
       OR (entry ->> 'timestamp')::NUMERIC < 0
       OR (entry ->> 'timestamp')::NUMERIC <> trunc((entry ->> 'timestamp')::NUMERIC)
  ) THEN
    RETURN FALSE;
  END IF;

  v_method := CASE
    WHEN EXISTS (
      SELECT 1
      FROM auth.mfa_factors AS factor
      WHERE factor.user_id = auth.uid()
        AND factor.factor_type = 'totp'
        AND factor.status = 'verified'
    ) THEN 'totp'
    ELSE 'password'
  END;
  IF v_method = 'totp' AND v_claims ->> 'aal' <> 'aal2' THEN
    RETURN FALSE;
  END IF;

  SELECT max((entry ->> 'timestamp')::NUMERIC)::BIGINT
    INTO v_at
    FROM jsonb_array_elements(v_amr) AS entry
   WHERE entry ->> 'method' = v_method;

  RETURN v_at IS NOT NULL AND v_at <= v_now + 30 AND v_now - v_at <= 300;
END;
$$;

REVOKE ALL ON FUNCTION public.caller_has_fresh_proof() FROM PUBLIC, anon, authenticated;

-- From 002_functions_triggers.sql, with the guard added.
CREATE OR REPLACE FUNCTION public.change_user_role(
  p_target_user_id  UUID,
  p_new_role        TEXT,
  p_changed_by_id   UUID,
  p_idempotency_key TEXT,
  p_org_id          UUID DEFAULT NULL,  -- explicit org context for multi-org
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
) RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_old_role          TEXT;
  v_current_updated_at TIMESTAMPTZ;
  v_target_org_id     UUID;
  v_caller_platform_role TEXT;
  v_caller_org_role   TEXT;
  v_caller_org_id     UUID;
BEGIN
  -- A Gridmaster's grant needs a recent sign-in here too, not only in the
  -- route, so a stale or stolen token cannot grant through the data API.
  IF public.is_gridmaster() AND NOT public.caller_has_fresh_proof() THEN
    RAISE EXCEPTION 'STEP_UP_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_changed_by_id <> auth.uid() THEN
    RAISE EXCEPTION 'Caller identity mismatch';
  END IF;

  -- Self-action guard: no one may change their own org role (neither demotion
  -- nor promotion). Mirrors the gridmaster self-demotion guard. Forces another
  -- admin to act, which also prevents self-inflicted lockout.
  IF p_target_user_id = p_changed_by_id THEN
    RAISE EXCEPTION 'SELF_ACTION_FORBIDDEN: you cannot change your own role';
  END IF;

  -- Advisory lock prevents two callers from changing the same user's role
  -- simultaneously (last-write-wins race). Released at end of transaction.
  PERFORM pg_advisory_xact_lock(hashtext('change_role_' || p_target_user_id::TEXT));

  IF EXISTS (
    SELECT 1 FROM role_change_log WHERE idempotency_key = p_idempotency_key
  ) THEN
    RETURN jsonb_build_object('status', 'already_applied');
  END IF;

  -- Resolve the org context: prefer explicit p_org_id, fall back to target's active org.
  IF p_org_id IS NOT NULL THEN
    v_target_org_id := p_org_id;
  ELSE
    SELECT org_id INTO v_target_org_id
    FROM profiles WHERE id = p_target_user_id;
  END IF;

  IF v_target_org_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found or has no active organization';
  END IF;

  SELECT org_role::TEXT, updated_at INTO v_old_role, v_current_updated_at
  FROM organization_memberships
  WHERE user_id = p_target_user_id AND org_id = v_target_org_id
  FOR UPDATE;

  IF v_old_role IS NULL THEN
    RAISE EXCEPTION 'Target user has no membership for this organization';
  END IF;

  IF p_expected_updated_at IS NOT NULL
     AND v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Organization membership changed elsewhere';
  END IF;

  SELECT p.platform_role::TEXT
  INTO v_caller_platform_role
  FROM profiles p WHERE p.id = auth.uid();

  -- Resolve caller's role in the target org (not their active org).
  v_caller_org_id := v_target_org_id;
  SELECT cm.org_role::TEXT INTO v_caller_org_role
  FROM organization_memberships cm
  WHERE cm.user_id = auth.uid() AND cm.org_id = v_target_org_id;

  IF v_caller_org_role IS NULL AND v_caller_platform_role <> 'gridmaster' THEN
    RAISE EXCEPTION 'Caller not found or has no membership';
  END IF;

  IF v_caller_platform_role <> 'gridmaster'
     AND COALESCE(v_caller_org_role, 'user') NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admins and gridmasters can change roles';
  END IF;

  -- Org scoping: caller must have membership in the target org (already verified above).
  IF v_caller_platform_role <> 'gridmaster' THEN
    IF v_caller_org_role IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: cannot change roles for users outside your organization';
    END IF;
  END IF;

  -- Tier guard: an admin may not touch privileged accounts in either
  -- direction. They cannot promote anyone INTO admin/super_admin/gridmaster,
  -- and cannot change the role of a target who already holds one of those
  -- tiers (which would otherwise let an admin demote a super_admin). Only
  -- super_admins and gridmasters manage privileged roles.
  IF COALESCE(v_caller_org_role, 'user') = 'admin'
     AND (
       v_old_role IN ('gridmaster', 'admin', 'super_admin')
       OR p_new_role IN ('gridmaster', 'admin', 'super_admin')
     ) THEN
    RAISE EXCEPTION 'admin cannot change the role of an admin, super_admin, or gridmaster';
  END IF;

  -- Prevent demotion of the last super_admin in an org.
  IF v_old_role = 'super_admin' AND p_new_role <> 'super_admin' THEN
    IF (SELECT count(*) FROM organization_memberships
        WHERE org_id = v_target_org_id
          AND org_role = 'super_admin'
          AND user_id <> p_target_user_id
          AND archived_at IS NULL) = 0 THEN
      RAISE EXCEPTION 'Cannot demote the last super_admin of an organization';
    END IF;
  END IF;

  -- Set session flag to bypass the guard_org_role_change trigger.
  -- This is the ONLY authorised path for org_role mutations.
  PERFORM set_config('app.allow_role_change', 'true', true);

  UPDATE organization_memberships
  SET org_role = p_new_role::org_role
  WHERE user_id = p_target_user_id AND org_id = v_target_org_id;

  UPDATE profiles
  SET version = version + 1, updated_at = NOW()
  WHERE id = p_target_user_id;

  INSERT INTO role_change_log
    (org_id, target_user_id, changed_by_id, from_role, to_role, idempotency_key)
  VALUES
    (v_target_org_id, p_target_user_id, p_changed_by_id, v_old_role, p_new_role, p_idempotency_key);

  INSERT INTO jwt_refresh_locks (user_id, locked_until, reason)
    VALUES (p_target_user_id, NOW() + INTERVAL '5 seconds', 'role_change')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '5 seconds', reason = 'role_change';

  RETURN jsonb_build_object('status', 'success', 'from_role', v_old_role, 'to_role', p_new_role);
END;
$$;

-- From 021_platform_account_termination.sql, with the guard added.
CREATE OR REPLACE FUNCTION public.assign_org_role_by_email(
  p_email    TEXT,
  p_org_id   UUID,
  p_org_role public.org_role DEFAULT 'user'
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  target_user_id UUID;
BEGIN
  -- A Gridmaster's grant needs a recent sign-in here too, not only in the
  -- route, so a stale or stolen token cannot grant through the data API.
  IF public.is_gridmaster() AND NOT public.caller_has_fresh_proof() THEN
    RAISE EXCEPTION 'STEP_UP_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_email IS NULL OR p_email !~ '^\S+@\S+\.\S+$' THEN
    RAISE EXCEPTION 'Invalid email format';
  END IF;

  IF NOT (
    public.is_gridmaster()
    OR (
      public.caller_org_id() = p_org_id
      AND public.caller_org_role() IN ('admin', 'super_admin')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: insufficient permissions';
  END IF;

  IF NOT public.is_gridmaster()
     AND public.caller_org_role() = 'admin'
     AND p_org_role IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'admin cannot assign admin or super_admin';
  END IF;

  SELECT id INTO target_user_id FROM auth.users WHERE lower(email::TEXT) = lower(p_email);

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', p_email;
  END IF;

  INSERT INTO public.profiles (id, org_id, platform_role)
  VALUES (target_user_id, p_org_id, 'none')
  ON CONFLICT (id) DO UPDATE
    SET org_id = COALESCE(profiles.org_id, EXCLUDED.org_id),
        updated_at = NOW();

  PERFORM set_config('app.allow_role_change', 'true', true);

  -- Reviving an archived membership runs through guard_terminated_membership,
  -- so a terminated account still cannot be let back in this way.
  INSERT INTO public.organization_memberships (user_id, org_id, org_role)
  VALUES (target_user_id, p_org_id, p_org_role)
  ON CONFLICT (user_id, org_id) DO UPDATE
    SET org_role = EXCLUDED.org_role,
        archived_at = NULL,
        archived_by = NULL,
        updated_at = NOW();
END;
$$;

-- From 002_functions_triggers.sql, with the guard added.
CREATE OR REPLACE FUNCTION public.promote_gridmaster_by_email(p_email TEXT)
RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  target_user_id UUID;
BEGIN
  -- A Gridmaster's grant needs a recent sign-in here too, not only in the
  -- route, so a stale or stolen token cannot grant through the data API.
  IF public.is_gridmaster() AND NOT public.caller_has_fresh_proof() THEN
    RAISE EXCEPTION 'STEP_UP_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_gridmaster() THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT id INTO target_user_id
  FROM auth.users
  WHERE lower(email::TEXT) = lower(p_email);

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', p_email;
  END IF;

  UPDATE public.organization_memberships
  SET archived_at = COALESCE(archived_at, NOW()),
      archived_by = auth.uid(),
      updated_at = NOW()
  WHERE user_id = target_user_id
    AND archived_at IS NULL;

  INSERT INTO public.profiles (id, org_id, platform_role, updated_at)
  VALUES (target_user_id, NULL, 'gridmaster', NOW())
  ON CONFLICT (id) DO UPDATE
    SET platform_role = 'gridmaster',
        org_id = NULL,
        updated_at = NOW();

  DELETE FROM public.user_sessions WHERE user_id = target_user_id;

  INSERT INTO public.jwt_refresh_locks (user_id, locked_until, reason)
    VALUES (target_user_id, NOW() + INTERVAL '5 minutes', 'gridmaster_promotion')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '5 minutes', reason = 'gridmaster_promotion';

  RETURN jsonb_build_object('user_id', target_user_id, 'email', p_email);
END;
$$;

-- From 002_functions_triggers.sql, with the guard added.
CREATE OR REPLACE FUNCTION public.demote_gridmaster_account(
  p_target_user_id UUID,
  p_org_id UUID,
  p_org_role public.org_role
)
RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  target_email TEXT;
  target_was_active BOOLEAN := FALSE;
BEGIN
  -- A Gridmaster's grant needs a recent sign-in here too, not only in the
  -- route, so a stale or stolen token cannot grant through the data API.
  IF public.is_gridmaster() AND NOT public.caller_has_fresh_proof() THEN
    RAISE EXCEPTION 'STEP_UP_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_gridmaster() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_target_user_id = auth.uid() THEN RAISE EXCEPTION 'Cannot demote your own gridmaster account'; END IF;

  SELECT u.email::TEXT, p.deactivated_at IS NULL
  INTO target_email, target_was_active
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_target_user_id
    AND p.platform_role = 'gridmaster';

  IF target_email IS NULL THEN RAISE EXCEPTION 'Gridmaster account not found'; END IF;

  IF target_was_active AND (
    SELECT count(*)
    FROM public.profiles
    WHERE platform_role = 'gridmaster'
      AND deactivated_at IS NULL
      AND id <> p_target_user_id
  ) = 0 THEN
    RAISE EXCEPTION 'Cannot remove the last active gridmaster account';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = p_org_id AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  UPDATE public.profiles
  SET platform_role = 'none',
      org_id = p_org_id,
      updated_at = NOW()
  WHERE id = p_target_user_id;

  INSERT INTO public.organization_memberships (user_id, org_id, org_role, archived_at, archived_by, updated_at)
  VALUES (p_target_user_id, p_org_id, p_org_role, NULL, NULL, NOW())
  ON CONFLICT (user_id, org_id) DO UPDATE
    SET org_role = EXCLUDED.org_role,
        archived_at = NULL,
        archived_by = NULL,
        updated_at = NOW();

  DELETE FROM public.user_sessions WHERE user_id = p_target_user_id;

  INSERT INTO public.jwt_refresh_locks (user_id, locked_until, reason)
    VALUES (p_target_user_id, NOW() + INTERVAL '5 minutes', 'gridmaster_demotion')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '5 minutes', reason = 'gridmaster_demotion';

  RETURN jsonb_build_object('user_id', p_target_user_id, 'email', target_email, 'org_id', p_org_id, 'org_role', p_org_role);
END;
$$;

-- From 002_functions_triggers.sql, with the guard added.
CREATE OR REPLACE FUNCTION public.set_gridmaster_account_deactivated(
  p_target_user_id UUID,
  p_deactivate BOOLEAN
)
RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  target_email TEXT;
  target_was_active BOOLEAN := FALSE;
BEGIN
  -- A Gridmaster's grant needs a recent sign-in here too, not only in the
  -- route, so a stale or stolen token cannot grant through the data API.
  IF public.is_gridmaster() AND NOT public.caller_has_fresh_proof() THEN
    RAISE EXCEPTION 'STEP_UP_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_gridmaster() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_target_user_id = auth.uid() THEN RAISE EXCEPTION 'Cannot change activation for your own gridmaster account'; END IF;

  SELECT u.email::TEXT, p.deactivated_at IS NULL
  INTO target_email, target_was_active
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_target_user_id
    AND p.platform_role = 'gridmaster';

  IF target_email IS NULL THEN RAISE EXCEPTION 'Gridmaster account not found'; END IF;

  IF p_deactivate AND target_was_active AND (
    SELECT count(*)
    FROM public.profiles
    WHERE platform_role = 'gridmaster'
      AND deactivated_at IS NULL
      AND id <> p_target_user_id
  ) = 0 THEN
    RAISE EXCEPTION 'Cannot deactivate the last active gridmaster account';
  END IF;

  UPDATE public.profiles
  SET deactivated_at = CASE WHEN p_deactivate THEN NOW() ELSE NULL END,
      deactivated_by = CASE WHEN p_deactivate THEN auth.uid() ELSE NULL END,
      updated_at = NOW()
  WHERE id = p_target_user_id;

  IF p_deactivate THEN
    DELETE FROM public.user_sessions WHERE user_id = p_target_user_id;
  END IF;

  INSERT INTO public.jwt_refresh_locks (user_id, locked_until, reason)
    VALUES (p_target_user_id, NOW() + INTERVAL '5 minutes', 'gridmaster_activation_change')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '5 minutes', reason = 'gridmaster_activation_change';

  RETURN jsonb_build_object('user_id', p_target_user_id, 'email', target_email, 'deactivated', p_deactivate);
END;
$$;
