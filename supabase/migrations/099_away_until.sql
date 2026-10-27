-- 099: Away until a date (item 51e).
--
-- `away_until` is an Away person's first day back. They can be scheduled on
-- that day and later, never before, and a daily job sets them back to Active
-- on it. Every check that required `status = 'active'` to schedule someone
-- now asks `employee_schedulable_on` for the date being written; the function
-- bodies below are otherwise copied unchanged from the migration named above
-- each one, so CREATE OR REPLACE keeps their grants.
--
-- Marking someone Away with a return date clears only the days before it,
-- keeps their recurring schedules (the fills skip the away days) and closes
-- the open requests for those days. Changing the date re-applies that to the
-- new range; removing it clears everything ahead, as Away always has.
SET lock_timeout = '5s';

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS away_until DATE;

COMMENT ON COLUMN public.employees.away_until IS
  'An Away (inactive) person''s first day back: schedulable from this date, and set back to Active on it by the return-from-away job. NULL means away until someone marks them active.';

-- Leaving Away in any direction ends the return date, so a reactivation,
-- an archive or terminate_user_account never has to know about it.
CREATE OR REPLACE FUNCTION public.clear_away_until_off_away()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'inactive' OR NEW.archived_at IS NOT NULL THEN
    NEW.away_until := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_away_until_off_away() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_employees_clear_away_until
  BEFORE INSERT OR UPDATE OF status, archived_at, away_until ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.clear_away_until_off_away();

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_away_until_only_when_away,
  ADD CONSTRAINT employees_away_until_only_when_away
  CHECK (away_until IS NULL OR (status = 'inactive' AND archived_at IS NULL));

-- Schedulability is monotone in the date: once someone can be scheduled on a
-- day, they can on every later one. A NULL date answers for an active person
-- only, and 'infinity' asks whether they will ever be schedulable.
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
        e.status = 'active'
        OR (e.status = 'inactive' AND e.away_until <= p_date)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.employee_schedulable_on(UUID, DATE) FROM PUBLIC, anon, authenticated;

-- 067's gate, asked per date. A recurring template or series of someone Away
-- with a return date passes: the cells it writes are each gated on their own
-- date, and the fills skip the away days. A request is gated on the earliest
-- day it would give the requester.
CREATE OR REPLACE FUNCTION public.refuse_unschedulable_employee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp_id UUID;
  v_date DATE;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'schedule_cell_snapshots' THEN
      IF NEW.state_kind = 'deleted' THEN
        RETURN NEW;
      END IF;
      SELECT c.emp_id, c.date INTO v_emp_id, v_date
      FROM public.schedule_cells c
      WHERE c.id = NEW.cell_id;
    WHEN 'schedule_cell_segments' THEN
      SELECT c.emp_id, c.date INTO v_emp_id, v_date
      FROM public.schedule_cell_snapshots s
      JOIN public.schedule_cells c ON c.id = s.cell_id
      WHERE s.id = NEW.snapshot_id;
    WHEN 'shift_requests' THEN
      v_emp_id := NEW.requester_emp_id;
      v_date := LEAST(NEW.requester_shift_date, NEW.target_shift_date);
    ELSE
      IF NEW.archived_at IS NOT NULL THEN
        RETURN NEW;
      END IF;
      v_emp_id := NEW.emp_id;
      v_date := 'infinity'::DATE;
  END CASE;

  IF v_emp_id IS NULL OR public.employee_schedulable_on(v_emp_id, v_date) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Employee not found, archived, or inactive'
    USING ERRCODE = 'check_violation';
END;
$$;

