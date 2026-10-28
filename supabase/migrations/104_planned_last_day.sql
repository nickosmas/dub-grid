-- 104: Last day (item 51g2).
--
-- A last day is 103's planned change with status `removed`: planned_from is
-- the day after the last day, when they're offboarded, and it has no end. Until
-- then they stay as they are. The days from planned_from on can't be
-- scheduled and are cleared in the draft as soon as it is planned, with open
-- requests on them closed, through 103's planned-days rewrite. The daily job
-- offboards them on planned_from the way a manual Offboard does, after which
-- 067's departure clearing owns the schedule.
SET lock_timeout = '5s';

COMMENT ON COLUMN public.employees.planned_status IS
  'A status change planned for planned_from (51g): away, or removed after a last day (planned_from is the day after it). The person stays as they are until then.';

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_planned_status_known,
  ADD CONSTRAINT employees_planned_status_known
    CHECK (planned_status IS NULL OR planned_status IN ('away', 'removed')),
  DROP CONSTRAINT IF EXISTS employees_planned_removal_has_no_end,
  ADD CONSTRAINT employees_planned_removal_has_no_end
    CHECK (planned_status IS DISTINCT FROM 'removed' OR planned_until IS NULL);

-- 103's helper: an Active person can't be scheduled on a planned Away day, or
-- from the day after a planned last day on.
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

-- 103's rewrite, for a last day too: it clears its days onward (no end, no
-- absence), and replacing a planned Away with one puts that Away's absence
-- days back first. Offboarding on the day returns early: archiving clears
-- the schedule ahead itself.
CREATE OR REPLACE FUNCTION public.rewrite_planned_away()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE;
  v_actor_id UUID := COALESCE(auth.uid(), NEW.planned_by, NEW.updated_by);
  v_old BOOLEAN := OLD.planned_status IN ('away', 'removed');
  v_new BOOLEAN := NEW.planned_status IN ('away', 'removed');
  v_old_type BIGINT := OLD.planned_absence_type_id;
BEGIN
  IF v_old AND NOT v_new
    AND NEW.status = 'inactive'
    AND NEW.away_until IS NOT DISTINCT FROM OLD.planned_until
    AND NEW.away_absence_type_id IS NOT DISTINCT FROM OLD.planned_absence_type_id
  THEN
    RETURN NEW;
  END IF;

  -- Archiving clears the whole schedule ahead already.
  IF NEW.archived_at IS NOT NULL OR NEW.status = 'removed' THEN
    RETURN NEW;
  END IF;

  SELECT (now() AT TIME ZONE o.timezone)::DATE INTO v_today
  FROM public.organizations o
  WHERE o.id = NEW.org_id;

  IF v_old AND v_old_type IS NOT NULL THEN
    IF NOT v_new OR NEW.planned_absence_type_id IS DISTINCT FROM v_old_type THEN
      PERFORM public.unfill_away_absence(
        NEW.id, GREATEST(OLD.planned_from, v_today), OLD.planned_until, v_old_type, v_actor_id
      );
    ELSE
      IF NEW.planned_from > OLD.planned_from THEN
        PERFORM public.unfill_away_absence(
          NEW.id,
          GREATEST(OLD.planned_from, v_today),
          LEAST(NEW.planned_from, OLD.planned_until),
          v_old_type,
          v_actor_id
        );
      END IF;
      IF NEW.planned_until < OLD.planned_until THEN
        PERFORM public.unfill_away_absence(
          NEW.id,
          GREATEST(NEW.planned_until, v_today),
          OLD.planned_until,
          v_old_type,
          v_actor_id
        );
      END IF;
    END IF;
  END IF;

  IF v_new THEN
    PERFORM public.clear_schedule_for_planned_away(
      NEW.id,
      GREATEST(NEW.planned_from, v_today),
      NEW.planned_until,
      NEW.planned_absence_type_id,
      v_actor_id
    );
    IF NEW.planned_absence_type_id IS NOT NULL THEN
      PERFORM public.fill_away_absence(
        NEW.id,
        GREATEST(NEW.planned_from, v_today),
        NEW.planned_until,
        NEW.planned_absence_type_id,
        v_actor_id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rewrite_planned_away() FROM PUBLIC, anon, authenticated;
