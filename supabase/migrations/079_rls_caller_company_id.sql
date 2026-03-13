-- ============================================================
-- Migration 079: Rebuild all RLS policies to use caller_company_id()
--
-- All policies currently call caller_org_id() (a shim that
-- forwards to caller_company_id()). This migration:
--   1. Drops all policies on affected tables
--   2. Recreates them calling caller_company_id() directly
--   3. Drops the caller_org_id() shim
-- ============================================================


-- ── 1. Bulk-drop all policies on affected tables ────────────────────────────

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'profiles', 'companies', 'role_change_log',
        'focus_areas', 'employees', 'shift_codes', 'shift_categories',
        'shifts', 'schedule_notes', 'regular_shifts', 'shift_series',
        'indicator_types', 'invitations',
        'certifications', 'company_roles'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;


-- ── 2. Recreate all policies using caller_company_id() ──────────────────────

-- ── profiles ────────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "own_profile_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "admin_profiles_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "admin_profiles_update"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (
    company_id = public.caller_company_id()
    AND platform_role = 'none'
  );

-- ── companies ───────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_companies"
  ON public.companies FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_company"
  ON public.companies FOR SELECT TO authenticated
  USING (id = public.caller_company_id());

CREATE POLICY "admin_update_company"
  ON public.companies FOR UPDATE TO authenticated
  USING (
    id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (id = public.caller_company_id());

-- ── role_change_log ─────────────────────────────────────────────────────────

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
        AND company_id = public.caller_company_id()
    )
  );

-- ── focus_areas ─────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_focus_areas"
  ON public.focus_areas FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_focus_areas"
  ON public.focus_areas FOR SELECT TO authenticated
  USING (company_id = public.caller_company_id());

CREATE POLICY "admin_insert_focus_areas"
  ON public.focus_areas FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "admin_update_focus_areas"
  ON public.focus_areas FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (company_id = public.caller_company_id());

