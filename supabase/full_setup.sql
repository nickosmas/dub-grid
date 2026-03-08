-- ============================================================
-- DubGrid — Full Database Setup (Idempotent)
-- ============================================================
-- Run this ONCE in the Supabase SQL Editor to create (or update)
-- every table, enum, function, trigger, index, and RLS policy.
--
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE /
-- DO $$ ... EXCEPTION ... $$ throughout.
--
-- After running, go to:
--   Supabase Dashboard → Auth → Hooks → Custom Access Token
--   and register: public.custom_access_token_hook
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 0. EXTENSIONS
-- ════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ════════════════════════════════════════════════════════════════
-- 1. ENUMS
-- ════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE public.platform_role AS ENUM ('gridmaster', 'none');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.org_role AS ENUM ('admin', 'scheduler', 'supervisor', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ensure required enum values exist for previously-created enum types.
-- This prevents failures when older environments have a partial role set.
ALTER TYPE public.platform_role ADD VALUE IF NOT EXISTS 'gridmaster';
ALTER TYPE public.platform_role ADD VALUE IF NOT EXISTS 'none';
ALTER TYPE public.org_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE public.org_role ADD VALUE IF NOT EXISTS 'scheduler';
ALTER TYPE public.org_role ADD VALUE IF NOT EXISTS 'supervisor';
ALTER TYPE public.org_role ADD VALUE IF NOT EXISTS 'user';


-- ════════════════════════════════════════════════════════════════
-- 2. TABLES
-- ════════════════════════════════════════════════════════════════

-- ── 2a. organizations ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organizations (
  id             uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name           text NOT NULL DEFAULT 'My Organization',
  slug           text UNIQUE,
  address        text NOT NULL DEFAULT '',
  phone          text NOT NULL DEFAULT '',
  employee_count integer,
  skill_levels   text[] NOT NULL DEFAULT ARRAY['JLCSN','CSN III','CSN II','STAFF','—'::text],
  roles          text[] NOT NULL DEFAULT ARRAY['DCSN','DVCSN','Supv','Mentor','CN','SC. Mgr.','Activity Coordinator','SC/Asst/Act/Cor'::text],
  created_at     timestamptz DEFAULT now(),
  CONSTRAINT organizations_name_key UNIQUE (name)
);

-- Ensure slug and created_at columns exist (idempotent for existing DBs)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS slug       text UNIQUE,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS skill_levels   text[] NOT NULL DEFAULT ARRAY['JLCSN','CSN III','CSN II','STAFF','—'::text],
  ADD COLUMN IF NOT EXISTS roles          text[] NOT NULL DEFAULT ARRAY['DCSN','DVCSN','Supv','Mentor','CN','SC. Mgr.','Activity Coordinator','SC/Asst/Act/Cor'::text];


-- ── 2b. profiles (RBAC — replaces legacy permission tables) ──

CREATE TABLE IF NOT EXISTS public.profiles (
  id            uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  org_id        uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  platform_role public.platform_role NOT NULL DEFAULT 'none',
  org_role      public.org_role      NOT NULL DEFAULT 'user',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);


-- ── 2c. wings ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wings (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color_bg    text NOT NULL DEFAULT '#F1F5F9',
  color_text  text NOT NULL DEFAULT '#475569',
  sort_order  integer NOT NULL DEFAULT 0,
  UNIQUE (org_id, name)
);


-- ── 2d. shift_types ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shift_types (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label               text NOT NULL,
  name                text NOT NULL,
  color               text NOT NULL DEFAULT '#F8FAFC',
  border_color        text NOT NULL DEFAULT '#CBD5E1',
  text_color          text NOT NULL DEFAULT '#64748B',
  counts_toward_day   boolean NOT NULL DEFAULT false,
  counts_toward_eve   boolean NOT NULL DEFAULT false,
  counts_toward_night boolean NOT NULL DEFAULT false,
  is_orientation      boolean NOT NULL DEFAULT false,
  is_general          boolean NOT NULL DEFAULT false,
  wing_name           text,
  sort_order          integer NOT NULL DEFAULT 0,
  UNIQUE (org_id, label)
);


-- ── 2e. employees ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.employees (
  id            uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name          text         NOT NULL,
  designation   text         NOT NULL DEFAULT 'STAFF',
  roles         text[]       NOT NULL DEFAULT '{}',
  fte_weight    numeric(4,2) NOT NULL DEFAULT 1.0,
  seniority     integer      NOT NULL,
  wings         text[]       NOT NULL DEFAULT '{}',
  phone         text         NOT NULL DEFAULT '',
  email         text         NOT NULL DEFAULT '',
  contact_notes text         NOT NULL DEFAULT '',
  UNIQUE(org_id, name)
);


-- ── 2f. shifts ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shifts (
  emp_id      UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date        DATE   NOT NULL,
  shift_label TEXT   NOT NULL,
  org_id      UUID   REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id     UUID   REFERENCES auth.users(id) ON DELETE SET NULL,
  version     BIGINT NOT NULL DEFAULT 0,
  created_by  UUID   REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by  UUID   REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (emp_id, date)
);


-- ── 2g. schedule_notes ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schedule_notes (
  id         bigserial PRIMARY KEY,
  org_id     uuid   REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  emp_id     uuid REFERENCES public.employees(id)     ON DELETE CASCADE NOT NULL,
  date       date   NOT NULL,
  note_type  text   NOT NULL CHECK (note_type IN ('readings', 'shower')),
  created_by uuid   REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (emp_id, date, note_type)
);


-- ── 2h. Legacy tables (kept for data migration, can be dropped later) ──

CREATE TABLE IF NOT EXISTS public.org_members (
  org_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role    text NOT NULL DEFAULT 'member',
  PRIMARY KEY (org_id, user_id)
);

-- Drop superseded shifts_v2 table (replaced by the enhanced shifts table)
DROP TABLE IF EXISTS public.shifts_v2 CASCADE;


-- ════════════════════════════════════════════════════════════════
-- 3. INDEXES
-- ════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS organizations_id_idx    ON public.organizations(id);
CREATE INDEX IF NOT EXISTS org_members_user_id_idx ON public.org_members(user_id);
CREATE INDEX IF NOT EXISTS wings_org_id_idx        ON public.wings(org_id);
CREATE INDEX IF NOT EXISTS shift_types_org_id_idx  ON public.shift_types(org_id);
CREATE INDEX IF NOT EXISTS employees_org_id_idx    ON public.employees(org_id);
CREATE INDEX IF NOT EXISTS shifts_emp_id_idx       ON public.shifts(emp_id);
CREATE INDEX IF NOT EXISTS shifts_date_idx         ON public.shifts(date);
CREATE INDEX IF NOT EXISTS idx_shifts_org_date     ON public.shifts(org_id, date);
CREATE INDEX IF NOT EXISTS profiles_org_id_idx     ON public.profiles(org_id);
CREATE INDEX IF NOT EXISTS schedule_notes_org_idx  ON public.schedule_notes(org_id);
CREATE INDEX IF NOT EXISTS schedule_notes_emp_idx  ON public.schedule_notes(emp_id);


-- ════════════════════════════════════════════════════════════════
-- 4. HELPER FUNCTIONS
-- ════════════════════════════════════════════════════════════════

-- URL-safe slug generator
CREATE OR REPLACE FUNCTION public.generate_org_slug(p_name text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
$$;

-- Backfill slugs for any existing orgs that don't have one yet
UPDATE public.organizations
SET slug = public.generate_org_slug(name)
WHERE slug IS NULL;

-- Normalize legacy elevated role labels to the canonical gridmaster value.
UPDATE public.profiles
SET platform_role = 'gridmaster'::public.platform_role
WHERE platform_role::text = 'nexus_architect';

-- Normalize legacy org role labels to the canonical admin value.
UPDATE public.profiles
SET org_role = 'admin'::public.org_role
WHERE org_role::text = 'sovereign';

-- RBAC helper: is the current user a Gridmaster?
CREATE OR REPLACE FUNCTION public.is_gridmaster()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND platform_role = 'gridmaster'::public.platform_role
  );
$$;

-- RBAC helper: caller's org_id from profiles
CREATE OR REPLACE FUNCTION public.caller_org_id()
RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$;

-- RBAC helper: caller's org_role from profiles
CREATE OR REPLACE FUNCTION public.caller_org_role()
RETURNS public.org_role
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT org_role FROM public.profiles WHERE id = auth.uid();
$$;


-- ════════════════════════════════════════════════════════════════
-- 5. TRIGGERS
-- ════════════════════════════════════════════════════════════════

-- Auto-create a profile row for every new auth user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
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

-- Auto-update updated_at on shifts
CREATE OR REPLACE FUNCTION public.update_shifts_updated_at()
RETURNS TRIGGER LANGUAGE PLPGSQL AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_shifts_updated_at ON public.shifts;
CREATE TRIGGER trigger_shifts_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_shifts_updated_at();


-- ════════════════════════════════════════════════════════════════
-- 6. ROW LEVEL SECURITY — ENABLE
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.organizations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_types    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members    ENABLE ROW LEVEL SECURITY;


-- ════════════════════════════════════════════════════════════════
-- 7. RLS POLICIES — DROP OLD + CREATE NEW
-- ════════════════════════════════════════════════════════════════
-- We drop every policy first so this script is fully re-runnable.
-- Supabase silently ignores DROP POLICY IF EXISTS on missing policies.

-- ── Drop legacy (schema.sql) policies ─────────────────────────
DROP POLICY IF EXISTS "auth_orgs_select"          ON public.organizations;
DROP POLICY IF EXISTS "auth_orgs_insert"          ON public.organizations;
DROP POLICY IF EXISTS "auth_orgs_update"          ON public.organizations;
DROP POLICY IF EXISTS "auth_org_members_select"   ON public.org_members;
DROP POLICY IF EXISTS "auth_org_members_insert"   ON public.org_members;
DROP POLICY IF EXISTS "auth_wings_select"         ON public.wings;
DROP POLICY IF EXISTS "auth_wings_insert"         ON public.wings;
DROP POLICY IF EXISTS "auth_wings_update"         ON public.wings;
DROP POLICY IF EXISTS "auth_wings_delete"         ON public.wings;
DROP POLICY IF EXISTS "auth_shift_types_select"   ON public.shift_types;
DROP POLICY IF EXISTS "auth_shift_types_insert"   ON public.shift_types;
DROP POLICY IF EXISTS "auth_shift_types_update"   ON public.shift_types;
DROP POLICY IF EXISTS "auth_shift_types_delete"   ON public.shift_types;
DROP POLICY IF EXISTS "auth_employees_select"     ON public.employees;
DROP POLICY IF EXISTS "auth_employees_insert"     ON public.employees;
DROP POLICY IF EXISTS "auth_employees_update"     ON public.employees;
DROP POLICY IF EXISTS "auth_employees_delete"     ON public.employees;
DROP POLICY IF EXISTS "auth_shifts_select"        ON public.shifts;
DROP POLICY IF EXISTS "auth_shifts_insert"        ON public.shifts;
DROP POLICY IF EXISTS "auth_shifts_update"        ON public.shifts;
DROP POLICY IF EXISTS "auth_shifts_delete"        ON public.shifts;

-- ── Drop RBAC (migration 001) policies in case of re-run ─────
DROP POLICY IF EXISTS "gridmaster_all_profiles"          ON public.profiles;
DROP POLICY IF EXISTS "own_profile_select"               ON public.profiles;
DROP POLICY IF EXISTS "admin_org_profiles_select"    ON public.profiles;
DROP POLICY IF EXISTS "admin_org_profiles_update"    ON public.profiles;
DROP POLICY IF EXISTS "sovereign_org_profiles_select"    ON public.profiles;
DROP POLICY IF EXISTS "sovereign_org_profiles_update"    ON public.profiles;
DROP POLICY IF EXISTS "gridmaster_all_orgs"              ON public.organizations;
DROP POLICY IF EXISTS "org_member_select_org"            ON public.organizations;
DROP POLICY IF EXISTS "admin_update_org"             ON public.organizations;
DROP POLICY IF EXISTS "sovereign_update_org"             ON public.organizations;
DROP POLICY IF EXISTS "gridmaster_all_employees"         ON public.employees;
DROP POLICY IF EXISTS "org_members_select_employees"     ON public.employees;
DROP POLICY IF EXISTS "scheduler_insert_employees"       ON public.employees;
DROP POLICY IF EXISTS "scheduler_update_employees"       ON public.employees;
DROP POLICY IF EXISTS "scheduler_delete_employees"       ON public.employees;
DROP POLICY IF EXISTS "gridmaster_all_wings"             ON public.wings;
DROP POLICY IF EXISTS "org_members_select_wings"         ON public.wings;
DROP POLICY IF EXISTS "admin_insert_wings"           ON public.wings;
DROP POLICY IF EXISTS "admin_update_wings"           ON public.wings;
DROP POLICY IF EXISTS "admin_delete_wings"           ON public.wings;
DROP POLICY IF EXISTS "sovereign_insert_wings"           ON public.wings;
DROP POLICY IF EXISTS "sovereign_update_wings"           ON public.wings;
DROP POLICY IF EXISTS "sovereign_delete_wings"           ON public.wings;
DROP POLICY IF EXISTS "gridmaster_all_shift_types"       ON public.shift_types;
DROP POLICY IF EXISTS "org_members_select_shift_types"   ON public.shift_types;
DROP POLICY IF EXISTS "scheduler_insert_shift_types"     ON public.shift_types;
DROP POLICY IF EXISTS "scheduler_update_shift_types"     ON public.shift_types;
DROP POLICY IF EXISTS "scheduler_delete_shift_types"     ON public.shift_types;
DROP POLICY IF EXISTS "gridmaster_all_shifts"            ON public.shifts;
DROP POLICY IF EXISTS "org_members_select_shifts"        ON public.shifts;
DROP POLICY IF EXISTS "scheduler_insert_shifts"          ON public.shifts;
DROP POLICY IF EXISTS "scheduler_update_shifts"          ON public.shifts;
DROP POLICY IF EXISTS "scheduler_delete_shifts"          ON public.shifts;
DROP POLICY IF EXISTS "shifts_select"                    ON public.shifts;
DROP POLICY IF EXISTS "shifts_insert"                    ON public.shifts;
DROP POLICY IF EXISTS "shifts_update"                    ON public.shifts;
DROP POLICY IF EXISTS "shifts_delete"                    ON public.shifts;
DROP POLICY IF EXISTS "gridmaster_all_notes"             ON public.schedule_notes;
DROP POLICY IF EXISTS "org_members_select_notes"         ON public.schedule_notes;
DROP POLICY IF EXISTS "supervisor_insert_notes"          ON public.schedule_notes;
DROP POLICY IF EXISTS "supervisor_update_notes"          ON public.schedule_notes;
DROP POLICY IF EXISTS "scheduler_delete_notes"           ON public.schedule_notes;

-- ── profiles ──────────────────────────────────────────────────

-- Gridmaster: full access to all profiles
CREATE POLICY "gridmaster_all_profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

-- Every user can read their own profile
CREATE POLICY "own_profile_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Admins can read all profiles within their org
CREATE POLICY "admin_org_profiles_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    org_id IS NOT NULL
    AND org_id = public.caller_org_id()
    AND public.caller_org_role() = 'admin'::public.org_role
  );

