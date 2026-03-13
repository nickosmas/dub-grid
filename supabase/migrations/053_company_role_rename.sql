-- Migration 053: Rename org_role → company_role
--
-- "organization" was renamed to "company" in migration 048 (org_id → company_id).
-- This migration completes that rename for the role column and enum.
--
-- Changes:
--   1. Rename enum type:    org_role      → company_role
--   2. Rename column:       profiles.org_role → profiles.company_role
--   3. Rename function:     caller_org_role() → caller_company_role()
--   4. Update JWT hook:     claim key org_role → company_role
--   5. Update helper fn:    get_all_users_with_profiles (return column renamed)
--   6. Update helper fn:    assign_org_role_by_email → assign_company_role_by_email
--   7. Rebuild all RLS policies to call caller_company_role()

-- ── 1. Rename the enum type ───────────────────────────────────────────────────
-- Simple rename — no cascade needed, dependent columns automatically follow.

ALTER TYPE public.org_role RENAME TO company_role;


-- ── 2. Rename the column ──────────────────────────────────────────────────────

ALTER TABLE public.profiles RENAME COLUMN org_role TO company_role;


-- ── 3. Drop all policies that call caller_org_role() ─────────────────────────
-- We bulk-drop then recreate so the function rename doesn't invalidate policies.

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


-- ── 4. Drop and recreate caller_org_role() as caller_company_role() ──────────

DROP FUNCTION IF EXISTS public.caller_org_role();

CREATE OR REPLACE FUNCTION public.caller_company_role()
RETURNS public.company_role
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT company_role FROM public.profiles WHERE id = auth.uid();
$$;

-- Keep old name as a shim for any code still calling caller_org_role()
-- (drop after all callers are updated).
CREATE OR REPLACE FUNCTION public.caller_org_role()
RETURNS public.company_role
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT public.caller_company_role();
$$;


-- ── 5. Update assign_org_role_by_email → assign_company_role_by_email ─────────

DROP FUNCTION IF EXISTS public.assign_org_role_by_email(TEXT, UUID, public.company_role);
DROP FUNCTION IF EXISTS public.assign_org_admin_by_email(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.assign_company_role_by_email(
  p_email        TEXT,
  p_company_id   UUID,
  p_company_role public.company_role DEFAULT 'user'
)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER AS $$
DECLARE
  target_user_id UUID;
BEGIN
  IF NOT (
    public.is_gridmaster()
    OR (
      public.caller_org_id() = p_company_id
      AND public.caller_company_role() IN ('admin', 'super_admin')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: insufficient permissions';
  END IF;

  SELECT id INTO target_user_id FROM auth.users WHERE email = p_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', p_email;
  END IF;

  INSERT INTO public.profiles (id, company_id, company_role)
  VALUES (target_user_id, p_company_id, p_company_role)
  ON CONFLICT (id) DO UPDATE
    SET company_id   = EXCLUDED.company_id,
        company_role = EXCLUDED.company_role,
        updated_at   = NOW();
END;
$$;

-- Backward-compat shims for old call sites.
CREATE OR REPLACE FUNCTION public.assign_org_role_by_email(
  p_email    TEXT,
  p_org_id   UUID,
  p_org_role public.company_role DEFAULT 'user'
)
RETURNS VOID
LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT public.assign_company_role_by_email(p_email, p_org_id, p_org_role);
$$;

CREATE OR REPLACE FUNCTION public.assign_org_admin_by_email(
  target_org_id UUID,
  target_email  TEXT
)
RETURNS VOID
LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT public.assign_company_role_by_email(target_email, target_org_id, 'admin'::public.company_role);
$$;


-- ── 6. Update get_all_users_with_profiles ─────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_all_users_with_profiles();

CREATE OR REPLACE FUNCTION public.get_all_users_with_profiles()
RETURNS TABLE (
  id              UUID,
  email           TEXT,
  platform_role   public.platform_role,
  company_role    public.company_role,
  org_id          UUID,        -- kept as org_id for backward compat with existing callers
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
    p.company_role,
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


-- ── 7. Update custom_access_token_hook ────────────────────────────────────────
-- Emit claim key "company_role" instead of "org_role".
-- The client (usePermissions.ts) will read "company_role" with fallback to "org_role".

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  claims       JSONB;
  user_profile RECORD;
  uid          UUID;
  lock_until   TIMESTAMPTZ;
BEGIN
  claims := event -> 'claims';

  uid := (event ->> 'user_id')::UUID;
  IF uid IS NULL THEN
    uid := (event -> 'claims' ->> 'sub')::UUID;
  END IF;

  SELECT locked_until INTO lock_until
    FROM public.jwt_refresh_locks
   WHERE user_id = uid
     AND locked_until > NOW();

  IF lock_until IS NOT NULL THEN
    DELETE FROM public.jwt_refresh_locks
     WHERE user_id = uid AND locked_until <= NOW();

    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Session invalidated due to role change. Please sign in again.'
      )
    );
  END IF;

  DELETE FROM public.jwt_refresh_locks
   WHERE user_id = uid AND locked_until <= NOW();

  SELECT
    p.company_id,
    p.platform_role::TEXT  AS platform_role,
    p.company_role::TEXT   AS company_role,
    o.slug                 AS org_slug
  INTO user_profile
  FROM public.profiles p
  LEFT JOIN public.companies o ON o.id = p.company_id
  WHERE p.id = uid;

  IF FOUND THEN
    claims := jsonb_set(claims, '{platform_role}',  to_jsonb(user_profile.platform_role));
    claims := jsonb_set(claims, '{company_role}',   to_jsonb(user_profile.company_role));
    IF user_profile.company_id IS NOT NULL THEN
      claims := jsonb_set(claims, '{org_id}',   to_jsonb(user_profile.company_id::TEXT));
      claims := jsonb_set(claims, '{org_slug}', to_jsonb(COALESCE(user_profile.org_slug, '')));
    END IF;
  ELSE
    claims := jsonb_set(claims, '{platform_role}', '"none"');
    claims := jsonb_set(claims, '{company_role}',  '"user"');
  END IF;

  RETURN jsonb_build_object('claims', claims);
END;
$$;

ALTER FUNCTION public.custom_access_token_hook(jsonb) OWNER TO postgres;


-- ── 8. Recreate all RLS policies using caller_company_role() ─────────────────

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
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "admin_org_profiles_update"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
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
    AND public.caller_company_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (id = public.caller_org_id());

-- ── role_change_log ───────────────────────────────────────────────────────────

CREATE POLICY "audit_insert"
  ON public.role_change_log FOR INSERT TO authenticated
  WITH CHECK (
    public.caller_company_role()::TEXT IN ('admin', 'super_admin')
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
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "admin_update_focus_areas"
  ON public.focus_areas FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (company_id = public.caller_org_id());

CREATE POLICY "admin_delete_focus_areas"
  ON public.focus_areas FOR DELETE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
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
      public.caller_company_role()::TEXT IN ('admin', 'super_admin')
      OR (
        public.caller_company_role()::TEXT = 'user'
        AND lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    )
  );

CREATE POLICY "admin_insert_employees"
  ON public.employees FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.caller_org_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "admin_update_employees"
  ON public.employees FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (company_id = public.caller_org_id());

CREATE POLICY "admin_delete_employees"
  ON public.employees FOR DELETE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
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
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "admin_update_shift_types"
  ON public.shift_types FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (company_id = public.caller_org_id());

CREATE POLICY "admin_delete_shift_types"
  ON public.shift_types FOR DELETE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
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
          AND public.caller_company_role() IN ('admin', 'super_admin')
        )
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "admin_update_shift_categories"
        ON public.shift_categories FOR UPDATE TO authenticated
        USING (
          company_id = public.caller_org_id()
          AND public.caller_company_role() IN ('admin', 'super_admin')
        )
        WITH CHECK (company_id = public.caller_org_id())
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "admin_delete_shift_categories"
        ON public.shift_categories FOR DELETE TO authenticated
        USING (
          company_id = public.caller_org_id()
          AND public.caller_company_role() IN ('admin', 'super_admin')
        )
    $pol$;
  END IF;
END $$;

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
    public.caller_company_role() IN ('admin', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = emp_id AND e.company_id = public.caller_org_id()
    )
  );

