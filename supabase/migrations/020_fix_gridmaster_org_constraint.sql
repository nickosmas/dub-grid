-- Migration: 020_fix_gridmaster_org_constraint.sql
-- Purpose: Add CHECK constraint ensuring gridmasters have no org_id
--
-- Design doc specifies: gridmaster has no org (global scope).
-- Without this constraint, a gridmaster could accidentally be assigned
-- an org_id, scoping their global access to a single tenant.

ALTER TABLE public.profiles
  ADD CONSTRAINT gridmaster_no_org
  CHECK (platform_role <> 'gridmaster' OR org_id IS NULL);

COMMENT ON CONSTRAINT gridmaster_no_org ON public.profiles IS
  'Gridmasters cannot belong to an organization — they have global scope';
