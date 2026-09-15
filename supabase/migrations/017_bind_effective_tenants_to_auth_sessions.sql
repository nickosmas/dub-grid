-- Bind temporary effective-tenant state to the authenticated browser session.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS sandbox_owner_session_id UUID;

ALTER TABLE public.impersonation_sessions
  ADD COLUMN IF NOT EXISTS auth_session_id UUID;

COMMENT ON COLUMN public.organizations.sandbox_owner_session_id IS
  'Supabase auth session that owns this Test Sandbox. A different session cannot select it.';

COMMENT ON COLUMN public.impersonation_sessions.auth_session_id IS
  'Supabase auth session that created and owns this impersonation session.';

CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_auth_session
  ON public.impersonation_sessions(auth_session_id)
  WHERE ended_at IS NULL;

CREATE OR REPLACE FUNCTION public.bind_impersonation_auth_session()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SET search_path = 'public'
AS $$
DECLARE
  v_auth_session_id UUID;
BEGIN
  v_auth_session_id := NULLIF(auth.jwt() ->> 'session_id', '')::UUID;
  IF v_auth_session_id IS NULL THEN
    RAISE EXCEPTION 'An authenticated session is required';
  END IF;

  NEW.auth_session_id := v_auth_session_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_bind_impersonation_auth_session
  BEFORE INSERT ON public.impersonation_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.bind_impersonation_auth_session();

CREATE OR REPLACE FUNCTION public.is_own_sandbox_org(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = p_org_id
      AND o.workspace_kind = 'sandbox'
      AND o.sandbox_owner_user_id = auth.uid()
      AND o.sandbox_owner_session_id = NULLIF(auth.jwt() ->> 'session_id', '')::UUID
      AND o.archived_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.bind_impersonation_auth_session() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bind_impersonation_auth_session() TO service_role;
