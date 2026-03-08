-- Migration: 017_fix_change_user_role_rpc.sql
-- Purpose: Fix privilege escalation in change_user_role RPC
--
-- Bug: The original function accepted p_changed_by_id as a caller-supplied
-- parameter and used it for the permission check. Any authenticated user could
-- pass any UUID as p_changed_by_id to bypass the admin promotion guard and
-- promote themselves or others to any role including admin.
--
-- Fix:
--   1. Assert p_changed_by_id = auth.uid() so the parameter cannot be spoofed.
--   2. Derive the caller's role from auth.uid() directly (not the parameter).
--   3. Gate the function: only admins and gridmasters may change roles at all.
--   4. Admins may only change roles within their own org.

CREATE OR REPLACE FUNCTION public.change_user_role(
  p_target_user_id  UUID,
  p_new_role        TEXT,
  p_changed_by_id   UUID,
  p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_old_role             TEXT;
  v_org_id               UUID;
  v_caller_org_role      TEXT;
  v_caller_platform_role TEXT;
  v_caller_org_id        UUID;
BEGIN
  -- 0. Verify p_changed_by_id matches the actual authenticated caller.
  --    Prevents a user from impersonating a higher-privileged account by
  --    supplying a different UUID as the "changed by" identity.
  IF p_changed_by_id <> auth.uid() THEN
    RAISE EXCEPTION 'Caller identity mismatch';
  END IF;

  -- 1. Idempotency check: return early if this key was already processed.
  IF EXISTS (
    SELECT 1 FROM role_change_log WHERE idempotency_key = p_idempotency_key
  ) THEN
    RETURN jsonb_build_object('status', 'already_applied');
  END IF;

  -- 2. Lock the target row to serialize concurrent role changes.
  SELECT org_role::TEXT, org_id INTO v_old_role, v_org_id
    FROM profiles
   WHERE id = p_target_user_id
     FOR UPDATE;

  IF v_old_role IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  -- 3. Read the caller's role from auth.uid() — never from the caller-supplied param.
  SELECT org_role::TEXT, platform_role::TEXT, org_id
    INTO v_caller_org_role, v_caller_platform_role, v_caller_org_id
    FROM profiles
   WHERE id = auth.uid();

  IF v_caller_org_role IS NULL THEN
    RAISE EXCEPTION 'Caller not found';
  END IF;

  -- 4. Only admins and gridmasters are authorised to change roles.
  IF v_caller_platform_role <> 'gridmaster' AND v_caller_org_role <> 'admin' THEN
    RAISE EXCEPTION 'Unauthorized: only admins and gridmasters can change roles';
  END IF;

  -- 5. Admins may only change roles for users within their own organisation.
  IF v_caller_org_role = 'admin' AND v_caller_platform_role <> 'gridmaster' THEN
    IF v_caller_org_id IS NULL OR v_caller_org_id <> v_org_id THEN
      RAISE EXCEPTION 'Unauthorized: admin cannot change roles for users outside their organization';
    END IF;
  END IF;

  -- 6. Admins cannot promote to admin or gridmaster.
  IF v_caller_org_role = 'admin' AND p_new_role IN ('gridmaster', 'admin') THEN
    RAISE EXCEPTION 'admin cannot promote to admin or gridmaster';
  END IF;

  -- 7. Apply the role change with version increment.
  UPDATE profiles
     SET org_role   = p_new_role::org_role,
         version    = version + 1,
         updated_at = NOW()
   WHERE id = p_target_user_id;

  -- 8. Write immutable audit log record.
  INSERT INTO role_change_log
    (target_user_id, changed_by_id, from_role, to_role, idempotency_key)
  VALUES
    (p_target_user_id, p_changed_by_id, v_old_role, p_new_role, p_idempotency_key);

  -- 9. Write JWT refresh lock to force token refresh after role change.
  INSERT INTO jwt_refresh_locks (user_id, locked_until, reason)
    VALUES (p_target_user_id, NOW() + INTERVAL '5 seconds', 'role_change')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '5 seconds',
        reason       = 'role_change';

  RETURN jsonb_build_object(
    'status',    'success',
    'from_role', v_old_role,
    'to_role',   p_new_role
  );
END;
$$;

COMMENT ON FUNCTION public.change_user_role IS
  'Race-condition-safe role change RPC. Verifies caller identity via auth.uid(), '
  'gates on admin/gridmaster, enforces org scoping for admins, and prevents '
  'admin self-promotion to admin or gridmaster.';
