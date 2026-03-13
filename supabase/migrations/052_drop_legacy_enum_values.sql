-- Migration 052: Drop legacy org_role enum values (scheduler, supervisor)
--
-- PostgreSQL requires dropping all dependent objects before a type can be dropped.
-- This migration:
--   1. Bulk-drops all RLS policies on affected tables
--   2. Drops functions that reference the org_role type in their signature or return type
--   3. Drops DEFAULT constraints that reference the type
--   4. DROPs and recreates org_role enum with only: super_admin, admin, user
--   5. Alters columns to the new type
--   6. Recreates caller_org_role(), assign_org_role_by_email(), get_all_users_with_profiles()
--   7. Recreates all RLS policies (clean versions from migration 049)
--
-- Data safety: migration 049 already promoted all scheduler/supervisor rows to admin.

-- ── 1. Drop all RLS policies on affected tables ───────────────────────────────

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'profiles', 'focus_areas', 'employees', 'shift_types', 'shift_categories',
        'shifts', 'schedule_notes', 'regular_shifts', 'shift_series',
        'indicator_types', 'invitations', 'companies', 'role_change_log'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;


-- ── 2. Drop functions that use the org_role type ──────────────────────────────

DROP FUNCTION IF EXISTS public.caller_org_role();
DROP FUNCTION IF EXISTS public.assign_org_role_by_email(TEXT, UUID, public.org_role);
DROP FUNCTION IF EXISTS public.assign_org_admin_by_email(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_all_users_with_profiles();


-- ── 3. Preserve column data as text, then explicitly drop typed columns ───────
-- DROP TYPE ... CASCADE drops columns whose type IS the enum.
-- We also explicitly drop invitations.role_to_assign before DROP TYPE to ensure
-- the column is in a clean state (CASCADE behavior varies by PostgreSQL version).

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS _org_role_bak TEXT;
UPDATE public.profiles SET _org_role_bak = org_role::TEXT;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invitations'
      AND column_name = 'role_to_assign'
  ) THEN
    ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS _role_to_assign_bak TEXT;
    UPDATE public.invitations SET _role_to_assign_bak = role_to_assign::TEXT;
    ALTER TABLE public.invitations DROP COLUMN role_to_assign;
  END IF;
END $$;


-- ── 4. Drop and recreate the org_role enum ────────────────────────────────────

DROP TYPE public.org_role CASCADE;

CREATE TYPE public.org_role AS ENUM ('super_admin', 'admin', 'user');


-- ── 5. Restore columns with the new type ─────────────────────────────────────

-- profiles.org_role was dropped by CASCADE; re-add and restore values.
ALTER TABLE public.profiles
  ADD COLUMN org_role public.org_role NOT NULL DEFAULT 'user'::public.org_role;

UPDATE public.profiles
  SET org_role = _org_role_bak::public.org_role
  WHERE _org_role_bak IS NOT NULL;

ALTER TABLE public.profiles DROP COLUMN _org_role_bak;

-- invitations.role_to_assign was explicitly dropped above; re-add and restore values.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invitations') THEN
    ALTER TABLE public.invitations
      ADD COLUMN role_to_assign public.org_role NOT NULL DEFAULT 'user'::public.org_role;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'invitations'
        AND column_name = '_role_to_assign_bak'
    ) THEN
      UPDATE public.invitations
        SET role_to_assign = _role_to_assign_bak::public.org_role
        WHERE _role_to_assign_bak IS NOT NULL;
      ALTER TABLE public.invitations DROP COLUMN _role_to_assign_bak;
    END IF;
  END IF;
END $$;


-- ── 6. Recreate functions ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.caller_org_role()
RETURNS public.org_role
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT org_role FROM public.profiles WHERE id = auth.uid();
$$;

-- assign_org_role_by_email: updated to use company_id (renamed from org_id in migration 048)
-- and to allow super_admin callers in addition to admin.
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
      AND public.caller_org_role() IN ('admin', 'super_admin')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: insufficient permissions';
  END IF;

  SELECT id INTO target_user_id FROM auth.users WHERE email = p_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', p_email;
  END IF;

  INSERT INTO public.profiles (id, company_id, org_role)
  VALUES (target_user_id, p_org_id, p_org_role)
  ON CONFLICT (id) DO UPDATE
    SET company_id = EXCLUDED.company_id,
        org_role   = EXCLUDED.org_role,
        updated_at = NOW();
END;
$$;

-- Backward-compat alias used by older code paths.
CREATE OR REPLACE FUNCTION public.assign_org_admin_by_email(
  target_org_id UUID,
  target_email  TEXT
)
RETURNS VOID
LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT public.assign_org_role_by_email(target_email, target_org_id, 'admin'::public.org_role);
$$;

