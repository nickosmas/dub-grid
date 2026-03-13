-- ============================================================
-- Migration 048: Column renames — org_id → company_id, wings → focus_areas, wing_name → focus_area_name
--
-- This migration:
--   1. Renames org_id → company_id in all public tables that carry it
--   2. Renames employees.wings → employees.focus_areas (TEXT[])
--   3. Renames shift_types.wing_name → shift_types.focus_area_name
--   4. Renames schedule_notes.wing_name → schedule_notes.focus_area_name
--   5. Drops and recreates the schedule_notes unique constraint with new column name
--   6. Fixes the supabase_realtime publication (removes old wings table, adds focus_areas)
--   7. Recreates caller_org_id() to read company_id
--   8. Recreates cascade_wing_rename() trigger function + trigger on focus_areas
--   9. Recreates custom_access_token_hook to read company_id (JWT keys unchanged)
--  10. Recreates get_all_users_with_profiles to read company_id (return col unchanged)
--  11. Recreates send_invitation to use company_id column
--  12. Drops all stale RLS policies (still reference org_id column text) and
--      recreates them using company_id
--
-- Fully idempotent: every step checks current state before acting.
-- ============================================================


-- ── 0. Ensure table renames from 046 are applied (idempotent) ────────────────
--    In case migration 046 was a no-op (tables already renamed or never existed
--    under the old names), we repeat the renames here safely.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'wings') THEN
    ALTER TABLE public.wings RENAME TO focus_areas;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'organizations') THEN
    ALTER TABLE public.organizations RENAME TO companies;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'org_invitations') THEN
    ALTER TABLE public.org_invitations RENAME TO invitations;
  END IF;
END $$;


-- ── 1. Column renames (idempotent) ───────────────────────────────────────────

-- profiles.org_id → company_id
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE public.profiles RENAME COLUMN org_id TO company_id;
  END IF;
END $$;

-- focus_areas.org_id → company_id  (table was wings, renamed in 046)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'focus_areas' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE public.focus_areas RENAME COLUMN org_id TO company_id;
  END IF;
END $$;

-- employees.org_id → company_id
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE public.employees RENAME COLUMN org_id TO company_id;
  END IF;
END $$;

-- employees.wings → focus_areas  (TEXT[] column)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'wings'
  ) THEN
    ALTER TABLE public.employees RENAME COLUMN wings TO focus_areas;
  END IF;
END $$;

-- shift_types.org_id → company_id
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shift_types' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE public.shift_types RENAME COLUMN org_id TO company_id;
  END IF;
END $$;

-- shift_types.wing_name → focus_area_name
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shift_types' AND column_name = 'wing_name'
  ) THEN
    ALTER TABLE public.shift_types RENAME COLUMN wing_name TO focus_area_name;
  END IF;
END $$;

-- schedule_notes.org_id → company_id
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'schedule_notes' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE public.schedule_notes RENAME COLUMN org_id TO company_id;
  END IF;
END $$;

-- schedule_notes.wing_name → focus_area_name
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'schedule_notes' AND column_name = 'wing_name'
  ) THEN
    ALTER TABLE public.schedule_notes RENAME COLUMN wing_name TO focus_area_name;
  END IF;
END $$;

-- regular_shifts.org_id → company_id
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'regular_shifts' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE public.regular_shifts RENAME COLUMN org_id TO company_id;
  END IF;
END $$;

-- shift_series.org_id → company_id
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shift_series' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE public.shift_series RENAME COLUMN org_id TO company_id;
  END IF;
END $$;

-- indicator_types.org_id → company_id
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'indicator_types' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE public.indicator_types RENAME COLUMN org_id TO company_id;
  END IF;
END $$;

-- invitations.org_id → company_id  (table was org_invitations, renamed in 046)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invitations' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE public.invitations RENAME COLUMN org_id TO company_id;
  END IF;
END $$;