-- Admins can update org_role for users in their org
CREATE POLICY "admin_org_profiles_update"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() = 'admin'::public.org_role
  )
  WITH CHECK (
    org_id = public.caller_org_id()
    AND platform_role = 'none'::public.platform_role
  );

-- ── organizations ─────────────────────────────────────────────

-- Gridmaster sees and manages all orgs
CREATE POLICY "gridmaster_all_orgs"
  ON public.organizations FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

-- Org members see only their own org
CREATE POLICY "org_member_select_org"
  ON public.organizations FOR SELECT TO authenticated
  USING (id = public.caller_org_id());

-- Admins can update their org's metadata
CREATE POLICY "admin_update_org"
  ON public.organizations FOR UPDATE TO authenticated
  USING (
    id = public.caller_org_id()
    AND public.caller_org_role() = 'admin'::public.org_role
  )
  WITH CHECK (id = public.caller_org_id());

-- ── employees ─────────────────────────────────────────────────

-- Gridmaster bypass
CREATE POLICY "gridmaster_all_employees"
  ON public.employees FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

-- All org members (Tier 0–3) can read employees in their org
CREATE POLICY "org_members_select_employees"
  ON public.employees FOR SELECT TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND (
      public.caller_org_role() IN (
        'admin'::public.org_role,
        'scheduler'::public.org_role,
        'supervisor'::public.org_role
      )
      OR (
        public.caller_org_role() = 'user'::public.org_role
        AND lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    )
  );

