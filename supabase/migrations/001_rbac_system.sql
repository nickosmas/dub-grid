-- ============================================================
-- DubGrid RBAC Migration: 5-Tier Permission Hierarchy
-- ============================================================
-- Run this migration in your Supabase SQL Editor.
-- After running, go to:
--   Auth > Hooks > Custom Access Token
--   and register: public.custom_access_token_hook
-- ============================================================

-- ── 1. ENUMS ──────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.platform_role AS ENUM ('gridmaster', 'none');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.org_role AS ENUM ('admin', 'scheduler', 'supervisor', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- If the enum already existed with the legacy 'sovereign' value, rename it in-place.
DO $$ BEGIN
  ALTER TYPE public.org_role RENAME VALUE 'sovereign' TO 'admin';
EXCEPTION WHEN invalid_parameter_value THEN NULL; END $$;

-- ── 2. ORGANIZATIONS — add slug + created_at ──────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS slug       TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Generate a URL-safe slug from an org name
CREATE OR REPLACE FUNCTION public.generate_org_slug(p_name TEXT)
RETURNS TEXT
LANGUAGE SQL IMMUTABLE AS $$
  SELECT lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
$$;

-- Backfill slugs for any existing orgs
UPDATE public.organizations
SET slug = public.generate_org_slug(name)
WHERE slug IS NULL;

-- ── 3. PROFILES ───────────────────────────────────────────────────────────────
-- Single source of truth for role assignments.
-- Tier 4 (Gridmaster): platform_role = 'gridmaster'
-- Tier 3 (Org Admin):   org_role = 'admin'  + org_id set
-- Tier 2 (Scheduler):       org_role = 'scheduler'  + org_id set
-- Tier 1 (Supervisor):      org_role = 'supervisor' + org_id set
-- Tier 0 (Staff User):      org_role = 'user'       + org_id set

CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  org_id        UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  platform_role public.platform_role NOT NULL DEFAULT 'none',
  org_role      public.org_role      NOT NULL DEFAULT 'user',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create a profile row for every new Supabase auth user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 4. SCHEDULE NOTES ─────────────────────────────────────────────────────────
-- Tier 1 (Supervisor) and above can INSERT/UPDATE here.
-- Tier 0 (Staff) is read-only everywhere.

CREATE TABLE IF NOT EXISTS public.schedule_notes (
  id         BIGSERIAL PRIMARY KEY,
  org_id     UUID   REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  emp_id     UUID REFERENCES public.employees(id)     ON DELETE CASCADE NOT NULL,
  date       DATE   NOT NULL,
  note       TEXT   NOT NULL,
  created_by UUID   REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (emp_id, date)
);

-- ── 5. SECURITY HELPER FUNCTIONS ──────────────────────────────────────────────
-- These are SECURITY DEFINER so they bypass RLS on profiles,
-- allowing RLS policies on other tables to call them safely.

CREATE OR REPLACE FUNCTION public.is_gridmaster()
RETURNS BOOLEAN
LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND platform_role = 'gridmaster'
  );
$$;

CREATE OR REPLACE FUNCTION public.caller_org_id()
RETURNS UUID
LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.caller_org_role()
RETURNS public.org_role
LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT org_role FROM public.profiles WHERE id = auth.uid();
$$;

-- ── 6. RLS POLICIES ───────────────────────────────────────────────────────────

