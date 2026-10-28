-- 103: Away from a date (item 51g1).
--
-- A status change can be planned for a later date, one per person. This part
-- plans Away: until its first day the person stays Active, the days from it
-- up to their return date can't be scheduled, and those days are cleared in
-- the draft (holding the chosen absence when there is one) as soon as it is
-- planned. Moving, changing or cancelling the plan rewrites the days. The
-- daily job starts it on the day by setting status, return date and absence
-- from the plan in one update, after which 099 and 100 own the days.
SET lock_timeout = '5s';

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS planned_status TEXT,
  ADD COLUMN IF NOT EXISTS planned_from DATE,
  ADD COLUMN IF NOT EXISTS planned_until DATE,
  ADD COLUMN IF NOT EXISTS planned_absence_type_id BIGINT
    REFERENCES public.absence_types (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS planned_note TEXT,
  ADD COLUMN IF NOT EXISTS planned_by UUID
    REFERENCES public.profiles (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.employees.planned_status IS
  'A status change planned for planned_from (51g). Only away so far; the person stays as they are until then.';
COMMENT ON COLUMN public.employees.planned_from IS
  'The planned change''s first day, in the organization''s timezone.';
COMMENT ON COLUMN public.employees.planned_until IS
  'The first day back from a planned Away, or NULL to stay away until marked active.';

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_planned_status_known,
  ADD CONSTRAINT employees_planned_status_known
    CHECK (planned_status IS NULL OR planned_status IN ('away')),
  DROP CONSTRAINT IF EXISTS employees_planned_has_start,
  ADD CONSTRAINT employees_planned_has_start
    CHECK ((planned_status IS NULL) = (planned_from IS NULL)),
  DROP CONSTRAINT IF EXISTS employees_planned_until_after_start,
  ADD CONSTRAINT employees_planned_until_after_start
    CHECK (planned_until IS NULL OR (planned_from IS NOT NULL AND planned_until > planned_from)),
  DROP CONSTRAINT IF EXISTS employees_planned_absence_needs_until,
  ADD CONSTRAINT employees_planned_absence_needs_until
    CHECK (planned_absence_type_id IS NULL OR planned_until IS NOT NULL),
  DROP CONSTRAINT IF EXISTS employees_planned_only_when_active,
  ADD CONSTRAINT employees_planned_only_when_active
    CHECK (
      planned_status IS NULL
      OR (status = 'active' AND archived_at IS NULL AND suspended_at IS NULL)
    );

-- 101's guard, extended: leaving Active, being archived or being suspended
-- ends a plan, and a planned absence must be a live one of the organization.
CREATE OR REPLACE FUNCTION public.clear_away_until_off_away()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'inactive' OR NEW.archived_at IS NOT NULL THEN
    NEW.away_until := NULL;
  END IF;
  IF NEW.away_until IS NULL THEN
    NEW.away_absence_type_id := NULL;
  END IF;
  IF NEW.status <> 'active' OR NEW.archived_at IS NOT NULL THEN
    NEW.suspended_at := NULL;
    NEW.suspended_by := NULL;
  END IF;
  IF NEW.status <> 'active' OR NEW.archived_at IS NOT NULL OR NEW.suspended_at IS NOT NULL THEN
    NEW.planned_status := NULL;
  END IF;
  IF NEW.planned_status IS NULL THEN
    NEW.planned_from := NULL;
    NEW.planned_until := NULL;
    NEW.planned_note := NULL;
    NEW.planned_by := NULL;
  END IF;
  IF NEW.planned_until IS NULL THEN
    NEW.planned_absence_type_id := NULL;
  END IF;
  IF NEW.away_absence_type_id IS NOT NULL
    AND (TG_OP = 'INSERT' OR NEW.away_absence_type_id IS DISTINCT FROM OLD.away_absence_type_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.absence_types a
      WHERE a.id = NEW.away_absence_type_id
        AND a.org_id = NEW.org_id
        AND a.archived_at IS NULL
    )
  THEN
    RAISE EXCEPTION 'Absence type not found in this organization'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.planned_absence_type_id IS NOT NULL
    AND (TG_OP = 'INSERT' OR NEW.planned_absence_type_id IS DISTINCT FROM OLD.planned_absence_type_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.absence_types a
      WHERE a.id = NEW.planned_absence_type_id
        AND a.org_id = NEW.org_id
        AND a.archived_at IS NULL
    )
  THEN
    RAISE EXCEPTION 'Absence type not found in this organization'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_away_until_off_away() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_employees_clear_away_until
  BEFORE INSERT OR UPDATE OF status, archived_at, away_until, away_absence_type_id, suspended_at,
    planned_status, planned_from, planned_until, planned_absence_type_id
  ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.clear_away_until_off_away();

-- 099's helper: an Active person can't be scheduled on a planned Away day.
-- An infinite date (a recurring template or series asking whether it may
-- exist at all) is not a day, so a plan never refuses it; its cells are each
-- gated on their own date.
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
            AND e.planned_status = 'away'
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

-- 100's helper: a planned Away's absence is allowed on its days too.
CREATE OR REPLACE FUNCTION public.is_away_absence_day(
  p_emp_id UUID,
  p_date DATE,
  p_absence_type_id BIGINT
)
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
          e.status = 'inactive'
          AND e.away_until > p_date
          AND e.away_absence_type_id = p_absence_type_id
        )
        OR (
          e.status = 'active'
          AND e.planned_status = 'away'
          AND e.planned_from <= p_date
          AND e.planned_until > p_date
          AND e.planned_absence_type_id = p_absence_type_id
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_away_absence_day(UUID, DATE, BIGINT) FROM PUBLIC, anon, authenticated;

-- Clears the days in [p_from, p_until) (onward when p_until is NULL) in the
-- draft, as 100 clears an Away person's days, and closes open requests on
-- them. A day already holding p_away_type keeps it. Recurring schedules and
-- series are left alone: their fills skip days nobody can schedule.
CREATE OR REPLACE FUNCTION public.clear_schedule_for_planned_away(
  p_emp_id UUID,
  p_from DATE,
  p_until DATE,
  p_away_type BIGINT,
  p_actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  r RECORD;
BEGIN
  SELECT org_id INTO v_org_id FROM public.employees WHERE id = p_emp_id;
  IF NOT FOUND OR (p_until IS NOT NULL AND p_from >= p_until) THEN
    RETURN;
  END IF;

  -- Id order, as publish_schedule and discard_schedule_drafts lock cells.
  FOR r IN
    SELECT
      c.id,
      EXISTS (
        SELECT 1
        FROM public.schedule_cell_snapshots s
        WHERE s.cell_id = c.id
          AND s.snapshot_kind = 'published'
      ) AS has_published,
      (
        SELECT s.state_kind
        FROM public.schedule_cell_snapshots s
        WHERE s.cell_id = c.id
          AND s.snapshot_kind = 'draft'
      ) AS draft_state
    FROM public.schedule_cells c
    WHERE c.org_id = v_org_id
      AND c.emp_id = p_emp_id
      AND c.date >= p_from
      AND (p_until IS NULL OR c.date < p_until)
      AND NOT (
        p_away_type IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.schedule_cell_snapshots s
          WHERE s.cell_id = c.id
            AND s.state_kind = 'absence'
            AND s.absence_type_id = p_away_type
            AND s.absence_start_time IS NULL
            AND (
              s.snapshot_kind = 'draft'
              OR NOT EXISTS (
                SELECT 1
                FROM public.schedule_cell_snapshots d
                WHERE d.cell_id = c.id
                  AND d.snapshot_kind = 'draft'
              )
            )
        )
      )
    ORDER BY c.id
    FOR UPDATE OF c
  LOOP
    IF NOT r.has_published THEN
      DELETE FROM public.schedule_cells
      WHERE id = r.id;
    ELSIF r.draft_state IS DISTINCT FROM 'deleted' THEN
      UPDATE public.schedule_cells
      SET version = version + 1,
          updated_by = p_actor_id,
          updated_at = now()
      WHERE id = r.id;

      PERFORM public.sync_schedule_cell_snapshot(
        r.id, v_org_id, 'draft', 'deleted', NULL, NULL, NULL,
        '{}'::BIGINT[], '{}'::BIGINT[], '{}'::BOOLEAN[]
      );
    END IF;
  END LOOP;

  UPDATE public.shift_requests
  SET status = 'expired', resolved_at = now(), updated_at = now()
  WHERE org_id = v_org_id
    AND (requester_emp_id = p_emp_id OR target_emp_id = p_emp_id)
    AND status IN ('open', 'pending_approval')
    AND (
      (requester_shift_date >= p_from AND (p_until IS NULL OR requester_shift_date < p_until))
      OR (
        target_shift_date IS NOT NULL
        AND target_shift_date >= p_from
        AND (p_until IS NULL OR target_shift_date < p_until)
      )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.clear_schedule_for_planned_away(UUID, DATE, DATE, BIGINT, UUID) FROM PUBLIC, anon, authenticated;

-- Rewrites the planned days when a plan is made, moved, changed or ended.
-- Starting it (the job's one update moves the plan's dates and absence onto
-- the Away it becomes) changes nothing here: 099 and 100 own the days then.
-- Runs before 100's trg_rewrite_away_absence, so an Away started some other
-- way still fills its own days last.
CREATE OR REPLACE FUNCTION public.rewrite_planned_away()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE;
  v_actor_id UUID := COALESCE(auth.uid(), NEW.planned_by, NEW.updated_by);
  v_old BOOLEAN := OLD.planned_status = 'away';
  v_new BOOLEAN := NEW.planned_status = 'away';
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

-- The OF list names the columns that end a plan too: 101's guard clears the
-- plan in the same update, which an OF list of the plan alone wouldn't see.
CREATE OR REPLACE TRIGGER trg_planned_away_days
  AFTER UPDATE OF status, archived_at, suspended_at,
    planned_status, planned_from, planned_until, planned_absence_type_id
  ON public.employees
  FOR EACH ROW
  WHEN (
    OLD.planned_status IS DISTINCT FROM NEW.planned_status
    OR OLD.planned_from IS DISTINCT FROM NEW.planned_from
    OR OLD.planned_until IS DISTINCT FROM NEW.planned_until
    OR OLD.planned_absence_type_id IS DISTINCT FROM NEW.planned_absence_type_id
  )
  EXECUTE FUNCTION public.rewrite_planned_away();