-- Tier 2+ (Scheduler, Admin) can insert employees
CREATE POLICY "scheduler_insert_employees"
  ON public.employees FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin'::public.org_role, 'scheduler'::public.org_role)
  );

-- Tier 2+ can update employees
CREATE POLICY "scheduler_update_employees"
  ON public.employees FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin'::public.org_role, 'scheduler'::public.org_role)
  )
  WITH CHECK (org_id = public.caller_org_id());

-- Tier 2+ can delete employees
CREATE POLICY "scheduler_delete_employees"
  ON public.employees FOR DELETE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin'::public.org_role, 'scheduler'::public.org_role)
  );

-- ── wings ─────────────────────────────────────────────────────

-- Gridmaster bypass
CREATE POLICY "gridmaster_all_wings"
  ON public.wings FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

-- All org members can read wings
CREATE POLICY "org_members_select_wings"
  ON public.wings FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

-- Only Admin can manage wings
CREATE POLICY "admin_insert_wings"
  ON public.wings FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.caller_org_id()
    AND public.caller_org_role() = 'admin'::public.org_role
  );

CREATE POLICY "admin_update_wings"
  ON public.wings FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() = 'admin'::public.org_role
  )
  WITH CHECK (org_id = public.caller_org_id());

CREATE POLICY "admin_delete_wings"
  ON public.wings FOR DELETE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() = 'admin'::public.org_role
  );

