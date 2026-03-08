-- Migration: 033_gridmaster_dashboard_helpers.sql
-- Purpose: Add RPCs and tables to support the Gridmaster Dashboard.

-- 1. Create System Config table
CREATE TABLE IF NOT EXISTS public.system_config (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- Only Gridmasters can see/manage system config
CREATE POLICY "gridmaster_all_system_config" 
  ON public.system_config FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

-- Initialize maintenance_mode
INSERT INTO public.system_config (key, value)
VALUES ('maintenance_mode', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2. RPC to get system stats
CREATE OR REPLACE FUNCTION public.get_system_stats()
RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT jsonb_build_object(
    'org_count', (SELECT count(*) FROM public.organizations),
    'user_count', (SELECT count(*) FROM public.profiles),
    'shift_count', (SELECT count(*) FROM public.shifts),
    'active_sessions', (SELECT count(*) FROM auth.sessions WHERE not_after > now())
  ) INTO result;

  RETURN result;
END;
$$;

-- 3. RPC to get all users with profile data (joining auth.users)
-- This is necessary because public.profiles alone doesn't have email.
CREATE OR REPLACE FUNCTION public.get_all_users_with_profiles()
RETURNS TABLE (
  id UUID,
  email TEXT,
  platform_role public.platform_role,
  org_role public.org_role,
  org_id UUID,
  org_name TEXT,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ
)
LANGUAGE PLPGSQL SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT 
    u.id,
    u.email::TEXT,
    p.platform_role,
    p.org_role,
    p.org_id,
    o.name AS org_name,
    p.created_at,
    u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON u.id = p.id
  LEFT JOIN public.organizations o ON p.org_id = o.id
  ORDER BY u.email ASC;
END;
$$;
