-- 047: End one of a user's provider sessions.
--
-- Revoking a single device wrote a one-hour marker and deleted DubGrid's
-- session row, but the provider session and its refresh token survived: the
-- access-token hook re-created the row on the next refresh and the device was
-- back once the marker expired. 046 ends all of a user's sessions (or all but
-- one); this ends exactly one, the same way. Refresh tokens cascade from
-- auth.sessions, so no refresh can follow. Access tokens already issued stay
-- valid until expiry, which the per-session marker covers.
--
-- Both ids must match, so a session id taken from one account cannot end
-- another's. Service role only: the route authorizes the actor first.

CREATE OR REPLACE FUNCTION public.end_user_auth_session(
  p_user_id UUID,
  p_session_id UUID
) RETURNS INTEGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_ended INTEGER;
BEGIN
  DELETE FROM auth.sessions
   WHERE user_id = p_user_id
     AND id = p_session_id;
  GET DIAGNOSTICS v_ended = ROW_COUNT;
  RETURN v_ended;
END;
$$;

REVOKE ALL ON FUNCTION public.end_user_auth_session(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_user_auth_session(UUID, UUID) TO service_role;
