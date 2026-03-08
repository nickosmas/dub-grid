-- Migration: 019_impersonation_sessions_rls.sql
-- Purpose: Enable RLS on impersonation_sessions table
--
-- Bug: The table was created (migration 010) without enabling RLS.
-- Any authenticated user could read/write impersonation sessions,
-- exposing support activity and allowing session manipulation.
--
-- Fix: Enable RLS with gridmaster-only policies.

ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;

-- Gridmaster: full access (create, read, delete sessions)
CREATE POLICY "gridmaster_all_impersonation"
  ON public.impersonation_sessions FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

COMMENT ON POLICY "gridmaster_all_impersonation" ON public.impersonation_sessions IS
  'Only gridmasters can view and manage impersonation sessions';