-- ── shift_types ───────────────────────────────────────────────

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
    AND public.caller_org_role() IN ('admin'::public.org_role, 'scheduler'::public.org_role)
  );

CREATE POLICY "scheduler_update_shift_types"
  ON public.shift_types FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin'::public.org_role, 'scheduler'::public.org_role)
  )
  WITH CHECK (org_id = public.caller_org_id());

CREATE POLICY "scheduler_delete_shift_types"
  ON public.shift_types FOR DELETE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin'::public.org_role, 'scheduler'::public.org_role)
  );

-- ── shifts ────────────────────────────────────────────────────

CREATE POLICY "shifts_select" ON public.shifts
  FOR SELECT TO authenticated
  USING (
    public.is_gridmaster()
    OR org_id = public.caller_org_id()
  );

CREATE POLICY "shifts_insert" ON public.shifts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_gridmaster()
    OR (
      org_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'scheduler')
    )
  );

CREATE POLICY "shifts_update" ON public.shifts
  FOR UPDATE TO authenticated
  USING (
    public.is_gridmaster()
    OR (
      org_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'scheduler')
    )
  )
  WITH CHECK (
    public.is_gridmaster()
    OR (
      org_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'scheduler')
    )
  );

CREATE POLICY "shifts_delete" ON public.shifts
  FOR DELETE TO authenticated
  USING (
    public.is_gridmaster()
    OR (
      org_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'scheduler')
    )
  );

