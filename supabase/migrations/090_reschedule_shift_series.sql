-- 090: A repeating shift or absence can change its dates and pattern.
--
-- `reschedule_shift_series` gives an existing series a new frequency, days,
-- start, end or count in one step, so a failure leaves it as it was. Its shift
-- stays the series' own (`shift_series.state`).
--
-- Each date is handled by where it falls:
-- - Leaving the pattern: removed as `delete_shift_series` removes it, as a
--   draft removal once published, and returned with its person so the caller
--   can clear its notes.
-- - Joining it: written as `create_shift_series` writes it, skipping a day that
--   already holds a shift or absence when `p_keep_existing` is set. A skipped
--   day still counts toward `p_max_occurrences`.
-- - In both: kept as it is, including a change made to that day alone, unless
--   `p_reset_occurrences`, which rewrites it from the series' shift. A day
--   removed on its own after publishing stays removed either way, as in
--   `update_series_all_shifts`.

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
      AND e.status = 'active'
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

REVOKE ALL ON FUNCTION public.reschedule_shift_series(UUID, UUID, public.shift_series_frequency, SMALLINT[], DATE, DATE, INTEGER, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_shift_series(UUID, UUID, public.shift_series_frequency, SMALLINT[], DATE, DATE, INTEGER, BOOLEAN, BOOLEAN) TO authenticated;
