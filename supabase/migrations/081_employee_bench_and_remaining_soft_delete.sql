-- ============================================================
-- Migration 081: Employee bench feature + soft-delete for remaining tables
--
-- Migration 080 added archived_at to 6 master data tables
-- (shift_codes, certifications, company_roles, focus_areas,
-- indicator_types, shift_categories). This migration:
--
--   1. Adds archived_at to the remaining 5 tables:
--      employees, regular_shifts, shift_series, invitations, companies
--   2. Adds employee bench columns: status enum, status_changed_at,
--      status_note — enabling active/benched/terminated workflow
--   3. Updates unique constraints to exclude archived rows
--   4. Fixes shift_categories code indexes missed in migration 080
--   5. Adds performance indexes
--
-- Fully idempotent.
-- ============================================================


-- ── 1. Create employee_status enum ─────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employee_status') THEN
    CREATE TYPE public.employee_status AS ENUM ('active', 'benched', 'terminated');
  END IF;
END $$;


-- ── 2. Add columns to employees ────────────────────────────────────────────────

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS status public.employee_status NOT NULL DEFAULT 'active';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS status_note TEXT NOT NULL DEFAULT '';


-- ── 3. Add archived_at to remaining tables ─────────────────────────────────────

ALTER TABLE public.regular_shifts  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.shift_series    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.invitations     ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.companies       ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;


-- ── 4. Update employees unique constraint ──────────────────────────────────────

-- The constraint was created as UNIQUE(org_id, name) in migration 023.
-- After org_id → company_id rename, constraint name was kept as employees_org_id_name_key.
DO $$ BEGIN
  -- Try original name
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'employees'
      AND constraint_name = 'employees_org_id_name_key' AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE public.employees DROP CONSTRAINT employees_org_id_name_key;
  END IF;
  -- Try variant name
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'employees'
      AND constraint_name = 'employees_company_id_name_key' AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE public.employees DROP CONSTRAINT employees_company_id_name_key;
  END IF;
END $$;

DROP INDEX IF EXISTS public.employees_company_name_active_unique;
CREATE UNIQUE INDEX employees_company_name_active_unique
  ON public.employees (company_id, name) WHERE archived_at IS NULL;


-- ── 5. Update regular_shifts unique constraint ─────────────────────────────────

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'regular_shifts'
      AND constraint_name = 'regular_shifts_emp_day_from_unique' AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE public.regular_shifts DROP CONSTRAINT regular_shifts_emp_day_from_unique;
  END IF;
END $$;

DROP INDEX IF EXISTS public.regular_shifts_emp_day_from_active_unique;
CREATE UNIQUE INDEX regular_shifts_emp_day_from_active_unique
  ON public.regular_shifts (emp_id, day_of_week, effective_from) WHERE archived_at IS NULL;


-- ── 6. Update invitations unique constraint ────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'invitations'
      AND constraint_name = 'one_pending_invite' AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE public.invitations DROP CONSTRAINT one_pending_invite;
  END IF;
END $$;

DROP INDEX IF EXISTS public.invitations_pending_unique;
CREATE UNIQUE INDEX invitations_pending_unique
  ON public.invitations (company_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL AND archived_at IS NULL;


-- ── 7. Performance indexes ──────────────────────────────────────────────────
-- Note: shift_categories unique indexes (on `name`) were already created
-- correctly in migration 080. The `code` column was dropped in migration 057.

CREATE INDEX IF NOT EXISTS idx_employees_active
  ON public.employees (company_id) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_status
  ON public.employees (company_id, status) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_regular_shifts_active
  ON public.regular_shifts (company_id) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shift_series_active
  ON public.shift_series (company_id) WHERE archived_at IS NULL;
