-- Migration 049: Admin permissions — per-user configurable permissions for admins
--
-- Changes:
--   1. Migrate legacy role data (scheduler/supervisor → admin)
--   2. Add admin_permissions JSONB column to profiles
--   3. Update all RLS policies to remove scheduler/supervisor references
--
-- Role hierarchy after this migration:
--   gridmaster (platform_role) — global platform admin
--   super_admin               — org owner; all org permissions
--   admin                     — configurable permissions set by super_admin
--   user                      — read-only
--
-- NOTE: PostgreSQL does not support dropping enum values without cascading all
-- dependent objects (functions, policies). Dropping and recreating the org_role
-- enum would require recreating dozens of policies and RPCs in this migration,
-- creating a high risk of missing something. Instead, 'scheduler' and 'supervisor'
-- remain as unused enum values — all existing rows are promoted to 'admin' in step 1,
-- no new code assigns those values, and the RLS policies below no longer reference them.
--
-- Security model for admins:
--   DB level:  admin role has blanket write access (same as super_admin for org data)
--   App level: admin_permissions JSONB controls which actions the UI exposes

-- ── 1. Migrate legacy role data ───────────────────────────────────────────────
-- Promote any existing scheduler/supervisor rows to admin.

UPDATE public.profiles
SET org_role = 'admin'
WHERE org_role IN ('scheduler', 'supervisor');

-- Also update any open invitations that assigned legacy roles
UPDATE public.invitations
SET role_to_assign = 'admin'
WHERE role_to_assign IN ('scheduler', 'supervisor');


-- ── 3. Add admin_permissions JSONB column ─────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'admin_permissions'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN admin_permissions JSONB DEFAULT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.admin_permissions IS
  'Per-user configurable permissions for admin role users. NULL = no write access. '
  'Ignored for super_admin and gridmaster (always full access). '
  'Keys: canEditShifts, canPublishSchedule, canApplyRegularSchedule, canEditNotes, '
  'canManageRegularShifts, canManageShiftSeries, canManageEmployees, '
  'canManageFocusAreas, canManageShiftTypes, canManageIndicatorTypes, canManageOrgSettings.';


-- ── 4. Recreate caller_org_role() to return the new enum type ─────────────────
-- (May already exist; CREATE OR REPLACE is safe.)

CREATE OR REPLACE FUNCTION public.caller_org_role()
RETURNS public.org_role
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT org_role FROM public.profiles WHERE id = auth.uid();
$$;


-- ── 5. Update RLS policies to remove scheduler / supervisor ───────────────────
-- Drop and recreate every policy that referenced the legacy role values.
-- We only touch policies whose USING/WITH CHECK clauses included those values.

-- ── profiles ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_org_profiles_select" ON public.profiles;
CREATE POLICY "admin_org_profiles_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

DROP POLICY IF EXISTS "admin_org_profiles_update" ON public.profiles;
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

-- ── focus_areas ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_insert_focus_areas" ON public.focus_areas;
CREATE POLICY "admin_insert_focus_areas"
  ON public.focus_areas FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

DROP POLICY IF EXISTS "admin_update_focus_areas" ON public.focus_areas;
CREATE POLICY "admin_update_focus_areas"
  ON public.focus_areas FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (company_id = public.caller_org_id());

DROP POLICY IF EXISTS "admin_delete_focus_areas" ON public.focus_areas;
CREATE POLICY "admin_delete_focus_areas"
  ON public.focus_areas FOR DELETE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

-- ── employees ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "org_members_select_employees" ON public.employees;
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

DROP POLICY IF EXISTS "scheduler_insert_employees" ON public.employees;
CREATE POLICY "admin_insert_employees"
  ON public.employees FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

DROP POLICY IF EXISTS "scheduler_update_employees" ON public.employees;
CREATE POLICY "admin_update_employees"
  ON public.employees FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (company_id = public.caller_org_id());

DROP POLICY IF EXISTS "scheduler_delete_employees" ON public.employees;
CREATE POLICY "admin_delete_employees"
  ON public.employees FOR DELETE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

