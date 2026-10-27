-- 100: An absence while away (item 51f).
--
-- Someone Away with a return date can carry an absence type, such as
-- Vacation. Every day from today up to the day before the return date then
-- holds that absence in the draft, over any shift, and publishes with the
-- period. Nothing else can be scheduled on those days. Moving the return
-- date, changing or clearing the absence, or marking them active early
-- rewrites the days; archiving clears them as it always has.
SET lock_timeout = '5s';

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS away_absence_type_id BIGINT
    REFERENCES public.absence_types (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.employees.away_absence_type_id IS
  'The absence an Away person''s days before their return date hold in the draft. Only set with away_until.';

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_away_absence_needs_return_date,
  ADD CONSTRAINT employees_away_absence_needs_return_date
  CHECK (away_absence_type_id IS NULL OR away_until IS NOT NULL);

-- 099's guard, extended: leaving Away or losing the return date ends the
-- absence too, and the absence must be a live one of the same organization.
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
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_away_until_off_away() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_employees_clear_away_until
  BEFORE INSERT OR UPDATE OF status, archived_at, away_until, away_absence_type_id ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.clear_away_until_off_away();

-- Whether a whole-day absence of this type is the one an Away person holds
-- on this day.
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
      AND e.status = 'inactive'
      AND e.archived_at IS NULL
      AND e.away_until > p_date
      AND e.away_absence_type_id = p_absence_type_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_away_absence_day(UUID, DATE, BIGINT) FROM PUBLIC, anon, authenticated;

-- 099's gate, with one exception: on an away day, the person's away absence.
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
      IF NEW.state_kind = 'absence'
        AND NEW.absence_start_time IS NULL
        AND public.is_away_absence_day(v_emp_id, v_date, NEW.absence_type_id)
      THEN
        RETURN NEW;
      END IF;
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

-- 099's clearing, except that a day already holding the person's away
-- absence keeps it.
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
  v_away_type BIGINT;
  v_actor_id UUID := COALESCE(auth.uid(), p_actor_id);
  r RECORD;
BEGIN
  SELECT
    e.org_id,
    (now() AT TIME ZONE o.timezone)::DATE,
    CASE WHEN e.status = 'inactive' AND e.archived_at IS NULL THEN e.away_until END,
    CASE WHEN e.status = 'inactive' AND e.archived_at IS NULL THEN e.away_absence_type_id END
  INTO v_org_id, v_today, v_until, v_away_type
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
      -- A day already holding their away absence (100) keeps it.
      AND NOT (
        v_away_type IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.schedule_cell_snapshots s
          WHERE s.cell_id = c.id
            AND s.state_kind = 'absence'
            AND s.absence_type_id = v_away_type
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

-- Puts the away absence on every day in [p_from, p_until) in the draft.
-- A day whose published state is already that absence keeps no draft.
CREATE OR REPLACE FUNCTION public.fill_away_absence(
  p_emp_id UUID,
  p_from DATE,
  p_until DATE,
  p_absence_type_id BIGINT,
  p_actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_date DATE;
  v_cell public.schedule_cells%ROWTYPE;
  v_published public.schedule_cell_snapshots%ROWTYPE;
  v_draft public.schedule_cell_snapshots%ROWTYPE;
BEGIN
  SELECT org_id INTO v_org_id FROM public.employees WHERE id = p_emp_id;
  IF NOT FOUND OR p_absence_type_id IS NULL OR p_from >= p_until THEN
    RETURN;
  END IF;

  FOR v_date IN
    SELECT d::DATE FROM generate_series(p_from, p_until - 1, INTERVAL '1 day') d
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext('schedule_cell_' || p_emp_id::TEXT || '_' || v_date::TEXT));

    SELECT * INTO v_cell
    FROM public.schedule_cells
    WHERE org_id = v_org_id AND emp_id = p_emp_id AND date = v_date
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.schedule_cells (
        org_id, emp_id, date, focus_area_id, version, series_id, from_recurring,
        created_by, updated_by
      )
      VALUES (v_org_id, p_emp_id, v_date, NULL, 0, NULL, FALSE, p_actor_id, p_actor_id)
      RETURNING * INTO v_cell;

      PERFORM public.sync_schedule_cell_snapshot(
        v_cell.id, v_org_id, 'draft', 'absence', p_absence_type_id, NULL, NULL,
        '{}'::BIGINT[], '{}'::BIGINT[], '{}'::BOOLEAN[]
      );
      CONTINUE;
    END IF;

    v_published := NULL;
    v_draft := NULL;
    SELECT * INTO v_published FROM public.schedule_cell_snapshots
    WHERE cell_id = v_cell.id AND snapshot_kind = 'published';
    SELECT * INTO v_draft FROM public.schedule_cell_snapshots
    WHERE cell_id = v_cell.id AND snapshot_kind = 'draft';

    IF v_published.state_kind = 'absence'
      AND v_published.absence_type_id = p_absence_type_id
      AND v_published.absence_start_time IS NULL
    THEN
      IF v_draft.id IS NULL THEN
        CONTINUE;
      END IF;
      UPDATE public.schedule_cells
      SET version = version + 1, updated_by = p_actor_id, updated_at = now()
      WHERE id = v_cell.id;
      DELETE FROM public.schedule_cell_snapshots WHERE id = v_draft.id;
      CONTINUE;
    END IF;

    IF v_draft.state_kind = 'absence'
      AND v_draft.absence_type_id = p_absence_type_id
      AND v_draft.absence_start_time IS NULL
    THEN
      CONTINUE;
    END IF;

    UPDATE public.schedule_cells
    SET version = version + 1, updated_by = p_actor_id, updated_at = now()
    WHERE id = v_cell.id;

    PERFORM public.sync_schedule_cell_snapshot(
      v_cell.id, v_org_id, 'draft', 'absence', p_absence_type_id, NULL, NULL,
      '{}'::BIGINT[], '{}'::BIGINT[], '{}'::BOOLEAN[]
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.fill_away_absence(UUID, DATE, DATE, BIGINT, UUID) FROM PUBLIC, anon, authenticated;

-- Takes the away absence off the days in [p_from, p_until) that hold it.
-- A day they can be scheduled on again goes back to what was published; a day
-- still away is cleared as 099 clears it, so nothing shows there.
CREATE OR REPLACE FUNCTION public.unfill_away_absence(
  p_emp_id UUID,
  p_from DATE,
  p_until DATE,
  p_absence_type_id BIGINT,
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
  v_is_away_absence_draft BOOLEAN;
  v_is_away_absence_published BOOLEAN;
BEGIN
  SELECT org_id INTO v_org_id FROM public.employees WHERE id = p_emp_id;
  IF NOT FOUND OR p_absence_type_id IS NULL OR p_from >= p_until THEN
    RETURN;
  END IF;

  -- Id order, as publish_schedule and discard_schedule_drafts lock cells.
  FOR r IN
    SELECT c.id, c.date, p.state_kind AS published_kind,
      p.absence_type_id AS published_type, p.absence_start_time AS published_start,
      d.id AS draft_id, d.state_kind AS draft_kind,
      d.absence_type_id AS draft_type, d.absence_start_time AS draft_start
    FROM public.schedule_cells c
    LEFT JOIN public.schedule_cell_snapshots p
      ON p.cell_id = c.id AND p.snapshot_kind = 'published'
    LEFT JOIN public.schedule_cell_snapshots d
      ON d.cell_id = c.id AND d.snapshot_kind = 'draft'
    WHERE c.org_id = v_org_id
      AND c.emp_id = p_emp_id
      AND c.date >= p_from
      AND c.date < p_until
    ORDER BY c.id
    FOR UPDATE OF c
  LOOP
    v_is_away_absence_draft := r.draft_kind = 'absence'
      AND r.draft_type = p_absence_type_id AND r.draft_start IS NULL;
    v_is_away_absence_published := r.published_kind = 'absence'
      AND r.published_type = p_absence_type_id AND r.published_start IS NULL;

    IF NOT (v_is_away_absence_draft OR (r.draft_id IS NULL AND v_is_away_absence_published)) THEN
      CONTINUE;
    END IF;

    IF r.published_kind IS NULL THEN
      DELETE FROM public.schedule_cells WHERE id = r.id;
      CONTINUE;
    END IF;

    UPDATE public.schedule_cells
    SET version = version + 1, updated_by = p_actor_id, updated_at = now()
    WHERE id = r.id;

    IF public.employee_schedulable_on(p_emp_id, r.date) AND NOT v_is_away_absence_published THEN
      DELETE FROM public.schedule_cell_snapshots WHERE id = r.draft_id;
    ELSE
      PERFORM public.sync_schedule_cell_snapshot(
        r.id, v_org_id, 'draft', 'deleted', NULL, NULL, NULL,
        '{}'::BIGINT[], '{}'::BIGINT[], '{}'::BOOLEAN[]
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.unfill_away_absence(UUID, DATE, DATE, BIGINT, UUID) FROM PUBLIC, anon, authenticated;

-- Runs after 099's clearing (trigger names fire in order), so the days it
-- fills are the ones the clearing just emptied.
CREATE OR REPLACE FUNCTION public.rewrite_away_absence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE;
  v_actor_id UUID := COALESCE(auth.uid(), NEW.updated_by);
  v_old_until DATE;
  v_new_until DATE;
BEGIN
  SELECT (now() AT TIME ZONE o.timezone)::DATE INTO v_today
  FROM public.organizations o
  WHERE o.id = NEW.org_id;

  IF OLD.away_absence_type_id IS NOT NULL AND OLD.away_until > v_today THEN
    v_old_until := OLD.away_until;
  END IF;
  IF NEW.away_absence_type_id IS NOT NULL AND NEW.away_until > v_today THEN
    v_new_until := NEW.away_until;
  END IF;

  -- Archiving clears the whole schedule ahead already.
  IF NEW.archived_at IS NOT NULL OR NEW.status = 'removed' THEN
    RETURN NEW;
  END IF;

  IF v_old_until IS NOT NULL THEN
    IF OLD.away_absence_type_id IS DISTINCT FROM NEW.away_absence_type_id
      OR v_new_until IS NULL
    THEN
      PERFORM public.unfill_away_absence(
        NEW.id, v_today, v_old_until, OLD.away_absence_type_id, v_actor_id
      );
    ELSIF v_new_until < v_old_until THEN
      PERFORM public.unfill_away_absence(
        NEW.id, v_new_until, v_old_until, OLD.away_absence_type_id, v_actor_id
      );
    END IF;
  END IF;

  IF v_new_until IS NOT NULL THEN
    PERFORM public.fill_away_absence(
      NEW.id, v_today, v_new_until, NEW.away_absence_type_id, v_actor_id
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rewrite_away_absence() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_rewrite_away_absence
  AFTER UPDATE OF status, archived_at, away_until, away_absence_type_id ON public.employees
  FOR EACH ROW
  WHEN (
    OLD.away_absence_type_id IS DISTINCT FROM NEW.away_absence_type_id
    OR (
      NEW.away_absence_type_id IS NOT NULL
      AND NEW.away_until IS DISTINCT FROM OLD.away_until
    )
    OR (OLD.away_absence_type_id IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status)
  )
  EXECUTE FUNCTION public.rewrite_away_absence();