-- ── schedule_notes ────────────────────────────────────────────

-- Gridmaster bypass
CREATE POLICY "gridmaster_all_notes"
  ON public.schedule_notes FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

-- All org members can read notes
CREATE POLICY "org_members_select_notes"
  ON public.schedule_notes FOR SELECT TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND (
      public.caller_org_role() IN (
        'admin'::public.org_role,
        'scheduler'::public.org_role,
        'supervisor'::public.org_role
      )
      OR (
        public.caller_org_role() = 'user'::public.org_role
        AND EXISTS (
          SELECT 1
          FROM public.employees e
          WHERE e.id = schedule_notes.emp_id
            AND e.org_id = public.caller_org_id()
            AND lower(coalesce(e.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      )
    )
  );

-- Tier 1+ (Supervisor, Scheduler, Admin) can insert notes
CREATE POLICY "supervisor_insert_notes"
  ON public.schedule_notes FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin'::public.org_role, 'scheduler'::public.org_role, 'supervisor'::public.org_role)
  );

-- Tier 1+ can update notes
CREATE POLICY "supervisor_update_notes"
  ON public.schedule_notes FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin'::public.org_role, 'scheduler'::public.org_role, 'supervisor'::public.org_role)
  )
  WITH CHECK (org_id = public.caller_org_id());

-- Only Tier 2+ can delete notes
CREATE POLICY "scheduler_delete_notes"
  ON public.schedule_notes FOR DELETE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin'::public.org_role, 'scheduler'::public.org_role)
  );

-- ════════════════════════════════════════════════════════════════
-- 8. CUSTOM JWT CLAIMS HOOK
-- ════════════════════════════════════════════════════════════════
-- Embeds org_id, org_slug, platform_role, org_role into every JWT.
-- REQUIRED: register this function as the Custom Access Token Hook
-- in Supabase Dashboard → Auth → Hooks after running this script.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims       jsonb;
  user_profile record;
