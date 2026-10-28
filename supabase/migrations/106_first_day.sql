-- 106: First day (item 51g4).
--
-- A person can have a first day, the first day they can be scheduled. It is
-- a fact about them, not 103's planned change: they are Active and can sign
-- in before it, a planned away or last day can sit beside it, and it stays on
-- their record after it passes. No day before it can be scheduled, so every
-- path through employee_schedulable_on refuses those days. Setting it, or
-- moving it later, clears their draft from today up to the day before it and
-- closes open requests on those days, through 103's planned-days clearing.
-- Nothing happens on the day itself, so the daily job has no part in it.
SET lock_timeout = '5s';

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS first_day DATE;

COMMENT ON COLUMN public.employees.first_day IS
  'The first day they can be scheduled, in the organization''s timezone (51g4); NULL when not set. Days before it refuse a shift.';

-- 104's helper, with days before a first day refused. A NULL date (an active
-- person's question) and 'infinity' (whether a template may exist at all)
-- are never before it.
CREATE OR REPLACE FUNCTION public.employee_schedulable_on(p_emp_id UUID, p_date DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = p_emp_id
      AND e.archived_at IS NULL
      AND (e.first_day IS NULL OR p_date IS NULL OR p_date >= e.first_day)
      AND (
        (
          e.status = 'active'
          -- COALESCE: with no plan the comparison is NULL, which would refuse.
          AND NOT COALESCE(
            isfinite(p_date)
            AND e.planned_status IN ('away', 'removed')
            AND e.planned_from <= p_date
            AND (e.planned_until IS NULL OR p_date < e.planned_until),
            FALSE
          )
        )
        OR (e.status = 'inactive' AND e.away_until <= p_date)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.employee_schedulable_on(UUID, DATE) FROM PUBLIC, anon, authenticated;

-- Clears the days a later first day locks, from today on. Moving it earlier
-- or clearing it puts nothing back, as cancelling a last day doesn't.
CREATE OR REPLACE FUNCTION public.clear_schedule_before_first_day()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE;
BEGIN
  IF NEW.first_day IS NULL
    OR NEW.archived_at IS NOT NULL
    OR NEW.status = 'removed'
    OR (OLD.first_day IS NOT NULL AND NEW.first_day <= OLD.first_day)
  THEN
    RETURN NEW;
  END IF;

  SELECT (now() AT TIME ZONE o.timezone)::DATE INTO v_today
  FROM public.organizations o
  WHERE o.id = NEW.org_id;

  IF NEW.first_day > v_today THEN
    PERFORM public.clear_schedule_for_planned_away(
      NEW.id, v_today, NEW.first_day, NULL, COALESCE(auth.uid(), NEW.updated_by)
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_schedule_before_first_day() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_employees_first_day_days
  AFTER UPDATE OF first_day
  ON public.employees
  FOR EACH ROW
  WHEN (OLD.first_day IS DISTINCT FROM NEW.first_day)
  EXECUTE FUNCTION public.clear_schedule_before_first_day();
