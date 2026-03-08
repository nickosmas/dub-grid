-- Migration: Create impersonation RPC functions
-- Requirements: 4.1, 4.3, 4.4, 4.6
-- Provides start_impersonation and end_impersonation functions for Gridmaster support

-- ============================================================
-- start_impersonation RPC
-- ============================================================
-- Allows a Gridmaster to start an impersonation session for a target user.
-- Requirements: 4.1 (create session), 4.3 (30-minute expiry), 4.6 (scope to target org)

CREATE OR REPLACE FUNCTION public.start_impersonation(
  p_target_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session impersonation_sessions;
  v_target_org_id UUID;
BEGIN
  -- Verify caller is gridmaster (Requirement 4.1)
  IF NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Only gridmaster can impersonate users';
  END IF;

  -- Get target user's org_id for scoping data access (Requirement 4.6)
  SELECT org_id INTO v_target_org_id 
  FROM profiles 
  WHERE id = p_target_user_id;

  IF v_target_org_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found or has no organization';
  END IF;

  -- Create session with 30-minute expiry (Requirement 4.3)
  -- The default on expires_at column handles the 30-minute expiry
  INSERT INTO impersonation_sessions (gridmaster_id, target_user_id, target_org_id)
    VALUES (auth.uid(), p_target_user_id, v_target_org_id)
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'session_id', v_session.session_id,
    'expires_at', v_session.expires_at
  );
END;
$$;

-- ============================================================
-- end_impersonation RPC
-- ============================================================
-- Allows a Gridmaster to end their own impersonation session.
-- Requirement: 4.4 (delete session when ended)

CREATE OR REPLACE FUNCTION public.end_impersonation(
  p_session_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Delete session only if caller is the owning gridmaster
  -- This ensures gridmasters can only end their own sessions
  DELETE FROM impersonation_sessions
   WHERE session_id = p_session_id
     AND gridmaster_id = auth.uid();
END;
$$;

-- Add comments for documentation
COMMENT ON FUNCTION public.start_impersonation(UUID) IS 'Creates an impersonation session for a Gridmaster to impersonate a target user. Returns session_id and expires_at.';
COMMENT ON FUNCTION public.end_impersonation(UUID) IS 'Ends an impersonation session. Only the owning Gridmaster can end their own sessions.';
