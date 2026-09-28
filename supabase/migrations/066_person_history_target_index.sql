-- 066: Serve the Gridmaster person page's history and actor names.
--
-- The account history reads audit_log rows where the person is the actor, the
-- resource, or `details->>'targetUserId'`. The first two branches have
-- indexes; the third had none, so the whole OR planned as a sequential scan of
-- audit_log even with sequential scans disabled (F-92). A partial expression
-- index on the key lets the three branches combine as a bitmap OR. Equality on
-- the key implies it is not null, so the planner can use the partial index.
--
-- The page also named each actor with one Auth admin call per id. The
-- function returns the emails of a list of accounts in one query. Service role
-- only: the routes authorize the Gridmaster first, and emails of arbitrary
-- accounts must never be readable by a signed-in user.

CREATE INDEX IF NOT EXISTS idx_audit_log_details_target_user
  ON public.audit_log ((details ->> 'targetUserId'))
  WHERE (details ->> 'targetUserId') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.gridmaster_user_emails(p_user_ids UUID[])
RETURNS TABLE (id UUID, email TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT u.id, u.email::TEXT
  FROM auth.users AS u
  WHERE u.id = ANY (p_user_ids);
$$;

REVOKE ALL ON FUNCTION public.gridmaster_user_emails(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gridmaster_user_emails(UUID[]) TO service_role;
