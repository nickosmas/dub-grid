-- ============================================================================
-- Migration 091: get_company_users() RPC
--
-- Returns users for a specific company with email from auth.users.
-- Gridmaster-only. Joins profiles → company_memberships → auth.users.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_company_users(p_company_id UUID)
RETURNS TABLE (
  id                UUID,
  email             TEXT,
  first_name        TEXT,
  last_name         TEXT,
  platform_role     public.platform_role,
  company_role      public.company_role,
  admin_permissions JSONB,
  created_at        TIMESTAMPTZ
)
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    u.email::TEXT,
    p.first_name,
    p.last_name,
    p.platform_role,
    COALESCE(cm.company_role, 'user'::public.company_role),
    cm.admin_permissions,
    p.created_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.company_memberships cm
    ON cm.user_id = p.id AND cm.company_id = p_company_id
  WHERE p.company_id = p_company_id
  ORDER BY u.email ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_company_users(UUID) TO authenticated;