-- Re-run safety: drop policies before recreating them.
DROP POLICY IF EXISTS "gridmaster_all_profiles"        ON public.profiles;
DROP POLICY IF EXISTS "own_profile_select"             ON public.profiles;
DROP POLICY IF EXISTS "admin_org_profiles_select"      ON public.profiles;
DROP POLICY IF EXISTS "admin_org_profiles_update"      ON public.profiles;
DROP POLICY IF EXISTS "gridmaster_all_orgs"            ON public.organizations;
DROP POLICY IF EXISTS "org_member_select_org"          ON public.organizations;
DROP POLICY IF EXISTS "admin_update_org"               ON public.organizations;
DROP POLICY IF EXISTS "gridmaster_all_employees"       ON public.employees;
DROP POLICY IF EXISTS "org_members_select_employees"   ON public.employees;
DROP POLICY IF EXISTS "scheduler_insert_employees"     ON public.employees;
DROP POLICY IF EXISTS "scheduler_update_employees"     ON public.employees;
DROP POLICY IF EXISTS "scheduler_delete_employees"     ON public.employees;
DROP POLICY IF EXISTS "gridmaster_all_wings"           ON public.wings;
DROP POLICY IF EXISTS "org_members_select_wings"       ON public.wings;
DROP POLICY IF EXISTS "admin_insert_wings"             ON public.wings;
DROP POLICY IF EXISTS "admin_update_wings"             ON public.wings;
DROP POLICY IF EXISTS "admin_delete_wings"             ON public.wings;
DROP POLICY IF EXISTS "gridmaster_all_shift_types"     ON public.shift_types;
DROP POLICY IF EXISTS "org_members_select_shift_types" ON public.shift_types;
DROP POLICY IF EXISTS "scheduler_insert_shift_types"   ON public.shift_types;
DROP POLICY IF EXISTS "scheduler_update_shift_types"   ON public.shift_types;
DROP POLICY IF EXISTS "scheduler_delete_shift_types"   ON public.shift_types;
DROP POLICY IF EXISTS "gridmaster_all_shifts"          ON public.shifts;
DROP POLICY IF EXISTS "org_members_select_shifts"      ON public.shifts;
DROP POLICY IF EXISTS "scheduler_insert_shifts"        ON public.shifts;
DROP POLICY IF EXISTS "scheduler_update_shifts"        ON public.shifts;
DROP POLICY IF EXISTS "scheduler_delete_shifts"        ON public.shifts;
DROP POLICY IF EXISTS "gridmaster_all_notes"           ON public.schedule_notes;
DROP POLICY IF EXISTS "org_members_select_notes"       ON public.schedule_notes;
DROP POLICY IF EXISTS "supervisor_insert_notes"        ON public.schedule_notes;
DROP POLICY IF EXISTS "supervisor_update_notes"        ON public.schedule_notes;
DROP POLICY IF EXISTS "scheduler_delete_notes"         ON public.schedule_notes;

-- ── profiles ──────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Gridmaster: full access to all profiles
CREATE POLICY "gridmaster_all_profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

-- Every authenticated user can read their own profile
CREATE POLICY "own_profile_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Admins can read all profiles within their org
CREATE POLICY "admin_org_profiles_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    org_id IS NOT NULL
    AND org_id = public.caller_org_id()
    AND public.caller_org_role() = 'admin'
  );

-- Admins can update org_role for users in their org
-- (cannot change platform_role or move users to another org)
CREATE POLICY "admin_org_profiles_update"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() = 'admin'
  )
  WITH CHECK (
    org_id = public.caller_org_id()
    AND platform_role = 'none'  -- Admins cannot create other Nexus users
  );

-- ── organizations ─────────────────────────────────────────────────────────────

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Gridmaster sees and manages all orgs
CREATE POLICY "gridmaster_all_orgs"
  ON public.organizations FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

-- Org members see only their own org
CREATE POLICY "org_member_select_org"
  ON public.organizations FOR SELECT TO authenticated
  USING (id = public.caller_org_id());

-- Admins can update their org's metadata (name, address, phone, slug)
CREATE POLICY "admin_update_org"
  ON public.organizations FOR UPDATE TO authenticated
  USING (
    id = public.caller_org_id()
    AND public.caller_org_role() = 'admin'
  )
  WITH CHECK (id = public.caller_org_id());

-- ── employees ─────────────────────────────────────────────────────────────────

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Gridmaster bypass
CREATE POLICY "gridmaster_all_employees"
  ON public.employees FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

-- All org members (Tier 0–3) can read employees in their org
CREATE POLICY "org_members_select_employees"
  ON public.employees FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

-- Tier 2+ (Scheduler, Admin) can insert employees
CREATE POLICY "scheduler_insert_employees"
  ON public.employees FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'scheduler')
  );

-- Tier 2+ can update employees
CREATE POLICY "scheduler_update_employees"
  ON public.employees FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'scheduler')
  )
  WITH CHECK (org_id = public.caller_org_id());