CREATE POLICY "admin_delete_focus_areas"
  ON public.focus_areas FOR DELETE TO authenticated
  USING (
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

-- ── employees ───────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_employees"
  ON public.employees FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_employees"
  ON public.employees FOR SELECT TO authenticated
  USING (
    company_id = public.caller_company_id()
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
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "admin_update_employees"
  ON public.employees FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (company_id = public.caller_company_id());

CREATE POLICY "admin_delete_employees"
  ON public.employees FOR DELETE TO authenticated
  USING (
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

-- ── shift_codes (was shift_types, renamed in migration 055) ─────────────────

CREATE POLICY "gridmaster_all_shift_codes"
  ON public.shift_codes FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_shift_codes"
  ON public.shift_codes FOR SELECT TO authenticated
  USING (company_id = public.caller_company_id());

CREATE POLICY "admin_insert_shift_codes"
  ON public.shift_codes FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "admin_update_shift_codes"
  ON public.shift_codes FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (company_id = public.caller_company_id());

CREATE POLICY "admin_delete_shift_codes"
  ON public.shift_codes FOR DELETE TO authenticated
  USING (
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

-- ── shift_categories ────────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'shift_categories') THEN
    EXECUTE $pol$
      CREATE POLICY "gridmaster_all_shift_categories"
        ON public.shift_categories FOR ALL TO authenticated
        USING (public.is_gridmaster())
        WITH CHECK (public.is_gridmaster())
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "members_select_shift_categories"
        ON public.shift_categories FOR SELECT TO authenticated
        USING (company_id = public.caller_company_id())
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "admin_insert_shift_categories"
        ON public.shift_categories FOR INSERT TO authenticated
        WITH CHECK (
          company_id = public.caller_company_id()
          AND public.caller_company_role() IN ('admin', 'super_admin')
        )
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "admin_update_shift_categories"
        ON public.shift_categories FOR UPDATE TO authenticated
        USING (
          company_id = public.caller_company_id()
          AND public.caller_company_role() IN ('admin', 'super_admin')
        )
        WITH CHECK (company_id = public.caller_company_id())
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "admin_delete_shift_categories"
        ON public.shift_categories FOR DELETE TO authenticated
        USING (
          company_id = public.caller_company_id()
          AND public.caller_company_role() IN ('admin', 'super_admin')
        )
    $pol$;
  END IF;
END $$;

-- ── shifts ──────────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_shifts"
  ON public.shifts FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_shifts"
  ON public.shifts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = shifts.emp_id AND e.company_id = public.caller_company_id()
    )
  );

CREATE POLICY "admin_insert_shifts"
  ON public.shifts FOR INSERT TO authenticated
  WITH CHECK (
    public.caller_company_role() IN ('admin', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = emp_id AND e.company_id = public.caller_company_id()
    )
  );

CREATE POLICY "admin_update_shifts"
  ON public.shifts FOR UPDATE TO authenticated
  USING (
    public.caller_company_role() IN ('admin', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = shifts.emp_id AND e.company_id = public.caller_company_id()
    )
  );

CREATE POLICY "admin_delete_shifts"
  ON public.shifts FOR DELETE TO authenticated
  USING (
    public.caller_company_role() IN ('admin', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = shifts.emp_id AND e.company_id = public.caller_company_id()
    )
  );

-- ── schedule_notes ──────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_notes"
  ON public.schedule_notes FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_notes"
  ON public.schedule_notes FOR SELECT TO authenticated
  USING (company_id = public.caller_company_id());

CREATE POLICY "admin_insert_notes"
  ON public.schedule_notes FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "admin_update_notes"
  ON public.schedule_notes FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (company_id = public.caller_company_id());

CREATE POLICY "admin_delete_notes"
  ON public.schedule_notes FOR DELETE TO authenticated
  USING (
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

-- ── regular_shifts ──────────────────────────────────────────────────────────

CREATE POLICY "regular_shifts_select"
  ON public.regular_shifts FOR SELECT TO authenticated
  USING (
    public.is_gridmaster()
    OR company_id = public.caller_company_id()
  );

CREATE POLICY "regular_shifts_insert"
  ON public.regular_shifts FOR INSERT TO authenticated
  WITH CHECK (
    public.is_gridmaster()
    OR (
      company_id = public.caller_company_id()
      AND public.caller_company_role()::TEXT IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "regular_shifts_update"
  ON public.regular_shifts FOR UPDATE TO authenticated
  USING (
    public.is_gridmaster()
    OR (
      company_id = public.caller_company_id()
      AND public.caller_company_role()::TEXT IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "regular_shifts_delete"
  ON public.regular_shifts FOR DELETE TO authenticated
  USING (
    public.is_gridmaster()
    OR (
      company_id = public.caller_company_id()
      AND public.caller_company_role()::TEXT IN ('admin', 'super_admin')
    )
  );

-- ── shift_series ────────────────────────────────────────────────────────────

CREATE POLICY "shift_series_select"
  ON public.shift_series FOR SELECT TO authenticated
  USING (
    public.is_gridmaster()
    OR company_id = public.caller_company_id()
  );

CREATE POLICY "shift_series_insert"
  ON public.shift_series FOR INSERT TO authenticated
  WITH CHECK (
    public.is_gridmaster()
    OR (
      company_id = public.caller_company_id()
      AND public.caller_company_role()::TEXT IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "shift_series_update"
  ON public.shift_series FOR UPDATE TO authenticated
  USING (
    public.is_gridmaster()
    OR (
      company_id = public.caller_company_id()
      AND public.caller_company_role()::TEXT IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "shift_series_delete"
  ON public.shift_series FOR DELETE TO authenticated
  USING (
    public.is_gridmaster()
    OR (
      company_id = public.caller_company_id()
      AND public.caller_company_role()::TEXT IN ('admin', 'super_admin')
    )
  );

-- ── indicator_types ─────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_indicator_types"
  ON public.indicator_types FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_indicator_types"
  ON public.indicator_types FOR SELECT TO authenticated
  USING (company_id = public.caller_company_id());

CREATE POLICY "admins_manage_indicator_types"
  ON public.indicator_types FOR ALL TO authenticated
  USING (
    company_id = public.caller_company_id()
    AND public.caller_company_role()::TEXT IN ('admin', 'super_admin')
  )
  WITH CHECK (
    company_id = public.caller_company_id()
    AND public.caller_company_role()::TEXT IN ('admin', 'super_admin')
  );

-- ── invitations ─────────────────────────────────────────────────────────────

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
            company_id = public.caller_company_id()
            AND public.caller_company_role()::TEXT IN ('admin', 'super_admin')
          )
        )
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "invitations_insert"
        ON public.invitations FOR INSERT TO authenticated
        WITH CHECK (
          company_id = public.caller_company_id()
          AND public.caller_company_role()::TEXT = 'super_admin'
        )
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "invitations_revoke"
        ON public.invitations FOR UPDATE TO authenticated
        USING (
          company_id = public.caller_company_id()
          AND public.caller_company_role()::TEXT IN ('admin', 'super_admin')
          AND accepted_at IS NULL
        )
        WITH CHECK (revoked_at IS NOT NULL)
    $pol$;
  END IF;
END $$;

-- ── certifications ──────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_certifications"
  ON public.certifications FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_certifications"
  ON public.certifications FOR SELECT TO authenticated
  USING (company_id = public.caller_company_id());

CREATE POLICY "admin_insert_certifications"
  ON public.certifications FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "admin_update_certifications"
  ON public.certifications FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (company_id = public.caller_company_id());

CREATE POLICY "admin_delete_certifications"
  ON public.certifications FOR DELETE TO authenticated
  USING (
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

-- ── company_roles ───────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_company_roles"
  ON public.company_roles FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_company_roles"
  ON public.company_roles FOR SELECT TO authenticated
  USING (company_id = public.caller_company_id());

CREATE POLICY "admin_insert_company_roles"
  ON public.company_roles FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "admin_update_company_roles"
  ON public.company_roles FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (company_id = public.caller_company_id());

CREATE POLICY "admin_delete_company_roles"
  ON public.company_roles FOR DELETE TO authenticated
  USING (
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );


-- ── 3. Drop the caller_org_id() shim — no longer referenced anywhere ────────

DROP FUNCTION IF EXISTS public.caller_org_id();