-- ── shift_types ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "scheduler_insert_shift_types" ON public.shift_types;
CREATE POLICY "admin_insert_shift_types"
  ON public.shift_types FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

DROP POLICY IF EXISTS "scheduler_update_shift_types" ON public.shift_types;
CREATE POLICY "admin_update_shift_types"
  ON public.shift_types FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (company_id = public.caller_org_id());

DROP POLICY IF EXISTS "scheduler_delete_shift_types" ON public.shift_types;
CREATE POLICY "admin_delete_shift_types"
  ON public.shift_types FOR DELETE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

-- ── shifts ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "scheduler_insert_shifts" ON public.shifts;
CREATE POLICY "admin_insert_shifts"
  ON public.shifts FOR INSERT TO authenticated
  WITH CHECK (
    public.caller_org_role() IN ('admin', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = emp_id AND e.company_id = public.caller_org_id()
    )
  );

DROP POLICY IF EXISTS "scheduler_update_shifts" ON public.shifts;
CREATE POLICY "admin_update_shifts"
  ON public.shifts FOR UPDATE TO authenticated
  USING (
    public.caller_org_role() IN ('admin', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = shifts.emp_id AND e.company_id = public.caller_org_id()
    )
  );

DROP POLICY IF EXISTS "scheduler_delete_shifts" ON public.shifts;
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

DROP POLICY IF EXISTS "supervisor_insert_notes" ON public.schedule_notes;
CREATE POLICY "admin_insert_notes"
  ON public.schedule_notes FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

DROP POLICY IF EXISTS "supervisor_update_notes" ON public.schedule_notes;
CREATE POLICY "admin_update_notes"
  ON public.schedule_notes FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (company_id = public.caller_org_id());

DROP POLICY IF EXISTS "scheduler_delete_notes" ON public.schedule_notes;
CREATE POLICY "admin_delete_notes"
  ON public.schedule_notes FOR DELETE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

-- ── regular_shifts ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "regular_shifts_insert" ON public.regular_shifts;
CREATE POLICY "regular_shifts_insert"
  ON public.regular_shifts FOR INSERT TO authenticated
  WITH CHECK (
    public.is_gridmaster()
    OR (
      company_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "regular_shifts_update" ON public.regular_shifts;
CREATE POLICY "regular_shifts_update"
  ON public.regular_shifts FOR UPDATE TO authenticated
  USING (
    public.is_gridmaster()
    OR (
      company_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "regular_shifts_delete" ON public.regular_shifts;
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

DROP POLICY IF EXISTS "shift_series_insert" ON public.shift_series;
CREATE POLICY "shift_series_insert"
  ON public.shift_series FOR INSERT TO authenticated
  WITH CHECK (
    public.is_gridmaster()
    OR (
      company_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "shift_series_update" ON public.shift_series;
CREATE POLICY "shift_series_update"
  ON public.shift_series FOR UPDATE TO authenticated
  USING (
    public.is_gridmaster()
    OR (
      company_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "shift_series_delete" ON public.shift_series;
CREATE POLICY "shift_series_delete"
  ON public.shift_series FOR DELETE TO authenticated
  USING (
    public.is_gridmaster()
    OR (
      company_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin')
    )
  );

-- ── indicator_types ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admins_manage_indicator_types" ON public.indicator_types;
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
-- Only super_admin can invite; drop old policy that allowed 'admin' to invite
-- without restriction. Admin users can view invitations but cannot send them.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invitations') THEN
    EXECUTE $pol$
      DROP POLICY IF EXISTS "invitations_insert" ON public.invitations
    $pol$;

    EXECUTE $pol$
      CREATE POLICY "invitations_insert"
        ON public.invitations FOR INSERT TO authenticated
        WITH CHECK (
          company_id = public.caller_org_id()
          AND public.caller_org_role()::TEXT = 'super_admin'
        )
    $pol$;
  END IF;
END $$;