-- ── 2. Drop and recreate schedule_notes unique constraint ─────────────────────
--
-- Old constraint: schedule_notes_emp_id_date_note_type_wing_key
--                 on (emp_id, date, note_type, wing_name)
-- New constraint: schedule_notes_emp_id_date_note_type_focus_area_key
--                 on (emp_id, date, note_type, focus_area_name)

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'schedule_notes'
      AND constraint_name = 'schedule_notes_emp_id_date_note_type_wing_key'
  ) THEN
    ALTER TABLE public.schedule_notes
      DROP CONSTRAINT schedule_notes_emp_id_date_note_type_wing_key;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'schedule_notes'
      AND constraint_name = 'schedule_notes_emp_id_date_note_type_focus_area_key'
  ) THEN
    ALTER TABLE public.schedule_notes
      ADD CONSTRAINT schedule_notes_emp_id_date_note_type_focus_area_key
      UNIQUE (emp_id, date, note_type, focus_area_name);
  END IF;
END $$;


-- ── 3. Fix realtime publication ───────────────────────────────────────────────
--
-- Remove old public.wings reference (table no longer exists — renamed to focus_areas
-- in migration 046). Swallow errors in case it was never in the publication or
-- the table drop already removed it.

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.wings;
EXCEPTION
  WHEN undefined_table  THEN NULL;
  WHEN SQLSTATE '42P01' THEN NULL;
  WHEN others           THEN NULL;
END $$;

-- Add focus_areas to realtime publication (idempotent — duplicate_object = already there)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.focus_areas;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Ensure replica identity so clients receive old row values on UPDATE/DELETE
DO $$ BEGIN
  ALTER TABLE public.focus_areas REPLICA IDENTITY FULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;


-- ── 4. Recreate caller_org_id() ───────────────────────────────────────────────
--
-- The function body previously read `org_id` from profiles.
-- After the rename it must read `company_id`. Keep the function name and
-- signature unchanged — every RLS policy in the codebase calls it.

CREATE OR REPLACE FUNCTION public.caller_org_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;


-- ── 5. Recreate cascade_wing_rename() + trigger ───────────────────────────────
--
-- Migration 045 created this trigger on public.wings. After the table rename
-- (migration 046) the trigger survived on the renamed table, but its body still
-- references the old column names (org_id, wings, wing_name). We recreate the
-- function with the new column names and reattach the trigger to focus_areas.

CREATE OR REPLACE FUNCTION public.cascade_wing_rename()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    -- employees.focus_areas is a text[]; replace the old name with the new one
    UPDATE public.employees
    SET focus_areas = array_replace(focus_areas, OLD.name, NEW.name)
    WHERE company_id = NEW.company_id
      AND OLD.name = ANY(focus_areas);

    -- shift_types.focus_area_name is a plain text column
    UPDATE public.shift_types
    SET focus_area_name = NEW.name
    WHERE company_id = NEW.company_id
      AND focus_area_name = OLD.name;

    -- schedule_notes.focus_area_name is a plain text column
    UPDATE public.schedule_notes
    SET focus_area_name = NEW.name
    WHERE company_id = NEW.company_id
      AND focus_area_name = OLD.name;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop old trigger (may be named trg_wing_rename_cascade on focus_areas after 046 rename,
-- or still on wings if that table somehow exists). Recreate cleanly on focus_areas.
DROP TRIGGER IF EXISTS trg_wing_rename_cascade ON public.focus_areas;
DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_wing_rename_cascade ON public.wings;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

CREATE TRIGGER trg_wing_rename_cascade
  AFTER UPDATE OF name ON public.focus_areas
  FOR EACH ROW EXECUTE FUNCTION public.cascade_wing_rename();


-- ── 6. Recreate custom_access_token_hook ──────────────────────────────────────
--
-- Reads p.company_id and joins companies on company_id.
-- JWT claim keys remain org_id / org_slug for backward compatibility.

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

  -- Resolve user id from event (user_id or claims.sub)
  uid := (event ->> 'user_id')::UUID;
  IF uid IS NULL THEN
    uid := (event -> 'claims' ->> 'sub')::UUID;
  END IF;

  -- Check for active JWT refresh lock (written by change_user_role RPC).
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

  -- Read from company_id (renamed from org_id in this migration).
  -- JWT claim keys stay as org_id / org_slug for backward compat.
  SELECT
    p.company_id,
    p.platform_role::TEXT AS platform_role,
    p.org_role::TEXT AS org_role,
    o.slug AS org_slug
  INTO user_profile
  FROM public.profiles p
  LEFT JOIN public.companies o ON o.id = p.company_id
  WHERE p.id = uid;

  IF FOUND THEN
    claims := jsonb_set(claims, '{platform_role}', to_jsonb(user_profile.platform_role));
    claims := jsonb_set(claims, '{org_role}',      to_jsonb(user_profile.org_role));
    IF user_profile.company_id IS NOT NULL THEN
      claims := jsonb_set(claims, '{org_id}',   to_jsonb(user_profile.company_id::TEXT));
      claims := jsonb_set(claims, '{org_slug}', to_jsonb(COALESCE(user_profile.org_slug, '')));
    END IF;
  ELSE
    claims := jsonb_set(claims, '{platform_role}', '"none"');
    claims := jsonb_set(claims, '{org_role}',      '"user"');
  END IF;

  RETURN jsonb_build_object('claims', claims);
