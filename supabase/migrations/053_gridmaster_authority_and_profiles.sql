-- 053: Close the grant paths the 41d5 audit found around 051 (F-60).
--
-- change_user_role read profiles.platform_role directly, so a Gridmaster whose
-- second factor was still pending, whose account was deactivated or whose
-- session was revoked skipped 051's guard (is_gridmaster() is false for all
-- three) yet kept full Gridmaster authority in the body. It now takes that
-- authority only from is_gridmaster(), and ignores an archived membership of
-- the caller. profiles kept INSERT and DELETE for authenticated, and the
-- Gridmaster policy is FOR ALL, so a Gridmaster token could delete a profile
-- and re-insert it as a Gridmaster; every profile insert and delete is the
-- service role's or a SECURITY DEFINER function's, so both are revoked.
-- caller_has_fresh_proof() also refuses a timestamp beyond the safe-integer
-- range, as the routes' parser does, instead of overflowing.

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
       OR (entry ->> 'timestamp')::NUMERIC > 9007199254740991
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

  -- Gridmaster authority comes only from is_gridmaster(), which also refuses
  -- a pending second factor, a deactivated account and a revoked session;
  -- the raw platform_role granted it to all three. Never NULL: the checks
  -- below compare it with <>.
  v_caller_platform_role := CASE WHEN public.is_gridmaster() THEN 'gridmaster' ELSE 'none' END;

  -- Resolve caller's role in the target org (not their active org).
  v_caller_org_id := v_target_org_id;
  SELECT cm.org_role::TEXT INTO v_caller_org_role
  FROM organization_memberships cm
  WHERE cm.user_id = auth.uid() AND cm.org_id = v_target_org_id
    AND cm.archived_at IS NULL;

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

REVOKE INSERT, DELETE, TRUNCATE ON TABLE public.profiles FROM authenticated;