CREATE POLICY "admin_update_shifts"
  ON public.shifts FOR UPDATE TO authenticated
  USING (
    public.caller_company_role() IN ('admin', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = shifts.emp_id AND e.company_id = public.caller_org_id()
    )
  );

CREATE POLICY "admin_delete_shifts"
  ON public.shifts FOR DELETE TO authenticated
  USING (
    public.caller_company_role() IN ('admin', 'super_admin')
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
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "admin_update_notes"
  ON public.schedule_notes FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (company_id = public.caller_org_id());

CREATE POLICY "admin_delete_notes"
  ON public.schedule_notes FOR DELETE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
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
      AND public.caller_company_role()::TEXT IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "regular_shifts_update"
  ON public.regular_shifts FOR UPDATE TO authenticated
  USING (
    public.is_gridmaster()
    OR (
      company_id = public.caller_org_id()
      AND public.caller_company_role()::TEXT IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "regular_shifts_delete"
  ON public.regular_shifts FOR DELETE TO authenticated
  USING (
    public.is_gridmaster()
    OR (
      company_id = public.caller_org_id()
      AND public.caller_company_role()::TEXT IN ('admin', 'super_admin')
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
      AND public.caller_company_role()::TEXT IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "shift_series_update"
  ON public.shift_series FOR UPDATE TO authenticated
  USING (
    public.is_gridmaster()
    OR (
      company_id = public.caller_org_id()
      AND public.caller_company_role()::TEXT IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "shift_series_delete"
  ON public.shift_series FOR DELETE TO authenticated
  USING (
    public.is_gridmaster()
    OR (
      company_id = public.caller_org_id()
      AND public.caller_company_role()::TEXT IN ('admin', 'super_admin')
    )
  );

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
    AND public.caller_company_role()::TEXT IN ('admin', 'super_admin')
  )
  WITH CHECK (
    company_id = public.caller_org_id()
    AND public.caller_company_role()::TEXT IN ('admin', 'super_admin')
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
            AND public.caller_company_role()::TEXT IN ('admin', 'super_admin')
          )
        )
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "invitations_insert"
        ON public.invitations FOR INSERT TO authenticated
        WITH CHECK (
          company_id = public.caller_org_id()
          AND public.caller_company_role()::TEXT = 'super_admin'
        )
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "invitations_revoke"
        ON public.invitations FOR UPDATE TO authenticated
        USING (
          company_id = public.caller_org_id()
          AND public.caller_company_role()::TEXT IN ('admin', 'super_admin')
          AND accepted_at IS NULL
        )
        WITH CHECK (revoked_at IS NOT NULL)
    $pol$;
  END IF;
END $$;