-- Tier 2+ can delete employees
CREATE POLICY "scheduler_delete_employees"
  ON public.employees FOR DELETE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'scheduler')
  );

-- ── wings ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.wings ENABLE ROW LEVEL SECURITY;

-- Gridmaster bypass
CREATE POLICY "gridmaster_all_wings"
  ON public.wings FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

-- All org members can read wings
CREATE POLICY "org_members_select_wings"
  ON public.wings FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

-- Only Admin can manage wings (org-level configuration)
CREATE POLICY "admin_insert_wings"
  ON public.wings FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.caller_org_id()
    AND public.caller_org_role() = 'admin'
  );

CREATE POLICY "admin_update_wings"
  ON public.wings FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() = 'admin'
  )
  WITH CHECK (org_id = public.caller_org_id());

CREATE POLICY "admin_delete_wings"
  ON public.wings FOR DELETE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() = 'admin'
  );

-- ── shift_types ───────────────────────────────────────────────────────────────

ALTER TABLE public.shift_types ENABLE ROW LEVEL SECURITY;

-- Gridmaster bypass
CREATE POLICY "gridmaster_all_shift_types"
  ON public.shift_types FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

-- All org members can read shift types
CREATE POLICY "org_members_select_shift_types"
  ON public.shift_types FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

-- Tier 2+ can manage shift types
CREATE POLICY "scheduler_insert_shift_types"
  ON public.shift_types FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'scheduler')
  );

CREATE POLICY "scheduler_update_shift_types"
  ON public.shift_types FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'scheduler')
  )
  WITH CHECK (org_id = public.caller_org_id());

CREATE POLICY "scheduler_delete_shift_types"
  ON public.shift_types FOR DELETE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'scheduler')
  );

-- ── shifts ────────────────────────────────────────────────────────────────────
-- Shifts have no org_id column; org is inferred via the employee.

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- Gridmaster bypass
CREATE POLICY "gridmaster_all_shifts"
  ON public.shifts FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

-- All org members can read shifts for their org's employees
CREATE POLICY "org_members_select_shifts"
  ON public.shifts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = shifts.emp_id AND e.org_id = public.caller_org_id()
    )
  );

-- Tier 2+ can write shifts
CREATE POLICY "scheduler_insert_shifts"
  ON public.shifts FOR INSERT TO authenticated
  WITH CHECK (
    public.caller_org_role() IN ('admin', 'scheduler')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = emp_id AND e.org_id = public.caller_org_id()
    )
  );

CREATE POLICY "scheduler_update_shifts"
  ON public.shifts FOR UPDATE TO authenticated
  USING (
    public.caller_org_role() IN ('admin', 'scheduler')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = shifts.emp_id AND e.org_id = public.caller_org_id()
    )
  );

CREATE POLICY "scheduler_delete_shifts"
  ON public.shifts FOR DELETE TO authenticated
  USING (
    public.caller_org_role() IN ('admin', 'scheduler')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = shifts.emp_id AND e.org_id = public.caller_org_id()
    )
  );

-- ── schedule_notes ────────────────────────────────────────────────────────────

ALTER TABLE public.schedule_notes ENABLE ROW LEVEL SECURITY;

-- Gridmaster bypass
CREATE POLICY "gridmaster_all_notes"
  ON public.schedule_notes FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

-- All org members can read notes
CREATE POLICY "org_members_select_notes"
  ON public.schedule_notes FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

-- Tier 1+ (Supervisor, Scheduler, Admin) can insert/update notes
CREATE POLICY "supervisor_insert_notes"
  ON public.schedule_notes FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'scheduler', 'supervisor')
  );

CREATE POLICY "supervisor_update_notes"
  ON public.schedule_notes FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'scheduler', 'supervisor')
  )
  WITH CHECK (org_id = public.caller_org_id());

-- Only Tier 2+ can delete notes
CREATE POLICY "scheduler_delete_notes"
  ON public.schedule_notes FOR DELETE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'scheduler')
  );

-- ── 7. CUSTOM JWT CLAIMS HOOK ─────────────────────────────────────────────────
--
-- REQUIRED SETUP: After running this migration, go to:
--   Supabase Dashboard > Auth > Hooks > Custom Access Token Hook
--   and set the function to: public.custom_access_token_hook
--
-- This embeds org_id, org_slug, platform_role, and org_role directly into
-- every user's JWT, enabling zero-DB-query permission checks in middleware.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  claims       JSONB;
  user_profile RECORD;
