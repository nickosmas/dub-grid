-- 136: Signing in removes only the sandboxes whose session has ended.
--
-- Every web sign-in used to delete all of the person's sandboxes, so signing in
-- on a second device or in a private window discarded a sandbox still open in
-- the first, with no warning. That teardown predates session binding (017):
-- a sandbox now opens only for the auth session that created it, the sign-in
-- response clears the sandbox cookie, and every route refuses (and clears) a
-- cookie whose sandbox that session may not use. A live session's sandbox can
-- therefore stay; Enter asks before replacing it (SANDBOX_OPEN_ELSEWHERE).
--
-- A sandbox's session has ended when its auth session is gone (sign-out,
-- revocation, an ended refresh) or it is a web session past the idle limit
-- (128). Sandboxes with no recorded session predate 017 and go too. The daily
-- cleanup job still removes any sandbox older than 14 days.

CREATE OR REPLACE FUNCTION public.delete_ended_session_sandboxes(p_user_id UUID)
RETURNS INTEGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.organizations AS o
   WHERE o.workspace_kind = 'sandbox'
     AND o.sandbox_owner_user_id = p_user_id
     AND (
       o.sandbox_owner_session_id IS NULL
       OR NOT EXISTS (
         SELECT 1
           FROM auth.sessions AS s
          WHERE s.id = o.sandbox_owner_session_id
            AND s.user_id = p_user_id
       )
       OR public.web_session_is_idle(o.sandbox_owner_session_id, p_user_id)
     );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_ended_session_sandboxes(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_ended_session_sandboxes(UUID) TO service_role;