-- 067's clearing, bounded by the return date when there is one: only cells
-- before it go, recurring templates stay, a series stays unless it ends
-- before it, and only requests for days before it close.
CREATE OR REPLACE FUNCTION public.clear_schedule_for_departed_employee(
  p_emp_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_today DATE;
  v_until DATE;
  v_actor_id UUID := COALESCE(auth.uid(), p_actor_id);
  r RECORD;
BEGIN
  SELECT
    e.org_id,
    (now() AT TIME ZONE o.timezone)::DATE,
    CASE WHEN e.status = 'inactive' AND e.archived_at IS NULL THEN e.away_until END
  INTO v_org_id, v_today, v_until
  FROM public.employees e
  JOIN public.organizations o ON o.id = e.org_id
  WHERE e.id = p_emp_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Id order, as publish_schedule and discard_schedule_drafts lock cells.
  FOR r IN
    SELECT
      c.id,
      c.date,
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
      AND (v_until IS NULL OR c.date < v_until)
    ORDER BY c.id
    FOR UPDATE OF c
  LOOP
    IF NOT r.has_published THEN
      DELETE FROM public.schedule_cells
      WHERE id = r.id;
    ELSIF r.date >= v_today THEN
      IF r.draft_state IS DISTINCT FROM 'deleted' THEN
        UPDATE public.schedule_cells
        SET version = version + 1,
            updated_by = v_actor_id,
            updated_at = now()
        WHERE id = r.id;

        PERFORM public.sync_schedule_cell_snapshot(
          r.id, v_org_id, 'draft', 'deleted', NULL, NULL, NULL,
          '{}'::BIGINT[], '{}'::BIGINT[], '{}'::BOOLEAN[]
        );
      END IF;
    ELSIF r.draft_state IS NOT NULL AND r.draft_state <> 'deleted' THEN
      DELETE FROM public.schedule_cell_snapshots
      WHERE cell_id = r.id
        AND snapshot_kind = 'draft';
    END IF;
  END LOOP;

  IF v_until IS NULL THEN
    UPDATE public.recurring_shifts
    SET archived_at = now(), updated_by = v_actor_id, updated_at = now()
    WHERE org_id = v_org_id
      AND emp_id = p_emp_id
      AND archived_at IS NULL;
  END IF;

  UPDATE public.shift_series
  SET archived_at = now(), updated_by = v_actor_id, updated_at = now()
  WHERE org_id = v_org_id
    AND emp_id = p_emp_id
    AND archived_at IS NULL
    AND (v_until IS NULL OR end_date < v_until);

  UPDATE public.shift_requests
  SET status = 'expired', resolved_at = now(), updated_at = now()
  WHERE org_id = v_org_id
    AND (requester_emp_id = p_emp_id OR target_emp_id = p_emp_id)
    AND status IN ('open', 'pending_approval')
    AND (v_until IS NULL OR LEAST(requester_shift_date, target_shift_date) < v_until);
END;
$$;

-- Clearing runs when someone stops being schedulable, and again whenever an
-- Away person's return date changes or they are archived, so the range it
-- clears always matches the date they hold.
CREATE OR REPLACE TRIGGER trg_clear_schedule_on_employee_departure
  AFTER UPDATE OF status, archived_at, away_until ON public.employees
  FOR EACH ROW
  WHEN (
    (
      OLD.status = 'active' AND OLD.archived_at IS NULL
      AND (NEW.status <> 'active' OR NEW.archived_at IS NOT NULL)
    )
    OR (
      OLD.status = 'inactive' AND OLD.archived_at IS NULL
      AND (
        NEW.status = 'removed'
        OR NEW.archived_at IS NOT NULL
        OR (NEW.status = 'inactive' AND NEW.away_until IS DISTINCT FROM OLD.away_until)
      )
    )
  )
  EXECUTE FUNCTION public.clear_schedule_on_employee_departure();

-- write_schedule_cell_snapshot, as 092 left it.
CREATE OR REPLACE FUNCTION public.write_schedule_cell_snapshot(
  p_org_id UUID,
  p_emp_id UUID,
  p_date DATE,
  p_snapshot_kind TEXT,
  p_state_kind TEXT,
  p_shift_ids BIGINT[] DEFAULT '{}'::BIGINT[],
  p_job_ids BIGINT[] DEFAULT '{}'::BIGINT[],
  p_absence_type_id BIGINT DEFAULT NULL,
  p_custom_start_time TEXT DEFAULT NULL,
  p_custom_end_time TEXT DEFAULT NULL,
  p_series_id UUID DEFAULT NULL,
  p_from_recurring BOOLEAN DEFAULT FALSE,
  p_focus_area_id BIGINT DEFAULT NULL,
  p_expected_version BIGINT DEFAULT NULL,
  p_is_mentored_flags BOOLEAN[] DEFAULT '{}'::BOOLEAN[],
  p_absence_start_time TEXT DEFAULT NULL,
  p_absence_end_time TEXT DEFAULT NULL,
  p_allow_untimed_absence BOOLEAN DEFAULT FALSE
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cell public.schedule_cells%ROWTYPE;
  v_next_version BIGINT;
  v_cell_id UUID;
  v_actor_id UUID := auth.uid();
BEGIN
  IF p_snapshot_kind NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'Invalid snapshot kind: %', p_snapshot_kind;
  END IF;

  IF p_state_kind NOT IN ('worked', 'absence', 'deleted') THEN
    RAISE EXCEPTION 'Invalid state kind: %', p_state_kind;
  END IF;

  IF NOT public.check_admin_permission_for_org('canEditShifts', p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: missing canEditShifts permission';
  END IF;

  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = p_emp_id
      AND e.org_id = p_org_id
      AND e.archived_at IS NULL
      AND public.employee_schedulable_on(e.id, p_date)
  ) THEN
    RAISE EXCEPTION 'Employee not found, archived, or inactive';
  END IF;

  IF COALESCE(array_length(p_shift_ids, 1), 0) != COALESCE(array_length(p_job_ids, 1), 0) THEN
    RAISE EXCEPTION 'Shift ID and job ID segment lengths must match';
  END IF;

  IF COALESCE(array_length(p_is_mentored_flags, 1), 0) NOT IN (0, COALESCE(array_length(p_job_ids, 1), 0)) THEN
    RAISE EXCEPTION 'Mentored segment flag lengths must match shift segment lengths';
  END IF;

  IF p_state_kind = 'worked' AND COALESCE(array_length(p_job_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Worked snapshots must include at least one segment';
  END IF;

  IF p_state_kind = 'absence' AND p_absence_type_id IS NULL THEN
    RAISE EXCEPTION 'Absence snapshots must include an absence type';
  END IF;

  IF p_state_kind IN ('absence', 'deleted') AND (
    COALESCE(array_length(p_shift_ids, 1), 0) > 0
    OR COALESCE(array_length(p_job_ids, 1), 0) > 0
  ) THEN
    RAISE EXCEPTION 'Only worked snapshots may include segments';
  END IF;

  IF p_state_kind = 'worked' THEN
    PERFORM public.assert_non_overlapping_work_assignment_times(
      p_org_id,
      COALESCE(p_shift_ids, '{}'::BIGINT[]),
      COALESCE(p_job_ids, '{}'::BIGINT[]),
      p_custom_start_time,
      p_custom_end_time
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('schedule_cell_' || p_emp_id::TEXT || '_' || p_date::TEXT));

  SELECT *
  INTO v_cell
  FROM public.schedule_cells
  WHERE org_id = p_org_id
    AND emp_id = p_emp_id
    AND date = p_date
  FOR UPDATE;

  IF FOUND THEN
    IF p_expected_version IS NOT NULL AND v_cell.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'Optimistic lock failed: expected version %, found %',
        p_expected_version, v_cell.version;
    END IF;

    v_next_version := v_cell.version + 1;

    UPDATE public.schedule_cells
    SET version = v_next_version,
        series_id = COALESCE(p_series_id, schedule_cells.series_id),
        from_recurring = CASE
          WHEN p_from_recurring IS TRUE THEN TRUE
          ELSE schedule_cells.from_recurring
        END,
        focus_area_id = COALESCE(p_focus_area_id, schedule_cells.focus_area_id),
        updated_by = v_actor_id,
        updated_at = now()
    WHERE id = v_cell.id
    RETURNING id INTO v_cell_id;
  ELSE
    IF p_expected_version IS NOT NULL AND p_expected_version <> 0 THEN
      RAISE EXCEPTION 'Optimistic lock failed: expected version %, found %',
        p_expected_version, NULL;
    END IF;

    v_next_version := 0;

    INSERT INTO public.schedule_cells (
      org_id,
      emp_id,
      date,
      focus_area_id,
      version,
      series_id,
      from_recurring,
      created_by,
      updated_by
    )
    VALUES (
      p_org_id,
      p_emp_id,
      p_date,
      p_focus_area_id,
      0,
      p_series_id,
      p_from_recurring,
      v_actor_id,
      v_actor_id
    )
    RETURNING id INTO v_cell_id;
  END IF;

  PERFORM public.sync_schedule_cell_snapshot(
    v_cell_id,
    p_org_id,
    p_snapshot_kind,
    p_state_kind,
    CASE
      WHEN p_state_kind IN ('absence', 'worked') THEN p_absence_type_id
      ELSE NULL
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN p_custom_start_time
      ELSE NULL
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN p_custom_end_time
      ELSE NULL
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN COALESCE(p_shift_ids, '{}'::BIGINT[])
      ELSE '{}'::BIGINT[]
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN COALESCE(p_job_ids, '{}'::BIGINT[])
      ELSE '{}'::BIGINT[]
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN COALESCE(p_is_mentored_flags, '{}'::BOOLEAN[])
      ELSE '{}'::BOOLEAN[]
    END,
    p_absence_start_time,
    p_absence_end_time,
    NOT COALESCE(p_allow_untimed_absence, FALSE)
  );

  RETURN v_next_version;
END;
$$;

-- create_shift_series, as 080 left it.
CREATE OR REPLACE FUNCTION public.create_shift_series(
  p_series_id UUID,
  p_emp_id UUID,
  p_org_id UUID,
  p_state JSONB,
  p_frequency public.shift_series_frequency,
  p_days_of_week SMALLINT[] DEFAULT NULL,
  p_start_date DATE DEFAULT CURRENT_DATE,
  p_end_date DATE DEFAULT NULL,
  p_max_occurrences INTEGER DEFAULT NULL,
  p_keep_existing BOOLEAN DEFAULT FALSE,
  p_origin_date DATE DEFAULT NULL
) RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_series_id UUID := COALESCE(p_series_id, gen_random_uuid());
  v_state RECORD;
  v_current_date DATE := p_start_date;
  v_end_date DATE := LEAST(
    COALESCE(p_end_date, (p_start_date + INTERVAL '7 months')::DATE),
    p_start_date + 183 * 14
  );
  v_cap INTEGER := LEAST(COALESCE(p_max_occurrences, 183), 183);
  v_occurrence_count INTEGER := 0;
  v_start_day_of_week INTEGER := EXTRACT(DOW FROM p_start_date)::INTEGER;
  v_day_of_week INTEGER;
  v_day_index INTEGER;
  v_week_index INTEGER;
  v_day_match BOOLEAN;
  v_include BOOLEAN;
  v_existing_cell_id UUID;
  v_existing_version BIGINT;
  v_existing_kind TEXT;
BEGIN
  IF NOT public.check_admin_permission_for_org('canManageShiftSeries', p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: missing canManageShiftSeries permission';
  END IF;

  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  IF p_start_date IS NULL THEN
    RAISE EXCEPTION 'Series start date is required';
  END IF;

  IF v_end_date < p_start_date THEN
    RAISE EXCEPTION 'Series end date must be on or after start date';
  END IF;

  IF v_cap <= 0 THEN
    RAISE EXCEPTION 'Series max occurrences must be positive';
  END IF;

  SELECT *
  INTO v_state
  FROM public.resolve_schedule_state_storage(p_org_id, p_state);

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = p_emp_id
      AND e.org_id = p_org_id
      AND e.archived_at IS NULL
      AND public.employee_schedulable_on(e.id, p_start_date)
  ) THEN
    RAISE EXCEPTION 'Employee not found, archived, or inactive';
  END IF;

  INSERT INTO public.shift_series (
    id,
    emp_id,
    org_id,
    state,
    frequency,
    days_of_week,
    start_date,
    end_date,
    max_occurrences
  ) VALUES (
    v_series_id,
    p_emp_id,
    p_org_id,
    jsonb_set(p_state, '{seriesId}', to_jsonb(v_series_id::TEXT), TRUE),
    p_frequency,
    p_days_of_week,
    p_start_date,
    p_end_date,
    p_max_occurrences
  );

  WHILE v_current_date <= v_end_date AND v_occurrence_count < v_cap LOOP
    v_day_of_week := EXTRACT(DOW FROM v_current_date)::INTEGER;
    v_day_index := v_current_date - p_start_date;
    v_week_index := FLOOR(v_day_index / 7.0)::INTEGER;
    v_day_match := CASE
      WHEN array_length(p_days_of_week, 1) IS NULL THEN v_day_of_week = v_start_day_of_week
      ELSE v_day_of_week = ANY(p_days_of_week)
    END;
    v_include := CASE p_frequency
      WHEN 'daily' THEN TRUE
      WHEN 'weekly' THEN v_day_match
      WHEN 'biweekly' THEN v_week_index % 2 = 0 AND v_day_match
      ELSE FALSE
    END;

    IF v_include THEN
      SELECT c.id, c.version
      INTO v_existing_cell_id, v_existing_version
      FROM public.schedule_cells c
      WHERE c.org_id = p_org_id
        AND c.emp_id = p_emp_id
        AND c.date = v_current_date
      FOR UPDATE;

      IF NOT FOUND THEN
        v_existing_cell_id := NULL;
        v_existing_version := 0;
      END IF;

      -- What an editor sees in the cell: its draft, else its published state.
      v_existing_kind := NULL;
      IF p_keep_existing
        AND v_existing_cell_id IS NOT NULL
        AND v_current_date IS DISTINCT FROM p_origin_date THEN
        SELECT snapshot.state_kind
        INTO v_existing_kind
        FROM public.schedule_cell_snapshots snapshot
        WHERE snapshot.cell_id = v_existing_cell_id
        ORDER BY (snapshot.snapshot_kind = 'draft') DESC
        LIMIT 1;
      END IF;

      IF v_existing_kind IS NULL OR v_existing_kind = 'deleted' THEN
        PERFORM public.write_schedule_cell_snapshot_internal(
          p_org_id,
          p_emp_id,
          v_current_date,
          'draft',
          v_state.state_kind,
          v_state.shift_ids,
          v_state.job_ids,
          v_state.absence_type_id,
          NULL,
          NULL,
          v_series_id,
          FALSE,
          v_state.focus_area_id,
          v_existing_version,
          auth.uid(),
          v_state.is_mentored_flags
        );
      END IF;

      v_occurrence_count := v_occurrence_count + 1;
    END IF;

    v_current_date := v_current_date + 1;
  END LOOP;

  RETURN v_series_id;
END;
$$;

-- reschedule_shift_series, as 090 left it.
CREATE OR REPLACE FUNCTION public.reschedule_shift_series(
  p_series_id UUID,
  p_org_id UUID,
  p_frequency public.shift_series_frequency,
  p_days_of_week SMALLINT[] DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_max_occurrences INTEGER DEFAULT NULL,
  p_keep_existing BOOLEAN DEFAULT FALSE,
  p_reset_occurrences BOOLEAN DEFAULT FALSE
) RETURNS TABLE (removed_emp_id UUID, removed_date DATE)
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_series public.shift_series%ROWTYPE;
  v_state RECORD;
  v_dates DATE[] := '{}'::DATE[];
  v_current_date DATE := p_start_date;
  v_end_date DATE := LEAST(
    COALESCE(p_end_date, (p_start_date + INTERVAL '7 months')::DATE),
    p_start_date + 183 * 14
  );
  v_cap INTEGER := LEAST(COALESCE(p_max_occurrences, 183), 183);
  v_start_day_of_week INTEGER := EXTRACT(DOW FROM p_start_date)::INTEGER;
  v_day_of_week INTEGER;
  v_day_index INTEGER;
  v_week_index INTEGER;
  v_day_match BOOLEAN;
  v_include BOOLEAN;
  v_date DATE;
  v_cell RECORD;
  v_cell_found BOOLEAN;
  v_has_published BOOLEAN;
  v_existing_kind TEXT;
BEGIN
  IF NOT public.check_admin_permission_for_org('canManageShiftSeries', p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: missing canManageShiftSeries permission';
  END IF;

  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  IF p_start_date IS NULL THEN
    RAISE EXCEPTION 'Series start date is required';
  END IF;

  IF v_end_date < p_start_date THEN
    RAISE EXCEPTION 'Series end date must be on or after start date';
  END IF;

  IF v_cap <= 0 THEN
    RAISE EXCEPTION 'Series max occurrences must be positive';
  END IF;

  SELECT *
  INTO v_series
  FROM public.shift_series s
  WHERE s.id = p_series_id
    AND s.org_id = p_org_id
    AND s.archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Series not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = v_series.emp_id
      AND e.org_id = p_org_id
      AND e.archived_at IS NULL
      AND public.employee_schedulable_on(e.id, p_start_date)
  ) THEN
    RAISE EXCEPTION 'Employee not found, archived, or inactive';
  END IF;

  SELECT *
  INTO v_state
  FROM public.resolve_schedule_state_storage(p_org_id, v_series.state);

  WHILE v_current_date <= v_end_date AND COALESCE(array_length(v_dates, 1), 0) < v_cap LOOP
    v_day_of_week := EXTRACT(DOW FROM v_current_date)::INTEGER;
    v_day_index := v_current_date - p_start_date;
    v_week_index := FLOOR(v_day_index / 7.0)::INTEGER;
    v_day_match := CASE
      WHEN array_length(p_days_of_week, 1) IS NULL THEN v_day_of_week = v_start_day_of_week
      ELSE v_day_of_week = ANY(p_days_of_week)
    END;
    v_include := CASE p_frequency
      WHEN 'daily' THEN TRUE
      WHEN 'weekly' THEN v_day_match
      WHEN 'biweekly' THEN v_week_index % 2 = 0 AND v_day_match
      ELSE FALSE
    END;

    IF v_include THEN
      v_dates := v_dates || v_current_date;
    END IF;

    v_current_date := v_current_date + 1;
  END LOOP;

  IF COALESCE(array_length(v_dates, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Series pattern has no dates';
  END IF;

  FOR v_cell IN
    SELECT c.id, c.emp_id, c.date, c.version
    FROM public.schedule_cells c
    WHERE c.org_id = p_org_id
      AND c.series_id = p_series_id
      AND NOT (c.date = ANY(v_dates))
    ORDER BY c.date
    FOR UPDATE
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM public.schedule_cell_snapshots snapshot
      WHERE snapshot.cell_id = v_cell.id
        AND snapshot.snapshot_kind = 'published'
    )
    INTO v_has_published;

    IF v_has_published THEN
      PERFORM public.write_schedule_cell_snapshot_internal(
        p_org_id,
        v_cell.emp_id,
        v_cell.date,
        'draft',
        'deleted',
        '{}'::BIGINT[],
        '{}'::BIGINT[],
        NULL,
        NULL,
        NULL,
        NULL,
        FALSE,
        NULL,
        v_cell.version,
        auth.uid()
      );
    ELSE
      DELETE FROM public.schedule_cells
      WHERE id = v_cell.id;
    END IF;

    removed_emp_id := v_cell.emp_id;
    removed_date := v_cell.date;
    RETURN NEXT;
  END LOOP;

  UPDATE public.schedule_cells c
  SET series_id = NULL
  WHERE c.org_id = p_org_id
    AND c.series_id = p_series_id
    AND NOT (c.date = ANY(v_dates));

  FOREACH v_date IN ARRAY v_dates LOOP
    SELECT c.id, c.version, c.series_id, c.focus_area_id, c.from_recurring
    INTO v_cell
    FROM public.schedule_cells c
    WHERE c.org_id = p_org_id
      AND c.emp_id = v_series.emp_id
      AND c.date = v_date
    FOR UPDATE;
    v_cell_found := FOUND;

    IF v_cell_found AND v_cell.series_id IS NOT DISTINCT FROM p_series_id THEN
      IF p_reset_occurrences AND NOT EXISTS (
        SELECT 1
        FROM public.schedule_cell_snapshots draft
        WHERE draft.cell_id = v_cell.id
          AND draft.snapshot_kind = 'draft'
          AND draft.state_kind = 'deleted'
      ) THEN
        PERFORM public.write_schedule_cell_snapshot_internal(
          p_org_id,
          v_series.emp_id,
          v_date,
          'draft',
          v_state.state_kind,
          v_state.shift_ids,
          v_state.job_ids,
          v_state.absence_type_id,
          NULL,
          NULL,
          p_series_id,
          COALESCE(v_cell.from_recurring, FALSE),
          COALESCE(v_state.focus_area_id, v_cell.focus_area_id),
          v_cell.version,
          auth.uid(),
          v_state.is_mentored_flags
        );
      END IF;
      CONTINUE;
    END IF;

    -- What an editor sees in the cell: its draft, else its published state.
    v_existing_kind := NULL;
    IF p_keep_existing AND v_cell_found THEN
      SELECT snapshot.state_kind
      INTO v_existing_kind
      FROM public.schedule_cell_snapshots snapshot
      WHERE snapshot.cell_id = v_cell.id
      ORDER BY (snapshot.snapshot_kind = 'draft') DESC
      LIMIT 1;
    END IF;

    IF v_existing_kind IS NULL OR v_existing_kind = 'deleted' THEN
      PERFORM public.write_schedule_cell_snapshot_internal(
        p_org_id,
        v_series.emp_id,
        v_date,
        'draft',
        v_state.state_kind,
        v_state.shift_ids,
        v_state.job_ids,
        v_state.absence_type_id,
        NULL,
        NULL,
        p_series_id,
        FALSE,
        v_state.focus_area_id,
        CASE WHEN v_cell_found THEN v_cell.version ELSE 0 END,
        auth.uid(),
        v_state.is_mentored_flags
      );
    END IF;
  END LOOP;

  UPDATE public.shift_series
  SET frequency = p_frequency,
      days_of_week = p_days_of_week,
      start_date = p_start_date,
      end_date = p_end_date,
      max_occurrences = p_max_occurrences,
      updated_by = auth.uid(),
      updated_at = NOW()
  WHERE org_id = p_org_id
    AND id = p_series_id;
END;
$$;

-- move_shift, as 092 left it.
CREATE OR REPLACE FUNCTION public.move_shift(
  p_org_id            UUID,
  p_source_emp_id     UUID,
  p_source_date       DATE,
  p_target_emp_id     UUID,
  p_target_date       DATE,
  p_kind              TEXT,
  p_shift_ids         BIGINT[],
  p_job_ids           BIGINT[],
  p_absence_type_id   BIGINT DEFAULT NULL,
  p_custom_start_time TEXT DEFAULT NULL,
  p_custom_end_time   TEXT DEFAULT NULL,
  p_drag_mode         TEXT DEFAULT 'move',
  p_expected_version  BIGINT DEFAULT NULL,
  p_target_expected_version BIGINT DEFAULT NULL,
  p_target_was_empty  BOOLEAN DEFAULT FALSE,
  p_is_mentored_flags BOOLEAN[] DEFAULT '{}'::BOOLEAN[],
  p_absence_start_time TEXT DEFAULT NULL,
  p_absence_end_time TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_source_cell public.schedule_cells%ROWTYPE;
  v_target_cell public.schedule_cells%ROWTYPE;
  v_target_found BOOLEAN := FALSE;
  v_target_write_expected_version BIGINT;
  v_lock_key_src  TEXT;
  v_lock_key_tgt  TEXT;
BEGIN
  -- Permission check
  IF NOT public.check_admin_permission_for_org('canEditShifts', p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: missing canEditShifts permission';
  END IF;

  -- Org scoping: caller must belong to p_org_id (gridmaster exempt)
  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  IF p_drag_mode NOT IN ('move', 'copy') THEN
    RAISE EXCEPTION 'Invalid drag mode: %', p_drag_mode;
  END IF;

  IF p_kind NOT IN ('worked', 'absence') THEN
    RAISE EXCEPTION 'Invalid move payload kind: %', p_kind;
  END IF;

  -- Reject no-op self-move
  IF p_source_emp_id = p_target_emp_id AND p_source_date = p_target_date THEN
    RETURN jsonb_build_object('status', 'ok');
  END IF;

  -- Validate target employee is active and belongs to org
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = p_target_emp_id AND e.org_id = p_org_id
      AND public.employee_schedulable_on(e.id, p_target_date) AND e.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target employee not found, archived, or inactive';
  END IF;

  -- Advisory locks in deterministic order to prevent deadlocks
  v_lock_key_src := p_source_emp_id::TEXT || '_' || p_source_date::TEXT;
  v_lock_key_tgt := p_target_emp_id::TEXT || '_' || p_target_date::TEXT;

  IF v_lock_key_src < v_lock_key_tgt THEN
    PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_lock_key_src));
    PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_lock_key_tgt));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_lock_key_tgt));
    PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_lock_key_src));
  END IF;

  -- Validate source schedule cell exists and belongs to org
  SELECT *
  INTO v_source_cell
  FROM public.schedule_cells
  WHERE emp_id = p_source_emp_id
    AND date = p_source_date
    AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source shift not found';
  END IF;

  IF p_kind = 'absence' AND p_absence_type_id IS NULL THEN
    RAISE EXCEPTION 'Absence moves require an absence type';
  END IF;

  IF p_kind = 'worked' AND COALESCE(array_length(p_job_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Worked moves require at least one segment';
  END IF;

  IF COALESCE(array_length(p_is_mentored_flags, 1), 0) NOT IN (0, COALESCE(array_length(p_job_ids, 1), 0)) THEN
    RAISE EXCEPTION 'Mentored segment flag lengths must match shift segment lengths';
  END IF;

  IF p_kind = 'absence' AND (
    array_length(COALESCE(p_shift_ids, '{}'::BIGINT[]), 1) IS NOT NULL
    OR array_length(COALESCE(p_job_ids, '{}'::BIGINT[]), 1) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot move both worked segments and an absence type';
  END IF;

  -- Optimistic lock check
  IF p_expected_version IS NOT NULL AND v_source_cell.version != p_expected_version THEN
    RAISE EXCEPTION 'Optimistic lock failed: expected version %, found %',
      p_expected_version, v_source_cell.version;
  END IF;

  SELECT *
  INTO v_target_cell
  FROM public.schedule_cells
  WHERE emp_id = p_target_emp_id
    AND date = p_target_date
    AND org_id = p_org_id
  FOR UPDATE;

  v_target_found := FOUND;

  IF p_target_was_empty AND v_target_found THEN
    RAISE EXCEPTION 'Optimistic lock failed: expected empty target, found version %',
      v_target_cell.version;
  END IF;

  IF p_target_expected_version IS NOT NULL THEN
    IF NOT v_target_found AND p_target_expected_version <> 0 THEN
      RAISE EXCEPTION 'Optimistic lock failed: expected target version %, found %',
        p_target_expected_version, NULL;
    END IF;

    IF v_target_found AND v_target_cell.version IS DISTINCT FROM p_target_expected_version THEN
      RAISE EXCEPTION 'Optimistic lock failed: expected target version %, found %',
        p_target_expected_version, v_target_cell.version;
    END IF;
  END IF;

  v_target_write_expected_version := COALESCE(
    p_target_expected_version,
    CASE
      WHEN p_target_was_empty THEN 0
      WHEN v_target_found THEN v_target_cell.version
      ELSE 0
    END
  );

  PERFORM public.write_schedule_cell_snapshot(
    p_org_id,
    p_target_emp_id,
    p_target_date,
    'draft',
    p_kind,
    CASE
      WHEN p_kind = 'worked' THEN COALESCE(p_shift_ids, '{}'::BIGINT[])
      ELSE '{}'::BIGINT[]
    END,
    CASE
      WHEN p_kind = 'worked' THEN COALESCE(p_job_ids, '{}'::BIGINT[])
      ELSE '{}'::BIGINT[]
    END,
    CASE
      WHEN p_kind IN ('absence', 'worked') THEN p_absence_type_id
      ELSE NULL
    END,
    CASE
      WHEN p_kind = 'worked' THEN p_custom_start_time
      ELSE NULL
    END,
    CASE
      WHEN p_kind = 'worked' THEN p_custom_end_time
      ELSE NULL
    END,
    NULL,
    FALSE,
    v_source_cell.focus_area_id,
    v_target_write_expected_version,
    CASE
      WHEN p_kind = 'worked' THEN COALESCE(p_is_mentored_flags, '{}'::BOOLEAN[])
      ELSE '{}'::BOOLEAN[]
    END,
    p_absence_start_time => CASE WHEN p_kind = 'worked' THEN p_absence_start_time END,
    p_absence_end_time => CASE WHEN p_kind = 'worked' THEN p_absence_end_time END,
    -- A cell saved untimed before 50a still moves as it is.
    p_allow_untimed_absence => TRUE
  );

  -- Delete source only for real moves. Copies leave the origin untouched.
  IF p_drag_mode = 'move' THEN
    PERFORM public.delete_schedule_cell_draft(
      p_org_id,
      p_source_emp_id,
      p_source_date,
      p_expected_version
    );
  END IF;

  RETURN jsonb_build_object('status', 'ok');
END;
$$;

-- import_previous_schedule, as 092 left it.
CREATE OR REPLACE FUNCTION public.import_previous_schedule(
  p_org_id        UUID,
  p_source_start  DATE,
  p_source_end    DATE,
  p_target_start  DATE,
  p_target_end    DATE,
  p_dry_run       BOOLEAN DEFAULT FALSE
) RETURNS TABLE (
  emp_id      UUID,
  source_date DATE,
  target_date DATE,
  outcome     TEXT,
  reason      TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id        UUID := auth.uid();
  v_source_span     INTEGER;
  v_target_span     INTEGER;
  r                 RECORD;
  v_disq            TEXT;
  v_segment_disq    TEXT;
  v_segment_count   INTEGER;
  v_existing_version BIGINT;
BEGIN
  -- Permission gates: same as every other draft-write path.
  IF NOT public.check_admin_permission_for_org('canEditShifts', p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: missing canEditShifts permission';
  END IF;

  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  IF p_source_start IS NULL OR p_source_end IS NULL
     OR p_target_start IS NULL OR p_target_end IS NULL THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;

  IF p_source_end < p_source_start OR p_target_end < p_target_start THEN
    RAISE EXCEPTION 'Range end precedes range start';
  END IF;

  v_source_span := (p_source_end - p_source_start) + 1;
  v_target_span := (p_target_end - p_target_start) + 1;
  IF v_source_span <> v_target_span THEN
    RAISE EXCEPTION 'Source and target ranges must cover the same number of days';
  END IF;

  -- Serialize concurrent imports against the same target.
  PERFORM pg_advisory_xact_lock(
    hashtext('import_previous_' || p_org_id::TEXT || '_' || p_target_start::TEXT)
  );

  -- Iterate the effective source cells. The CTE picks the draft if present
  -- and not deleted, else the published snapshot — matching the client's
  -- display rule. Cells whose effective snapshot is empty are dropped.
  FOR r IN
    WITH effective AS (
      SELECT
        c.emp_id,
        c.date AS source_date,
        CASE
          WHEN draft.id IS NOT NULL AND draft.state_kind <> 'deleted'
            THEN draft.id
          ELSE published.id
        END AS snapshot_id,
        CASE
          WHEN draft.id IS NOT NULL AND draft.state_kind <> 'deleted'
            THEN draft.state_kind
          ELSE published.state_kind
        END AS state_kind,
        CASE
          WHEN draft.id IS NOT NULL AND draft.state_kind <> 'deleted'
            THEN draft.absence_type_id
          ELSE published.absence_type_id
        END AS absence_type_id,
        CASE
          WHEN draft.id IS NOT NULL AND draft.state_kind <> 'deleted'
            THEN draft.custom_start_time
          ELSE published.custom_start_time
        END AS custom_start_time,
        CASE
          WHEN draft.id IS NOT NULL AND draft.state_kind <> 'deleted'
            THEN draft.custom_end_time
          ELSE published.custom_end_time
        END AS custom_end_time,
        CASE
          WHEN draft.id IS NOT NULL AND draft.state_kind <> 'deleted'
            THEN draft.absence_start_time
          ELSE published.absence_start_time
        END AS absence_start_time,
        CASE
          WHEN draft.id IS NOT NULL AND draft.state_kind <> 'deleted'
            THEN draft.absence_end_time
          ELSE published.absence_end_time
        END AS absence_end_time
      FROM public.schedule_cells c
      LEFT JOIN public.schedule_cell_snapshots draft
        ON draft.cell_id = c.id AND draft.snapshot_kind = 'draft'
      LEFT JOIN public.schedule_cell_snapshots published
        ON published.cell_id = c.id AND published.snapshot_kind = 'published'
      WHERE c.org_id = p_org_id
        AND c.date BETWEEN p_source_start AND p_source_end
        AND (
          (draft.id IS NOT NULL AND draft.state_kind <> 'deleted')
          OR (draft.id IS NULL AND published.id IS NOT NULL)
        )
    ),
    with_segments AS (
      SELECT
        eff.emp_id,
        eff.source_date,
        eff.state_kind,
        eff.absence_type_id,
        eff.custom_start_time,
        eff.custom_end_time,
        eff.absence_start_time,
        eff.absence_end_time,
        COALESCE(
          ARRAY(
            SELECT seg.shift_id
            FROM public.schedule_cell_segments seg
            WHERE seg.snapshot_id = eff.snapshot_id
            ORDER BY seg.position
          ),
          '{}'::BIGINT[]
        ) AS shift_ids,
        COALESCE(
          ARRAY(
            SELECT seg.job_id
            FROM public.schedule_cell_segments seg
            WHERE seg.snapshot_id = eff.snapshot_id
            ORDER BY seg.position
          ),
          '{}'::BIGINT[]
        ) AS job_ids,
        COALESCE(
          ARRAY(
            SELECT COALESCE(seg.is_mentored, FALSE)
            FROM public.schedule_cell_segments seg
            WHERE seg.snapshot_id = eff.snapshot_id
            ORDER BY seg.position
          ),
          '{}'::BOOLEAN[]
        ) AS is_mentored_flags
      FROM effective eff
    )
    SELECT
      ws.emp_id,
      ws.source_date,
      (p_target_start + (ws.source_date - p_source_start))::DATE AS target_date,
      ws.state_kind,
      ws.absence_type_id,
      ws.custom_start_time,
      ws.custom_end_time,
      ws.absence_start_time,
      ws.absence_end_time,
      ws.shift_ids,
      ws.job_ids,
      ws.is_mentored_flags
    FROM with_segments ws
    ORDER BY ws.source_date, ws.emp_id
  LOOP
    -- Initialize OUT row for this iteration.
    emp_id := r.emp_id;
    source_date := r.source_date;
    target_date := r.target_date;
    outcome := NULL;
    reason := NULL;

    -- Defensive: effective state must actually have content. The CTE filters
    -- empty effective snapshots, but worked-with-zero-segments could slip
    -- past the filter; reject explicitly so the UI surfaces it.
    IF r.state_kind = 'worked' AND COALESCE(array_length(r.job_ids, 1), 0) = 0 THEN
      outcome := 'skipped';
      reason := 'source_has_no_content';
      RETURN NEXT;
      CONTINUE;
    END IF;
    IF r.state_kind = 'absence' AND r.absence_type_id IS NULL THEN
      outcome := 'skipped';
      reason := 'source_has_no_content';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Employee active gate.
    IF NOT EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = r.emp_id
        AND e.org_id = p_org_id
        AND e.archived_at IS NULL
        AND public.employee_schedulable_on(e.id, r.target_date)
    ) THEN
      outcome := 'skipped';
      reason := 'employee_inactive';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Serialize check + write against any concurrent writer of this target
    -- cell using the same advisory key write_schedule_cell_snapshot_internal
    -- uses. Without this lock, a manual draft landing between the empty
    -- check and our write would be silently overwritten. Advisory locks are
    -- reentrant within one xact, so the inner write's lock acquisition is a
    -- no-op.
    PERFORM pg_advisory_xact_lock(
      hashtext('schedule_cell_' || r.emp_id::TEXT || '_' || r.target_date::TEXT)
    );

    -- Target already has effective content (any draft non-deleted, or any
    -- published). Uses the exact same rule grid display uses.
    IF public.schedule_cell_has_effective_content(p_org_id, r.emp_id, r.target_date) THEN
      outcome := 'skipped';
      reason := 'target_has_data';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Per-segment qualification gate (worked only). First failing segment
    -- names the reason.
    IF r.state_kind = 'worked' THEN
      v_segment_count := COALESCE(array_length(r.job_ids, 1), 0);
      v_disq := NULL;
      FOR i IN 1..v_segment_count LOOP
        v_segment_disq := public.is_employee_qualified_for_shift_job(
          r.emp_id, r.shift_ids[i], r.job_ids[i]
        );
        IF v_segment_disq IS NOT NULL THEN
          v_disq := v_segment_disq;
          EXIT;
        END IF;
      END LOOP;

      IF v_disq IS NOT NULL THEN
        outcome := 'skipped';
        reason := 'disqualified:' || v_disq;
        RETURN NEXT;
        CONTINUE;
      END IF;
    END IF;

    -- All gates passed.
    IF p_dry_run THEN
      outcome := 'imported';
      reason := NULL;
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT c.version INTO v_existing_version
    FROM public.schedule_cells c
    WHERE c.org_id = p_org_id
      AND c.emp_id = r.emp_id
      AND c.date = r.target_date;

    PERFORM public.write_schedule_cell_snapshot_internal(
      p_org_id,
      r.emp_id,
      r.target_date,
      'draft',
      r.state_kind,
      CASE WHEN r.state_kind = 'worked' THEN r.shift_ids ELSE '{}'::BIGINT[] END,
      CASE WHEN r.state_kind = 'worked' THEN r.job_ids ELSE '{}'::BIGINT[] END,
      CASE WHEN r.state_kind IN ('absence', 'worked') THEN r.absence_type_id ELSE NULL END,
      CASE WHEN r.state_kind = 'worked' THEN r.custom_start_time ELSE NULL END,
      CASE WHEN r.state_kind = 'worked' THEN r.custom_end_time ELSE NULL END,
      NULL,
      FALSE,
      NULL,
      COALESCE(v_existing_version, 0),
      v_actor_id,
      CASE WHEN r.state_kind = 'worked' THEN r.is_mentored_flags ELSE '{}'::BOOLEAN[] END,
      p_absence_start_time => r.absence_start_time,
      p_absence_end_time => r.absence_end_time
    );

    outcome := 'imported';
    reason := NULL;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

-- create_shift_request_unguarded, as 093 left it.
CREATE OR REPLACE FUNCTION public.create_shift_request_unguarded(
  p_org_id              UUID,
  p_type                public.shift_request_type,
  p_requester_emp_id    UUID,
  p_requester_shift_date DATE,
  p_target_emp_id       UUID DEFAULT NULL,
  p_target_shift_date   DATE DEFAULT NULL,
  p_idempotency_key     UUID DEFAULT gen_random_uuid(),
  p_absence_type_id     BIGINT DEFAULT NULL,
  p_requester_segment_index INTEGER DEFAULT NULL,
  p_target_segment_index INTEGER DEFAULT NULL
) RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_absence_conflict TEXT;
  v_request_id UUID;
  v_requester_shift RECORD;
  v_target_shift RECORD;
  v_requester_employee RECORD;
  v_target_employee RECORD;
  v_requester_shift_focus_area_id BIGINT;
  v_initial_status public.shift_request_status;
  v_requester_state JSONB;
  v_target_state JSONB;
  v_requester_required_focus_area_ids BIGINT[] := '{}'::BIGINT[];
  v_target_required_focus_area_ids BIGINT[] := '{}'::BIGINT[];
  v_requester_segment_ordinal INTEGER;
  v_target_segment_ordinal INTEGER;
  v_requester_selected_shift_ids BIGINT[];
  v_requester_selected_job_ids BIGINT[];
  v_requester_selected_is_mentored_flags BOOLEAN[];
  v_target_selected_shift_ids BIGINT[];
  v_target_selected_job_ids BIGINT[];
  v_target_selected_is_mentored_flags BOOLEAN[];
  v_requester_selected_custom_start TEXT;
  v_requester_selected_custom_end TEXT;
  v_target_selected_custom_start TEXT;
  v_target_selected_custom_end TEXT;
BEGIN
  -- Idempotency: return existing if already created
  SELECT id INTO v_request_id FROM public.shift_requests WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_request_id; END IF;

  IF p_requester_shift_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot create a request for a past shift';
  END IF;

  -- Validate calloff and targeted-pickup absence constraints
  IF p_type = 'calloff' THEN
    IF p_absence_type_id IS NULL THEN
      RAISE EXCEPTION 'Calloff requests require an absence type';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.absence_types
      WHERE id = p_absence_type_id AND org_id = p_org_id AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Absence type not found or archived';
    END IF;
  ELSIF p_type = 'pickup' AND (
    p_target_emp_id IS NOT NULL
    OR p_target_shift_date IS NOT NULL
    OR p_absence_type_id IS NOT NULL
  ) THEN
    IF p_target_emp_id IS NULL OR p_target_shift_date IS NULL OR p_absence_type_id IS NULL THEN
      RAISE EXCEPTION 'Targeted pickup requests require a target employee, target shift date, and absence type';
    END IF;

    IF p_target_shift_date IS DISTINCT FROM p_requester_shift_date THEN
      RAISE EXCEPTION 'Targeted pickup requests must target the requester shift date';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.absence_types
      WHERE id = p_absence_type_id AND org_id = p_org_id AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Absence type not found or archived';
    END IF;
  ELSIF p_absence_type_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only calloff and targeted pickup requests can have an absence type';
  END IF;

  -- Validate requester is an active employee in this org
  SELECT id, user_id, status, focus_area_ids INTO v_requester_employee
  FROM public.employees
  WHERE id = p_requester_emp_id AND org_id = p_org_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found or archived';
  END IF;

  -- Validate caller is the requester (employee's linked user) or admin+ IN
  -- THIS org (or their own sandbox). caller_org_role() alone reflects the
  -- caller's role in their *current session* org, which can differ from
  -- p_org_id — checking it without an org match let an admin of one org
  -- act on another org's shift requests.
  IF v_requester_employee.user_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_gridmaster()
     AND NOT (
       (public.caller_org_id() = p_org_id OR public.is_own_sandbox_org(p_org_id))
       AND public.caller_org_role()::TEXT IN ('super_admin', 'admin')
     ) THEN
    RAISE EXCEPTION 'Unauthorized: you can only create requests for your own shifts';
  END IF;

  -- Validate requester owns a published shift on this date
  SELECT *
  INTO v_requester_shift
  FROM public.get_schedule_cell_snapshot_payload(
    p_org_id,
    p_requester_emp_id,
    p_requester_shift_date,
    'published'
  );

  IF NOT FOUND
     OR v_requester_shift.state_kind IS DISTINCT FROM 'worked'
     OR array_length(v_requester_shift.job_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No published shift found for this employee on this date';
  END IF;

  v_requester_segment_ordinal := public.resolve_schedule_segment_ordinal(
    COALESCE(v_requester_shift.shift_ids, '{}'::BIGINT[]),
    COALESCE(v_requester_shift.job_ids, '{}'::BIGINT[]),
    v_requester_shift.custom_start_time,
    v_requester_shift.custom_end_time,
    p_requester_segment_index
  );
  v_requester_selected_shift_ids := ARRAY[v_requester_shift.shift_ids[v_requester_segment_ordinal]];
  v_requester_selected_job_ids := ARRAY[v_requester_shift.job_ids[v_requester_segment_ordinal]];
  v_requester_selected_is_mentored_flags := ARRAY[
    COALESCE(v_requester_shift.is_mentored_flags[v_requester_segment_ordinal], FALSE)
  ];
  v_requester_selected_custom_start := public.schedule_custom_time_at(
    v_requester_shift.custom_start_time,
    v_requester_segment_ordinal
  );
  v_requester_selected_custom_end := public.schedule_custom_time_at(
    v_requester_shift.custom_end_time,
    v_requester_segment_ordinal
  );

  IF public.has_work_assignment_started(
    p_org_id,
    p_requester_shift_date,
    COALESCE(v_requester_selected_shift_ids, '{}'::BIGINT[]),
    COALESCE(v_requester_selected_job_ids, '{}'::BIGINT[]),
    v_requester_selected_custom_start,
    v_requester_selected_custom_end
  ) THEN
    RAISE EXCEPTION 'Cannot create a request for a shift that has already started';
  END IF;

  v_requester_shift_focus_area_id := v_requester_shift.focus_area_id;

  -- Fall back to employee's primary focus area when shift has no focus_area_id
  IF v_requester_shift.focus_area_id IS NULL THEN
    v_requester_shift.focus_area_id := v_requester_employee.focus_area_ids[1];
  END IF;

  -- A worked cell may carry an absence after its shifts; only a whole-day
  -- absence has no shift to request
  IF v_requester_shift.state_kind = 'absence' THEN
    RAISE EXCEPTION 'Cannot create a request for an absence';
  END IF;

  IF (p_type = 'swap' OR (p_type = 'pickup' AND p_target_emp_id IS NOT NULL))
     AND (
       array_length(v_requester_selected_shift_ids, 1) IS NULL
       OR EXISTS (
         SELECT 1
         FROM unnest(COALESCE(v_requester_selected_shift_ids, '{}'::BIGINT[])) AS requester_segments(shift_id)
         WHERE requester_segments.shift_id IS NULL
       )
     ) THEN
    RAISE EXCEPTION 'This request requires a scheduled shift';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT required.focus_area_id), '{}'::BIGINT[])
  INTO v_requester_required_focus_area_ids
  FROM (
    SELECT v_requester_shift_focus_area_id AS focus_area_id
    WHERE v_requester_shift_focus_area_id IS NOT NULL
    UNION
    SELECT sc.focus_area_id
    FROM unnest(COALESCE(v_requester_selected_shift_ids, '{}'::BIGINT[])) AS shift_ids(shift_id)
    JOIN public.shift_categories sc
      ON sc.id = shift_ids.shift_id
     AND sc.org_id = p_org_id
    WHERE sc.focus_area_id IS NOT NULL
  ) required;

  v_requester_state := public.build_schedule_cell_state_json(
    'worked',
    v_requester_selected_shift_ids,
    v_requester_selected_job_ids,
    NULL,
    v_requester_selected_custom_start,
    v_requester_selected_custom_end,
    v_requester_shift.series_id,
    v_requester_shift.from_recurring,
    COALESCE(v_requester_selected_is_mentored_flags, '{}'::BOOLEAN[])
  );

  -- Check no active request already exists for this shift (as requester or target)
  IF EXISTS (
    SELECT 1 FROM public.shift_requests
    WHERE requester_emp_id = p_requester_emp_id
      AND requester_shift_date = p_requester_shift_date
      AND org_id = p_org_id
      AND status IN ('open', 'pending_approval')
  ) THEN
    RAISE EXCEPTION 'An active request already exists for this shift';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.shift_requests
    WHERE target_emp_id = p_requester_emp_id
      AND target_shift_date = p_requester_shift_date
      AND org_id = p_org_id
      AND status IN ('open', 'pending_approval')
  ) THEN
    RAISE EXCEPTION 'This shift is already involved in another active request';
  END IF;

  -- Calloffs go straight to pending_approval; pickups/swaps start as open
  IF p_type = 'calloff' THEN
    v_initial_status := 'pending_approval';
  ELSE
    v_initial_status := 'open';
  END IF;

  -- For targeted pickups: validate the requested teammate has an absence on the same date
  IF p_type = 'pickup' AND p_target_emp_id IS NOT NULL THEN
    IF p_requester_emp_id = p_target_emp_id THEN
      RAISE EXCEPTION 'Cannot request yourself for pickup';
    END IF;

    -- Validate target employee exists and is active
    SELECT id, focus_area_ids
    INTO v_target_employee
    FROM public.employees
    WHERE id = p_target_emp_id AND org_id = p_org_id AND archived_at IS NULL AND public.employee_schedulable_on(id, p_requester_shift_date);

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target employee not found, archived, or inactive';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_requester_required_focus_area_ids) AS required(focus_area_id)
      WHERE NOT (required.focus_area_id = ANY(COALESCE(v_target_employee.focus_area_ids, '{}'::BIGINT[])))
    ) THEN
      RAISE EXCEPTION 'Target employee is not eligible for the requester shift focus area';
    END IF;

    SELECT *
    INTO v_target_shift
    FROM public.get_schedule_cell_snapshot_payload(
      p_org_id,
      p_target_emp_id,
      p_target_shift_date,
      'published'
    );

    IF NOT FOUND OR v_target_shift.state_kind IS DISTINCT FROM 'absence' THEN
      RAISE EXCEPTION 'Target employee has no published absence on the specified date';
    END IF;

    v_target_state := public.build_schedule_cell_state_json(
      'absence',
      '{}'::BIGINT[],
      '{}'::BIGINT[],
      v_target_shift.absence_type_id,
      NULL,
      NULL,
      v_target_shift.series_id,
      v_target_shift.from_recurring,
      '{}'::BOOLEAN[]
    );

    IF EXISTS (
      SELECT 1 FROM public.shift_requests
      WHERE (
        (requester_emp_id = p_target_emp_id AND requester_shift_date = p_target_shift_date)
        OR (target_emp_id = p_target_emp_id AND target_shift_date = p_target_shift_date)
      )
        AND org_id = p_org_id
        AND status IN ('open', 'pending_approval')
    ) THEN
      RAISE EXCEPTION 'The target employee is already involved in another active request on this date';
    END IF;
  END IF;

  -- For swaps: validate target
  IF p_type = 'swap' THEN
    IF p_target_emp_id IS NULL OR p_target_shift_date IS NULL THEN
      RAISE EXCEPTION 'Swap requests require a target employee and shift date';
    END IF;

    IF p_requester_emp_id = p_target_emp_id THEN
      RAISE EXCEPTION 'Cannot swap with yourself';
    END IF;

    IF p_target_shift_date < CURRENT_DATE THEN
      RAISE EXCEPTION 'Cannot create a swap request for a past target shift';
    END IF;

    -- Validate target employee exists and is active
    SELECT id, focus_area_ids
    INTO v_target_employee
    FROM public.employees
      WHERE id = p_target_emp_id AND org_id = p_org_id AND archived_at IS NULL AND public.employee_schedulable_on(id, p_requester_shift_date)
    ;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target employee not found, archived, or inactive';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_requester_required_focus_area_ids) AS required(focus_area_id)
      WHERE NOT (required.focus_area_id = ANY(COALESCE(v_target_employee.focus_area_ids, '{}'::BIGINT[])))
    ) THEN
      RAISE EXCEPTION 'Target employee is not eligible for the requester shift focus area';
    END IF;

    -- Validate target owns a published shift on the target date
    SELECT *
    INTO v_target_shift
    FROM public.get_schedule_cell_snapshot_payload(
      p_org_id,
      p_target_emp_id,
      p_target_shift_date,
      'published'
    );

    IF NOT FOUND
       OR v_target_shift.state_kind IS DISTINCT FROM 'worked'
       OR array_length(v_target_shift.job_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'Target employee has no published shift on the specified date';
    END IF;

    v_target_segment_ordinal := public.resolve_schedule_segment_ordinal(
      COALESCE(v_target_shift.shift_ids, '{}'::BIGINT[]),
      COALESCE(v_target_shift.job_ids, '{}'::BIGINT[]),
      v_target_shift.custom_start_time,
      v_target_shift.custom_end_time,
      p_target_segment_index
    );
    v_target_selected_shift_ids := ARRAY[v_target_shift.shift_ids[v_target_segment_ordinal]];
    v_target_selected_job_ids := ARRAY[v_target_shift.job_ids[v_target_segment_ordinal]];
    v_target_selected_is_mentored_flags := ARRAY[
      COALESCE(v_target_shift.is_mentored_flags[v_target_segment_ordinal], FALSE)
    ];
    v_target_selected_custom_start := public.schedule_custom_time_at(
      v_target_shift.custom_start_time,
      v_target_segment_ordinal
    );
    v_target_selected_custom_end := public.schedule_custom_time_at(
      v_target_shift.custom_end_time,
      v_target_segment_ordinal
    );

    IF public.has_work_assignment_started(
      p_org_id,
      p_target_shift_date,
      COALESCE(v_target_selected_shift_ids, '{}'::BIGINT[]),
      COALESCE(v_target_selected_job_ids, '{}'::BIGINT[]),
      v_target_selected_custom_start,
      v_target_selected_custom_end
    ) THEN
      RAISE EXCEPTION 'Cannot create a swap request for a target shift that has already started';
    END IF;

    -- Check target shift is not a whole-day absence
    IF v_target_shift.state_kind = 'absence' THEN
      RAISE EXCEPTION 'Cannot swap with an absence';
    END IF;

    -- Each side takes a shift on the other's date: nobody who left early that
    -- day, and nobody whose late arrival overlaps the shift (item 50)
    v_absence_conflict := public.rest_of_day_absence_conflict(
      p_org_id,
      p_target_emp_id,
      p_requester_shift_date,
      v_requester_selected_shift_ids,
      v_requester_selected_job_ids,
      v_requester_selected_custom_start,
      v_requester_selected_custom_end
    );
    IF v_absence_conflict IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot swap: they are absent %', v_absence_conflict;
    END IF;

    v_absence_conflict := public.rest_of_day_absence_conflict(
      p_org_id,
      p_requester_emp_id,
      p_target_shift_date,
      v_target_selected_shift_ids,
      v_target_selected_job_ids,
      v_target_selected_custom_start,
      v_target_selected_custom_end
    );
    IF v_absence_conflict IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot swap: you are absent %', v_absence_conflict;
    END IF;

    IF array_length(v_target_selected_shift_ids, 1) IS NULL
       OR EXISTS (
         SELECT 1
         FROM unnest(COALESCE(v_target_selected_shift_ids, '{}'::BIGINT[])) AS target_segments(shift_id)
         WHERE target_segments.shift_id IS NULL
       ) THEN
      RAISE EXCEPTION 'Cannot swap with a general job';
    END IF;

    SELECT COALESCE(array_agg(DISTINCT required.focus_area_id), '{}'::BIGINT[])
    INTO v_target_required_focus_area_ids
    FROM (
      SELECT v_target_shift.focus_area_id AS focus_area_id
      WHERE v_target_shift.focus_area_id IS NOT NULL
      UNION
      SELECT sc.focus_area_id
      FROM unnest(COALESCE(v_target_selected_shift_ids, '{}'::BIGINT[])) AS shift_ids(shift_id)
      JOIN public.shift_categories sc
        ON sc.id = shift_ids.shift_id
       AND sc.org_id = p_org_id
      WHERE sc.focus_area_id IS NOT NULL
    ) required;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_target_required_focus_area_ids) AS required(focus_area_id)
      WHERE NOT (required.focus_area_id = ANY(COALESCE(v_requester_employee.focus_area_ids, '{}'::BIGINT[])))
    ) THEN
      RAISE EXCEPTION 'Requester is not eligible for the target shift focus area';
    END IF;

    v_target_state := public.build_schedule_cell_state_json(
      'worked',
      v_target_selected_shift_ids,
      v_target_selected_job_ids,
      NULL,
      v_target_selected_custom_start,
      v_target_selected_custom_end,
      v_target_shift.series_id,
      v_target_shift.from_recurring,
      COALESCE(v_target_selected_is_mentored_flags, '{}'::BOOLEAN[])
    );

    -- Block if target's shift is already involved in any active request
    IF EXISTS (
      SELECT 1 FROM public.shift_requests
      WHERE (
        (requester_emp_id = p_target_emp_id AND requester_shift_date = p_target_shift_date)
        OR (target_emp_id = p_target_emp_id AND target_shift_date = p_target_shift_date)
      )
        AND org_id = p_org_id
        AND status IN ('open', 'pending_approval')
    ) THEN
      RAISE EXCEPTION 'The target''s shift is already involved in another active request';
    END IF;
  END IF;

  -- Create the request
  IF p_type = 'swap' THEN
    INSERT INTO public.shift_requests (
      org_id, type, status,
      requester_emp_id, requester_shift_date, requester_state,
      target_emp_id, target_shift_date, target_state,
      idempotency_key
    ) VALUES (
      p_org_id, p_type, v_initial_status,
      p_requester_emp_id, p_requester_shift_date,
      v_requester_state,
      p_target_emp_id, p_target_shift_date, v_target_state,
      p_idempotency_key
    ) RETURNING id INTO v_request_id;
  ELSIF p_type = 'calloff' THEN
    INSERT INTO public.shift_requests (
      org_id, type, status,
      requester_emp_id, requester_shift_date, requester_state,
      absence_type_id, idempotency_key
    ) VALUES (
      p_org_id, p_type, v_initial_status,
      p_requester_emp_id, p_requester_shift_date, v_requester_state,
      p_absence_type_id, p_idempotency_key
    ) RETURNING id INTO v_request_id;
  ELSIF p_type = 'pickup' AND p_target_emp_id IS NOT NULL THEN
    INSERT INTO public.shift_requests (
      org_id, type, status,
      requester_emp_id, requester_shift_date, requester_state,
      target_emp_id, target_shift_date, target_state,
      absence_type_id, idempotency_key
    ) VALUES (
      p_org_id, p_type, v_initial_status,
      p_requester_emp_id, p_requester_shift_date, v_requester_state,
      p_target_emp_id, p_target_shift_date, v_target_state,
      p_absence_type_id, p_idempotency_key
    ) RETURNING id INTO v_request_id;
  ELSE
    INSERT INTO public.shift_requests (
      org_id, type, status,
      requester_emp_id, requester_shift_date, requester_state,
      target_emp_id, target_shift_date,
      idempotency_key
    ) VALUES (
      p_org_id, p_type, v_initial_status,
      p_requester_emp_id, p_requester_shift_date, v_requester_state,
      NULL, NULL,
      p_idempotency_key
    ) RETURNING id INTO v_request_id;
  END IF;

  RETURN v_request_id;
