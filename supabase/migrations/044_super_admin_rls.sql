-- Migration 044: Rebuild all RLS policies with super_admin support
--
-- Two problems solved:
-- 1. Migration 042 renamed admin → super_admin, so policies checking
--    caller_org_role() = 'admin' blocked all writes for super_admin users.
-- 2. Stale RLS policies referencing the dropped org_members table survive
--    DROP TABLE CASCADE (Postgres only cascades policies ON that table, not
--    policies on other tables whose USING subqueries reference it). Those
--    stale policies fail at runtime with "relation org_members does not exist".
--
-- Strategy: wipe ALL policies on affected tables, then recreate them correctly.

-- ── 1. Purge all policies on affected tables ──────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'profiles', 'organizations', 'employees',
        'wings', 'shift_types', 'shifts', 'schedule_notes'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      r.policyname, r.tablename
    );
  END LOOP;
END $$;

-- ── 2. profiles ───────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "own_profile_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Admins/super_admins can read all profiles in their org
CREATE POLICY "admin_org_profiles_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    org_id IS NOT NULL
    AND org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

-- Admins/super_admins can update org members' roles (not platform_role)
CREATE POLICY "admin_org_profiles_update"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (
    org_id = public.caller_org_id()
    AND platform_role = 'none'
  );

-- ── 3. organizations ──────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_orgs"
  ON public.organizations FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "org_member_select_org"
  ON public.organizations FOR SELECT TO authenticated
  USING (id = public.caller_org_id());

CREATE POLICY "admin_update_org"
  ON public.organizations FOR UPDATE TO authenticated
  USING (
    id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (id = public.caller_org_id());

-- ── 4. employees ──────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_employees"
  ON public.employees FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

-- All org members can read employees; regular users only see their own record
CREATE POLICY "org_members_select_employees"
  ON public.employees FOR SELECT TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND (
      public.caller_org_role()::TEXT IN ('admin', 'super_admin', 'scheduler', 'supervisor')
      OR (
        public.caller_org_role()::TEXT = 'user'
        AND lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    )
  );

CREATE POLICY "scheduler_insert_employees"
  ON public.employees FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
  );

CREATE POLICY "scheduler_update_employees"
  ON public.employees FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
  )
  WITH CHECK (org_id = public.caller_org_id());

CREATE POLICY "scheduler_delete_employees"
  ON public.employees FOR DELETE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
  );

-- ── 5. wings ──────────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_wings"
  ON public.wings FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "org_members_select_wings"
  ON public.wings FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

CREATE POLICY "admin_insert_wings"
  ON public.wings FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "admin_update_wings"
  ON public.wings FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (org_id = public.caller_org_id());

CREATE POLICY "admin_delete_wings"
  ON public.wings FOR DELETE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

-- ── 6. shift_types ────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_shift_types"
  ON public.shift_types FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "org_members_select_shift_types"
  ON public.shift_types FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

CREATE POLICY "scheduler_insert_shift_types"
  ON public.shift_types FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
  );

CREATE POLICY "scheduler_update_shift_types"
  ON public.shift_types FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
  )
  WITH CHECK (org_id = public.caller_org_id());

CREATE POLICY "scheduler_delete_shift_types"
  ON public.shift_types FOR DELETE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
  );

-- ── 7. shifts ─────────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_shifts"
  ON public.shifts FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "org_members_select_shifts"
  ON public.shifts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = shifts.emp_id AND e.org_id = public.caller_org_id()
    )
  );

CREATE POLICY "scheduler_insert_shifts"
  ON public.shifts FOR INSERT TO authenticated
  WITH CHECK (
    public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = emp_id AND e.org_id = public.caller_org_id()
    )
  );

CREATE POLICY "scheduler_update_shifts"
  ON public.shifts FOR UPDATE TO authenticated
  USING (
    public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = shifts.emp_id AND e.org_id = public.caller_org_id()
    )
  );

CREATE POLICY "scheduler_delete_shifts"
  ON public.shifts FOR DELETE TO authenticated
  USING (
    public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = shifts.emp_id AND e.org_id = public.caller_org_id()
    )
  );

-- ── 8. schedule_notes ─────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_notes"
  ON public.schedule_notes FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "org_members_select_notes"
  ON public.schedule_notes FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

CREATE POLICY "supervisor_insert_notes"
  ON public.schedule_notes FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin', 'scheduler', 'supervisor')
  );

CREATE POLICY "supervisor_update_notes"
  ON public.schedule_notes FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin', 'scheduler', 'supervisor')
  )
  WITH CHECK (org_id = public.caller_org_id());

CREATE POLICY "scheduler_delete_notes"
  ON public.schedule_notes FOR DELETE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
  );
