-- F-02: callers cannot raise the occurrence cap or make the loop scan indefinitely.
CREATE OR REPLACE FUNCTION public.create_shift_series(
  p_series_id UUID,
  p_emp_id UUID,
  p_org_id UUID,
  p_state JSONB,
  p_frequency public.shift_series_frequency,
  p_days_of_week SMALLINT[] DEFAULT NULL,
  p_start_date DATE DEFAULT CURRENT_DATE,
  p_end_date DATE DEFAULT NULL,
  p_max_occurrences INTEGER DEFAULT NULL
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
  v_existing_version BIGINT;
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
      AND e.status = 'active'
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
      SELECT c.version
      INTO v_existing_version
      FROM public.schedule_cells c
      WHERE c.org_id = p_org_id
        AND c.emp_id = p_emp_id
        AND c.date = v_current_date
      FOR UPDATE;

      IF NOT FOUND THEN
        v_existing_version := 0;
      END IF;

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

      v_occurrence_count := v_occurrence_count + 1;
    END IF;

    v_current_date := v_current_date + 1;
  END LOOP;

  RETURN v_series_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_shift_series(UUID, UUID, UUID, JSONB, public.shift_series_frequency, SMALLINT[], DATE, DATE, INTEGER) TO authenticated;