END;
$$;

ALTER FUNCTION public.custom_access_token_hook(jsonb) OWNER TO postgres;


-- ── 7. Recreate get_all_users_with_profiles ───────────────────────────────────
--
-- Internally reads p.company_id and joins on company_id = o.id.
-- Return column is still named org_id for backward compatibility.

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
    p.company_id AS org_id,   -- return column kept as org_id for backward compat
    o.name       AS org_name,
    p.created_at,
    u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON u.id = p.id
  LEFT JOIN public.companies o ON p.company_id = o.id
  ORDER BY u.email ASC;
END;
$$;


-- ── 8. Recreate send_invitation ───────────────────────────────────────────────
--
-- Parameter name p_org_id kept unchanged for backward compat.
-- Column references updated from org_id to company_id.

CREATE OR REPLACE FUNCTION public.send_invitation(
  p_email    TEXT,
  p_role     TEXT,
  p_org_id   UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite RECORD;
BEGIN
  -- Authorization: only gridmasters or admins/super_admins of the target org may invite
  IF NOT (
    public.is_gridmaster()
    OR (
      public.caller_org_id() = p_org_id
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only org admins can send invitations';
  END IF;

  -- Clean up expired invites for the same email/org
  DELETE FROM public.invitations
   WHERE company_id = p_org_id
     AND email = p_email
     AND accepted_at IS NULL
     AND expires_at < NOW();

  -- Insert new invite with 72-hour expiry (default from table definition)
  INSERT INTO public.invitations (company_id, invited_by, email, role_to_assign)
    VALUES (p_org_id, auth.uid(), p_email, p_role)
  RETURNING * INTO v_invite;

  RETURN jsonb_build_object(
    'token',      v_invite.token,
    'expires_at', v_invite.expires_at
  );
END;
$$;


-- ── 9. Drop and recreate all RLS policies that reference org_id ───────────────
--
-- RLS policy SQL text is stored verbatim. Renaming a column does NOT update
-- policy definitions, so any policy whose USING/WITH CHECK clause contained
-- "org_id" will now reference a non-existent column and fail at query time.
--
-- Strategy:
--   a) Drop ALL existing policies on affected tables (using a dynamic loop so
--      we catch every policy name regardless of what prior migrations left behind)
--   b) Recreate authoritative policies using the new company_id column name

-- ── 9a. Purge all policies on affected tables ─────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'profiles', 'focus_areas', 'employees', 'shift_types',
        'shifts', 'schedule_notes', 'regular_shifts', 'shift_series',
        'indicator_types', 'invitations'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      r.policyname, r.tablename
    );
  END LOOP;
END $$;

-- ── 9b. profiles ──────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "own_profile_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Admins and super_admins can read all profiles in their org
CREATE POLICY "admin_org_profiles_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

-- Admins and super_admins can update org members' roles (not platform_role)
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

-- ── 9c. focus_areas ───────────────────────────────────────────────────────────

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

-- ── 9d. employees ─────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_employees"
  ON public.employees FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

-- All org members can read employees; regular users only see their own record
CREATE POLICY "org_members_select_employees"
  ON public.employees FOR SELECT TO authenticated
  USING (
    company_id = public.caller_org_id()
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
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
  );

CREATE POLICY "scheduler_update_employees"
  ON public.employees FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
  )
  WITH CHECK (company_id = public.caller_org_id());