CREATE OR REPLACE FUNCTION public.get_all_users_with_profiles()
RETURNS TABLE (
  id              UUID,
  email           TEXT,
  platform_role   public.platform_role,
  org_role        public.org_role,
  org_id          UUID,
  org_name        TEXT,
  created_at      TIMESTAMPTZ,
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
    p.company_id AS org_id,
    o.name       AS org_name,
    p.created_at,
    u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON u.id = p.id
  LEFT JOIN public.companies o ON p.company_id = o.id
  ORDER BY u.email ASC;
END;
$$;


-- ── 7. Recreate all RLS policies ──────────────────────────────────────────────

-- ── profiles ──────────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "own_profile_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "admin_org_profiles_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "admin_org_profiles_update"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (
    company_id = public.caller_org_id()
    AND platform_role = 'none'
  );

-- ── companies ─────────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_companies"
  ON public.companies FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "org_members_select_company"
  ON public.companies FOR SELECT TO authenticated
  USING (id = public.caller_org_id());

CREATE POLICY "admin_update_org"
  ON public.companies FOR UPDATE TO authenticated
  USING (
    id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (id = public.caller_org_id());

-- ── role_change_log ───────────────────────────────────────────────────────────

CREATE POLICY "audit_insert"
  ON public.role_change_log FOR INSERT TO authenticated
  WITH CHECK (
    public.caller_org_role()::TEXT IN ('admin', 'super_admin')
    OR public.is_gridmaster()
  );

CREATE POLICY "audit_select"
  ON public.role_change_log FOR SELECT TO authenticated
  USING (
    public.is_gridmaster()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = target_user_id
        AND company_id = public.caller_org_id()
    )
  );

-- ── focus_areas ───────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_focus_areas"
  ON public.focus_areas FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "org_members_select_focus_areas"
  ON public.focus_areas FOR SELECT TO authenticated
  USING (company_id = public.caller_org_id());

CREATE POLICY "admin_insert_focus_areas"
  ON public.focus_areas FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "admin_update_focus_areas"
  ON public.focus_areas FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (company_id = public.caller_org_id());

CREATE POLICY "admin_delete_focus_areas"
  ON public.focus_areas FOR DELETE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

-- ── employees ─────────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_employees"
  ON public.employees FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "org_members_select_employees"
  ON public.employees FOR SELECT TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND (
      public.caller_org_role()::TEXT IN ('admin', 'super_admin')
      OR (
        public.caller_org_role()::TEXT = 'user'
        AND lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    )
  );

CREATE POLICY "admin_insert_employees"
  ON public.employees FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "admin_update_employees"
  ON public.employees FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (company_id = public.caller_org_id());

CREATE POLICY "admin_delete_employees"
  ON public.employees FOR DELETE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

-- ── shift_types ───────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_shift_types"
  ON public.shift_types FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "org_members_select_shift_types"
  ON public.shift_types FOR SELECT TO authenticated
  USING (company_id = public.caller_org_id());

CREATE POLICY "admin_insert_shift_types"
  ON public.shift_types FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "admin_update_shift_types"
  ON public.shift_types FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (company_id = public.caller_org_id());

CREATE POLICY "admin_delete_shift_types"
  ON public.shift_types FOR DELETE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

-- ── shifts ────────────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_shifts"
  ON public.shifts FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "org_members_select_shifts"
  ON public.shifts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = shifts.emp_id AND e.company_id = public.caller_org_id()
    )
  );

CREATE POLICY "admin_insert_shifts"
  ON public.shifts FOR INSERT TO authenticated
  WITH CHECK (
    public.caller_org_role() IN ('admin', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = emp_id AND e.company_id = public.caller_org_id()
    )
  );

CREATE POLICY "admin_update_shifts"
  ON public.shifts FOR UPDATE TO authenticated
  USING (
    public.caller_org_role() IN ('admin', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = shifts.emp_id AND e.company_id = public.caller_org_id()
    )
  );

CREATE POLICY "admin_delete_shifts"
  ON public.shifts FOR DELETE TO authenticated
  USING (
    public.caller_org_role() IN ('admin', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = shifts.emp_id AND e.company_id = public.caller_org_id()
    )
  );

-- ── schedule_notes ────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_notes"
  ON public.schedule_notes FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "org_members_select_notes"
  ON public.schedule_notes FOR SELECT TO authenticated
  USING (company_id = public.caller_org_id());

CREATE POLICY "admin_insert_notes"
  ON public.schedule_notes FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "admin_update_notes"
  ON public.schedule_notes FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (company_id = public.caller_org_id());

CREATE POLICY "admin_delete_notes"
  ON public.schedule_notes FOR DELETE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

-- ── regular_shifts ────────────────────────────────────────────────────────────

CREATE POLICY "regular_shifts_select"
  ON public.regular_shifts FOR SELECT TO authenticated
  USING (
    public.is_gridmaster()
    OR company_id = public.caller_org_id()
  );