END;
$$;

-- claim_shift_request_unguarded, as 093 left it.
CREATE OR REPLACE FUNCTION public.claim_shift_request_unguarded(
  p_request_id   UUID,
  p_claimer_emp_id UUID
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_absence_conflict TEXT;
  v_request RECORD;
  v_claimer RECORD;
  v_existing_shift RECORD;
  v_request_state RECORD;
  v_request_custom_start TEXT;
  v_request_custom_end TEXT;
BEGIN
  -- Lock and fetch the request
  SELECT * INTO v_request
  FROM public.shift_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_request.type != 'pickup' THEN
    RAISE EXCEPTION 'Only pickup requests can be claimed';
  END IF;

  IF v_request.status != 'open' THEN
    RAISE EXCEPTION 'Request is no longer open (status: %)', v_request.status;
  END IF;

  IF v_request.expires_at < now() THEN
    RAISE EXCEPTION 'Request has expired';
  END IF;

  IF v_request.requester_emp_id = p_claimer_emp_id THEN
    RAISE EXCEPTION 'Cannot claim your own request';
  END IF;

  SELECT * INTO v_request_state
  FROM public.resolve_schedule_state_storage(v_request.org_id, v_request.requester_state);

  IF v_request_state.state_kind IS DISTINCT FROM 'worked' THEN
    RAISE EXCEPTION 'Only worked shift requests can be claimed';
  END IF;

  v_request_custom_start := NULLIF(v_request.requester_state->>'customStartTime', '');
  v_request_custom_end := NULLIF(v_request.requester_state->>'customEndTime', '');

  IF public.has_work_assignment_started(
    v_request.org_id,
    v_request.requester_shift_date,
    COALESCE(v_request_state.shift_ids, '{}'::BIGINT[]),
    COALESCE(v_request_state.job_ids, '{}'::BIGINT[]),
    v_request_custom_start,
    v_request_custom_end
  ) THEN
    RAISE EXCEPTION 'Cannot claim a pickup request for a shift that has already started';
  END IF;

  -- Validate claimer is active employee in same org
  SELECT id, user_id, certification_id, role_ids, status, focus_area_ids INTO v_claimer
  FROM public.employees
  WHERE id = p_claimer_emp_id AND org_id = v_request.org_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claimer employee not found or archived';
  END IF;

  IF NOT public.employee_schedulable_on(v_claimer.id, v_request.requester_shift_date) THEN
    RAISE EXCEPTION 'Claimer employee is not active';
  END IF;

  -- Validate caller is the claimer, or admin+ IN THIS org (or their own
  -- sandbox) — see create_shift_request for why the org match is required.
  IF v_claimer.user_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_gridmaster()
     AND NOT (
       (public.caller_org_id() = v_request.org_id OR public.is_own_sandbox_org(v_request.org_id))
       AND public.caller_org_role()::TEXT IN ('super_admin', 'admin')
     ) THEN
    RAISE EXCEPTION 'Unauthorized: you can only claim requests for yourself';
  END IF;

  -- Check job eligibility requirements. Items inside each gate are alternatives;
  -- eligibility_mode only controls how role and certification gates combine.
  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(v_request_state.job_ids, '{}'::BIGINT[])) AS request_jobs(job_id)
    JOIN public.jobs j ON j.id = request_jobs.job_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(array_agg(role.id ORDER BY role.sort_order, role.id), '{}'::BIGINT[]) AS role_ids
      FROM public.organization_roles role
      WHERE role.org_id = j.org_id
        AND role.id = ANY(j.eligible_role_ids)
        AND role.archived_at IS NULL
        AND role.is_schedule_role IS DISTINCT FROM FALSE
    ) eligible_roles ON TRUE
    WHERE j.archived_at IS NULL
      AND NOT (
        CASE
          WHEN array_length(eligible_roles.role_ids, 1) IS NOT NULL
            AND array_length(j.required_certification_ids, 1) IS NOT NULL
            AND COALESCE(j.eligibility_mode, 'and') = 'or'
          THEN
            (COALESCE(v_claimer.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
            OR (
              v_claimer.certification_id IS NOT NULL
              AND v_claimer.certification_id = ANY(j.required_certification_ids)
            )
          ELSE
            (
              array_length(eligible_roles.role_ids, 1) IS NULL
              OR (COALESCE(v_claimer.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
            )
            AND (
              array_length(j.required_certification_ids, 1) IS NULL
              OR (
                v_claimer.certification_id IS NOT NULL
                AND v_claimer.certification_id = ANY(j.required_certification_ids)
              )
            )
        END
      )
  ) THEN
    RAISE EXCEPTION 'You do not meet the eligibility requirements for this shift';
  END IF;

  IF v_request_state.focus_area_id IS NOT NULL
     AND NOT (v_request_state.focus_area_id = ANY(COALESCE(v_claimer.focus_area_ids, '{}'::BIGINT[]))) THEN
    RAISE EXCEPTION 'You are not assigned to the focus area required for this shift';
  END IF;

  -- Block if claimer has a shift on the same date with overlapping time
  SELECT *
  INTO v_existing_shift
  FROM public.get_schedule_cell_snapshot_payload(
    v_request.org_id,
    p_claimer_emp_id,
    v_request.requester_shift_date,
    'published'
  );

  v_absence_conflict := public.rest_of_day_absence_conflict(
    v_request.org_id,
    p_claimer_emp_id,
    v_request.requester_shift_date,
    v_request_state.shift_ids,
    v_request_state.job_ids,
    v_request_custom_start,
    v_request_custom_end
  );
  IF v_absence_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'You are absent %', v_absence_conflict;
  END IF;

  IF FOUND
     AND v_existing_shift.state_kind = 'worked'
     AND array_length(v_existing_shift.job_ids, 1) IS NOT NULL
     AND public.work_assignment_times_overlap(
       COALESCE(v_existing_shift.shift_ids, '{}'::BIGINT[]),
       COALESCE(v_existing_shift.job_ids, '{}'::BIGINT[]),
       v_existing_shift.custom_start_time,
       v_existing_shift.custom_end_time,
       COALESCE(v_request_state.shift_ids, '{}'::BIGINT[]),
       COALESCE(v_request_state.job_ids, '{}'::BIGINT[]),
       v_request_custom_start,
       v_request_custom_end
     ) THEN
    RAISE EXCEPTION 'You have a shift with overlapping times on this date';
  END IF;

  -- Block if claimer is already involved in another active request on this date.
  -- Exclude calloff-spawned pickups where the claimer is the former shift owner
  -- (they called off and should still be able to pick up a different shift).
  IF EXISTS (
    SELECT 1 FROM public.shift_requests sr
    WHERE sr.org_id = v_request.org_id
      AND sr.id != p_request_id
      AND sr.status IN ('open', 'pending_approval')
      AND (
        (sr.requester_emp_id = p_claimer_emp_id AND sr.requester_shift_date = v_request.requester_shift_date
         AND NOT (sr.type = 'pickup' AND sr.parent_request_id IS NOT NULL))
        OR (sr.target_emp_id = p_claimer_emp_id AND sr.target_shift_date = v_request.requester_shift_date)
      )
  ) THEN
    RAISE EXCEPTION 'You are involved in another active shift request on this date';
  END IF;

  -- Claim the request
  UPDATE public.shift_requests
  SET target_emp_id = p_claimer_emp_id,
      target_shift_date = v_request.requester_shift_date,
      status = 'pending_approval',
      updated_at = now()
  WHERE id = p_request_id;
END;
$$;

-- volunteer_for_open_shift_unguarded, as 093 left it.
CREATE OR REPLACE FUNCTION public.volunteer_for_open_shift_unguarded(
  p_org_id              UUID,
  p_emp_id              UUID,
  p_shift_date          DATE,
  p_shift_ids           BIGINT[],
  p_job_ids             BIGINT[],
  p_focus_area_id       BIGINT,
  p_custom_start_time   TEXT DEFAULT NULL,
  p_custom_end_time     TEXT DEFAULT NULL,
  p_is_mentored_flags   BOOLEAN[] DEFAULT '{}'::BOOLEAN[]
) RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_absence_conflict TEXT;
  v_request_id UUID;
  v_employee RECORD;
  v_existing_shift RECORD;
  v_segment RECORD;
  v_required_staff INTEGER;
  v_actual_staff NUMERIC;
  v_pending_volunteer_count INTEGER;
  v_day_of_week INTEGER;
  v_mentored_credit NUMERIC := 1;
BEGIN
  IF COALESCE(array_length(p_shift_ids, 1), 0) != COALESCE(array_length(p_job_ids, 1), 0) THEN
    RAISE EXCEPTION 'Shift ID and job ID segment lengths must match';
  END IF;

  IF array_length(p_is_mentored_flags, 1) IS NOT NULL
     AND array_length(p_is_mentored_flags, 1) != array_length(p_job_ids, 1) THEN
    RAISE EXCEPTION 'Mentored flag and job ID segment lengths must match';
  END IF;

  -- Validate worked assignment is non-empty
  IF array_length(p_job_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one worked segment is required';
  END IF;

  -- Validate employee is active in this org
  SELECT id, user_id, certification_id, role_ids, status, focus_area_ids INTO v_employee
  FROM public.employees
  WHERE id = p_emp_id AND org_id = p_org_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found or archived';
  END IF;

  IF NOT public.employee_schedulable_on(v_employee.id, p_shift_date) THEN
    RAISE EXCEPTION 'Employee is not active';
  END IF;

  -- Validate caller is the employee, or admin+ IN THIS org (or their own
  -- sandbox) — see create_shift_request for why the org match is required.
  IF v_employee.user_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_gridmaster()
     AND NOT (
       (public.caller_org_id() = p_org_id OR public.is_own_sandbox_org(p_org_id))
       AND public.caller_org_role()::TEXT IN ('super_admin', 'admin')
     ) THEN
    RAISE EXCEPTION 'Unauthorized: you can only volunteer for yourself';
  END IF;

  -- Check job eligibility requirements. Items inside each gate are alternatives;
  -- eligibility_mode only controls how role and certification gates combine.
  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_job_ids, '{}'::BIGINT[])) AS request_jobs(job_id)
    JOIN public.jobs j ON j.id = request_jobs.job_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(array_agg(role.id ORDER BY role.sort_order, role.id), '{}'::BIGINT[]) AS role_ids
      FROM public.organization_roles role
      WHERE role.org_id = j.org_id
        AND role.id = ANY(j.eligible_role_ids)
        AND role.archived_at IS NULL
        AND role.is_schedule_role IS DISTINCT FROM FALSE
    ) eligible_roles ON TRUE
    WHERE j.archived_at IS NULL
      AND NOT (
        CASE
          WHEN array_length(eligible_roles.role_ids, 1) IS NOT NULL
            AND array_length(j.required_certification_ids, 1) IS NOT NULL
            AND COALESCE(j.eligibility_mode, 'and') = 'or'
          THEN
            (COALESCE(v_employee.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
            OR (
              v_employee.certification_id IS NOT NULL
              AND v_employee.certification_id = ANY(j.required_certification_ids)
            )
          ELSE
            (
              array_length(eligible_roles.role_ids, 1) IS NULL
              OR (COALESCE(v_employee.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
            )
            AND (
              array_length(j.required_certification_ids, 1) IS NULL
              OR (
                v_employee.certification_id IS NOT NULL
                AND v_employee.certification_id = ANY(j.required_certification_ids)
              )
            )
        END
      )
  ) THEN
    RAISE EXCEPTION 'You do not meet the eligibility requirements for this shift';
  END IF;

  IF p_focus_area_id IS NOT NULL
     AND NOT (p_focus_area_id = ANY(COALESCE(v_employee.focus_area_ids, '{}'::BIGINT[]))) THEN
    RAISE EXCEPTION 'You are not assigned to the focus area required for this shift';
  END IF;

  IF public.has_work_assignment_started(
    p_org_id,
    p_shift_date,
    COALESCE(p_shift_ids, '{}'::BIGINT[]),
    COALESCE(p_job_ids, '{}'::BIGINT[]),
    p_custom_start_time,
    p_custom_end_time
  ) THEN
    RAISE EXCEPTION 'Cannot volunteer for a shift that has already started';
  END IF;

  SELECT COALESCE(
    NULLIF(o.coverage_rule_config->>'mentoredCoverageCreditPercent', '')::NUMERIC / 100,
    1
  )
  INTO v_mentored_credit
  FROM public.organizations o
  WHERE o.id = p_org_id;

  v_day_of_week := EXTRACT(DOW FROM p_shift_date)::INTEGER;

  FOR v_segment IN
    SELECT segment.shift_id, segment.job_id, COALESCE(segment.is_mentored, FALSE) AS is_mentored
    FROM unnest(
      COALESCE(p_shift_ids, '{}'::BIGINT[]),
      COALESCE(p_job_ids, '{}'::BIGINT[]),
      COALESCE(p_is_mentored_flags, '{}'::BOOLEAN[])
    ) WITH ORDINALITY AS segment(shift_id, job_id, is_mentored, ordinality)
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext(
      'open_shift_volunteer_' ||
      p_org_id::TEXT || '_' ||
      p_shift_date::TEXT || '_' ||
      COALESCE(p_focus_area_id::TEXT, 'none') || '_' ||
      COALESCE(v_segment.shift_id::TEXT, 'none') || '_' ||
      v_segment.job_id::TEXT
    ));

    SELECT cr.min_staff
    INTO v_required_staff
    FROM public.coverage_requirements cr
    WHERE cr.org_id = p_org_id
      AND cr.focus_area_id = p_focus_area_id
      AND cr.job_id = v_segment.job_id
      AND (cr.preferred_shift_id IS NOT DISTINCT FROM v_segment.shift_id OR cr.preferred_shift_id IS NULL)
      AND (cr.day_of_week = v_day_of_week OR cr.day_of_week IS NULL)
      AND cr.min_staff > 0
    ORDER BY
      CASE WHEN cr.preferred_shift_id IS NOT DISTINCT FROM v_segment.shift_id THEN 0 ELSE 1 END,
      CASE WHEN cr.day_of_week = v_day_of_week THEN 0 ELSE 1 END
    LIMIT 1;

    IF v_required_staff IS NULL THEN
      RAISE EXCEPTION 'That open shift is no longer available';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.shift_requests sr
      JOIN LATERAL public.resolve_schedule_state_storage(sr.org_id, sr.requester_state) request_state ON TRUE
      JOIN LATERAL unnest(
        COALESCE(request_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(request_state.job_ids, '{}'::BIGINT[])
      ) AS request_segment(shift_id, job_id) ON TRUE
      WHERE sr.org_id = p_org_id
        AND sr.type = 'pickup'
        AND sr.status = 'pending_approval'
        AND sr.target_emp_id IS NULL
        AND sr.parent_request_id IS NULL
        AND sr.requester_emp_id = p_emp_id
        AND sr.requester_shift_date = p_shift_date
        AND request_state.focus_area_id IS NOT DISTINCT FROM p_focus_area_id
        AND request_segment.job_id = v_segment.job_id
        AND request_segment.shift_id IS NOT DISTINCT FROM v_segment.shift_id
    ) THEN
      RAISE EXCEPTION 'You already volunteered for this open shift';
    END IF;

    SELECT COUNT(DISTINCT sr.id)
    INTO v_pending_volunteer_count
    FROM public.shift_requests sr
    JOIN LATERAL public.resolve_schedule_state_storage(sr.org_id, sr.requester_state) request_state ON TRUE
    JOIN LATERAL unnest(
      COALESCE(request_state.shift_ids, '{}'::BIGINT[]),
      COALESCE(request_state.job_ids, '{}'::BIGINT[])
    ) AS request_segment(shift_id, job_id) ON TRUE
    WHERE sr.org_id = p_org_id
      AND sr.type = 'pickup'
      AND sr.status = 'pending_approval'
      AND sr.target_emp_id IS NULL
      AND sr.parent_request_id IS NULL
      AND sr.requester_shift_date = p_shift_date
      AND request_state.focus_area_id IS NOT DISTINCT FROM p_focus_area_id
      AND request_segment.job_id = v_segment.job_id
      AND request_segment.shift_id IS NOT DISTINCT FROM v_segment.shift_id;

    SELECT COALESCE(SUM(
      CASE WHEN COALESCE(scheduled_segment.is_mentored, FALSE) THEN v_mentored_credit ELSE 1 END
    ), 0)
    INTO v_actual_staff
    FROM public.employees e
    JOIN LATERAL public.get_schedule_cell_snapshot_payload(
      p_org_id,
      e.id,
      p_shift_date,
      'published'
    ) snapshot ON TRUE
    JOIN LATERAL unnest(
      COALESCE(snapshot.shift_ids, '{}'::BIGINT[]),
      COALESCE(snapshot.job_ids, '{}'::BIGINT[]),
      COALESCE(snapshot.is_mentored_flags, '{}'::BOOLEAN[])
    ) WITH ORDINALITY AS scheduled_segment(shift_id, job_id, is_mentored, ordinality) ON TRUE
    WHERE e.org_id = p_org_id
      AND e.archived_at IS NULL
      AND public.employee_schedulable_on(e.id, p_shift_date)
      AND p_focus_area_id = ANY(COALESCE(e.focus_area_ids, '{}'::BIGINT[]))
      AND snapshot.focus_area_id IS NOT DISTINCT FROM p_focus_area_id
      AND snapshot.state_kind = 'worked'
      AND scheduled_segment.job_id = v_segment.job_id
      AND scheduled_segment.shift_id IS NOT DISTINCT FROM v_segment.shift_id;

    IF v_actual_staff + COALESCE(v_pending_volunteer_count, 0) >= v_required_staff THEN
      RAISE EXCEPTION 'That open shift is no longer available';
    END IF;
  END LOOP;

  -- Check time conflicts: volunteer must not have an overlapping shift on this date
  SELECT *
  INTO v_existing_shift
  FROM public.get_schedule_cell_snapshot_payload(
    p_org_id,
    p_emp_id,
    p_shift_date,
    'published'
  );

  v_absence_conflict := public.rest_of_day_absence_conflict(
    p_org_id,
    p_emp_id,
    p_shift_date,
    p_shift_ids,
    p_job_ids,
    p_custom_start_time,
    p_custom_end_time
  );
  IF v_absence_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'You are absent %', v_absence_conflict;
  END IF;

  IF FOUND
     AND v_existing_shift.state_kind = 'worked'
     AND array_length(v_existing_shift.job_ids, 1) IS NOT NULL
     AND public.work_assignment_times_overlap(
       COALESCE(v_existing_shift.shift_ids, '{}'::BIGINT[]),
       COALESCE(v_existing_shift.job_ids, '{}'::BIGINT[]),
       v_existing_shift.custom_start_time,
       v_existing_shift.custom_end_time,
       COALESCE(p_shift_ids, '{}'::BIGINT[]),
       COALESCE(p_job_ids, '{}'::BIGINT[]),
       p_custom_start_time,
       p_custom_end_time
     ) THEN
    RAISE EXCEPTION 'You have a shift with overlapping times on this date';
  END IF;

  -- Check no active request already exists for this employee on this date.
  -- Exclude calloff-spawned pickups where the employee is the former shift owner
  -- (they called off and should still be able to volunteer for a different shift).
  IF EXISTS (
    SELECT 1 FROM public.shift_requests sr
    WHERE sr.org_id = p_org_id
      AND sr.status IN ('open', 'pending_approval')
      AND (
        (sr.requester_emp_id = p_emp_id AND sr.requester_shift_date = p_shift_date
         AND NOT (sr.type = 'pickup' AND sr.parent_request_id IS NOT NULL))
        OR (sr.target_emp_id = p_emp_id AND sr.target_shift_date = p_shift_date)
      )
  ) THEN
    RAISE EXCEPTION 'You are involved in another active shift request on this date';
  END IF;

  INSERT INTO public.shift_requests (
    org_id, type, status,
    requester_emp_id, requester_shift_date, requester_state
  ) VALUES (
    p_org_id, 'pickup', 'pending_approval',
    p_emp_id, p_shift_date,
    public.build_schedule_cell_state_json(
      'worked',
      COALESCE(p_shift_ids, '{}'::BIGINT[]),
      COALESCE(p_job_ids, '{}'::BIGINT[]),
      NULL,
      p_custom_start_time,
      p_custom_end_time,
      NULL,
      FALSE,
      COALESCE(p_is_mentored_flags, '{}'::BOOLEAN[]),
      p_focus_area_id
    )
  ) RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- resolve_shift_request_unchecked, as 093 left it.
CREATE OR REPLACE FUNCTION public.resolve_shift_request_unchecked(
  p_request_id    UUID,
  p_approved      BOOLEAN,
  p_note          TEXT,
  p_admin_user_id UUID
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_absence_conflict TEXT;
  v_request RECORD;
  v_admin_user_id UUID := p_admin_user_id;
  v_req_shift RECORD;
  v_tgt_shift RECORD;
  v_requester_state RECORD;
  v_target_state RECORD;
  v_requester_custom_start TEXT;
  v_requester_custom_end TEXT;
  v_target_custom_start TEXT;
  v_target_custom_end TEXT;
  v_source_matches BOOLEAN;
  v_row_count INTEGER;
  v_requester_employee RECORD;
  v_target_employee RECORD;
  v_requester_required_focus_area_ids BIGINT[] := '{}'::BIGINT[];
  v_target_required_focus_area_ids BIGINT[] := '{}'::BIGINT[];
  v_requester_match_ordinal INTEGER;
  v_target_match_ordinal INTEGER;
  v_requester_segment_count INTEGER;
  v_target_segment_count INTEGER;
  v_remaining_shift_ids BIGINT[];
  v_remaining_job_ids BIGINT[];
  v_remaining_is_mentored_flags BOOLEAN[];
  v_remaining_custom_start TEXT;
  v_remaining_custom_end TEXT;
  v_segment RECORD;
  v_required_staff INTEGER;
  v_actual_staff NUMERIC;
  v_pending_volunteer_count INTEGER;
  v_day_of_week INTEGER;
  v_mentored_credit NUMERIC := 1;
BEGIN
  -- Lock and fetch the request
  SELECT * INTO v_request
  FROM public.shift_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  IF v_request.status != 'pending_approval' THEN
    RAISE EXCEPTION 'Request is not pending approval (status: %)', v_request.status;
  END IF;

  IF v_request.expires_at < now() THEN
    RAISE EXCEPTION 'Request has expired';
  END IF;

  -- Validate org scoping
  IF v_request.org_id != public.caller_org_id() AND NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Unauthorized: request belongs to a different organization';
  END IF;

  -- Authority and attribution come from p_admin_user_id, not the JWT:
  -- auto-approval acts for the approver who is party to the request, who
  -- is not always the caller. The org check above still ties the caller's
  -- session to this org, and only the two wrappers below can reach here.
  IF NOT public.user_can_approve_shift_requests(p_admin_user_id, v_request.org_id) THEN
    RAISE EXCEPTION 'Unauthorized: you do not have permission to approve shift requests';
  END IF;

  IF NOT p_approved THEN
    -- Rejecting a claimed public/calloff pickup releases it for another
    -- single applicant instead of permanently closing the open shift.
    IF v_request.type = 'pickup'
       AND v_request.target_emp_id IS NOT NULL
       AND v_request.target_state IS NULL THEN
      UPDATE public.shift_requests
      SET status = 'open',
          target_emp_id = NULL,
          target_shift_date = NULL,
          admin_user_id = v_admin_user_id,
          admin_note = p_note,
          resolved_at = NULL,
          updated_at = now()
      WHERE id = p_request_id;
      RETURN;
    END IF;

    -- Reject
    UPDATE public.shift_requests
    SET status = 'rejected', admin_user_id = v_admin_user_id,
        admin_note = p_note, resolved_at = now(), updated_at = now()
    WHERE id = p_request_id;
    RETURN;
  END IF;

  -- ── APPROVAL: execute the shift reassignment ──
  SELECT * INTO v_requester_state
  FROM public.resolve_schedule_state_storage(v_request.org_id, v_request.requester_state);
  v_requester_custom_start := NULLIF(v_request.requester_state->>'customStartTime', '');
  v_requester_custom_end := NULLIF(v_request.requester_state->>'customEndTime', '');

  IF v_request.target_state IS NOT NULL THEN
    SELECT * INTO v_target_state
    FROM public.resolve_schedule_state_storage(v_request.org_id, v_request.target_state);
    v_target_custom_start := NULLIF(v_request.target_state->>'customStartTime', '');
    v_target_custom_end := NULLIF(v_request.target_state->>'customEndTime', '');
  END IF;

  -- ── CALLOFF: apply absence + spawn open pickup ──
  IF v_request.type = 'calloff' THEN
    -- Advisory lock on requester's shift
    PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));

    -- Re-validate requester's shift still matches snapshot
    SELECT *
    INTO v_req_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.requester_emp_id,
      v_request.requester_shift_date,
      'published'
    );

    IF NOT FOUND OR v_req_shift.state_kind IS DISTINCT FROM 'worked' THEN
      RAISE EXCEPTION 'The requester''s shift has been modified since the calloff was created. Please ask the employee to resubmit.';
    END IF;

    v_requester_match_ordinal := public.find_matching_schedule_segment_ordinal(
      COALESCE(v_req_shift.shift_ids, '{}'::BIGINT[]),
      COALESCE(v_req_shift.job_ids, '{}'::BIGINT[]),
      COALESCE(v_req_shift.is_mentored_flags, '{}'::BOOLEAN[]),
      v_req_shift.custom_start_time,
      v_req_shift.custom_end_time,
      v_requester_state.shift_ids[1],
      v_requester_state.job_ids[1],
      COALESCE(v_requester_state.is_mentored_flags[1], FALSE),
      v_requester_custom_start,
      v_requester_custom_end
    );

    IF v_requester_match_ordinal IS NULL THEN
      RAISE EXCEPTION 'The requester''s shift has been modified since the calloff was created. Please ask the employee to resubmit.';
    END IF;

    v_requester_segment_count := COALESCE(array_length(v_req_shift.job_ids, 1), 0);

    IF v_requester_segment_count <= 1 THEN
      -- Full-day calloff: preserve the existing absence-cell behavior.
      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.requester_shift_date,
        'published',
        'absence',
        '{}'::BIGINT[],
        '{}'::BIGINT[],
        v_request.absence_type_id,
        NULL,
        NULL,
        NULL,
        FALSE,
        v_requester_state.focus_area_id,
        v_req_shift.version,
        v_admin_user_id
      );
    ELSE
      -- Partial calloff: remove only the selected segment. The calloff request
      -- remains the durable absence record for that individual shift.
      SELECT
        COALESCE(array_agg(segment.shift_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
        COALESCE(array_agg(segment.job_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
        COALESCE(array_agg(segment.is_mentored ORDER BY segment.ordinality), '{}'::BOOLEAN[])
      INTO v_remaining_shift_ids, v_remaining_job_ids, v_remaining_is_mentored_flags
      FROM unnest(
        COALESCE(v_req_shift.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_req_shift.job_ids, '{}'::BIGINT[]),
        COALESCE(v_req_shift.is_mentored_flags, '{}'::BOOLEAN[])
      ) WITH ORDINALITY AS segment(shift_id, job_id, is_mentored, ordinality)
      WHERE segment.ordinality <> v_requester_match_ordinal;

      v_remaining_custom_start := public.schedule_custom_times_except_ordinal(
        v_req_shift.custom_start_time,
        v_requester_match_ordinal,
        v_requester_segment_count
      );
      v_remaining_custom_end := public.schedule_custom_times_except_ordinal(
        v_req_shift.custom_end_time,
        v_requester_match_ordinal,
        v_requester_segment_count
      );

      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.requester_shift_date,
        'published',
        'worked',
        COALESCE(v_remaining_shift_ids, '{}'::BIGINT[]),
        COALESCE(v_remaining_job_ids, '{}'::BIGINT[]),
        v_req_shift.absence_type_id,
        v_remaining_custom_start,
        v_remaining_custom_end,
        NULL,
        FALSE,
        CASE
          WHEN v_req_shift.focus_area_id = v_requester_state.focus_area_id THEN v_req_shift.focus_area_id
          ELSE NULL
        END,
        v_req_shift.version,
        v_admin_user_id,
        COALESCE(v_remaining_is_mentored_flags, '{}'::BOOLEAN[]),
        p_absence_start_time => v_req_shift.absence_start_time,
        p_absence_end_time => v_req_shift.absence_end_time
      );
    END IF;

    DELETE FROM public.schedule_cell_snapshots
    WHERE cell_id = v_req_shift.cell_id
      AND snapshot_kind = 'draft';

    -- Auto-create an open pickup request so other staff can claim the vacated shift
    INSERT INTO public.shift_requests (
      org_id, type, status,
      requester_emp_id, requester_shift_date, requester_state,
      parent_request_id
    ) VALUES (
      v_request.org_id, 'pickup', 'open',
      v_request.requester_emp_id, v_request.requester_shift_date,
      v_request.requester_state,
      p_request_id
    );

    -- Mark calloff as approved
    UPDATE public.shift_requests
    SET status = 'approved', admin_user_id = v_admin_user_id,
        admin_note = p_note, resolved_at = now(), updated_at = now()
    WHERE id = p_request_id;

    -- Cascade-cancel other active requests involving this shift
    UPDATE public.shift_requests
    SET status = 'cancelled',
        admin_note = 'Auto-cancelled: shift was called off',
        resolved_at = now(), updated_at = now()
    WHERE id != p_request_id
      AND parent_request_id IS DISTINCT FROM p_request_id
      AND org_id = v_request.org_id
      AND status IN ('open', 'pending_approval')
      AND (
        (requester_emp_id = v_request.requester_emp_id AND requester_shift_date = v_request.requester_shift_date)
        OR (target_emp_id = v_request.requester_emp_id AND target_shift_date = v_request.requester_shift_date)
      );

    RETURN;
  END IF;

  -- Advisory lock on involved shifts to prevent concurrent modifications.
  -- Acquire in deterministic order (alphabetical by key) to prevent deadlocks.
  IF v_request.type = 'pickup' THEN
    IF v_request.target_emp_id IS NOT NULL THEN
      -- Calloff-claimed pickup: lock both requester and target shifts
      IF (v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT)
         < (v_request.target_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT)
      THEN
        PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
        PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.target_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
      ELSE
        PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.target_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
        PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
      END IF;
    ELSE
      -- Volunteer pickup: only lock the volunteer's date
      PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
    END IF;
  ELSIF v_request.type = 'swap' THEN
    IF (v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT)
       < (v_request.target_emp_id::TEXT || '_' || v_request.target_shift_date::TEXT)
    THEN
      PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
      PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.target_emp_id::TEXT || '_' || v_request.target_shift_date::TEXT));
    ELSE
      PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.target_emp_id::TEXT || '_' || v_request.target_shift_date::TEXT));
      PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
    END IF;
  END IF;

  -- Re-validate both employees are still active (status could change between creation and approval)
  SELECT id, focus_area_ids, certification_id, role_ids
  INTO v_requester_employee
  FROM public.employees
    WHERE id = v_request.requester_emp_id AND org_id = v_request.org_id
      AND archived_at IS NULL
      AND public.employee_schedulable_on(id, LEAST(v_request.requester_shift_date, v_request.target_shift_date))
  ;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Requester is no longer active. Cannot approve.';
  END IF;

  IF v_request.target_emp_id IS NOT NULL THEN
    SELECT id, focus_area_ids, certification_id, role_ids
    INTO v_target_employee
    FROM public.employees
    WHERE id = v_request.target_emp_id AND org_id = v_request.org_id
      AND archived_at IS NULL
      AND public.employee_schedulable_on(id, LEAST(v_request.requester_shift_date, v_request.target_shift_date))
    ;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target employee is no longer active. Cannot approve.';
    END IF;
  END IF;

  -- Verify requester's shift still exists as snapshotted
  -- (Skip for volunteer pickups — there is no original shift to validate against)
  -- (Skip for a call-off's own open pickup: the call-off already took the shift)
  IF NOT (v_request.type = 'pickup' AND v_request.target_emp_id IS NULL)
     AND v_request.parent_request_id IS NULL THEN
    SELECT *
    INTO v_req_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.requester_emp_id,
      v_request.requester_shift_date,
      'published'
    );

    IF NOT FOUND OR v_req_shift.state_kind IS DISTINCT FROM 'worked' THEN
      RAISE EXCEPTION 'The requester''s shift has been modified since the request was created. Please ask the employee to resubmit.';
    END IF;

    v_requester_match_ordinal := public.find_matching_schedule_segment_ordinal(
      COALESCE(v_req_shift.shift_ids, '{}'::BIGINT[]),
      COALESCE(v_req_shift.job_ids, '{}'::BIGINT[]),
      COALESCE(v_req_shift.is_mentored_flags, '{}'::BOOLEAN[]),
      v_req_shift.custom_start_time,
      v_req_shift.custom_end_time,
      v_requester_state.shift_ids[1],
      v_requester_state.job_ids[1],
      COALESCE(v_requester_state.is_mentored_flags[1], FALSE),
      v_requester_custom_start,
      v_requester_custom_end
    );

    IF v_requester_match_ordinal IS NULL THEN
      RAISE EXCEPTION 'The requester''s shift has been modified since the request was created. Please ask the employee to resubmit.';
    END IF;
  END IF;

  IF v_request.type = 'pickup' THEN
    IF v_request.target_emp_id IS NULL THEN
      -- ── VOLUNTEER PICKUP: no source shift to transfer, just assign to volunteer ──

      IF public.has_work_assignment_started(
        v_request.org_id,
        v_request.requester_shift_date,
        COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
        v_requester_custom_start,
        v_requester_custom_end
      ) THEN
        RAISE EXCEPTION 'Cannot approve: volunteered shift has already started';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM unnest(COALESCE(v_requester_state.job_ids, '{}'::BIGINT[])) AS request_jobs(job_id)
        JOIN public.jobs j ON j.id = request_jobs.job_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(array_agg(role.id ORDER BY role.sort_order, role.id), '{}'::BIGINT[]) AS role_ids
          FROM public.organization_roles role
          WHERE role.org_id = j.org_id
            AND role.id = ANY(j.eligible_role_ids)
            AND role.archived_at IS NULL
            AND role.is_schedule_role IS DISTINCT FROM FALSE
        ) eligible_roles ON TRUE
        WHERE j.archived_at IS NULL
          AND NOT (
            CASE
              WHEN array_length(eligible_roles.role_ids, 1) IS NOT NULL
                AND array_length(j.required_certification_ids, 1) IS NOT NULL
                AND COALESCE(j.eligibility_mode, 'and') = 'or'
              THEN
                (COALESCE(v_requester_employee.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
                OR (
                  v_requester_employee.certification_id IS NOT NULL
                  AND v_requester_employee.certification_id = ANY(j.required_certification_ids)
                )
              ELSE
                (
                  array_length(eligible_roles.role_ids, 1) IS NULL
                  OR (COALESCE(v_requester_employee.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
                )
                AND (
                  array_length(j.required_certification_ids, 1) IS NULL
                  OR (
                    v_requester_employee.certification_id IS NOT NULL
                    AND v_requester_employee.certification_id = ANY(j.required_certification_ids)
                  )
                )
            END
          )
      ) THEN
        RAISE EXCEPTION 'Cannot approve: volunteer no longer meets the eligibility requirements for this shift';
      END IF;

      IF v_requester_state.focus_area_id IS NOT NULL
         AND NOT (v_requester_state.focus_area_id = ANY(COALESCE(v_requester_employee.focus_area_ids, '{}'::BIGINT[]))) THEN
        RAISE EXCEPTION 'Cannot approve: volunteer is no longer assigned to the required focus area';
      END IF;

      SELECT COALESCE(
        NULLIF(o.coverage_rule_config->>'mentoredCoverageCreditPercent', '')::NUMERIC / 100,
        1
      )
      INTO v_mentored_credit
      FROM public.organizations o
      WHERE o.id = v_request.org_id;

      v_day_of_week := EXTRACT(DOW FROM v_request.requester_shift_date)::INTEGER;

      FOR v_segment IN
        SELECT segment.shift_id, segment.job_id, COALESCE(segment.is_mentored, FALSE) AS is_mentored
        FROM unnest(
          COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
          COALESCE(v_requester_state.is_mentored_flags, '{}'::BOOLEAN[])
        ) WITH ORDINALITY AS segment(shift_id, job_id, is_mentored, ordinality)
      LOOP
        SELECT cr.min_staff
        INTO v_required_staff
        FROM public.coverage_requirements cr
        WHERE cr.org_id = v_request.org_id
          AND cr.focus_area_id = v_requester_state.focus_area_id
          AND cr.job_id = v_segment.job_id
          AND (cr.preferred_shift_id IS NOT DISTINCT FROM v_segment.shift_id OR cr.preferred_shift_id IS NULL)
          AND (cr.day_of_week = v_day_of_week OR cr.day_of_week IS NULL)
          AND cr.min_staff > 0
        ORDER BY
          CASE WHEN cr.preferred_shift_id IS NOT DISTINCT FROM v_segment.shift_id THEN 0 ELSE 1 END,
          CASE WHEN cr.day_of_week = v_day_of_week THEN 0 ELSE 1 END
        LIMIT 1;

        IF v_required_staff IS NULL THEN
          RAISE EXCEPTION 'Cannot approve: that open shift is no longer available';
        END IF;

        SELECT COALESCE(SUM(
          CASE WHEN COALESCE(scheduled_segment.is_mentored, FALSE) THEN v_mentored_credit ELSE 1 END
        ), 0)
        INTO v_actual_staff
        FROM public.employees e
        JOIN LATERAL public.get_schedule_cell_snapshot_payload(
          v_request.org_id,
          e.id,
          v_request.requester_shift_date,
          'published'
        ) snapshot ON TRUE
        JOIN LATERAL unnest(
          COALESCE(snapshot.shift_ids, '{}'::BIGINT[]),
          COALESCE(snapshot.job_ids, '{}'::BIGINT[]),
          COALESCE(snapshot.is_mentored_flags, '{}'::BOOLEAN[])
        ) WITH ORDINALITY AS scheduled_segment(shift_id, job_id, is_mentored, ordinality) ON TRUE
        WHERE e.org_id = v_request.org_id
          AND e.archived_at IS NULL
          AND public.employee_schedulable_on(e.id, v_request.requester_shift_date)
          AND v_requester_state.focus_area_id = ANY(COALESCE(e.focus_area_ids, '{}'::BIGINT[]))
          AND snapshot.focus_area_id IS NOT DISTINCT FROM v_requester_state.focus_area_id
          AND snapshot.state_kind = 'worked'
          AND scheduled_segment.job_id = v_segment.job_id
          AND scheduled_segment.shift_id IS NOT DISTINCT FROM v_segment.shift_id;

        IF v_actual_staff >= v_required_staff THEN
          RAISE EXCEPTION 'Cannot approve: that open shift is no longer available';
        END IF;
      END LOOP;

      -- Re-check at approval: volunteer must not have an overlapping shift now
      SELECT *
      INTO v_tgt_shift
      FROM public.get_schedule_cell_snapshot_payload(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.requester_shift_date,
        'published'
      );

      v_absence_conflict := public.rest_of_day_absence_conflict(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.requester_shift_date,
        v_requester_state.shift_ids,
        v_requester_state.job_ids,
        v_requester_custom_start,
        v_requester_custom_end
      );
      IF v_absence_conflict IS NOT NULL THEN
        RAISE EXCEPTION 'The volunteer is absent %. Cannot approve.', v_absence_conflict;
      END IF;

      IF FOUND
         AND v_tgt_shift.state_kind = 'worked'
         AND array_length(v_tgt_shift.job_ids, 1) IS NOT NULL
         AND public.work_assignment_times_overlap(
           COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]),
           v_tgt_shift.custom_start_time,
           v_tgt_shift.custom_end_time,
           COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
           v_requester_custom_start,
           v_requester_custom_end
         ) THEN
        RAISE EXCEPTION 'The volunteer has an overlapping shift on this date. Cannot approve.';
      END IF;

      IF FOUND AND v_tgt_shift.state_kind = 'worked' THEN
        PERFORM public.write_schedule_cell_snapshot_internal(
          v_request.org_id,
          v_request.requester_emp_id,
          v_request.requester_shift_date,
          'published',
          'worked',
          COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]) || COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]) || COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
          NULL,
          CASE
            WHEN v_tgt_shift.custom_start_time IS NOT NULL AND v_requester_custom_start IS NOT NULL
              THEN v_tgt_shift.custom_start_time || '|' || v_requester_custom_start
            WHEN v_requester_custom_start IS NOT NULL THEN v_requester_custom_start
            ELSE v_tgt_shift.custom_start_time
          END,
          CASE
            WHEN v_tgt_shift.custom_end_time IS NOT NULL AND v_requester_custom_end IS NOT NULL
              THEN v_tgt_shift.custom_end_time || '|' || v_requester_custom_end
            WHEN v_requester_custom_end IS NOT NULL THEN v_requester_custom_end
            ELSE v_tgt_shift.custom_end_time
          END,
          NULL,
          FALSE,
          CASE
            WHEN v_tgt_shift.focus_area_id = v_requester_state.focus_area_id THEN v_tgt_shift.focus_area_id
            ELSE NULL
          END,
          v_tgt_shift.version,
          v_admin_user_id,
          COALESCE(v_tgt_shift.is_mentored_flags, '{}'::BOOLEAN[]) || COALESCE(v_requester_state.is_mentored_flags, '{}'::BOOLEAN[])
        );
      ELSE
        PERFORM public.write_schedule_cell_snapshot_internal(
          v_request.org_id,
          v_request.requester_emp_id,
          v_request.requester_shift_date,
          'published',
          'worked',
          COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
          NULL,
          v_requester_custom_start,
          v_requester_custom_end,
          NULL,
          FALSE,
          v_requester_state.focus_area_id,
          CASE WHEN FOUND THEN v_tgt_shift.version ELSE 0 END,
          v_admin_user_id,
          COALESCE(v_requester_state.is_mentored_flags, '{}'::BOOLEAN[])
        );
      END IF;

    ELSE
      -- ── CALLOFF-CLAIMED PICKUP: transfer shift from requester to target ──

      IF public.has_work_assignment_started(
        v_request.org_id,
        v_request.requester_shift_date,
        COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
        v_requester_custom_start,
        v_requester_custom_end
      ) THEN
        RAISE EXCEPTION 'Cannot approve: pickup shift has already started';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM unnest(COALESCE(v_requester_state.job_ids, '{}'::BIGINT[])) AS request_jobs(job_id)
        JOIN public.jobs j ON j.id = request_jobs.job_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(array_agg(role.id ORDER BY role.sort_order, role.id), '{}'::BIGINT[]) AS role_ids
          FROM public.organization_roles role
          WHERE role.org_id = j.org_id
            AND role.id = ANY(j.eligible_role_ids)
            AND role.archived_at IS NULL
            AND role.is_schedule_role IS DISTINCT FROM FALSE
        ) eligible_roles ON TRUE
        WHERE j.archived_at IS NULL
          AND NOT (
            CASE
              WHEN array_length(eligible_roles.role_ids, 1) IS NOT NULL
                AND array_length(j.required_certification_ids, 1) IS NOT NULL
                AND COALESCE(j.eligibility_mode, 'and') = 'or'
              THEN
                (COALESCE(v_target_employee.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
                OR (
                  v_target_employee.certification_id IS NOT NULL
                  AND v_target_employee.certification_id = ANY(j.required_certification_ids)
                )
              ELSE
                (
                  array_length(eligible_roles.role_ids, 1) IS NULL
                  OR (COALESCE(v_target_employee.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
                )
                AND (
                  array_length(j.required_certification_ids, 1) IS NULL
                  OR (
                    v_target_employee.certification_id IS NOT NULL
                    AND v_target_employee.certification_id = ANY(j.required_certification_ids)
                  )
                )
            END
          )
      ) THEN
        RAISE EXCEPTION 'Cannot approve: target employee no longer meets the eligibility requirements for this shift';
      END IF;

      IF v_requester_state.focus_area_id IS NOT NULL
         AND NOT (v_requester_state.focus_area_id = ANY(COALESCE(v_target_employee.focus_area_ids, '{}'::BIGINT[]))) THEN
        RAISE EXCEPTION 'Cannot approve: target employee is no longer assigned to the required focus area';
      END IF;

      -- Re-check at approval: target must not have an overlapping shift on this date
      SELECT *
      INTO v_tgt_shift
      FROM public.get_schedule_cell_snapshot_payload(
        v_request.org_id,
        v_request.target_emp_id,
        v_request.requester_shift_date,
        'published'
      );

      IF v_request.absence_type_id IS NOT NULL
         AND (
           NOT FOUND
           OR public.build_schedule_cell_state_json(
                v_tgt_shift.state_kind,
                COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]),
                COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]),
                v_tgt_shift.absence_type_id,
                v_tgt_shift.custom_start_time,
                v_tgt_shift.custom_end_time,
                v_tgt_shift.series_id,
                v_tgt_shift.from_recurring,
                COALESCE(v_tgt_shift.is_mentored_flags, '{}'::BOOLEAN[])
              ) IS DISTINCT FROM v_request.target_state
         ) THEN
        RAISE EXCEPTION 'The target employee''s absence has been modified since the request was created. Please ask the employee to resubmit.';
      END IF;

      v_absence_conflict := public.rest_of_day_absence_conflict(
        v_request.org_id,
        v_request.target_emp_id,
        v_request.requester_shift_date,
        v_requester_state.shift_ids,
        v_requester_state.job_ids,
        v_requester_custom_start,
        v_requester_custom_end
      );
      IF v_absence_conflict IS NOT NULL THEN
        RAISE EXCEPTION 'The target employee is absent %. Cannot approve.', v_absence_conflict;
      END IF;

      IF FOUND
         AND v_tgt_shift.state_kind = 'worked'
         AND array_length(v_tgt_shift.job_ids, 1) IS NOT NULL
         AND public.work_assignment_times_overlap(
           COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]),
           v_tgt_shift.custom_start_time,
           v_tgt_shift.custom_end_time,
           COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
           v_requester_custom_start,
           v_requester_custom_end
         ) THEN
        RAISE EXCEPTION 'The target employee has an overlapping shift on this date. Cannot approve.';
      END IF;

      IF FOUND AND v_tgt_shift.state_kind = 'worked' THEN
        PERFORM public.write_schedule_cell_snapshot_internal(
          v_request.org_id,
          v_request.target_emp_id,
          v_request.requester_shift_date,
          'published',
          'worked',
          COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]) || COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]) || COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
          NULL,
          CASE
            WHEN v_tgt_shift.custom_start_time IS NOT NULL AND v_requester_custom_start IS NOT NULL
              THEN v_tgt_shift.custom_start_time || '|' || v_requester_custom_start
            WHEN v_requester_custom_start IS NOT NULL THEN v_requester_custom_start
            ELSE v_tgt_shift.custom_start_time
          END,
          CASE
            WHEN v_tgt_shift.custom_end_time IS NOT NULL AND v_requester_custom_end IS NOT NULL
              THEN v_tgt_shift.custom_end_time || '|' || v_requester_custom_end
            WHEN v_requester_custom_end IS NOT NULL THEN v_requester_custom_end
            ELSE v_tgt_shift.custom_end_time
          END,
          NULL,
          FALSE,
          CASE
            WHEN v_tgt_shift.focus_area_id = v_requester_state.focus_area_id THEN v_tgt_shift.focus_area_id
            ELSE NULL
          END,
          v_tgt_shift.version,
          v_admin_user_id,
          COALESCE(v_tgt_shift.is_mentored_flags, '{}'::BOOLEAN[]) || COALESCE(v_requester_state.is_mentored_flags, '{}'::BOOLEAN[])
        );
      ELSE
        PERFORM public.write_schedule_cell_snapshot_internal(
          v_request.org_id,
          v_request.target_emp_id,
          v_request.requester_shift_date,
          'published',
          'worked',
          COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
          NULL,
          v_requester_custom_start,
          v_requester_custom_end,
          NULL,
          FALSE,
          v_requester_state.focus_area_id,
          CASE WHEN FOUND THEN v_tgt_shift.version ELSE 0 END,
          v_admin_user_id,
          COALESCE(v_requester_state.is_mentored_flags, '{}'::BOOLEAN[])
        );
      END IF;

      IF v_request.parent_request_id IS NULL THEN
        v_requester_segment_count := COALESCE(array_length(v_req_shift.job_ids, 1), 0);
      END IF;

      IF v_request.parent_request_id IS NOT NULL THEN
        -- A call-off's own open pickup: the requester's cell already shows
        -- the call-off, so it stays as it is.
        NULL;
      ELSIF v_requester_segment_count <= 1 AND v_request.absence_type_id IS NOT NULL THEN
        PERFORM public.write_schedule_cell_snapshot_internal(
          v_request.org_id,
          v_request.requester_emp_id,
          v_request.requester_shift_date,
          'published',
          'absence',
          '{}'::BIGINT[],
          '{}'::BIGINT[],
          v_request.absence_type_id,
          NULL,
          NULL,
          NULL,
          FALSE,
          v_requester_state.focus_area_id,
          v_req_shift.version,
          v_admin_user_id
        );

        DELETE FROM public.schedule_cell_snapshots
        WHERE cell_id = v_req_shift.cell_id
          AND snapshot_kind = 'draft';
      ELSIF v_requester_segment_count <= 1 THEN
        PERFORM public.write_schedule_cell_snapshot_internal(
          v_request.org_id,
          v_request.requester_emp_id,
          v_request.requester_shift_date,
          'published',
          CASE WHEN v_req_shift.absence_type_id IS NOT NULL THEN 'absence' ELSE 'deleted' END,
          '{}'::BIGINT[],
          '{}'::BIGINT[],
          v_req_shift.absence_type_id,
          NULL,
          NULL,
          NULL,
          FALSE,
          NULL,
          v_req_shift.version,
          v_admin_user_id,
        p_absence_start_time => v_req_shift.absence_start_time,
        p_absence_end_time => v_req_shift.absence_end_time
      );
      ELSE
        SELECT
          COALESCE(array_agg(segment.shift_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
          COALESCE(array_agg(segment.job_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
          COALESCE(array_agg(segment.is_mentored ORDER BY segment.ordinality), '{}'::BOOLEAN[])
        INTO v_remaining_shift_ids, v_remaining_job_ids, v_remaining_is_mentored_flags
        FROM unnest(
          COALESCE(v_req_shift.shift_ids, '{}'::BIGINT[]),
          COALESCE(v_req_shift.job_ids, '{}'::BIGINT[]),
          COALESCE(v_req_shift.is_mentored_flags, '{}'::BOOLEAN[])
        ) WITH ORDINALITY AS segment(shift_id, job_id, is_mentored, ordinality)
        WHERE segment.ordinality <> v_requester_match_ordinal;

        v_remaining_custom_start := public.schedule_custom_times_except_ordinal(
          v_req_shift.custom_start_time,
          v_requester_match_ordinal,
          v_requester_segment_count
        );
        v_remaining_custom_end := public.schedule_custom_times_except_ordinal(
          v_req_shift.custom_end_time,
          v_requester_match_ordinal,
          v_requester_segment_count
        );

        PERFORM public.write_schedule_cell_snapshot_internal(
          v_request.org_id,
          v_request.requester_emp_id,
          v_request.requester_shift_date,
          'published',
          'worked',
          COALESCE(v_remaining_shift_ids, '{}'::BIGINT[]),
          COALESCE(v_remaining_job_ids, '{}'::BIGINT[]),
          v_req_shift.absence_type_id,
          v_remaining_custom_start,
          v_remaining_custom_end,
          NULL,
          FALSE,
          CASE
            WHEN v_req_shift.focus_area_id = v_requester_state.focus_area_id THEN v_req_shift.focus_area_id
            ELSE NULL
          END,
          v_req_shift.version,
          v_admin_user_id,
          COALESCE(v_remaining_is_mentored_flags, '{}'::BOOLEAN[]),
        p_absence_start_time => v_req_shift.absence_start_time,
        p_absence_end_time => v_req_shift.absence_end_time
      );
      END IF;
    END IF;

  ELSIF v_request.type = 'swap' THEN
    IF v_request.requester_shift_date < CURRENT_DATE
       OR v_request.target_shift_date < CURRENT_DATE THEN
      RAISE EXCEPTION 'Cannot approve: swap includes a past shift';
    END IF;

    -- Verify target's shift still exists as snapshotted
    SELECT *
    INTO v_tgt_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.target_emp_id,
      v_request.target_shift_date,
      'published'
    );

    IF NOT FOUND OR v_tgt_shift.state_kind IS DISTINCT FROM 'worked' THEN
      RAISE EXCEPTION 'The target''s shift has been modified since the request was created. Please ask the employees to resubmit.';
    END IF;

    v_target_match_ordinal := public.find_matching_schedule_segment_ordinal(
      COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]),
      COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]),
      COALESCE(v_tgt_shift.is_mentored_flags, '{}'::BOOLEAN[]),
      v_tgt_shift.custom_start_time,
      v_tgt_shift.custom_end_time,
      v_target_state.shift_ids[1],
      v_target_state.job_ids[1],
      COALESCE(v_target_state.is_mentored_flags[1], FALSE),
      v_target_custom_start,
      v_target_custom_end
    );

    IF v_target_match_ordinal IS NULL THEN
      RAISE EXCEPTION 'The target''s shift has been modified since the request was created. Please ask the employees to resubmit.';
    END IF;

    IF public.has_work_assignment_started(
      v_request.org_id,
      v_request.requester_shift_date,
      COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
      COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
      v_requester_custom_start,
      v_requester_custom_end
    ) THEN
      RAISE EXCEPTION 'Cannot approve: requester shift has already started';
    END IF;

    IF public.has_work_assignment_started(
      v_request.org_id,
      v_request.target_shift_date,
      COALESCE(v_target_state.shift_ids, '{}'::BIGINT[]),
      COALESCE(v_target_state.job_ids, '{}'::BIGINT[]),
      v_target_custom_start,
      v_target_custom_end
    ) THEN
      RAISE EXCEPTION 'Cannot approve: target shift has already started';
    END IF;

    SELECT COALESCE(array_agg(DISTINCT required.focus_area_id), '{}'::BIGINT[])
    INTO v_requester_required_focus_area_ids
    FROM (
      SELECT v_req_shift.focus_area_id AS focus_area_id
      WHERE v_req_shift.focus_area_id IS NOT NULL
      UNION
      SELECT sc.focus_area_id
      FROM unnest(COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[])) AS shift_ids(shift_id)
      JOIN public.shift_categories sc
        ON sc.id = shift_ids.shift_id
       AND sc.org_id = v_request.org_id
      WHERE sc.focus_area_id IS NOT NULL
    ) required;

    SELECT COALESCE(array_agg(DISTINCT required.focus_area_id), '{}'::BIGINT[])
    INTO v_target_required_focus_area_ids
    FROM (
      SELECT v_tgt_shift.focus_area_id AS focus_area_id
      WHERE v_tgt_shift.focus_area_id IS NOT NULL
      UNION
      SELECT sc.focus_area_id
      FROM unnest(COALESCE(v_target_state.shift_ids, '{}'::BIGINT[])) AS shift_ids(shift_id)
      JOIN public.shift_categories sc
        ON sc.id = shift_ids.shift_id
       AND sc.org_id = v_request.org_id
      WHERE sc.focus_area_id IS NOT NULL
    ) required;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_requester_required_focus_area_ids) AS required(focus_area_id)
      WHERE NOT (required.focus_area_id = ANY(COALESCE(v_target_employee.focus_area_ids, '{}'::BIGINT[])))
    ) THEN
      RAISE EXCEPTION 'Cannot approve: target employee is not eligible for the requester shift focus area';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_target_required_focus_area_ids) AS required(focus_area_id)
      WHERE NOT (required.focus_area_id = ANY(COALESCE(v_requester_employee.focus_area_ids, '{}'::BIGINT[])))
    ) THEN
      RAISE EXCEPTION 'Cannot approve: requester is not eligible for the target shift focus area';
    END IF;

    -- Block if shifts have overlapping time slots (full cascade: custom → job override/default → shift).
    -- Applies to both same-day and cross-day swaps.

    -- Same-day: block if requester and target shifts overlap in time (pointless swap)
    IF v_request.requester_shift_date = v_request.target_shift_date THEN
      IF v_req_shift.absence_type_id IS NOT NULL OR v_tgt_shift.absence_type_id IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot approve: someone in this swap is absent for the rest of the day';
      END IF;

      IF public.work_assignment_times_overlap(
           COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]), COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]), v_requester_custom_start, v_requester_custom_end,
           COALESCE(v_target_state.shift_ids, '{}'::BIGINT[]), COALESCE(v_target_state.job_ids, '{}'::BIGINT[]), v_target_custom_start, v_target_custom_end
         ) THEN
        RAISE EXCEPTION 'Cannot approve: shifts have overlapping time slots';
      END IF;
    ELSE
      -- Cross-day: requester's existing shift on target_date vs incoming target codes
      SELECT *
      INTO v_req_shift
      FROM public.get_schedule_cell_snapshot_payload(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.target_shift_date,
        'published'
      );

      v_absence_conflict := public.rest_of_day_absence_conflict(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.target_shift_date,
        v_target_state.shift_ids,
        v_target_state.job_ids,
        v_target_custom_start,
        v_target_custom_end
      );
      IF v_absence_conflict IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot approve: on the target''s date, the requester is absent %', v_absence_conflict;
      END IF;

      IF FOUND
         AND v_req_shift.state_kind = 'worked'
         AND array_length(v_req_shift.job_ids, 1) IS NOT NULL
         AND public.work_assignment_times_overlap(
           COALESCE(v_req_shift.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_req_shift.job_ids, '{}'::BIGINT[]),
           v_req_shift.custom_start_time,
           v_req_shift.custom_end_time,
           COALESCE(v_target_state.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_target_state.job_ids, '{}'::BIGINT[]),
           v_target_custom_start,
           v_target_custom_end
         ) THEN
        RAISE EXCEPTION 'Cannot approve: requester would have overlapping shift times on the target''s date';
      END IF;

      -- Cross-day: target's existing shift on requester_date vs incoming requester codes
      SELECT *
      INTO v_tgt_shift
      FROM public.get_schedule_cell_snapshot_payload(
        v_request.org_id,
        v_request.target_emp_id,
        v_request.requester_shift_date,
        'published'
      );

      v_absence_conflict := public.rest_of_day_absence_conflict(
        v_request.org_id,
        v_request.target_emp_id,
        v_request.requester_shift_date,
        v_requester_state.shift_ids,
        v_requester_state.job_ids,
        v_requester_custom_start,
        v_requester_custom_end
      );
      IF v_absence_conflict IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot approve: on the requester''s date, the target is absent %', v_absence_conflict;
      END IF;

      IF FOUND
         AND v_tgt_shift.state_kind = 'worked'
         AND array_length(v_tgt_shift.job_ids, 1) IS NOT NULL
         AND public.work_assignment_times_overlap(
           COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]),
           v_tgt_shift.custom_start_time,
           v_tgt_shift.custom_end_time,
           COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
           v_requester_custom_start,
           v_requester_custom_end
         ) THEN
        RAISE EXCEPTION 'Cannot approve: target would have overlapping shift times on the requester''s date';
      END IF;
    END IF;

    -- Remove only the specific swapped segments from their original owners.
    SELECT *
    INTO v_req_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.requester_emp_id,
      v_request.requester_shift_date,
      'published'
    );

    v_requester_segment_count := COALESCE(array_length(v_req_shift.job_ids, 1), 0);
    IF v_requester_segment_count <= 1 THEN
      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.requester_shift_date,
        'published',
        CASE WHEN v_req_shift.absence_type_id IS NOT NULL THEN 'absence' ELSE 'deleted' END,
        '{}'::BIGINT[],
        '{}'::BIGINT[],
        v_req_shift.absence_type_id,
        NULL,
        NULL,
        NULL,
        FALSE,
        NULL,
        v_req_shift.version,
        v_admin_user_id,
        p_absence_start_time => v_req_shift.absence_start_time,
        p_absence_end_time => v_req_shift.absence_end_time
      );
    ELSE
      SELECT
        COALESCE(array_agg(segment.shift_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
        COALESCE(array_agg(segment.job_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
        COALESCE(array_agg(segment.is_mentored ORDER BY segment.ordinality), '{}'::BOOLEAN[])
      INTO v_remaining_shift_ids, v_remaining_job_ids, v_remaining_is_mentored_flags
      FROM unnest(
        COALESCE(v_req_shift.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_req_shift.job_ids, '{}'::BIGINT[]),
        COALESCE(v_req_shift.is_mentored_flags, '{}'::BOOLEAN[])
      ) WITH ORDINALITY AS segment(shift_id, job_id, is_mentored, ordinality)
      WHERE segment.ordinality <> v_requester_match_ordinal;

      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.requester_shift_date,
        'published',
        'worked',
        COALESCE(v_remaining_shift_ids, '{}'::BIGINT[]),
        COALESCE(v_remaining_job_ids, '{}'::BIGINT[]),
        v_req_shift.absence_type_id,
        public.schedule_custom_times_except_ordinal(
          v_req_shift.custom_start_time,
          v_requester_match_ordinal,
          v_requester_segment_count
        ),
        public.schedule_custom_times_except_ordinal(
          v_req_shift.custom_end_time,
          v_requester_match_ordinal,
          v_requester_segment_count
        ),
        NULL,
        FALSE,
        CASE
          WHEN v_req_shift.focus_area_id = v_requester_state.focus_area_id THEN v_req_shift.focus_area_id
          ELSE NULL
        END,
        v_req_shift.version,
        v_admin_user_id,
        COALESCE(v_remaining_is_mentored_flags, '{}'::BOOLEAN[]),
        p_absence_start_time => v_req_shift.absence_start_time,
        p_absence_end_time => v_req_shift.absence_end_time
      );
    END IF;

    SELECT *
    INTO v_tgt_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.target_emp_id,
      v_request.target_shift_date,
      'published'
    );

    v_target_segment_count := COALESCE(array_length(v_tgt_shift.job_ids, 1), 0);
    IF v_target_segment_count <= 1 THEN
      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.target_emp_id,
        v_request.target_shift_date,
        'published',
        CASE WHEN v_tgt_shift.absence_type_id IS NOT NULL THEN 'absence' ELSE 'deleted' END,
        '{}'::BIGINT[],
        '{}'::BIGINT[],
        v_tgt_shift.absence_type_id,
        NULL,
        NULL,
        NULL,
        FALSE,
        NULL,
        v_tgt_shift.version,
        v_admin_user_id,
        p_absence_start_time => v_tgt_shift.absence_start_time,
        p_absence_end_time => v_tgt_shift.absence_end_time
      );
    ELSE
      SELECT
        COALESCE(array_agg(segment.shift_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
        COALESCE(array_agg(segment.job_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
        COALESCE(array_agg(segment.is_mentored ORDER BY segment.ordinality), '{}'::BOOLEAN[])
      INTO v_remaining_shift_ids, v_remaining_job_ids, v_remaining_is_mentored_flags
      FROM unnest(
        COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]),
        COALESCE(v_tgt_shift.is_mentored_flags, '{}'::BOOLEAN[])
      ) WITH ORDINALITY AS segment(shift_id, job_id, is_mentored, ordinality)
      WHERE segment.ordinality <> v_target_match_ordinal;

      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.target_emp_id,
        v_request.target_shift_date,
        'published',
        'worked',
        COALESCE(v_remaining_shift_ids, '{}'::BIGINT[]),
        COALESCE(v_remaining_job_ids, '{}'::BIGINT[]),
        v_tgt_shift.absence_type_id,
        public.schedule_custom_times_except_ordinal(
          v_tgt_shift.custom_start_time,
          v_target_match_ordinal,
          v_target_segment_count
        ),
        public.schedule_custom_times_except_ordinal(
          v_tgt_shift.custom_end_time,
          v_target_match_ordinal,
          v_target_segment_count
        ),
        NULL,
        FALSE,
        CASE
          WHEN v_tgt_shift.focus_area_id = v_target_state.focus_area_id THEN v_tgt_shift.focus_area_id
          ELSE NULL
        END,
        v_tgt_shift.version,
        v_admin_user_id,
        COALESCE(v_remaining_is_mentored_flags, '{}'::BOOLEAN[]),
        p_absence_start_time => v_tgt_shift.absence_start_time,
        p_absence_end_time => v_tgt_shift.absence_end_time
      );
    END IF;

    SELECT *
    INTO v_tgt_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.target_emp_id,
      v_request.requester_shift_date,
      'published'
    );

    IF FOUND AND v_tgt_shift.state_kind = 'worked' THEN
      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.target_emp_id,
        v_request.requester_shift_date,
        'published',
        'worked',
        COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]) || COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]) || COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
        NULL,
        CASE
          WHEN v_tgt_shift.custom_start_time IS NOT NULL AND v_requester_custom_start IS NOT NULL
            THEN v_tgt_shift.custom_start_time || '|' || v_requester_custom_start
          WHEN v_requester_custom_start IS NOT NULL THEN v_requester_custom_start
          ELSE v_tgt_shift.custom_start_time
        END,
        CASE
          WHEN v_tgt_shift.custom_end_time IS NOT NULL AND v_requester_custom_end IS NOT NULL
            THEN v_tgt_shift.custom_end_time || '|' || v_requester_custom_end
          WHEN v_requester_custom_end IS NOT NULL THEN v_requester_custom_end
          ELSE v_tgt_shift.custom_end_time
        END,
        NULL,
        FALSE,
        CASE
          WHEN v_tgt_shift.focus_area_id = v_requester_state.focus_area_id THEN v_tgt_shift.focus_area_id
          ELSE NULL
        END,
        v_tgt_shift.version,
        v_admin_user_id,
        COALESCE(v_tgt_shift.is_mentored_flags, '{}'::BOOLEAN[]) || COALESCE(v_requester_state.is_mentored_flags, '{}'::BOOLEAN[])
      );
    ELSE
      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.target_emp_id,
        v_request.requester_shift_date,
        'published',
        'worked',
        COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
        NULL,
        v_requester_custom_start,
        v_requester_custom_end,
        NULL,
        FALSE,
        v_requester_state.focus_area_id,
        CASE WHEN FOUND THEN v_tgt_shift.version ELSE 0 END,
        v_admin_user_id,
        COALESCE(v_requester_state.is_mentored_flags, '{}'::BOOLEAN[])
      );
    END IF;

    SELECT *
    INTO v_req_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.requester_emp_id,
      v_request.target_shift_date,
      'published'
    );

    IF FOUND AND v_req_shift.state_kind = 'worked' THEN
      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.target_shift_date,
        'published',
        'worked',
        COALESCE(v_req_shift.shift_ids, '{}'::BIGINT[]) || COALESCE(v_target_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_req_shift.job_ids, '{}'::BIGINT[]) || COALESCE(v_target_state.job_ids, '{}'::BIGINT[]),
        NULL,
        CASE
          WHEN v_req_shift.custom_start_time IS NOT NULL AND v_target_custom_start IS NOT NULL
            THEN v_req_shift.custom_start_time || '|' || v_target_custom_start
          WHEN v_target_custom_start IS NOT NULL THEN v_target_custom_start
          ELSE v_req_shift.custom_start_time
        END,
        CASE
          WHEN v_req_shift.custom_end_time IS NOT NULL AND v_target_custom_end IS NOT NULL
            THEN v_req_shift.custom_end_time || '|' || v_target_custom_end
          WHEN v_target_custom_end IS NOT NULL THEN v_target_custom_end
          ELSE v_req_shift.custom_end_time
        END,
        NULL,
        FALSE,
        CASE
          WHEN v_req_shift.focus_area_id = v_target_state.focus_area_id THEN v_req_shift.focus_area_id
          ELSE NULL
        END,
        v_req_shift.version,
        v_admin_user_id,
        COALESCE(v_req_shift.is_mentored_flags, '{}'::BOOLEAN[]) || COALESCE(v_target_state.is_mentored_flags, '{}'::BOOLEAN[])
      );
    ELSE
      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.target_shift_date,
        'published',
        'worked',
        COALESCE(v_target_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_target_state.job_ids, '{}'::BIGINT[]),
        NULL,
        v_target_custom_start,
        v_target_custom_end,
        NULL,
        FALSE,
        v_target_state.focus_area_id,
        CASE WHEN FOUND THEN v_req_shift.version ELSE 0 END,
        v_admin_user_id,
        COALESCE(v_target_state.is_mentored_flags, '{}'::BOOLEAN[])
      );
    END IF;
  END IF;

  -- Mark approved
  UPDATE public.shift_requests
  SET status = 'approved', admin_user_id = v_admin_user_id,
      admin_note = p_note, resolved_at = now(), updated_at = now()
  WHERE id = p_request_id;

  IF v_request.type = 'pickup' AND v_request.target_emp_id IS NULL THEN
    UPDATE public.shift_requests sr
    SET status = 'cancelled',
        admin_note = 'Auto-cancelled: open shift was taken by another approved volunteer',
        resolved_at = now(),
        updated_at = now()
    WHERE sr.id != p_request_id
      AND sr.org_id = v_request.org_id
      AND sr.type = 'pickup'
      AND sr.status = 'pending_approval'
      AND sr.target_emp_id IS NULL
      AND sr.parent_request_id IS NULL
      AND sr.requester_shift_date = v_request.requester_shift_date
      AND EXISTS (
        SELECT 1
        FROM public.resolve_schedule_state_storage(sr.org_id, sr.requester_state) other_state
        JOIN LATERAL unnest(
          COALESCE(other_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(other_state.job_ids, '{}'::BIGINT[])
        ) AS other_segment(shift_id, job_id) ON TRUE
        JOIN LATERAL unnest(
          COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(v_requester_state.job_ids, '{}'::BIGINT[])
        ) AS approved_segment(shift_id, job_id) ON TRUE
        WHERE other_state.focus_area_id IS NOT DISTINCT FROM v_requester_state.focus_area_id
          AND other_segment.job_id = approved_segment.job_id
          AND other_segment.shift_id IS NOT DISTINCT FROM approved_segment.shift_id
      )
      AND EXISTS (
        SELECT 1
        FROM public.resolve_schedule_state_storage(sr.org_id, sr.requester_state) other_state
        JOIN LATERAL unnest(
          COALESCE(other_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(other_state.job_ids, '{}'::BIGINT[])
        ) AS other_segment(shift_id, job_id) ON TRUE
        JOIN LATERAL (
          SELECT requirement.min_staff
          FROM public.coverage_requirements requirement
          WHERE requirement.org_id = sr.org_id
            AND requirement.focus_area_id = other_state.focus_area_id
            AND requirement.job_id = other_segment.job_id
            AND (requirement.preferred_shift_id IS NOT DISTINCT FROM other_segment.shift_id OR requirement.preferred_shift_id IS NULL)
            AND (requirement.day_of_week = EXTRACT(DOW FROM sr.requester_shift_date)::INTEGER OR requirement.day_of_week IS NULL)
            AND requirement.min_staff > 0
          ORDER BY
            CASE WHEN requirement.preferred_shift_id IS NOT DISTINCT FROM other_segment.shift_id THEN 0 ELSE 1 END,
            CASE WHEN requirement.day_of_week = EXTRACT(DOW FROM sr.requester_shift_date)::INTEGER THEN 0 ELSE 1 END
          LIMIT 1
        ) cr ON TRUE
        WHERE other_state.focus_area_id IS NOT DISTINCT FROM v_requester_state.focus_area_id
          AND (
            SELECT COALESCE(SUM(
              CASE WHEN COALESCE(scheduled_segment.is_mentored, FALSE) THEN v_mentored_credit ELSE 1 END
            ), 0)
            FROM public.employees e
            JOIN LATERAL public.get_schedule_cell_snapshot_payload(
              sr.org_id,
              e.id,
              sr.requester_shift_date,
              'published'
            ) snapshot ON TRUE
            JOIN LATERAL unnest(
              COALESCE(snapshot.shift_ids, '{}'::BIGINT[]),
              COALESCE(snapshot.job_ids, '{}'::BIGINT[]),
              COALESCE(snapshot.is_mentored_flags, '{}'::BOOLEAN[])
            ) WITH ORDINALITY AS scheduled_segment(shift_id, job_id, is_mentored, ordinality) ON TRUE
            WHERE e.org_id = sr.org_id
              AND e.archived_at IS NULL
              AND public.employee_schedulable_on(e.id, sr.requester_shift_date)
              AND other_state.focus_area_id = ANY(COALESCE(e.focus_area_ids, '{}'::BIGINT[]))
              AND snapshot.focus_area_id IS NOT DISTINCT FROM other_state.focus_area_id
              AND snapshot.state_kind = 'worked'
              AND scheduled_segment.job_id = other_segment.job_id
              AND scheduled_segment.shift_id IS NOT DISTINCT FROM other_segment.shift_id
          ) >= cr.min_staff
      );
  END IF;

  -- Cascade-cancel all other active requests involving the modified shifts
  UPDATE public.shift_requests
  SET status = 'cancelled',
      admin_note = 'Auto-cancelled: shift was reassigned by another approved request',
      resolved_at = now(),
      updated_at = now()
  WHERE id != p_request_id
    AND org_id = v_request.org_id
    AND status IN ('open', 'pending_approval')
    AND (
      (requester_emp_id = v_request.requester_emp_id AND requester_shift_date = v_request.requester_shift_date)
      OR (target_emp_id = v_request.requester_emp_id AND target_shift_date = v_request.requester_shift_date)
      OR (v_request.type = 'swap' AND requester_emp_id = v_request.target_emp_id AND requester_shift_date = v_request.target_shift_date)
      OR (v_request.type = 'swap' AND target_emp_id = v_request.target_emp_id AND target_shift_date = v_request.target_shift_date)
    );
END;
$$;

-- finalize_scheduler_staffed_calloffs, as 020 left it.
CREATE OR REPLACE FUNCTION public.finalize_scheduler_staffed_calloffs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID;
  v_to_state_kind TEXT;
  v_to_shift_ids BIGINT[] := '{}'::BIGINT[];
  v_to_job_ids BIGINT[] := '{}'::BIGINT[];
  v_from_shift_ids BIGINT[] := '{}'::BIGINT[];
  v_from_job_ids BIGINT[] := '{}'::BIGINT[];
  v_remaining JSONB := '[]'::JSONB;
  v_candidate_remaining JSONB;
  v_request RECORD;
  v_request_index INTEGER;
  v_match_index INTEGER;
  v_matches BOOLEAN;
BEGIN
  IF NEW.to_state IS NULL OR NEW.to_state->>'kind' IS DISTINCT FROM 'worked' THEN
    RETURN NEW;
  END IF;

  SELECT state_kind, shift_ids, job_ids
  INTO v_to_state_kind, v_to_shift_ids, v_to_job_ids
  FROM public.resolve_schedule_state_storage(NEW.org_id, NEW.to_state);

  IF v_to_state_kind IS DISTINCT FROM 'worked' THEN
    RETURN NEW;
  END IF;

  -- publish_schedule writes a brand-new cell's from_state as a JSON null, not
  -- a SQL NULL, so IS NOT NULL let it through to the resolver, which rejects
  -- anything but an object and failed every publish that added a cell.
  IF jsonb_typeof(NEW.from_state) = 'object' THEN
    SELECT shift_ids, job_ids
    INTO v_from_shift_ids, v_from_job_ids
    FROM public.resolve_schedule_state_storage(NEW.org_id, NEW.from_state);
  END IF;

  WITH to_segments AS (
    SELECT
      segment.shift_id,
      segment.job_id,
      segment.ordinality,
      row_number() OVER (
        PARTITION BY segment.shift_id, segment.job_id
        ORDER BY segment.ordinality
      ) AS occurrence
    FROM unnest(v_to_shift_ids, v_to_job_ids)
      WITH ORDINALITY AS segment(shift_id, job_id, ordinality)
  ),
  from_counts AS (
    SELECT segment.shift_id, segment.job_id, count(*) AS segment_count
    FROM unnest(v_from_shift_ids, v_from_job_ids)
      AS segment(shift_id, job_id)
    GROUP BY segment.shift_id, segment.job_id
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('shiftId', added.shift_id, 'jobId', added.job_id)
      ORDER BY added.ordinality
    ),
    '[]'::JSONB
  )
  INTO v_remaining
  FROM to_segments added
  LEFT JOIN from_counts prior
    ON prior.shift_id IS NOT DISTINCT FROM added.shift_id
   AND prior.job_id IS NOT DISTINCT FROM added.job_id
  WHERE added.occurrence > COALESCE(prior.segment_count, 0);

  IF jsonb_array_length(v_remaining) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT history.published_by
  INTO v_actor_id
  FROM public.publish_history history
  WHERE history.id = NEW.publish_history_id
    AND history.org_id = NEW.org_id;

  IF v_actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_request IN
    SELECT
      request.id,
      parent.absence_type_id,
      request_state.shift_ids,
      request_state.job_ids
    FROM public.shift_requests request
    JOIN public.shift_requests parent
      ON parent.id = request.parent_request_id
     AND parent.org_id = request.org_id
     AND parent.type = 'calloff'
     AND parent.status = 'approved'
     AND parent.absence_type_id IS NOT NULL
    JOIN public.employees requester
      ON requester.id = request.requester_emp_id
     AND requester.org_id = request.org_id
    JOIN public.employees target
      ON target.id = NEW.emp_id
     AND target.org_id = NEW.org_id
     AND public.employee_schedulable_on(target.id, NEW.date)
     AND target.archived_at IS NULL
    JOIN LATERAL public.resolve_schedule_state_storage(
      request.org_id,
      request.requester_state
    ) request_state ON TRUE
    WHERE request.org_id = NEW.org_id
      AND request.requester_shift_date = NEW.date
      AND request.type = 'pickup'
      AND request.status = 'open'
      AND request.parent_request_id IS NOT NULL
      AND request_state.state_kind = 'worked'
      AND COALESCE(request_state.focus_area_id, requester.focus_area_ids[1]) = ANY(target.focus_area_ids)
    ORDER BY request.created_at, request.id
    FOR UPDATE OF request SKIP LOCKED
  LOOP
    IF COALESCE(array_length(v_request.job_ids, 1), 0) = 0 THEN
      CONTINUE;
    END IF;

    v_candidate_remaining := v_remaining;
    v_matches := TRUE;

    FOR v_request_index IN 1..array_length(v_request.job_ids, 1) LOOP
      v_match_index := NULL;

      SELECT (item.ordinality - 1)::INTEGER
      INTO v_match_index
      FROM jsonb_array_elements(v_candidate_remaining)
        WITH ORDINALITY AS item(value, ordinality)
      WHERE NULLIF(item.value->>'shiftId', 'null')::BIGINT
              IS NOT DISTINCT FROM v_request.shift_ids[v_request_index]
        AND NULLIF(item.value->>'jobId', 'null')::BIGINT
              IS NOT DISTINCT FROM v_request.job_ids[v_request_index]
      ORDER BY item.ordinality
      LIMIT 1;

      IF v_match_index IS NULL THEN
        v_matches := FALSE;
        EXIT;
      END IF;

      v_candidate_remaining := v_candidate_remaining - v_match_index;
    END LOOP;

    IF v_matches THEN
      UPDATE public.shift_requests
      SET status = 'approved',
          target_emp_id = NEW.emp_id,
          target_shift_date = NEW.date,
          absence_type_id = v_request.absence_type_id,
          admin_user_id = v_actor_id,
          admin_note = 'Assigned through the published schedule',
          resolved_at = now(),
          updated_at = now()
      WHERE id = v_request.id
        AND status = 'open';

      IF FOUND THEN
        v_remaining := v_candidate_remaining;
        EXIT WHEN jsonb_array_length(v_remaining) = 0;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

INSERT INTO public.platform_feature_flags (key, enabled, description) VALUES
  ('cron_return_from_away', true, 'Daily job that sets Away people back to Active on their return date.')
ON CONFLICT (key) DO NOTHING;