BEGIN
  claims := event -> 'claims';

  SELECT
    p.org_id,
    p.platform_role,
    p.org_role,
    o.slug AS org_slug
  INTO user_profile
  FROM public.profiles p
  LEFT JOIN public.organizations o ON o.id = p.org_id
  WHERE p.id = (event ->> 'user_id')::uuid;

  IF FOUND THEN
    claims := jsonb_set(claims, '{platform_role}', to_jsonb(user_profile.platform_role::text));
    claims := jsonb_set(
      claims,
      '{org_role}',
      to_jsonb(
        CASE
          WHEN user_profile.org_role::text = 'sovereign' THEN 'admin'
          ELSE user_profile.org_role::text
        END
      )
    );
    IF user_profile.org_id IS NOT NULL THEN
      claims := jsonb_set(claims, '{org_id}',   to_jsonb(user_profile.org_id::text));
      claims := jsonb_set(claims, '{org_slug}', to_jsonb(COALESCE(user_profile.org_slug, '')));
    END IF;
  ELSE
    claims := jsonb_set(claims, '{platform_role}', to_jsonb('none'::text));
    claims := jsonb_set(claims, '{org_role}',      to_jsonb('user'::text));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Grant auth service permission to execute the hook
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
GRANT SELECT ON public.profiles      TO supabase_auth_admin;
GRANT SELECT ON public.organizations TO supabase_auth_admin;


-- ════════════════════════════════════════════════════════════════
-- 9. ROLE MANAGEMENT RPCs
-- ════════════════════════════════════════════════════════════════

-- Assign an org-level role to a user by email.
-- Callable by: Gridmaster (any org) or Org Admin (their own org).
CREATE OR REPLACE FUNCTION public.assign_org_role_by_email(
  p_email    text,
  p_org_id   uuid,
  p_org_role public.org_role DEFAULT 'user'::public.org_role
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  IF NOT (
    public.is_gridmaster()
    OR (
      public.caller_org_id() = p_org_id
      AND public.caller_org_role() = 'admin'::public.org_role
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
        updated_at = now();
END;
$$;

-- Backward-compat alias: maps to admin role
CREATE OR REPLACE FUNCTION public.assign_org_admin_by_email(
  target_org_id uuid,
  target_email  text
)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.assign_org_role_by_email(target_email, target_org_id, 'admin'::public.org_role);
$$;

-- Promote a user to Gridmaster (run manually or from trusted server process)
CREATE OR REPLACE FUNCTION public.assign_gridmaster_by_email(
  p_email text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  SELECT id INTO target_user_id FROM auth.users WHERE email = p_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', p_email;
  END IF;

  INSERT INTO public.profiles (id, platform_role)
  VALUES (target_user_id, 'gridmaster'::public.platform_role)
  ON CONFLICT (id) DO UPDATE
    SET platform_role = 'gridmaster'::public.platform_role,
        updated_at    = now();
END;
$$;


-- ════════════════════════════════════════════════════════════════
-- 10. (Section removed)


-- ════════════════════════════════════════════════════════════════
-- 11. DATA MIGRATION — org_members → profiles
-- ════════════════════════════════════════════════════════════════
-- Copies any existing org_members rows into profiles.
-- admin → admin; member → user.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'org_members'
  ) THEN
    INSERT INTO public.profiles (id, org_id, org_role)
    SELECT
      om.user_id,
      om.org_id,
      CASE WHEN om.role = 'admin' THEN 'admin'::public.org_role
           ELSE 'user'::public.org_role
      END
    FROM public.org_members om
    ON CONFLICT (id) DO UPDATE
      SET org_id   = EXCLUDED.org_id,
          org_role  = EXCLUDED.org_role,
          updated_at = now()
    WHERE public.profiles.platform_role = 'none'::public.platform_role;
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════════
-- DONE
-- ════════════════════════════════════════════════════════════════
-- Summary of what was created / updated:
--
--   ENUMS:    platform_role, org_role
--   TABLES:   organizations, profiles, wings, shift_types,
--             employees, shifts, schedule_notes
--             (+ legacy: org_members)
--   INDEXES:  10 indexes across all tables
--   FUNCTIONS: generate_org_slug, is_gridmaster, caller_org_id,
--              caller_org_role, handle_new_user,
--              custom_access_token_hook,
--              assign_org_role_by_email,
--              assign_org_admin_by_email,
--              assign_gridmaster_by_email
--   TRIGGERS: on_auth_user_created
--   RLS:      38 policies across 7 tables
--   GRANTS:   supabase_auth_admin access for JWT hook
--
-- NEXT STEP:
--   Go to Supabase Dashboard → Auth → Hooks → Custom Access Token
--   and register: public.custom_access_token_hook
-- ════════════════════════════════════════════════════════════════
