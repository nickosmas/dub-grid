-- Migration: 037_regular_shifts.sql
-- Purpose: Store each employee's default weekly schedule template.
--          Used to auto-populate new schedule periods without manual entry.

CREATE TABLE IF NOT EXISTS public.regular_shifts (
  id            UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_id        UUID     NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  org_id        UUID     NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  day_of_week   SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sunday
  shift_label   TEXT     NOT NULL,
  effective_from  DATE   NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE,
  created_by    UUID     REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by    UUID     REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT regular_shifts_emp_day_from_unique UNIQUE (emp_id, day_of_week, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_regular_shifts_org ON public.regular_shifts (org_id);
CREATE INDEX IF NOT EXISTS idx_regular_shifts_emp ON public.regular_shifts (emp_id);

ALTER TABLE public.regular_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regular_shifts_select" ON public.regular_shifts;
CREATE POLICY "regular_shifts_select"
  ON public.regular_shifts FOR SELECT
  USING (
    public.is_gridmaster()
    OR org_id = public.caller_org_id()
  );

DROP POLICY IF EXISTS "regular_shifts_insert" ON public.regular_shifts;
CREATE POLICY "regular_shifts_insert"
  ON public.regular_shifts FOR INSERT
  WITH CHECK (
    public.is_gridmaster()
    OR (
      org_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'scheduler')
    )
  );

DROP POLICY IF EXISTS "regular_shifts_update" ON public.regular_shifts;
CREATE POLICY "regular_shifts_update"
  ON public.regular_shifts FOR UPDATE
  USING (
    public.is_gridmaster()
    OR (
      org_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'scheduler')
    )
  );

DROP POLICY IF EXISTS "regular_shifts_delete" ON public.regular_shifts;
CREATE POLICY "regular_shifts_delete"
  ON public.regular_shifts FOR DELETE
  USING (
    public.is_gridmaster()
    OR (
      org_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'scheduler')
    )
  );

-- Auto-update audit fields
DROP TRIGGER IF EXISTS trigger_regular_shifts_audit ON public.regular_shifts;
CREATE TRIGGER trigger_regular_shifts_audit
  BEFORE INSERT OR UPDATE ON public.regular_shifts
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();
