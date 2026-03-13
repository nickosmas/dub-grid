-- ============================================================================
-- Migration 089: Drop unused tables and functions
--
-- system_config: Created in migration 033, never used by app code.
-- invitations:   Invite feature never built out; send_invitation RPC unused.
-- ============================================================================

-- ── 1. Drop send_invitation RPC ───────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.send_invitation(UUID, TEXT, public.company_role);

-- ── 2. Drop invitations table (RLS policies cascade automatically) ────────────

DROP TABLE IF EXISTS public.invitations CASCADE;

-- ── 3. Drop system_config table ───────────────────────────────────────────────

DROP TABLE IF EXISTS public.system_config CASCADE;

-- ── 4. Drop legacy shim functions that reference removed columns ──────────────

DROP FUNCTION IF EXISTS public.assign_org_role_by_email(TEXT, UUID, public.company_role);
DROP FUNCTION IF EXISTS public.assign_org_admin_by_email(UUID, TEXT);
