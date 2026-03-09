-- Migration: 038_shift_series.sql
-- Purpose: Support repeating shift series with recurrence rules.
--          Extends shifts table with series_id and from_regular columns.

-- 1. Create the shift_series_frequency enum
DO $$ BEGIN
  CREATE TYPE public.shift_series_frequency AS ENUM ('daily', 'weekly', 'biweekly');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create the shift_series master table
CREATE TABLE IF NOT EXISTS public.shift_series (
  id               UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_id           UUID      NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  org_id           UUID      NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  shift_label      TEXT      NOT NULL,
  frequency        public.shift_series_frequency NOT NULL,
  days_of_week     SMALLINT[],          -- [0..6]; NULL means every day (for 'daily')
  start_date       DATE      NOT NULL,
  end_date         DATE,                -- NULL = no end date
  max_occurrences  INTEGER,             -- Stop after N occurrences if set
  created_by       UUID      REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by       UUID      REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_series_org ON public.shift_series (org_id);
CREATE INDEX IF NOT EXISTS idx_shift_series_emp ON public.shift_series (emp_id);

ALTER TABLE public.shift_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shift_series_select" ON public.shift_series;
CREATE POLICY "shift_series_select"
  ON public.shift_series FOR SELECT
  USING (
    public.is_gridmaster()
    OR org_id = public.caller_org_id()
  );

DROP POLICY IF EXISTS "shift_series_insert" ON public.shift_series;
CREATE POLICY "shift_series_insert"
  ON public.shift_series FOR INSERT
  WITH CHECK (
    public.is_gridmaster()
    OR (
      org_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'scheduler')
    )
  );

DROP POLICY IF EXISTS "shift_series_update" ON public.shift_series;
CREATE POLICY "shift_series_update"
  ON public.shift_series FOR UPDATE
  USING (
    public.is_gridmaster()
    OR (
      org_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'scheduler')
    )
  );

DROP POLICY IF EXISTS "shift_series_delete" ON public.shift_series;
CREATE POLICY "shift_series_delete"
  ON public.shift_series FOR DELETE
  USING (
    public.is_gridmaster()
    OR (
      org_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'scheduler')
    )
  );

DROP TRIGGER IF EXISTS trigger_shift_series_audit ON public.shift_series;
CREATE TRIGGER trigger_shift_series_audit
  BEFORE INSERT OR UPDATE ON public.shift_series
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

-- 3. Extend the shifts table with series metadata
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS series_id    UUID    REFERENCES public.shift_series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS from_regular BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_shifts_series_id ON public.shifts (series_id);
