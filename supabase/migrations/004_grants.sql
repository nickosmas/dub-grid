-- ============================================================================
-- Migration 004: Grants & Permissions
--
-- Special grants for supabase_auth_admin (JWT hook access).
-- Default privileges are already set by Supabase for anon/authenticated/service_role.
-- ============================================================================


-- ══════════════════════════════════════════════════════════════════════════════
-- 1. SUPABASE AUTH ADMIN GRANTS
--
-- The custom_access_token_hook runs as postgres (SECURITY DEFINER) but is
-- called BY supabase_auth_admin. These grants ensure the hook can read
-- the tables it needs.
-- ══════════════════════════════════════════════════════════════════════════════

-- Hook needs to read profiles + organizations for JWT claims
GRANT SELECT ON TABLE public.profiles TO supabase_auth_admin;
GRANT SELECT ON TABLE public.organizations TO supabase_auth_admin;

-- Hook needs to read/delete jwt_refresh_locks to check/clean locks
GRANT SELECT, DELETE ON TABLE public.jwt_refresh_locks TO supabase_auth_admin;

-- Recurring shifts draft sessions — explicit grant for authenticated role
GRANT ALL ON TABLE public.recurring_shifts_draft_sessions TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. DEFAULT PRIVILEGES
--
-- Ensures all future objects in the public schema are accessible to the
-- standard Supabase roles. This is typically already set by Supabase,
-- but we include it for completeness.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
