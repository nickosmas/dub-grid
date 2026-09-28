-- 073: Record a completed sign-in once per Auth session, atomically (F-25).
--
-- recordCompletedSignIn read audit_log for the session's success and wrote
-- one when none was found: two concurrent completion calls could both read
-- nothing and both write. The check and the insert now run in one function
-- under a transaction advisory lock keyed on the person and the session hash,
-- so the second call waits for the first and then finds its row. A lock
-- rather than a unique index, because existing rows may already hold
-- duplicates and history is never rewritten.
--
-- The row matches what writeSecurityAuditEvent writes. Service role only.
CREATE OR REPLACE FUNCTION public.record_sign_in_once(
  p_actor_id UUID,
  p_org_id UUID,
  p_details JSONB
)
RETURNS BOOLEAN
LANGUAGE PLPGSQL
SET search_path = 'public'
AS $$
DECLARE
  v_session_hash TEXT := p_details ->> 'sessionHash';
BEGIN
  IF p_actor_id IS NULL OR v_session_hash IS NULL THEN
    RAISE EXCEPTION 'A sign-in is recorded once only for a known person and session';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('sign-in:' || p_actor_id || ':' || v_session_hash, 0));

  IF EXISTS (
    SELECT 1
      FROM public.audit_log
     WHERE action IN ('security.auth.login', 'security.auth.mfa')
       AND actor_id = p_actor_id
       AND details ->> 'outcome' = 'succeeded'
       AND details ->> 'sessionHash' = v_session_hash
  ) THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.audit_log (org_id, actor_id, actor_email, action, resource_type, resource_id, details)
  VALUES (
    p_org_id,
    p_actor_id,
    NULL,
    'security.auth.login',
    'user',
    NULL,
    p_details || jsonb_build_object('outcome', 'succeeded', 'reason', 'accepted')
  );
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.record_sign_in_once(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_sign_in_once(UUID, UUID, JSONB) TO service_role;