CREATE POLICY "scheduler_delete_employees"
  ON public.employees FOR DELETE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
  );

-- ── 9e. shift_types ───────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_shift_types"
  ON public.shift_types FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "org_members_select_shift_types"
  ON public.shift_types FOR SELECT TO authenticated
  USING (company_id = public.caller_org_id());

CREATE POLICY "scheduler_insert_shift_types"
  ON public.shift_types FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
  );

CREATE POLICY "scheduler_update_shift_types"
  ON public.shift_types FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
  )
  WITH CHECK (company_id = public.caller_org_id());

CREATE POLICY "scheduler_delete_shift_types"
  ON public.shift_types FOR DELETE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
  );

-- ── 9f. shifts ────────────────────────────────────────────────────────────────
--
-- shifts has no direct org_id / company_id column; org membership is resolved
-- through a join on employees.company_id. These policies are recreated here
-- to ensure they're consistent and reference the correct column name in the
-- subquery after the employees rename.

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

CREATE POLICY "scheduler_insert_shifts"
  ON public.shifts FOR INSERT TO authenticated
  WITH CHECK (
    public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = emp_id AND e.company_id = public.caller_org_id()
    )
  );

CREATE POLICY "scheduler_update_shifts"
  ON public.shifts FOR UPDATE TO authenticated
  USING (
    public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = shifts.emp_id AND e.company_id = public.caller_org_id()
    )
  );

CREATE POLICY "scheduler_delete_shifts"
  ON public.shifts FOR DELETE TO authenticated
  USING (
    public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = shifts.emp_id AND e.company_id = public.caller_org_id()
    )
  );

-- ── 9g. schedule_notes ────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_notes"
  ON public.schedule_notes FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "org_members_select_notes"
  ON public.schedule_notes FOR SELECT TO authenticated
  USING (company_id = public.caller_org_id());

CREATE POLICY "supervisor_insert_notes"
  ON public.schedule_notes FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin', 'scheduler', 'supervisor')
  );

CREATE POLICY "supervisor_update_notes"
  ON public.schedule_notes FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin', 'scheduler', 'supervisor')
  )
  WITH CHECK (company_id = public.caller_org_id());

CREATE POLICY "scheduler_delete_notes"
  ON public.schedule_notes FOR DELETE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
  );

-- ── 9h. regular_shifts ────────────────────────────────────────────────────────

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
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin', 'scheduler')
    )
  );

CREATE POLICY "regular_shifts_update"
  ON public.regular_shifts FOR UPDATE TO authenticated
  USING (
    public.is_gridmaster()
    OR (
      company_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin', 'scheduler')
    )
  );

CREATE POLICY "regular_shifts_delete"
  ON public.regular_shifts FOR DELETE TO authenticated
  USING (
    public.is_gridmaster()
    OR (
      company_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin', 'scheduler')
    )
  );

-- ── 9i. shift_series ──────────────────────────────────────────────────────────

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
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin', 'scheduler')
    )
  );

CREATE POLICY "shift_series_update"
  ON public.shift_series FOR UPDATE TO authenticated
  USING (
    public.is_gridmaster()
    OR (
      company_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin', 'scheduler')
    )
  );

CREATE POLICY "shift_series_delete"
  ON public.shift_series FOR DELETE TO authenticated
  USING (
    public.is_gridmaster()
    OR (
      company_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin', 'scheduler')
    )
  );

-- ── 9j. indicator_types ───────────────────────────────────────────────────────

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
    AND public.caller_org_role()::TEXT IN ('admin', 'super_admin', 'scheduler')
  )
  WITH CHECK (
    company_id = public.caller_org_id()
    AND public.caller_org_role()::TEXT IN ('admin', 'super_admin', 'scheduler')
  );

-- ── 9k. invitations ───────────────────────────────────────────────────────────
--    Wrapped in DO block in case the table doesn't exist on this environment.

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

    EXECUTE $pol$
      CREATE POLICY "invitations_insert"
        ON public.invitations FOR INSERT TO authenticated
        WITH CHECK (
          company_id = public.caller_org_id()
          AND public.caller_org_role()::TEXT IN ('admin', 'super_admin')
          AND role_to_assign NOT IN ('admin', 'gridmaster')
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
