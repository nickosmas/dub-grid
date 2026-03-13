-- ============================================================
-- Migration 078: Drop dead functions
--
-- These functions were created during early development
-- (pre-migration system or since-renamed concepts) and were
-- never cleaned up. None are referenced by any migration,
-- RLS policy, trigger, or application code.
--
-- 1. is_nexus_architect()              — old name for is_gridmaster()
-- 2. assign_nexus_architect_by_email() — old name for assign_gridmaster_by_email()
-- 3. current_user_orgs()               — from original schema.sql, replaced by caller_org_id()
-- 4. update_shifts_v2_updated_at()     — from when shifts table was called shifts_v2
--
-- NOTE: caller_org_id() is intentionally KEPT — all RLS
-- policies (created in migration 053) call it. Dropping it
-- would require rebuilding every policy.
-- ============================================================

DROP FUNCTION IF EXISTS public.is_nexus_architect();
DROP FUNCTION IF EXISTS public.assign_nexus_architect_by_email(TEXT);
DROP FUNCTION IF EXISTS public.current_user_orgs();
DROP FUNCTION IF EXISTS public.update_shifts_v2_updated_at();
