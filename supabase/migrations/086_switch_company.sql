-- ============================================================================
-- Migration 086: switch_company RPC
-- Allows a user to switch their active company (updates profiles.company_id).
-- After calling, the user must sign out and back in to refresh JWT claims.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.switch_company(target_company_id UUID)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
  UPDATE public.profiles
  SET company_id  = target_company_id,
      updated_at  = NOW()
  WHERE id = auth.uid();
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.switch_company(UUID) TO authenticated;
