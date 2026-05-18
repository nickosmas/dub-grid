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

-- supabase_auth_admin needs USAGE on public schema to locate and call the hook
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

-- Hook needs to read profiles + org memberships + organizations for JWT claims
GRANT SELECT ON TABLE public.profiles TO supabase_auth_admin;
GRANT SELECT ON TABLE public.organization_memberships TO supabase_auth_admin;
GRANT SELECT ON TABLE public.organizations TO supabase_auth_admin;

-- Hook needs to read/delete jwt_refresh_locks to check/clean locks
GRANT SELECT, DELETE ON TABLE public.jwt_refresh_locks TO supabase_auth_admin;

-- Hook needs to read user_sessions.active_org_id for per-session org isolation,
-- and INSERT a row on first contact (freezes the session's active_org_id at
-- profiles.org_id so later cross-device switches don't contaminate this session).
GRANT SELECT, INSERT ON TABLE public.user_sessions TO supabase_auth_admin;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. GRANTS ON EXISTING OBJECTS
--
-- Grant access to all existing tables, functions, and sequences.
-- These are needed because ALTER DEFAULT PRIVILEGES only applies to
-- future objects, not objects already created by earlier migration files.
--
-- Roles are scoped by least privilege:
--   anon:          minimal access (public reads + cookie consent inserts)
--   authenticated: full CRUD on all tables (RLS enforces row-level access)
--   service_role:  unrestricted (bypasses RLS for server-side operations)
-- ══════════════════════════════════════════════════════════════════════════════

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- service_role: full access (server-side, bypasses RLS)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- authenticated: full CRUD (RLS policies enforce row-level access)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Organization billing identifiers are server-managed. Keep broad row access
-- for normal organization context, but do not expose Stripe IDs or billed-seat
-- snapshots through direct browser/mobile Supabase reads or writes.
REVOKE SELECT ON TABLE public.organizations FROM anon, authenticated;
REVOKE UPDATE ON TABLE public.organizations FROM authenticated;
GRANT SELECT (
  id,
  name,
  slug,
  address,
  address_line_1,
  address_line_2,
  address_city,
  address_state,
  address_postal_code,
  address_country,
  phone,
  employee_count,
  logo_url,
  app_name,
  meta_description,
  theme_config,
  landing_page_config,
  focus_area_label,
  certification_label,
  role_label,
  department_label,
  shift_display_mode,
  timezone,
  pay_period_start_date,
  subscription_status,
  trial_ends_at,
  data_retention_days,
  archived_at,
  suspended_at,
  suspended_reason,
  enforce_conflict_prevention,
  coverage_rule_config,
  feature_overrides,
  created_by,
  updated_by,
  created_at,
  updated_at
) ON TABLE public.organizations TO anon, authenticated;
GRANT UPDATE (
  name,
  slug,
  address,
  address_line_1,
  address_line_2,
  address_city,
  address_state,
  address_postal_code,
  address_country,
  phone,
  employee_count,
  logo_url,
  app_name,
  meta_description,
  theme_config,
  landing_page_config,
  focus_area_label,
  certification_label,
  role_label,
  department_label,
  shift_display_mode,
  timezone,
  pay_period_start_date,
  data_retention_days,
  enforce_conflict_prevention,
  coverage_rule_config,
  feature_overrides,
  updated_by,
  updated_at
) ON TABLE public.organizations TO authenticated;

-- anon: minimal access for unauthenticated visitors
-- IMPORTANT: anon must NOT have blanket EXECUTE on all functions.
-- Functions like gdpr_erase_user_data, purge_expired_data, etc. would be
-- callable via PostgREST by unauthenticated users if granted here.
GRANT INSERT ON TABLE public.cookie_consents TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. DEFAULT PRIVILEGES
--
-- Ensures all future objects in the public schema are accessible to the
-- standard Supabase roles (scoped per role).
-- ══════════════════════════════════════════════════════════════════════════════

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO postgres, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO postgres, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO postgres, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