BEGIN
  claims := event -> 'claims';

  SELECT
    p.org_id,
    p.platform_role::TEXT AS platform_role,
    p.org_role::TEXT AS org_role,
    o.slug AS org_slug
  INTO user_profile
  FROM public.profiles p
  LEFT JOIN public.organizations o ON o.id = p.org_id
  WHERE p.id = (event ->> 'user_id')::UUID;

  IF FOUND THEN
    claims := jsonb_set(claims, '{platform_role}', to_jsonb(user_profile.platform_role));
    claims := jsonb_set(claims, '{org_role}',      to_jsonb(user_profile.org_role));
    IF user_profile.org_id IS NOT NULL THEN
      claims := jsonb_set(claims, '{org_id}',   to_jsonb(user_profile.org_id::TEXT));
      claims := jsonb_set(claims, '{org_slug}', to_jsonb(COALESCE(user_profile.org_slug, '')));
    END IF;
  ELSE
    -- No profile row yet — safe defaults
    claims := jsonb_set(claims, '{platform_role}', '"none"');
    claims := jsonb_set(claims, '{org_role}',      '"user"');
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Grant the Supabase auth service permission to execute the hook
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
GRANT SELECT ON public.profiles      TO supabase_auth_admin;
GRANT SELECT ON public.organizations TO supabase_auth_admin;

-- ── 8. ROLE MANAGEMENT RPCs ───────────────────────────────────────────────────

-- Assign an org-level role to a user by email.
-- Callable by: Gridmaster (any org) or Org Admin (their own org).
CREATE OR REPLACE FUNCTION public.assign_org_role_by_email(
  p_email    TEXT,
  p_org_id   UUID,
  p_org_role public.org_role DEFAULT 'user'
)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER AS $$
DECLARE
  target_user_id UUID;
BEGIN
  IF NOT (
    public.is_gridmaster()
    OR (
      public.caller_org_id() = p_org_id
      AND public.caller_org_role() = 'admin'
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: insufficient permissions';
  END IF;

  SELECT id INTO target_user_id FROM auth.users WHERE email = p_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', p_email;
  END IF;

  INSERT INTO public.profiles (id, org_id, org_role)
  VALUES (target_user_id, p_org_id, p_org_role)
  ON CONFLICT (id) DO UPDATE
    SET org_id     = EXCLUDED.org_id,
        org_role   = EXCLUDED.org_role,
        updated_at = NOW();
END;
$$;

-- Backward-compat alias: existing db.ts calls assign_org_admin_by_email
-- with (target_org_id, target_email). Maps to admin role.
CREATE OR REPLACE FUNCTION public.assign_org_admin_by_email(
  target_org_id UUID,
  target_email  TEXT
)
RETURNS VOID
LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT public.assign_org_role_by_email(target_email, target_org_id, 'admin');
$$;

-- Promote a user to Gridmaster. Only run this manually via SQL
-- (or a trusted server-side process) during initial platform setup.
CREATE OR REPLACE FUNCTION public.assign_gridmaster_by_email(
  p_email TEXT
)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER AS $$
DECLARE
  target_user_id UUID;
BEGIN
  SELECT id INTO target_user_id FROM auth.users WHERE email = p_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', p_email;
  END IF;

  INSERT INTO public.profiles (id, platform_role)
  VALUES (target_user_id, 'gridmaster')
  ON CONFLICT (id) DO UPDATE
    SET platform_role = 'gridmaster',
        updated_at    = NOW();
END;
$$;

-- ── 9. MIGRATE EXISTING SUPER ADMINS → GRIDMASTERS ──────────────────────
-- Ensures any existing super_admins table users retain full access
-- after RLS is enabled on organizations.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'super_admins'
  ) THEN
    INSERT INTO public.profiles (id, platform_role)
    SELECT user_id, 'gridmaster'
    FROM public.super_admins
    ON CONFLICT (id) DO UPDATE
      SET platform_role = 'gridmaster';
  END IF;
END;
$$;
