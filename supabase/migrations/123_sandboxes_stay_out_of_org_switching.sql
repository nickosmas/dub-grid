-- 123: A Test Sandbox is entered through its cookie, never as an organization.
--
-- Audit finding F-198: a sandbox's owner holds a super_admin membership in it,
-- and switch_org and get_my_organizations read memberships alone. So the sandbox
-- could become a session's organization, outside the cookie's session binding
-- and the per-request check that its owner may still use it.
ALTER FUNCTION public.switch_org(UUID) RENAME TO switch_org_unguarded;
REVOKE ALL ON FUNCTION public.switch_org_unguarded(UUID) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.switch_org(target_org_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT public.is_gridmaster() AND EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = target_org_id AND workspace_kind = 'sandbox'
  ) THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;
  PERFORM public.switch_org_unguarded(target_org_id);
END;
$$;
REVOKE ALL ON FUNCTION public.switch_org(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.switch_org(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_organizations()
RETURNS TABLE (
  org_id    UUID,
  org_name  TEXT,
  org_slug  TEXT,
  org_role  public.org_role,
  is_active BOOLEAN
)
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid        UUID;
  v_session_id UUID;
  v_active_oid UUID;
BEGIN
  v_uid := auth.uid();
  v_session_id := NULLIF(auth.jwt() ->> 'session_id', '')::UUID;

  SELECT COALESCE(
    (SELECT s.active_org_id
       FROM public.user_sessions s
      WHERE s.supabase_session_id = v_session_id
        AND s.user_id = v_uid),
    (SELECT p.org_id FROM public.profiles p WHERE p.id = v_uid)
  ) INTO v_active_oid;

  IF public.is_gridmaster() THEN
    RETURN QUERY
    SELECT o.id, o.name, o.slug, 'user'::public.org_role, (o.id = v_active_oid)
    FROM public.organizations o ORDER BY o.name;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT cm.org_id, o.name, o.slug, cm.org_role, (cm.org_id = v_active_oid)
  FROM public.organization_memberships cm
  JOIN public.organizations o ON o.id = cm.org_id
  WHERE cm.user_id = v_uid
    AND cm.archived_at IS NULL
    AND o.archived_at IS NULL
    AND o.workspace_kind = 'real'
  ORDER BY o.name;
END;
$$;