CREATE POLICY "regular_shifts_insert"
  ON public.regular_shifts FOR INSERT TO authenticated
  WITH CHECK (
    public.is_gridmaster()
    OR (
      company_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "regular_shifts_update"
  ON public.regular_shifts FOR UPDATE TO authenticated
  USING (
    public.is_gridmaster()
    OR (
      company_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "regular_shifts_delete"
  ON public.regular_shifts FOR DELETE TO authenticated
  USING (
    public.is_gridmaster()
    OR (
      company_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin')
    )
  );

-- ── shift_series ──────────────────────────────────────────────────────────────

CREATE POLICY "shift_series_select"
  ON public.shift_series FOR SELECT TO authenticated
  USING (
    public.is_gridmaster()
    OR company_id = public.caller_org_id()
  );

CREATE POLICY "shift_series_insert"
  ON public.shift_series FOR INSERT TO authenticated
  WITH CHECK (
    public.is_gridmaster()
    OR (
      company_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "shift_series_update"
  ON public.shift_series FOR UPDATE TO authenticated
  USING (
    public.is_gridmaster()
    OR (
      company_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "shift_series_delete"
  ON public.shift_series FOR DELETE TO authenticated
  USING (
    public.is_gridmaster()
    OR (
      company_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin')
    )
  );

-- ── shift_categories ──────────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'shift_categories') THEN
    EXECUTE $pol$
      CREATE POLICY "gridmaster_all_shift_categories"
        ON public.shift_categories FOR ALL TO authenticated
        USING (public.is_gridmaster())
        WITH CHECK (public.is_gridmaster())
    $pol$;

    EXECUTE $pol$
      CREATE POLICY "org_members_select_shift_categories"
        ON public.shift_categories FOR SELECT TO authenticated
        USING (company_id = public.caller_org_id())
    $pol$;

    EXECUTE $pol$
      CREATE POLICY "admin_insert_shift_categories"
        ON public.shift_categories FOR INSERT TO authenticated
        WITH CHECK (
          company_id = public.caller_org_id()
          AND public.caller_org_role() IN ('admin', 'super_admin')
        )
    $pol$;

    EXECUTE $pol$
      CREATE POLICY "admin_update_shift_categories"
        ON public.shift_categories FOR UPDATE TO authenticated
        USING (
          company_id = public.caller_org_id()
          AND public.caller_org_role() IN ('admin', 'super_admin')
        )
        WITH CHECK (company_id = public.caller_org_id())
    $pol$;

    EXECUTE $pol$
      CREATE POLICY "admin_delete_shift_categories"
        ON public.shift_categories FOR DELETE TO authenticated
        USING (
          company_id = public.caller_org_id()
          AND public.caller_org_role() IN ('admin', 'super_admin')
        )
    $pol$;
  END IF;
END $$;

-- ── indicator_types ───────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_indicator_types"
  ON public.indicator_types FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "org_members_select_indicator_types"
  ON public.indicator_types FOR SELECT TO authenticated
  USING (company_id = public.caller_org_id());

CREATE POLICY "admins_manage_indicator_types"
  ON public.indicator_types FOR ALL TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role()::TEXT IN ('admin', 'super_admin')
  )
  WITH CHECK (
    company_id = public.caller_org_id()
    AND public.caller_org_role()::TEXT IN ('admin', 'super_admin')
  );

-- ── invitations ───────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invitations') THEN
    EXECUTE $pol$
      CREATE POLICY "gridmaster_all_invitations"
        ON public.invitations FOR ALL TO authenticated
        USING (public.is_gridmaster())
        WITH CHECK (public.is_gridmaster())
    $pol$;

    EXECUTE $pol$
      CREATE POLICY "invitations_select"
        ON public.invitations FOR SELECT TO authenticated
        USING (
          public.is_gridmaster()
          OR (
            company_id = public.caller_org_id()
            AND public.caller_org_role()::TEXT IN ('admin', 'super_admin')
          )
        )
    $pol$;

    -- Only super_admin can send invitations; admins cannot.
    EXECUTE $pol$
      CREATE POLICY "invitations_insert"
        ON public.invitations FOR INSERT TO authenticated
        WITH CHECK (
          company_id = public.caller_org_id()
          AND public.caller_org_role()::TEXT = 'super_admin'
        )
    $pol$;

    EXECUTE $pol$
      CREATE POLICY "invitations_revoke"
        ON public.invitations FOR UPDATE TO authenticated
        USING (
          company_id = public.caller_org_id()
          AND public.caller_org_role()::TEXT IN ('admin', 'super_admin')
          AND accepted_at IS NULL
        )
        WITH CHECK (revoked_at IS NOT NULL)
    $pol$;
  END IF;
END $$;
