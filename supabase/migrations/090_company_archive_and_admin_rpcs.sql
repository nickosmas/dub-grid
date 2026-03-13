-- ============================================================================
-- Migration 090: Company archive support + gridmaster admin RPCs
--
-- 1. Adds archived_at column to companies (soft-delete)
-- 2. Creates get_audit_log() RPC for gridmaster audit trail
-- 3. Creates count_active_draft_sessions() RPC for dashboard
-- ============================================================================


-- ── 1. Add archived_at to companies ─────────────────────────────────────────

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;


-- ── 2. Gridmaster-only audit log RPC ────────────────────────────────────────
-- Joins role_change_log with auth.users for email resolution and
-- profiles/companies for context. Must be SECURITY DEFINER to access auth.users.

CREATE OR REPLACE FUNCTION public.get_audit_log(
  p_company_id UUID DEFAULT NULL,
  p_limit      INTEGER DEFAULT 50,
  p_offset     INTEGER DEFAULT 0
)
RETURNS TABLE (
  id               UUID,
  target_user_id   UUID,
  target_email     TEXT,
  changed_by_id    UUID,
  changed_by_email TEXT,
  from_role        TEXT,
  to_role          TEXT,
  created_at       TIMESTAMPTZ,
  company_id       UUID,
  company_name     TEXT
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
    rcl.id,
    rcl.target_user_id,
    tu.email::TEXT     AS target_email,
    rcl.changed_by_id,
    cu.email::TEXT     AS changed_by_email,
    rcl.from_role,
    rcl.to_role,
    rcl.created_at,
    tp.company_id,
    c.name             AS company_name
  FROM public.role_change_log rcl
  LEFT JOIN auth.users tu ON tu.id = rcl.target_user_id
  LEFT JOIN auth.users cu ON cu.id = rcl.changed_by_id
  LEFT JOIN public.profiles tp ON tp.id = rcl.target_user_id
  LEFT JOIN public.companies c  ON c.id = tp.company_id
  WHERE (p_company_id IS NULL OR tp.company_id = p_company_id)
  ORDER BY rcl.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_audit_log(UUID, INTEGER, INTEGER) TO authenticated;


-- ── 3. Count active draft sessions (dashboard stat) ─────────────────────────

CREATE OR REPLACE FUNCTION public.count_active_draft_sessions()
RETURNS INTEGER
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COUNT(*)::INTEGER FROM public.schedule_draft_sessions;
$$;

GRANT EXECUTE ON FUNCTION public.count_active_draft_sessions() TO authenticated;
