-- 046: End a user's sessions at the provider, not only their current tokens.
--
-- The app revokes access with a watermark that rejects tokens issued before
-- it (lib/auth/revocation.ts). That is right after a role change, where the
-- session should refresh into new claims, but it cannot evict anyone: the
-- refresh token still works, the access-token hook re-creates the session row
-- and mints a token issued after the watermark. When an administrator changes
-- someone's sign-in email (finding F-21), their existing sessions must end.
--
-- Deleting auth.sessions is what Supabase's own logout does; refresh tokens
-- cascade from it (refresh_tokens_session_id_fkey ON DELETE CASCADE), so no
-- refresh can follow. Access tokens already issued stay valid until expiry,
-- which the watermark covers. p_keep_session_id spares the caller's own
-- session when someone changes their own record.
--
-- Service role only: the route authorizes the actor first.

CREATE OR REPLACE FUNCTION public.end_user_auth_sessions(
  p_user_id UUID,
  p_keep_session_id UUID DEFAULT NULL
) RETURNS INTEGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_ended INTEGER;
BEGIN
  DELETE FROM auth.sessions
   WHERE user_id = p_user_id
     AND (p_keep_session_id IS NULL OR id <> p_keep_session_id);
  GET DIAGNOSTICS v_ended = ROW_COUNT;
  RETURN v_ended;
END;
$$;

REVOKE ALL ON FUNCTION public.end_user_auth_sessions(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_user_auth_sessions(UUID, UUID) TO service_role;
