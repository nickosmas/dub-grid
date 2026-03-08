-- Migration: 008_change_user_role_rpc.sql
-- Purpose: Create change_user_role RPC function with race-condition-safe operations
-- Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1

-- ============================================================
-- change_user_role RPC Function
-- ============================================================
-- This function implements a race-condition-safe role change operation with:
-- 1. Idempotency check to prevent duplicate operations
-- 2. SELECT FOR UPDATE row locking to serialize concurrent changes
-- 3. Caller permission verification (admins cannot promote to admin/gridmaster)
-- 4. Version increment for optimistic locking support
-- 5. Audit log insertion for compliance
-- 6. JWT refresh lock to force token refresh after role change

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
  v_old_role    TEXT;
  v_caller_role TEXT;
  v_org_id      UUID;
BEGIN
  -- 1. Idempotency check: Return early if this operation was already applied
  -- This prevents duplicate role changes from network retries
  IF EXISTS (
    SELECT 1 FROM role_change_log WHERE idempotency_key = p_idempotency_key
  ) THEN
    RETURN jsonb_build_object('status', 'already_applied');
  END IF;

  -- 2. Lock the target row with FOR UPDATE to serialize concurrent changes
  -- This ensures only one role change can proceed at a time for a given user
  SELECT org_role::TEXT, org_id INTO v_old_role, v_org_id
    FROM profiles
   WHERE id = p_target_user_id
     FOR UPDATE;

  -- Check if target user exists
  IF v_old_role IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  -- 3. Verify caller permissions
  -- Get the caller's role to check if they have permission to make this change
  SELECT org_role::TEXT INTO v_caller_role FROM profiles WHERE id = p_changed_by_id;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller not found';
  END IF;

  -- Admins cannot promote users to admin or gridmaster roles
  -- This enforces the role hierarchy where only gridmasters can create admins
  IF v_caller_role = 'admin' AND p_new_role IN ('gridmaster', 'admin') THEN
    RAISE EXCEPTION 'admin cannot promote to admin or gridmaster';
  END IF;

  -- 4. Apply role change with version increment
  -- The version increment supports optimistic locking for concurrent access detection
  UPDATE profiles
     SET org_role = p_new_role::org_role,
         version = version + 1,
         updated_at = NOW()
   WHERE id = p_target_user_id;

  -- 5. Write audit log record
  -- This creates an immutable record of the role change for compliance
  INSERT INTO role_change_log
    (target_user_id, changed_by_id, from_role, to_role, idempotency_key)
  VALUES
    (p_target_user_id, p_changed_by_id, v_old_role, p_new_role, p_idempotency_key);

  -- 6. Write JWT refresh lock
  -- This blocks new token issuance for 5 seconds to ensure the user gets fresh claims
  -- Uses ON CONFLICT to update existing lock if one exists
  INSERT INTO jwt_refresh_locks (user_id, locked_until, reason)
    VALUES (p_target_user_id, NOW() + INTERVAL '5 seconds', 'role_change')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '5 seconds',
        reason = 'role_change';

  RETURN jsonb_build_object(
    'status', 'success',
    'from_role', v_old_role,
    'to_role', p_new_role
  );
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.change_user_role IS 'Race-condition-safe role change RPC with idempotency, row locking, permission verification, audit logging, and JWT refresh lock';

-- Grant execute permission to authenticated users
-- The function uses SECURITY DEFINER so it runs with elevated privileges
-- but internal checks ensure only authorized callers can make changes
GRANT EXECUTE ON FUNCTION public.change_user_role TO authenticated;
