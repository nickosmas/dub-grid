-- Migration: 023_employees_uuid_pk.sql
-- Purpose: Change employees.id from bigint to UUID.
--
-- PostgreSQL cannot ALTER COLUMN a bigint primary key to UUID in-place.
-- We drop dependent tables (shifts, schedule_notes) and employees,
-- then recreate them with the correct UUID types.
--
-- Safe for development environments without real user data.
-- If you have data to preserve, export it first and re-import after.

-- ── 1. Drop dependent tables ──────────────────────────────────────────────────
DROP TABLE IF EXISTS public.shifts          CASCADE;
DROP TABLE IF EXISTS public.schedule_notes  CASCADE;
DROP TABLE IF EXISTS public.employees       CASCADE;

-- ── 2. Recreate employees with UUID PK ───────────────────────────────────────
CREATE TABLE public.employees (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name          TEXT         NOT NULL,
  designation   TEXT         NOT NULL DEFAULT 'STAFF',
  roles         TEXT[]       NOT NULL DEFAULT '{}',
  fte_weight    NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  seniority     INTEGER      NOT NULL,
  wings         TEXT[]       NOT NULL DEFAULT '{}',
  phone         TEXT         NOT NULL DEFAULT '',
  email         TEXT         NOT NULL DEFAULT '',
  contact_notes TEXT         NOT NULL DEFAULT '',
  UNIQUE(org_id, name)
);

CREATE INDEX IF NOT EXISTS employees_org_id_idx ON public.employees(org_id);

-- ── 3. Recreate shifts with UUID emp_id ──────────────────────────────────────
CREATE TABLE public.shifts (
  emp_id      UUID        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  shift_label TEXT        NOT NULL,
  org_id      UUID        REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  version     BIGINT      NOT NULL DEFAULT 0,
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (emp_id, date)
);

CREATE INDEX IF NOT EXISTS shifts_emp_id_idx   ON public.shifts(emp_id);
CREATE INDEX IF NOT EXISTS shifts_date_idx     ON public.shifts(date);
CREATE INDEX IF NOT EXISTS idx_shifts_org_date ON public.shifts(org_id, date);

DROP TRIGGER IF EXISTS trigger_shifts_updated_at ON public.shifts;
CREATE TRIGGER trigger_shifts_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_shifts_updated_at();

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shifts_select" ON public.shifts;
DROP POLICY IF EXISTS "shifts_insert" ON public.shifts;
DROP POLICY IF EXISTS "shifts_update" ON public.shifts;
DROP POLICY IF EXISTS "shifts_delete" ON public.shifts;

CREATE POLICY "shifts_select" ON public.shifts FOR SELECT TO authenticated
  USING (public.is_gridmaster() OR org_id = public.caller_org_id());

CREATE POLICY "shifts_insert" ON public.shifts FOR INSERT TO authenticated
  WITH CHECK (
    public.is_gridmaster()
    OR (org_id = public.caller_org_id() AND public.caller_org_role()::TEXT IN ('admin', 'scheduler'))
  );

CREATE POLICY "shifts_update" ON public.shifts FOR UPDATE TO authenticated
  USING (
    public.is_gridmaster()
    OR (org_id = public.caller_org_id() AND public.caller_org_role()::TEXT IN ('admin', 'scheduler'))
  )
  WITH CHECK (
    public.is_gridmaster()
    OR (org_id = public.caller_org_id() AND public.caller_org_role()::TEXT IN ('admin', 'scheduler'))
  );

CREATE POLICY "shifts_delete" ON public.shifts FOR DELETE TO authenticated
  USING (
    public.is_gridmaster()
    OR (org_id = public.caller_org_id() AND public.caller_org_role()::TEXT IN ('admin', 'scheduler'))
  );

-- ── 4. Recreate schedule_notes with UUID emp_id ───────────────────────────────
CREATE TABLE public.schedule_notes (
  id         BIGSERIAL   PRIMARY KEY,
  org_id     UUID        REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  emp_id     UUID        REFERENCES public.employees(id)     ON DELETE CASCADE NOT NULL,
  date       DATE        NOT NULL,
  note_type  TEXT        NOT NULL CHECK (note_type IN ('readings', 'shower')),
  created_by UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (emp_id, date, note_type)
);

CREATE INDEX IF NOT EXISTS schedule_notes_org_idx ON public.schedule_notes(org_id);
CREATE INDEX IF NOT EXISTS schedule_notes_emp_idx ON public.schedule_notes(emp_id);

ALTER TABLE public.schedule_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gridmaster_all_notes"    ON public.schedule_notes;
DROP POLICY IF EXISTS "org_members_select_notes" ON public.schedule_notes;
DROP POLICY IF EXISTS "supervisor_insert_notes"  ON public.schedule_notes;
DROP POLICY IF EXISTS "supervisor_update_notes"  ON public.schedule_notes;
DROP POLICY IF EXISTS "scheduler_delete_notes"   ON public.schedule_notes;

CREATE POLICY "gridmaster_all_notes" ON public.schedule_notes FOR ALL TO authenticated
  USING (public.is_gridmaster()) WITH CHECK (public.is_gridmaster());

CREATE POLICY "org_members_select_notes" ON public.schedule_notes FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

CREATE POLICY "supervisor_insert_notes" ON public.schedule_notes FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.caller_org_id()
    AND public.caller_org_role()::TEXT IN ('admin', 'scheduler', 'supervisor')
  );

CREATE POLICY "supervisor_update_notes" ON public.schedule_notes FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role()::TEXT IN ('admin', 'scheduler', 'supervisor')
  )
  WITH CHECK (org_id = public.caller_org_id());

CREATE POLICY "scheduler_delete_notes" ON public.schedule_notes FOR DELETE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role()::TEXT IN ('admin', 'scheduler')
  );

-- ── 5. Re-enable RLS on employees ────────────────────────────────────────────
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gridmaster_all_employees"       ON public.employees;
DROP POLICY IF EXISTS "org_members_select_employees"   ON public.employees;
DROP POLICY IF EXISTS "scheduler_insert_employees"     ON public.employees;
DROP POLICY IF EXISTS "scheduler_update_employees"     ON public.employees;
DROP POLICY IF EXISTS "scheduler_delete_employees"     ON public.employees;

CREATE POLICY "gridmaster_all_employees" ON public.employees FOR ALL TO authenticated
  USING (public.is_gridmaster()) WITH CHECK (public.is_gridmaster());

CREATE POLICY "org_members_select_employees" ON public.employees FOR SELECT TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND (
      public.caller_org_role()::TEXT IN ('admin', 'scheduler', 'supervisor')
      OR (
        public.caller_org_role()::TEXT = 'user'
        AND lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    )
  );

CREATE POLICY "scheduler_insert_employees" ON public.employees FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.caller_org_id()
    AND public.caller_org_role()::TEXT IN ('admin', 'scheduler')
  );

CREATE POLICY "scheduler_update_employees" ON public.employees FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role()::TEXT IN ('admin', 'scheduler')
  )
  WITH CHECK (org_id = public.caller_org_id());

CREATE POLICY "scheduler_delete_employees" ON public.employees FOR DELETE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role()::TEXT IN ('admin', 'scheduler')
  );
